/**
 * Lecture des "Courses" Arena : score et deck construit d'un evenement.
 *
 * Arena emet periodiquement une charge {"Courses":[...]} listant les evenements
 * en cours. Chaque course porte CurrentWins / CurrentLosses et CourseDeck.
 *
 * Pieges verifies sur un Player.log reel :
 *
 *  1. CourseId n'est PAS le draftId, et aucun identifiant ne relie les deux.
 *     Le rattachement se fait donc par le CONTENU — mais par le POOL, pas par
 *     le deck construit. La course transporte `CardPool` : les 42 cartes
 *     draftees, exactement ce que la table diary_picks contient. Mesure sur un
 *     log reel : 100 % de recouvrement pour la bonne paire, 62 % au maximum
 *     pour les mauvaises.
 *
 *     Le deck construit ne sert plus que de repli. Il avait ete choisi en
 *     premier lieu parce que les mauvaises paires y tombaient a 8-16 % — mais
 *     c'etait mesure entre extensions differentes. Sur plusieurs drafts d'une
 *     MEME extension, elles montent a 61-65 % : un deck de 18 cartes partage
 *     trop de communes avec le pool du draft voisin. Un score s'est ainsi
 *     recopie d'un evenement sur l'autre. Le pool complet, lui, garde une
 *     separation franche.
 *
 *  2. Arena OMET le champ quand la valeur vaut zero : un evenement a 0-1 est
 *     logue avec CurrentWins absent. Toujours retomber sur 0, jamais sur null.
 */

/** Recouvrement exige selon ce qu'on a pu comparer. */
const POOL_THRESHOLD = 0.9; // CardPool vs picks : mesure 100 % contre 62 %
const DECK_THRESHOLD = 0.8; // repli deck construit : mesure 89-94 % contre 61-65 %

/** Conserve pour le rattachement des matchs, qui compare des cartes vues en jeu. */
const MATCH_THRESHOLD = 0.6;

const NEWLINE = String.fromCharCode(10);

/**
 * Regles d'arret par format. Un evenement qui les atteint est TERMINE : son
 * score et ses matchs ne bougent plus, seuls les commentaires restent ouverts.
 *
 * En Traditional la course fait exactement 3 rondes, quel qu'en soit l'issue.
 * En BO1 elle s'arrete a 7 victoires ou 3 defaites.
 */
const EVENT_LIMITS = {
  TradDraft: { rounds: 3 },
  TradSealed: { rounds: 3 },
  PremierDraft: { maxWins: 7, maxLosses: 3 },
  Sealed: { maxWins: 7, maxLosses: 3 },
  ArenaDirect_Sealed: { maxWins: 7, maxLosses: 3 },
};

const DEFAULT_LIMITS = { maxWins: 7, maxLosses: 3 };

/**
 * L'evenement a-t-il atteint sa fin de course ?
 *
 * C'est le garde-fou de dernier recours : meme si un rattachement se trompe,
 * il ne peut plus reecrire le resultat d'un evenement deja clos.
 */
function isEventSettled(format, wins, losses) {
  const limits = EVENT_LIMITS[format] ?? DEFAULT_LIMITS;
  const w = wins ?? 0;
  const l = losses ?? 0;

  if (limits.rounds) return w + l >= limits.rounds;
  return w >= limits.maxWins || l >= limits.maxLosses;
}

/** Extrait les courses d'une ligne de log, ou null si ce n'en est pas une. */
function parseCoursesLine(line) {
  const start = line.indexOf('{"Courses":');
  if (start < 0) return null;

  try {
    const payload = JSON.parse(line.slice(start));
    return Array.isArray(payload.Courses) ? payload.Courses : null;
  } catch {
    return null;
  }
}

/** Un evenement de draft/sealed, par opposition au constructed. */
function isLimitedCourse(course) {
  return /(Draft|Sealed)/i.test(course?.InternalEventName || '');
}

/** Score reel : un champ absent vaut zero, pas "inconnu". */
function readScore(course) {
  return {
    wins: course.CurrentWins ?? 0,
    losses: course.CurrentLosses ?? 0,
  };
}

/** [{cardId, quantity}] -> liste plate d'arenaId, quantites conservees. */
function readEntries(list) {
  return (list || [])
    .filter((entry) => entry?.cardId && entry?.quantity)
    .map((entry) => ({ arenaId: entry.cardId, qty: entry.quantity }));
}

function deckEntries(course) {
  return readEntries(course?.CourseDeck?.MainDeck);
}

/**
 * Reserve : en Limited, c'est le reste du pool drafte.
 *
 * Indispensable pour les suggestions d'ajout de "Test my deck", qui ne piochent
 * QUE dans `sideboardCards`. Sans cette section l'analyse ne propose jamais rien
 * a ajouter, faute de candidats.
 */
