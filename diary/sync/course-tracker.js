/**
 * Lecture des "Courses" Arena : score et deck construit d'un evenement.
 *
 * Arena emet periodiquement une charge {"Courses":[...]} listant les evenements
 * en cours. Chaque course porte CurrentWins / CurrentLosses et CourseDeck.
 *
 * Deux pieges verifies sur un Player.log reel :
 *
 *  1. CourseId n'est PAS le draftId. Aucun identifiant ne relie les deux, donc
 *     on rattache une course a un draft par le CONTENU : le deck construit est
 *     tire du pool drafte. Mesure sur un log reel, la bonne paire ressort a
 *     89-91 % de recouvrement contre 8-16 % pour les mauvaises — la separation
 *     est nette, d'ou le seuil a 60 %.
 *
 *  2. Arena OMET le champ quand la valeur vaut zero : un evenement a 0-1 est
 *     logue avec CurrentWins absent. Toujours retomber sur 0, jamais sur null.
 */

const MATCH_THRESHOLD = 0.6;
const NEWLINE = String.fromCharCode(10);

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
function deckEntries(course) {
  return (course?.CourseDeck?.MainDeck || [])
    .filter((entry) => entry?.cardId && entry?.quantity)
    .map((entry) => ({ arenaId: entry.cardId, qty: entry.quantity }));
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
 * Choisit la course correspondant au pool passe, ou null si aucune ne franchit
 * le seuil (cas normal : le draft en cours n'a pas encore de deck soumis).
 */
function findMatchingCourse(courses, pickedArenaIds) {
  let best = null;
  let bestScore = 0;

  for (const course of courses) {
    if (!isLimitedCourse(course)) continue;

    const overlap = poolOverlap(course, pickedArenaIds);
    if (overlap > bestScore) {
      bestScore = overlap;
      best = course;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? { course: best, overlap: bestScore } : null;
}

/**
 * Rend le deck au format d'export MTGA, seule forme stockee en base.
 * `resolveName` peut renvoyer null : les cartes non resolues (terrains de base,
 * absents de card_list) sont omises plutot que d'inventer un nom.
 */
async function toMtgaExport(course, resolveName) {
  const lines = ['Deck'];
  let skipped = 0;
  let resolved = 0;

  for (const entry of deckEntries(course)) {
    const name = await resolveName(entry.arenaId);
    if (name) {
      lines.push(`${entry.qty} ${name}`);
      resolved += entry.qty;
    } else {
      skipped += entry.qty;
    }
  }

  return { text: lines.join(NEWLINE), skipped, resolved };
}

module.exports = {
  MATCH_THRESHOLD,
  parseCoursesLine,
  isLimitedCourse,
  readScore,
  deckEntries,
  poolOverlap,
  findMatchingCourse,
  toMtgaExport,
};
