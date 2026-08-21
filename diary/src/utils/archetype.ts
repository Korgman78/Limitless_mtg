// ─── Détermination de TON archétype à partir de ton deck construit ───────────
//
// Règle DIFFÉRENTE de celle du collecteur (`diary/sync/match-tracker.js`), et
// c'est volontaire : les deux ne s'appliquent pas à la même donnée.
//
//  - Côté adversaire, on ne voit qu'un échantillon de cartes au fil des parties.
//    Voir 4 cartes d'une couleur y est un signal fort : seuil absolu.
//  - Côté deck, on a la liste complète. Un seuil absolu de 4 y désigne un
//    splash comme couleur principale — vérifié sur un deck réel : deux cartes
//    bicolores UW en deux exemplaires suffisaient à faire passer un UB pour du
//    WUB, alors que sa base de mana ne comportait aucun Plains.
//
// Ici la règle est donc RELATIVE : les deux couleurs dominantes, plus une
// troisième seulement si elle rivalise vraiment avec la deuxième.
// ─────────────────────────────────────────────────────────────────────────────

const WUBRG = 'WUBRG'

/** En dessous de ce total de cartes colorées, l'archétype n'est pas concluant. */
export const MIN_COLORED_CARDS = 4

/**
 * Part de la 2e couleur qu'une 3e doit atteindre pour être principale.
 * En dessous, c'est un splash.
 */
export const THIRD_COLOR_RATIO = 0.8

export const sortColors = (colors: string[]): string =>
  [...colors].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join('')

export interface ColoredCard {
  colors: string | null
  type: string | null
  qty: number
}

/**
 * Archétype d'un ensemble de cartes, ou null s'il y en a trop peu.
 *
 * Les terrains sont exclus : ils ne disent pas ce que le deck joue vraiment,
 * une bicolore posant volontiers un terrain de sa couleur de splash.
 */
export function deduceArchetype(cards: ColoredCard[]): string | null {
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  let total = 0

  for (const card of cards) {
    if (!card.colors) continue
    if ((card.type ?? '').toLowerCase().includes('land')) continue

    total += card.qty
    for (const color of card.colors.replace(/[^WUBRG]/g, '')) {
      counts[color] += card.qty
    }
  }

  if (total < MIN_COLORED_CARDS) return null

  const ranked = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  if (ranked.length === 0) return null
  if (ranked.length === 1) return ranked[0][0]

  const main = [ranked[0][0], ranked[1][0]]

  // Une 3e couleur n'est retenue que si elle pèse presque autant que la 2e :
  // sinon c'est un splash, ou le sous-produit d'une carte bicolore.
  const third = ranked[2]
  if (third && third[1] >= ranked[1][1] * THIRD_COLOR_RATIO) {
    main.push(third[0])
  }

  return sortColors(main)
}
