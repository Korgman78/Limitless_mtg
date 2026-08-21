// fetch global (Node 18+, Electron 28+) : aucune dependance externe, ce qui
// permet de lancer la synchro avec un `node` nu, sans installer quoi que ce soit.
const { findMatchingCourse, readScore, toMtgaExport } = require('./course-tracker');
const { resolveMatch } = require('./match-tracker');

/**
 * Écrit la phase de pick dans le Training Diary (tables diary_*).
 *
 * Écriture AU FIL DE L'EAU, pas en fin de draft : le log Arena n'émet aucun
 * marqueur `DraftStatus/Complete` (vérifié sur Player.log), donc `draft-end`
 * ne se déclenche jamais. Un flush final perdrait tout sur un crash d'Arena ou
 * un draft abandonné — ici chaque pick est persisté dès qu'il est joué.
 *
 * Toutes les erreurs sont avalées et loguées : le collecteur est un passager,
 * il ne doit jamais interrompre l'overlay.
 */
class DiaryCollector {
  constructor({ supabaseUrl, supabaseKey, resolveCardName, basicLandIds }) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.resolveCardName = resolveCardName;

    // arenaId -> nom de terrain de base, alimente depuis le log. Ces cartes
    // n'existent dans aucun card_list : sans ce repli, un deck s'enregistre
    // ampute de ses terrains.
    this.basicLandIds = basicLandIds ?? new Map();

    this.enabled = Boolean(supabaseUrl && supabaseKey);
    this.eventId = null;
    this.draftId = null;

    // (packNumber, pickNumber) -> [{arenaId, name}] du pack affiché.
    // Le contenu du pack arrive avant le pick, on le garde en attente.
    this.pendingPacks = new Map();

    // arenaId des cartes pickees : sert a rattacher une course au bon draft.
    this.pickedArenaIds = new Set();

    // eventId -> pool complet, conserve pour toute la session. Arena laisse
    // jouer les matchs d'un draft apres en avoir commence un autre : se fier au
    // seul draft courant rattacherait ces matchs au mauvais evenement.
    this.pools = new Map();

