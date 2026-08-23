// fetch global (Node 18+, Electron 28+) : aucune dependance externe, ce qui
// permet de lancer la synchro avec un `node` nu, sans installer quoi que ce soit.
const {
  isEventSettled,
  matchCoursesToPools,
  readScore,
  toMtgaExport,
} = require('./course-tracker');
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

    // eventId -> set_code, pour resoudre les noms de cartes d'un draft dont
    // le log ne parle plus (rotation du Player.log : plus de draft-start, donc
    // plus de set courant cote parser).
    this.eventSets = new Map();

    // eventId -> {format, wins, losses, matchCount}. Sert au verrou de fin de
    // course : un evenement termine n'accepte plus ni score, ni deck, ni match.
    // Sans cet etat il faudrait relire la base a chaque charge de course, qu'
    // Arena reemet plusieurs fois par minute.
    this.eventState = new Map();

    // Derniers etats ecrits PAR EVENEMENT, pour n'ecrire que sur changement
    // reel. Par evenement et non global : plusieurs drafts peuvent avancer en
    // parallele, un seul compteur les ferait s'ecraser l'un l'autre.
    this.lastDeckText = new Map();
    this.lastScore = new Map();
  }

  /**
   * Recharge les pools drafts depuis la base.
   *
   * Sans ca, le rattachement des courses et des matchs depend entierement de ce
   * que le Player.log courant contient. Or Arena fait tourner son log a chaque
   * redemarrage : le draft d'hier soir — voire de l'heure precedente — n'y a
   * plus ni draft-start ni picks, et tout ce qui suit (score, deck, matchs)
   * cesse silencieusement de remonter. La base, elle, garde les picks.
   */
  async rehydratePools(limit = 12) {
    if (!this.enabled) return 0;

    try {
      const events = await this.request(
        'diary_events?select=id,set_code,format,wins,losses,' +
          'diary_picks(picked_arena_id),diary_matches(match_id),diary_deck_versions(id)' +
          '&deleted_at=is.null&event_type=eq.draft' +
          `&order=created_at.desc&limit=${limit}`,
      );

      let loaded = 0;
      for (const event of events ?? []) {
        // L'etat est memorise meme sans picks : c'est lui qui protege un
        // evenement termine, y compris quand son pool n'est plus rechargeable.
        this.eventState.set(event.id, {
          format: event.format,
          wins: event.wins ?? 0,
          losses: event.losses ?? 0,
          matchCount: (event.diary_matches ?? []).length,
          deckCount: (event.diary_deck_versions ?? []).length,
        });

        const ids = (event.diary_picks ?? [])
          .map((p) => p.picked_arena_id)
          .filter(Boolean);
        if (!ids.length) continue;

        this.pools.set(event.id, new Set(ids));
        if (event.set_code) this.eventSets.set(event.id, event.set_code);
        loaded += 1;
      }

      console.log(`[Diary] ${loaded} pool(s) recharges depuis la base`);
      return loaded;
    } catch (err) {
      console.error('[Diary] Rechargement des pools impossible:', err.message);
      return 0;
    }
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

    try {
      const existing = await this.request(
        `diary_events?draft_id=eq.${encodeURIComponent(draftId)}` +
          '&select=id,format,wins,losses,diary_matches(match_id),diary_deck_versions(id)',
      );

      if (existing?.length) {
        this.eventId = existing[0].id;
        this.eventState.set(this.eventId, {
          format: existing[0].format,
          wins: existing[0].wins ?? 0,
          losses: existing[0].losses ?? 0,
          matchCount: (existing[0].diary_matches ?? []).length,
          deckCount: (existing[0].diary_deck_versions ?? []).length,
        });
        // Le pool rechargé depuis la base reste la reference : les picks rejoues
        // viennent s'y ajouter au lieu de repartir d'un ensemble vide, sinon un
        // rejeu partiel du log retrecirait le pool en cours de route.
        const known = this.pools.get(this.eventId);
        if (known) {
          for (const id of known) this.pickedArenaIds.add(id);
        }
        this.pools.set(this.eventId, this.pickedArenaIds);
        if (setCode) this.eventSets.set(this.eventId, setCode);
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
      if (this.eventId) {
        this.pools.set(this.eventId, this.pickedArenaIds);
        if (setCode) this.eventSets.set(this.eventId, setCode);
        this.eventState.set(this.eventId, {
          format: format || 'PremierDraft',
          wins: 0,
          losses: 0,
          matchCount: 0,
          deckCount: 0,
        });
      }
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
    if (!this.enabled || !this.pools.size) return;

    // Tous les pools, pas seulement le draft de la session : apres une rotation
    // du Player.log le draft en cours n'a plus de picks dans le fichier, alors
    // que sa course continue d'y passer. Se limiter au draft courant revenait a
    // ne plus rien enregistrer du tout jusqu'au draft suivant.
    for (const { eventId, course } of matchCoursesToPools(courses, this.pools)) {
      try {
        await this.applyCourse(eventId, course);
      } catch (err) {
        console.error('[Diary] Mise a jour course impossible:', err.message);
      }
    }
  }

  /**
   * Un evenement dont la course est allee au bout ne bouge plus.
   *
   * C'est le garde-fou de dernier recours, independant du rattachement : meme
   * si une course se posait sur le mauvais draft, elle ne pourrait plus en
   * reecrire le resultat. Seuls les commentaires restent modifiables, et ils
   * passent par le front, pas par ici.
   */
  isSettled(eventId) {
    const state = this.eventState.get(eventId);
    if (!state) return false;
    return isEventSettled(state.format, state.wins, state.losses);
  }

  /** Score et deck d'une course deja rattachee a son evenement. */
  async applyCourse(eventId, course) {
    const { wins, losses } = readScore(course);
    const scoreKey = `${wins}-${losses}`;
    const state = this.eventState.get(eventId);
    const settled = this.isSettled(eventId);

    // Un score identique n'est pas un conflit : Arena reemet la meme charge en
    // boucle. On ne signale que les tentatives de CHANGEMENT sur un evenement
    // clos — c'est exactement la trace qu'un rattachement a derape.
    if (settled && (state.wins !== wins || state.losses !== losses)) {
      console.warn(
        `[Diary] Evenement ${eventId.slice(0, 8)} deja termine ` +
          `(${state.wins}-${state.losses}) : score ${scoreKey} ignore`,
      );
      return;
    }

    if (!settled && scoreKey !== this.lastScore.get(eventId)) {
      await this.request(`diary_events?id=eq.${eventId}`, {
        method: 'PATCH',
        headers: { ...this.headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ wins, losses }),
      });
      this.lastScore.set(eventId, scoreKey);
      if (state) {
        state.wins = wins;
        state.losses = losses;
      }
      console.log(`[Diary] Score mis a jour: ${scoreKey}`);
    }

    // Un evenement clos ne change plus de deck — sauf s'il n'en a aucun. Ce
    // cas arrive au rattrapage : un draft synchronise pour la premiere fois
    // apres coup est deja termine, le verrouiller sans exception le priverait
    // definitivement de sa decklist.
    const mayWriteDeck = !settled || (state ? state.deckCount === 0 : true);
    if (!mayWriteDeck) return;

    const { text, skipped, resolved } = await toMtgaExport(course, (arenaId) =>
      this.resolveDeckCard(arenaId, eventId),
    );

    if (resolved > 0 && text !== this.lastDeckText.get(eventId)) {
      await this.saveDeckVersion(eventId, text, skipped);
      this.lastDeckText.set(eventId, text);
      if (state) state.deckCount += 1;
    }
  }

  /**
   * Nom d'une carte du deck : card_list d'abord, terrains de base ensuite.
   *
   * Le set vient de l'evenement quand on le connait, et non du draft courant :
   * apres une rotation du log il n'y a plus de draft courant, et sans set aucun
   * nom ne se resout — le deck ne serait jamais enregistre.
   */
  async resolveDeckCard(arenaId, eventId) {
    const name = await this.resolveCardName(arenaId, this.eventSets.get(eventId));
    return name ?? this.basicLandIds.get(arenaId) ?? null;
  }

  /**
   * Ajoute une version de deck, numerotee a la suite des existantes.
   *
   * Compare d'abord au dernier deck DEJA EN BASE, pas seulement a celui de la
   * session : sans ca, chaque relance de la synchro reecrirait une version
   * identique et l'historique se remplirait de doublons.
   */
  async saveDeckVersion(eventId, decklistRaw, skipped) {
    const existing = await this.request(
      `diary_deck_versions?event_id=eq.${eventId}` +
        '&select=version_no,decklist_raw&order=version_no.desc',
    );

    // Comparaison a TOUTES les versions, pas seulement a la derniere : un rejeu
    // du log repasse par tout l'historique de build (A, B, C), et comparer a la
    // seule derniere version rajouterait A, B, C a la suite de C a chaque
    // relance. Le prix : un rebuild qui revient exactement a une liste deja
    // jouee ne cree pas de nouvelle version. C'est le bon compromis, la synchro
    // etant faite pour etre relancee.
    if ((existing ?? []).some((v) => v.decklist_raw === decklistRaw)) {
      console.log('[Diary] Deck deja enregistre, aucune version ajoutee');
      return;
    }

    const versionNo = (existing?.[0]?.version_no ?? 0) + 1;

    await this.request('diary_deck_versions', {
      method: 'POST',
      headers: { ...this.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_id: eventId,
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

    // Un evenement clos n'accueille plus de match — mais seulement une fois
    // qu'il a les siens. Le score final arrive parfois avant le dernier match :
    // verrouiller sur le seul etat "termine" lui ferait perdre sa propre
    // derniere ronde.
    const state = this.eventState.get(resolved.eventId);
    if (
      state &&
      this.isSettled(resolved.eventId) &&
      state.matchCount >= state.wins + state.losses
    ) {
      console.warn(
        `[Diary] Evenement ${resolved.eventId.slice(0, 8)} deja termine ` +
          `et complet (${state.matchCount} matchs) : match ` +
          `${String(match.matchId).slice(0, 8)} ignore`,
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

      if (state && matchNumber) state.matchCount = matchNumber;

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
    this.lastDeckText.clear();
    this.lastScore.clear();
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
