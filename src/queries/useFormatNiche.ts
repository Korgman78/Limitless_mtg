import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from './keys'
import { fetchFormatContexts, colorKey } from './formatContexts'
import { normalizeRarity } from '../utils/helpers'

/**
 * "Niche cards" of a format = mono-colour commons/uncommons that are secretly
 * a two-colour card: they over-perform in one specific pair of their colour and
 * fall back to ordinary everywhere else. The opposite of FLEX.
 *
 * As for FLEX, the per-archetype measure is the DELTA vs the host archetype's
 * win rate (cardWR_in_pair − pairWR), so a strong pair doesn't make every card
 * look good in it.
 *
 * Only the 2-colour pairs containing the card's colour are compared (4 at
 * most). 3-colour contexts are variants of those pairs; off-colour pairs only
 * see the card as a splash.
 *
 *   home pair  = the pair with the highest delta
 *   gap        = home delta − mean delta of the other pairs
 *
 * The mean of the other pairs is weighted by the card's games in each pair:
 * that is where the card actually gets played, and where its WR is reliable.
 *
 * A card is a niche card when:
 *   1. it is a mono-colour Common or Uncommon,
 *   2. it has a delta in at least MIN_PAIRS pairs of its colour,
 *   3. its home delta is positive — it genuinely over-performs there, rather
 *      than being bad everywhere and only "less bad" in one pair,
 *   4. its gap is at least MIN_GAP points.
 * Sorted by gap, largest first.
 *
 * Draft formats only: in Sealed the per-context sample is far too small for a
 * few-point gap to mean anything.
 */

// Minimum games in hand per pair context for its WR to count (draft formats).
const MIN_GAMES = 500
// A home pair plus at least two others to compare it with.
const MIN_PAIRS = 3
// Gap between the home pair and the others, in WR points. Calibrated on FRA:
// at 3 pts a quarter of the testable cards qualified, mostly noise.
const MIN_GAP = 4

export interface NicheInfo {
  /** Home pair, sorted colour key as in card_stats contexts (e.g. "GU"). */
  home: string
  /** Delta in the home pair, in WR points. */
  homeDelta: number
  /** Games-weighted mean delta of the other pairs. */
  othersDelta: number
  /** homeDelta − othersDelta. */
  gap: number
}

export interface FormatNicheResult {
  nicheByName: Record<string, NicheInfo>
}

const EMPTY: FormatNicheResult = { nicheByName: {} }

export const isNicheFormat = (format: string) => !format.toLowerCase().includes('sealed')

export function useFormatNiche(activeSet: string, activeFormat: string, enabled: boolean) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.formatNiche(activeSet, activeFormat),
    queryFn: async (): Promise<FormatNicheResult> => {
      if (!activeSet || !isNicheFormat(activeFormat)) return EMPTY

      const { rows, archRows } = await fetchFormatContexts(queryClient, activeSet, activeFormat)

      // WR of each pure (non-splash) 2-colour archetype, the delta baseline.
      const pairWR: Record<string, number> = {}
      for (const a of archRows) {
        const k = colorKey(a.colors)
        if (k.length === 2 && !String(a.colors).includes('Splash') && a.win_rate != null) pairWR[k] = a.win_rate
      }

      // Per card: its pair contexts with a valued WR and enough games.
      const byCard = new Map<string, { rarity: string; colors: string; pairs: { key: string; delta: number; games: number }[] }>()
      for (const row of rows) {
        let agg = byCard.get(row.card_name)
        if (!agg) {
          agg = { rarity: row.rarity, colors: colorKey(row.colors), pairs: [] }
          byCard.set(row.card_name, agg)
        }
        const key = colorKey(row.filter_context)
        if (key.length !== 2 || row.filter_context === 'Global') continue
        if (row.gih_wr == null || row.img_count < MIN_GAMES || pairWR[key] == null) continue
        agg.pairs.push({ key, delta: row.gih_wr - pairWR[key], games: row.img_count })
      }

      const nicheByName: Record<string, NicheInfo> = {}
      for (const [name, agg] of byCard) {
        const r = normalizeRarity(agg.rarity)
        if (r !== 'C' && r !== 'U') continue
        if (agg.colors.length !== 1) continue

        const pairs = agg.pairs.filter(p => p.key.includes(agg.colors))
        if (pairs.length < MIN_PAIRS) continue

        const home = pairs.reduce((best, p) => (p.delta > best.delta ? p : best))
        if (home.delta <= 0) continue

        const others = pairs.filter(p => p !== home)
        const games = others.reduce((s, p) => s + p.games, 0)
        const othersDelta = others.reduce((s, p) => s + p.delta * p.games, 0) / games
        const gap = home.delta - othersDelta
        if (gap < MIN_GAP) continue

        nicheByName[name] = { home: home.key, homeDelta: home.delta, othersDelta, gap }
      }

      return { nicheByName }
    },
    enabled: enabled && !!activeSet,
    staleTime: 5 * 60_000,
  })
}
