import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { normalizeRarity } from '../utils/helpers'

/**
 * "Pivot cards" of a format = commons/uncommons that contribute consistently
 * whatever the archetype.
 *
 * The consistency metric is the standard deviation NOT of the card's raw GIH
 * win rate across archetypes, but of its DELTA vs each host archetype's win
 * rate (cardWR_in_archetype − archetypeWR). Raw WR is confounded by archetype
 * strength — a card in a weak archetype scores low there even when it pulls its
 * weight — so the delta isolates the card's own, archetype-independent value.
 *
 * Mean and stddev are WEIGHTED by each archetype's meta share, normalised over
 * the archetypes where the card has a valued WR. A big delta in a 1%-of-meta
 * archetype thus barely moves the score, while the same delta in a 15% pillar
 * counts fully — a card close to archetype level everywhere it actually gets
 * played isn't disqualified by one fringe outlier.
 *
 * A card is eligible when:
 *   1. it is a Common or Uncommon,
 *   2. its global GIH win rate is at least the format baseline (All Decks WR)
 *      — it is genuinely good in absolute terms,
 *   3. it has a delta in at least MIN_ARCHETYPES archetypes,
 *   4. those archetypes cover at least MIN_META_COVERAGE of the metagame
 *      (so a low-variance niche card can't masquerade as a pivot),
 *   5. its mean delta is at least MIN_MEAN_DELTA (it performs ~at archetype
 *      level on average — it doesn't consistently drag the deck down).
 * Among eligible cards, the bottom 15% by stddev of delta (the flattest =
 * the most reliable) are flagged as pivots — a relative, not arbitrary, cut.
 */

// Share of the eligible pool flagged as pivots (lowest delta-stddev first).
const PIVOT_PERCENTILE = 0.20
// A card needs a delta in at least this many archetypes for its stddev to be
// statistically meaningful (avoids 1-2 point "flat" noise dominating the cut).
const MIN_ARCHETYPES = 3
// The archetypes a pivot is played in must represent at least this % of the
// metagame (sum of meta share, splash variants of the same colours included).
// Calibrated on 5 sets: legitimate pivots all sit ≥25%, niche gold cards below.
const MIN_META_COVERAGE = 25
// Minimum mean delta: a pivot must perform roughly at its host archetypes'
// level on average (within ~1.25%), so a consistent under-performer can't qualify.
const MIN_MEAN_DELTA = -1.25

// Sorted colour identity of an archetype code/colours string, e.g. "RU" -> "RU".
const colorKey = (s: string | null | undefined) =>
  String(s ?? '').replace(' + Splash', '').replace(/[^WUBRG]/g, '').split('').sort().join('')

// archetype_stats aggregate rows that are not individual decks.
const AGGREGATE_NAMES = new Set([
  'All Decks', 'Two-color', 'Two-color + Splash', 'Three-color',
  'Three-color + Splash', 'Mono-color', 'Mono-color + Splash',
])

export interface FormatPivotsResult {
  pivotNames: Set<string>
  stdDevByName: Record<string, number>
  eligibleCount: number
}

const EMPTY: FormatPivotsResult = { pivotNames: new Set(), stdDevByName: {}, eligibleCount: 0 }