    // Derniers etats ecrits, pour n'ecrire que sur changement reel.
    this.lastDeckText = null;
    this.lastScore = null;
  }

  get headers() {
    return {
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
    };
  }

  packKey(packNumber, pickNumber) {
    return `${packNumber}:${pickNumber}`;
  }

  /**
   * Crée l'événement au journal, ou récupère celui d'un draft déjà commencé
   * (relance de l'overlay en cours de draft).
   *
   * Select-then-insert plutôt qu'un upsert PostgREST : l'index unique sur
   * draft_id est partiel (`where draft_id is not null`), et Postgres ne sait
   * pas l'utiliser pour inférer un ON CONFLICT sans sa clause WHERE.
   */
  async onDraftStart({ draftId, setCode, format }) {
    if (!this.enabled || !draftId) return;

    this.draftId = draftId;
    this.eventId = null;
    this.pendingPacks.clear();
    // Nouveau Set plutot que clear() : this.pools garde une reference vers
    // celui du draft precedent, le vider effacerait son pool.
    this.pickedArenaIds = new Set();
    this.lastDeckText = null;
    this.lastScore = null;

    try {
      const existing = await this.request(
        `diary_events?draft_id=eq.${encodeURIComponent(draftId)}&select=id`,
      );

      if (existing?.length) {
        this.eventId = existing[0].id;
        this.pools.set(this.eventId, this.pickedArenaIds);
        console.log('[Diary] Draft déjà au journal, reprise:', this.eventId);
        return;
      }

      const created = await this.request('diary_events', {
        method: 'POST',
        headers: { ...this.headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          set_code: setCode,
          format: format || 'PremierDraft',
          event_type: 'draft',
          source: 'overlay',
          draft_id: draftId,
        }),
      });

      this.eventId = created?.[0]?.id ?? null;
      if (this.eventId) this.pools.set(this.eventId, this.pickedArenaIds);
      console.log('[Diary] Événement créé:', this.eventId, setCode, format);
    } catch (err) {
      console.error('[Diary] Création événement impossible:', err.message);
    }
  }

  /**
   * Mémorise le contenu d'un pack. `cards` vient déjà enrichi par main.js,
   * donc les noms sont résolus sans requête supplémentaire.
   */
  registerPack(packNumber, pickNumber, cards) {
    if (!this.enabled) return;

    this.pendingPacks.set(
      this.packKey(packNumber, pickNumber),
      (cards || []).map((c) => ({ arenaId: c.arenaId, name: c.name ?? null })),
    );

    // Un draft = 42 à 45 packs. Au-delà, on traîne un état obsolète.
    if (this.pendingPacks.size > 60) {
      const oldest = this.pendingPacks.keys().next().value;
      this.pendingPacks.delete(oldest);
    }
  }

  /** Persiste le pick. Idempotent grâce à unique(event_id, pack, pick). */
  async onCardPicked({ arenaId, packNumber, pickNumber, setCode }) {
    if (!this.enabled || !this.eventId) return;

    this.pickedArenaIds.add(arenaId);

    try {
      const key = this.packKey(packNumber, pickNumber);
      const packCards = this.pendingPacks.get(key) ?? [];
      this.pendingPacks.delete(key);

      let pickedName = packCards.find((c) => c.arenaId === arenaId)?.name ?? null;
      if (!pickedName && this.resolveCardName) {
        pickedName = await this.resolveCardName(arenaId, setCode);
      }

      await this.request(
        'diary_picks?on_conflict=event_id,pack_number,pick_number',
        {
          method: 'POST',
          headers: {
            ...this.headers,
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            event_id: this.eventId,
            pack_number: packNumber,
            pick_number: pickNumber,
            picked_card: pickedName,
            picked_arena_id: arenaId,
            pack_cards: packCards,
          }),
        },
      );

      console.log(
        `[Diary] Pick enregistré P${packNumber}P${pickNumber}: ${pickedName ?? arenaId}`,
      );
    } catch (err) {
      console.error('[Diary] Écriture du pick impossible:', err.message);
    }
  }

  /**
   * Score et deck construit, depuis la charge {"Courses":[...]} d'Arena.
   *
   * La course est rattachee au draft par recouvrement du deck avec le pool
   * (CourseId n'est pas le draftId). N'ecrit que sur changement reel : Arena
   * reemet la meme charge plusieurs fois par minute.
   */
  async onCoursesUpdate(courses) {
    if (!this.enabled || !this.eventId || !this.pickedArenaIds.size) return;

    const matched = findMatchingCourse(courses, this.pickedArenaIds);
    if (!matched) return;

    try {
      const { wins, losses } = readScore(matched.course);
      const scoreKey = `${wins}-${losses}`;

      if (scoreKey !== this.lastScore) {
        await this.request(`diary_events?id=eq.${this.eventId}`, {
          method: 'PATCH',
          headers: { ...this.headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ wins, losses }),
        });
        this.lastScore = scoreKey;
        console.log(`[Diary] Score mis a jour: ${scoreKey}`);
      }

      const { text, skipped, resolved } = await toMtgaExport(
        matched.course,
        (arenaId) => this.resolveDeckCard(arenaId),
      );

      if (resolved > 0 && text !== this.lastDeckText) {
        await this.saveDeckVersion(text, skipped);
        this.lastDeckText = text;
      }
    } catch (err) {
      console.error('[Diary] Mise a jour course impossible:', err.message);
    }
  }

  /** Nom d'une carte du deck : card_list d'abord, terrains de base ensuite. */
  async resolveDeckCard(arenaId) {
    const name = await this.resolveCardName(arenaId);
    return name ?? this.basicLandIds.get(arenaId) ?? null;
  }

  /**
   * Ajoute une version de deck, numerotee a la suite des existantes.
   *
   * Compare d'abord au dernier deck DEJA EN BASE, pas seulement a celui de la
   * session : sans ca, chaque relance de la synchro reecrirait une version
   * identique et l'historique se remplirait de doublons.
   */
  async saveDeckVersion(decklistRaw, skipped) {
    const existing = await this.request(
      `diary_deck_versions?event_id=eq.${this.eventId}` +
        '&select=version_no,decklist_raw&order=version_no.desc&limit=1',
    );

    if (existing?.[0]?.decklist_raw === decklistRaw) {
      console.log('[Diary] Deck inchange, aucune version ajoutee');
      return;
    }

    const versionNo = (existing?.[0]?.version_no ?? 0) + 1;

    await this.request('diary_deck_versions', {
      method: 'POST',
      headers: { ...this.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: this.eventId,
        version_no: versionNo,
        label: versionNo === 1 ? 'Build initial' : `Rebuild ${versionNo - 1}`,
        decklist_raw: decklistRaw,
      }),
    });

    const note = skipped ? ` (${skipped} terrains non resolus omis)` : '';
    console.log(`[Diary] Deck v${versionNo} enregistre${note}`);
  }

  /**
   * Enregistre un match termine. `cardMeta` : Map(arenaId -> {colors, type}),
   * necessaire pour deduire les couleurs de l'adversaire.
   *
   * Le match est rattache a un evenement par recouvrement des cartes vues avec
   * les pools draftes. En dessous du seuil, on ne relie rien : mieux vaut un
   * match absent qu'un match attribue au mauvais draft.
   */
  async onMatchComplete(match, cardMeta) {
    if (!this.enabled || !this.pools.size) return;

    const resolved = resolveMatch(match, this.pools, cardMeta);
    if (!resolved) {
      console.log(
        `[Diary] Match ${String(match.matchId).slice(0, 8)} non rattache ` +
          '(draft hors du log ?)',
      );
      return;
    }

    try {
      const existing = await this.request(
        `diary_matches?event_id=eq.${resolved.eventId}&select=match_id`,
      );
      const known = new Set((existing ?? []).map((row) => row.match_id));
      const matchNumber = known.has(resolved.matchId)
        ? undefined
        : known.size + 1;

      await this.request('diary_matches?on_conflict=match_id', {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          event_id: resolved.eventId,
          match_id: resolved.matchId,
          ...(matchNumber ? { match_number: matchNumber } : {}),
          opponent_name: resolved.opponentName,
          opponent_colors: resolved.opponentColors,
          games_won: resolved.gamesWon,
          games_lost: resolved.gamesLost,
          won: resolved.won,
        }),
      });

      console.log(
        `[Diary] Match ${resolved.won ? 'gagne' : 'perdu'} ` +
          `${resolved.gamesWon}-${resolved.gamesLost} vs ` +
          `${resolved.opponentName ?? '?'} (${resolved.opponentColors ?? '?'})`,
      );
    } catch (err) {
      console.error('[Diary] Ecriture du match impossible:', err.message);
    }
  }

  reset() {
    this.eventId = null;
    this.draftId = null;
    this.pendingPacks.clear();
    // Nouveau Set plutot que clear() : this.pools garde une reference vers
    // celui du draft precedent, le vider effacerait son pool.
    this.pickedArenaIds = new Set();
    this.lastDeckText = null;
    this.lastScore = null;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, {
      headers: this.headers,
      ...options,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    // `return=minimal` renvoie un corps vide.
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

module.exports = DiaryCollector;
