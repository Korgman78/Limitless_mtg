/**
 * Extraction des matchs depuis le Player.log d'Arena.
 *
 * Ce que le log fournit (verifie sur un log reel) :
 *  - `matchGameRoomStateChangedEvent.gameRoomInfo.gameRoomConfig.reservedPlayers`
 *    -> noms, systemSeatId et teamId des deux joueurs, plus l'eventId.
 *  - `...gameRoomInfo.finalMatchResult.resultList` -> une entree par PARTIE
 *    (`MatchScope_Game`) puis une pour le MATCH (`MatchScope_Match`). C'est ce
 *    qui permet de distinguer un 2-1 en matchs d'un 5-4 en parties.
 *  - `greToClientEvent.greToClientMessages[].gameStateMessage.gameObjects`
 *    -> chaque carte vue, avec son `grpId` (= arena_id) et son `ownerSeatId`.
 *    Les cartes de l'adversaire donnent ses couleurs.
 *
 * Ce que le log NE fournit PAS : aucun identifiant reliant un match a un draft.
 * Le rattachement se fait par recouvrement des cartes vues avec le pool drafte
 * — la meme technique que pour les courses. Le siege du joueur en est deduit au
 * passage : c'est celui dont les cartes viennent de mon pool.
 */

const BASIC_TO_COLOR = {
  SubType_Plains: 'W',
  SubType_Island: 'U',
  SubType_Swamp: 'B',
  SubType_Mountain: 'R',
  SubType_Forest: 'G',
};

const WUBRG = 'WUBRG';

/** En dessous, le rattachement n'est pas fiable : mieux vaut ne pas relier. */
const MATCH_THRESHOLD = 0.6;

/**
 * Recense les arenaId des terrains de base croises en jeu, par nom.
 *
 * Les cinq terrains de base sont ABSENTS de card_list, quel que soit le set :
 * leur arenaId depend de l'illustration possedee par le joueur. Le log est la
 * seule source qui les identifie, via `subtypes` sur les objets de jeu. Sans ce
 * recensement, un deck s'enregistre ampute de ses terrains.
 */
function readBasicLandIds(payload, target) {
  for (const message of payload?.greToClientEvent?.greToClientMessages ?? []) {
    for (const object of message?.gameStateMessage?.gameObjects ?? []) {
      if (!object.grpId) continue;
      for (const subtype of object.subtypes ?? []) {
        if (BASIC_TO_COLOR[subtype]) {
          target.set(object.grpId, subtype.replace('SubType_', ''));
        }
      }
    }
  }
}


/** Etat mutable d'un suivi de matchs, a conserver entre les lignes. */
function createMatchTracker() {
  return { current: null, completed: [] };
}

function emptyMatch(matchId, players) {
  return {
    matchId,
    players,
    eventName: players[0]?.eventId ?? null,
    // arenaId des cartes vues, par siege
    cards: { 1: new Set(), 2: new Set() },
    // terrains de base joues, par siege — corrobore les couleurs
    basics: { 1: new Set(), 2: new Set() },
    gameWinners: [],
    matchWinner: null,
  };
}

/**
 * Consomme une ligne de log deja parsee en JSON. Renvoie le match qui vient de
 * se terminer, ou null.
 */
function feedParsedLine(tracker, payload) {
  const room = payload?.matchGameRoomStateChangedEvent?.gameRoomInfo;

  if (room?.gameRoomConfig?.reservedPlayers) {
    const matchId = room.gameRoomConfig.matchId;
    if (!tracker.current || tracker.current.matchId !== matchId) {
      tracker.current = emptyMatch(matchId, room.gameRoomConfig.reservedPlayers);
    }
  }

  for (const message of payload?.greToClientEvent?.greToClientMessages ?? []) {
    for (const object of message?.gameStateMessage?.gameObjects ?? []) {
      if (!tracker.current) continue;
      if (object.type !== 'GameObjectType_Card') continue;
      if (!object.grpId || !object.ownerSeatId) continue;

      tracker.current.cards[object.ownerSeatId]?.add(object.grpId);

      for (const subtype of object.subtypes ?? []) {
        if (BASIC_TO_COLOR[subtype]) {
          tracker.current.basics[object.ownerSeatId]?.add(BASIC_TO_COLOR[subtype]);
        }
      }
    }
  }

  if (room?.finalMatchResult && tracker.current) {
    for (const result of room.finalMatchResult.resultList ?? []) {
      if (result.scope === 'MatchScope_Game') {
        tracker.current.gameWinners.push(result.winningTeamId);
      }
      if (result.scope === 'MatchScope_Match') {
        tracker.current.matchWinner = result.winningTeamId;
      }
    }

    // Un match sans vainqueur declare est encore en cours.
    if (tracker.current.matchWinner != null) {
      const done = tracker.current;
      tracker.current = null;
      tracker.completed.push(done);
      return done;
    }
  }

  return null;
}