export function useFormatPivots(activeSet: string, activeFormat: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.formatPivots(activeSet, activeFormat),
    queryFn: async (): Promise<FormatPivotsResult> => {
      if (!activeSet) return EMPTY

      // A set/format holds ~7k card_stats rows (≈250 cards × ~20 archetype
      // contexts), well over the server's hard 1000-row cap, so we must page.
      // Ordering is by (card_name, filter_context) — a deterministic total
      // order so range paging never skips/duplicates rows. (Ordering by `id`
      // is NOT indexed for this filter and times out.)
      const COLS = 'card_name, rarity, filter_context, gih_wr, img_count'
      const PAGE = 1000
      const page = (from: number, withCount: boolean) =>
        supabase
          .from('card_stats')
          .select(COLS, withCount ? { count: 'exact' } : undefined)
          .eq('set_code', activeSet)
          .eq('format', activeFormat)
          .order('card_name', { ascending: true })
          .order('filter_context', { ascending: true })
          .range(from, from + PAGE - 1)

      // Archetype stats (baseline WR + per-archetype meta shares) + first card
      // page (with total count), in parallel.
      const [archResult, firstPage] = await Promise.all([
        supabase
          .from('archetype_stats')
          .select('archetype_name, colors, win_rate, games_count')
          .eq('set_code', activeSet)
          .eq('format', activeFormat),
        page(0, true),
      ])

      if (archResult.error) throw archResult.error
      const archRows = (archResult.data ?? []) as any[]
      const globalMeanWR = archRows.find(a => a.archetype_name === 'All Decks')?.win_rate ?? 55.0
      const individualDecks = archRows.filter(a => !AGGREGATE_NAMES.has(a.archetype_name))
      const totalGames = individualDecks.reduce((s, d) => s + (d.games_count || 0), 0) || 1

      // Per colour identity: meta share (%) summing splash variants together,
      // and the win rate of the pure (non-splash) archetype — the baseline we
      // subtract from the card's WR to get its delta. (Keys e.g. "RU".)
      const metaShareByColors: Record<string, number> = {}
      const archetypeWRByColors: Record<string, number> = {}
      for (const d of individualDecks) {
        const k = colorKey(d.colors)
        metaShareByColors[k] = (metaShareByColors[k] || 0) + (d.games_count || 0) / totalGames * 100
        if (!String(d.colors).includes('Splash') && d.win_rate != null) archetypeWRByColors[k] = d.win_rate
      }

      if (firstPage.error) throw firstPage.error
      const total = firstPage.count ?? firstPage.data?.length ?? 0
      const rows: any[] = [...(firstPage.data ?? [])]

      // Remaining pages fetched in parallel (count is known up front).
      const reqs = []
      for (let from = PAGE; from < total; from += PAGE) reqs.push(page(from, false))
      for (const res of await Promise.all(reqs)) {
        if (res.error) throw res.error
        rows.push(...(res.data ?? []))
      }

      if (rows.length === 0) return EMPTY

      const minGames = activeFormat.toLowerCase().includes('sealed') ? 10 : 500

      // Group rows by card: global WR (absolute quality) + the per-archetype
      // context/WR pairs (used for delta consistency and metagame coverage).
      interface Agg { rarity: string; globalWr: number | null; archStats: { ctx: string; wr: number }[] }
      const byCard = new Map<string, Agg>()
      for (const row of rows as any[]) {
        let agg = byCard.get(row.card_name)
        if (!agg) {
          agg = { rarity: row.rarity, globalWr: null, archStats: [] }
          byCard.set(row.card_name, agg)
        }
        if (row.filter_context === 'Global') {
          agg.globalWr = row.gih_wr
        } else {
          // Only real 2 & 3-colour archetype contexts with enough games.
          const ctxLen = (String(row.filter_context).match(/[WUBRG]/g) || []).length
          if ((ctxLen === 2 || ctxLen === 3) && row.gih_wr != null && row.img_count >= minGames) {
            agg.archStats.push({ ctx: row.filter_context, wr: row.gih_wr })
          }
        }
      }

      // Keep eligible cards and score them by the stddev of their deltas.
      const eligible: { name: string; std: number }[] = []
      const stdDevByName: Record<string, number> = {}
      for (const [name, agg] of byCard) {
        const r = normalizeRarity(agg.rarity)
        if (r !== 'C' && r !== 'U') continue
        if (agg.globalWr == null || agg.globalWr < globalMeanWR) continue

        // Delta per archetype = card WR − pure archetype WR. Skip contexts whose
        // pure archetype WR is unknown (only a splash variant of those colours).
        const entries = agg.archStats
          .filter(a => archetypeWRByColors[colorKey(a.ctx)] != null)
          .map(a => ({ key: colorKey(a.ctx), delta: a.wr - archetypeWRByColors[colorKey(a.ctx)] }))
        if (entries.length < MIN_ARCHETYPES) continue

        // Metagame coverage: distinct colour identities (so a card seen in both
        // a context and its splash sibling isn't double-counted).
        const coveredKeys = new Set(agg.archStats.map(a => colorKey(a.ctx)))
        let coverage = 0
        for (const k of coveredKeys) coverage += metaShareByColors[k] || 0
        if (coverage < MIN_META_COVERAGE) continue

        // Each delta is weighted by its archetype's meta share, normalised over
        // the card's own archetypes. A pure context and its splash sibling map
        // to the same colour identity and split its share, so an identity never
        // weighs more just because the card has two rows for it. Falls back to
        // equal weights if no share data is available.
        const keyCount: Record<string, number> = {}
        for (const e of entries) keyCount[e.key] = (keyCount[e.key] || 0) + 1
        let weights = entries.map(e => (metaShareByColors[e.key] || 0) / keyCount[e.key])
        let totalWeight = weights.reduce((a, b) => a + b, 0)
        if (totalWeight <= 0) {
          weights = entries.map(() => 1)
          totalWeight = entries.length
        }

        const meanDelta = entries.reduce((s, e, i) => s + weights[i] * e.delta, 0) / totalWeight
        if (meanDelta < MIN_MEAN_DELTA) continue

        const variance = entries.reduce((s, e, i) => s + weights[i] * (e.delta - meanDelta) ** 2, 0) / totalWeight
        const std = Math.sqrt(variance)
        eligible.push({ name, std })
        stdDevByName[name] = std
      }

      // Bottom 15% by delta-stddev = the most consistent contributors = pivots.
      eligible.sort((a, b) => a.std - b.std)
      const cut = eligible.length > 0 ? Math.max(1, Math.round(eligible.length * PIVOT_PERCENTILE)) : 0
      const pivotNames = new Set(eligible.slice(0, cut).map(e => e.name))

      return { pivotNames, stdDevByName, eligibleCount: eligible.length }
    },
    enabled: enabled && !!activeSet,
    staleTime: 5 * 60_000,
  })
}