function sideboardEntries(course) {
  return readEntries(course?.CourseDeck?.Sideboard);
}

/** Les 42 cartes draftees, telles que la course les porte. */
function cardPoolIds(course) {
  return (course?.CardPool || []).map(Number).filter(Number.isFinite);
}

/**
 * Part du deck qui provient du pool drafte. Les terrains de base font
 * naturellement baisser le ratio : ils ne sont jamais dans le pool.
 */
function poolOverlap(course, pickedArenaIds) {
  const entries = deckEntries(course);
  if (!entries.length || !pickedArenaIds?.size) return 0;

  const fromPool = entries.filter((e) => pickedArenaIds.has(e.arenaId)).length;
  return fromPool / entries.length;
}

/**
 * Affinite d'une course avec un pool, et sur quelle base elle a ete mesuree.
 *
 * Le pool de la course est compare aux picks quand il est disponible : c'est
 * une egalite d'ensembles, pas une ressemblance. Le deck ne sert que si Arena
 * n'a pas encore emis `CardPool`.
 */
function courseAffinity(course, pickedArenaIds) {
  if (!pickedArenaIds?.size) return { overlap: 0, threshold: 1, basis: 'aucune' };

  const ids = cardPoolIds(course);
  if (ids.length) {
    const hits = ids.filter((id) => pickedArenaIds.has(id)).length;
    return { overlap: hits / ids.length, threshold: POOL_THRESHOLD, basis: 'pool' };
  }

  return {
    overlap: poolOverlap(course, pickedArenaIds),
    threshold: DECK_THRESHOLD,
    basis: 'deck',
  };
}

/**
 * Rattache les courses aux pools, EXCLUSIVEMENT : une course va a un seul
 * evenement, un evenement recoit une seule course.
 *
 * `pools` : Map(eventId -> Set(arenaId)). Plusieurs drafts peuvent etre en
 * cours en meme temps — Arena laisse finir les matchs d’un draft apres en avoir
 * commence un autre — et le draft courant n’est pas forcement celui que le log
 * en cours decrit : apres une rotation du Player.log, les picks ont disparu du
 * fichier alors que la course, elle, est toujours emise. On resout donc contre
 * TOUS les pools, sans privilegier le draft de la session.
 *
 * L'attribution est globale et gloutonne : on classe toutes les paires
 * candidates par affinite decroissante et on consomme les deux cotes. Sans
 * cette exclusivite, deux courses pouvaient revendiquer le meme pool, ou une
 * course se poser sur un pool qu'une autre decrivait bien mieux.
 */
function matchCoursesToPools(courses, pools) {
  const candidates = [];

  for (const course of courses) {
    if (!isLimitedCourse(course)) continue;

    for (const [eventId, pool] of pools) {
      const { overlap, threshold, basis } = courseAffinity(course, pool);
      if (overlap >= threshold) {
        candidates.push({ eventId, course, overlap, basis });
      }
    }
  }

  candidates.sort((a, b) => b.overlap - a.overlap);

  const usedCourses = new Set();
  const usedEvents = new Set();
  const matches = [];

  for (const candidate of candidates) {
    if (usedCourses.has(candidate.course) || usedEvents.has(candidate.eventId)) continue;
    usedCourses.add(candidate.course);
    usedEvents.add(candidate.eventId);
    matches.push(candidate);
  }

  return matches;
}

/**
 * Rend le deck au format d'export MTGA, seule forme stockee en base.
 * `resolveName` peut renvoyer null : les cartes non resolues (terrains de base,
 * absents de card_list) sont omises plutot que d'inventer un nom.
 */
async function toMtgaExport(course, resolveName) {
  const lines = [];
  let skipped = 0;
  let resolved = 0;

  const section = async (header, entries) => {
    if (!entries.length) return;
    if (lines.length) lines.push('');
    lines.push(header);

    for (const entry of entries) {
      const name = await resolveName(entry.arenaId);
      if (name) {
        lines.push(`${entry.qty} ${name}`);
        resolved += entry.qty;
      } else {
        skipped += entry.qty;
      }
    }
  };

  await section('Deck', deckEntries(course));
  await section('Sideboard', sideboardEntries(course));

  return { text: lines.join(NEWLINE), skipped, resolved };
}

module.exports = {
  MATCH_THRESHOLD,
  POOL_THRESHOLD,
  DECK_THRESHOLD,
  parseCoursesLine,
  isLimitedCourse,
  isEventSettled,
  readScore,
  deckEntries,
  sideboardEntries,
  cardPoolIds,
  poolOverlap,
  courseAffinity,
  matchCoursesToPools,
  toMtgaExport,
};