/**
 * Couleurs principales d'un siege, ordre WUBRG.
 *
 * Regle : une couleur est PRINCIPALE a partir de 4 cartes vues, en dessous
 * c'est un splash. Prendre simplement les deux couleurs les plus frequentes
 * promouvait un splash au rang de couleur principale des qu'on ne voyait que
 * deux couleurs — un BR avec une carte verte ressortait en "BR" ou pire en
 * "BG" selon l'ordre de tri.
 *
 * Les terrains sont exclus du compte : ils ne disent pas ce que le deck joue
 * vraiment, une bicolore posant volontiers un terrain de sa couleur de splash.
 */
const MAIN_COLOR_MIN_CARDS = 4;

function countColors(match, seat, cardMeta) {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let resolved = 0;

  for (const arenaId of match.cards[seat] ?? []) {
    const meta = cardMeta?.get(arenaId);
    if (!meta?.colors) continue;
    if ((meta.type || '').toLowerCase().includes('land')) continue;

    resolved += 1;
    for (const color of meta.colors.replace(/[^WUBRG]/g, '')) counts[color] += 1;
  }

  return { counts, resolved };
}

function deduceColors(match, seat, cardMeta) {
  const { counts, resolved } = countColors(match, seat, cardMeta);

  const ranked = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  // Trop peu de cartes revelees : les terrains de base restent le meilleur
  // indice disponible, sinon on assume l'inconnu plutot que d'inventer.
  if (resolved < MAIN_COLOR_MIN_CARDS) {
    const fromBasics = [...(match.basics[seat] ?? [])];
    if (fromBasics.length >= 2) return sortColors(fromBasics.slice(0, 2));
    return null;
  }

  const main = ranked.filter(([, n]) => n >= MAIN_COLOR_MIN_CARDS);

  // Une seule couleur franchit le seuil : soit c'est une mono, soit on n'a pas
  // assez vu la seconde. On complete avec la suivante pour rester lisible.
  if (main.length === 0) return sortColors(ranked.slice(0, 2).map(([c]) => c));
  if (main.length === 1 && ranked.length > 1) {
    const second = ranked.find(([c]) => c !== main[0][0]);
    // La seconde n'est retenue que si elle pese vraiment : moitie du seuil.
    if (second && second[1] >= MAIN_COLOR_MIN_CARDS / 2) {
      return sortColors([main[0][0], second[0]]);
    }
  }

  return sortColors(main.map(([c]) => c));
}

function sortColors(colors) {
  return [...colors].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join('');
}

/**
 * Rattache un match a un pool drafte et en tire le point de vue du joueur.
 * `pools` : Map(eventId -> Set(arenaId)).
 */
function resolveMatch(match, pools, cardMeta) {
  let best = { overlap: 0, seat: null, eventId: null };

  for (const seat of [1, 2]) {
    const seen = match.cards[seat];
    if (!seen?.size) continue;

    for (const [eventId, pool] of pools) {
      const hits = [...seen].filter((id) => pool.has(id)).length;
      const overlap = hits / seen.size;
      if (overlap > best.overlap) best = { overlap, seat, eventId };
    }
  }

  if (best.overlap < MATCH_THRESHOLD) return null;

  const mySeat = best.seat;
  const opponentSeat = mySeat === 1 ? 2 : 1;
  const me = match.players.find((p) => p.systemSeatId === mySeat);
  const opponent = match.players.find((p) => p.systemSeatId === opponentSeat);
  if (!me) return null;

  const gamesWon = match.gameWinners.filter((t) => t === me.teamId).length;
  const gamesLost = match.gameWinners.length - gamesWon;

  return {
    matchId: match.matchId,
    eventId: best.eventId,
    overlap: best.overlap,
    opponentName: opponent?.playerName ?? null,
    opponentColors: deduceColors(match, opponentSeat, cardMeta),
    gamesWon,
    gamesLost,
    won: match.matchWinner === me.teamId,
  };
}

module.exports = {
  MATCH_THRESHOLD,
  MAIN_COLOR_MIN_CARDS,
  countColors,
  readBasicLandIds,
  createMatchTracker,
  feedParsedLine,
  resolveMatch,
  deduceColors,
  sortColors,
};
