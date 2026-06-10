import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { normalizeRarity } from '../utils/helpers'

/**
 * "Pivot cards" of a format = commons/uncommons that perform consistently well
 * whatever the archetype. A card is eligible when:
 *   1. it is a Common or Uncommon,
 *   2. its global GIH win rate is at least the format baseline (All Decks WR),
 *   3. it has WR data in at least MIN_ARCHETYPES archetypes,
 *   4. the archetypes it is played in cover at least MIN_META_COVERAGE of the
 *      metagame (so a low-variance niche card can't masquerade as a pivot).
 * Among eligible cards, the bottom 15% by standard deviation of GIH win rate
 * across archetypes (the flattest = the most reliable) are flagged as pivots.
 *
 * Rather than picking an arbitrary stddev threshold, the cut-off is relative:
 * the 15% most consistent eligible cards are flagged.
 */

// Share of the eligible pool flagged as pivots (lowest stddev first).
const PIVOT_PERCENTILE = 0.15
// A card needs WR data in at least this many archetypes for its stddev to be
// statistically meaningful (avoids 1-2 point "flat" noise dominating the cut).
const MIN_ARCHETYPES = 3
// The archetypes a pivot is played in must represent at least this % of the
// metagame (sum of meta share, splash variants of the same colours included).
// Calibrated on 5 sets: legitimate pivots all sit ≥25%, niche gold cards below.
const MIN_META_COVERAGE = 25

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

      // Meta share (%) per colour identity, summing splash variants of the same
      // colours together (e.g. "Izzet (UR)" + "Izzet (UR) + Splash" -> key "RU").
      const individualDecks = archRows.filter(a => !AGGREGATE_NAMES.has(a.archetype_name))
      const totalGames = individualDecks.reduce((s, d) => s + (d.games_count || 0), 0) || 1
      const metaShareByColors: Record<string, number> = {}
      for (const d of individualDecks) {
        const k = colorKey(d.colors)
        metaShareByColors[k] = (metaShareByColors[k] || 0) + (d.games_count || 0) / totalGames * 100
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

      // Group rows by card (keep the archetype context alongside its WR so we
      // can score both consistency and metagame coverage).
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

      // Keep eligible cards and compute their cross-archetype stddev.
      const eligible: { name: string; std: number }[] = []
      const stdDevByName: Record<string, number> = {}
      for (const [name, agg] of byCard) {
        const r = normalizeRarity(agg.rarity)
        if (r !== 'C' && r !== 'U') continue
        if (agg.globalWr == null || agg.globalWr < globalMeanWR) continue
        if (agg.archStats.length < MIN_ARCHETYPES) continue

        // Metagame coverage: distinct colour identities (so a card seen in both
        // a context and its splash sibling isn't double-counted).
        const coveredKeys = new Set(agg.archStats.map(a => colorKey(a.ctx)))
        let coverage = 0
        for (const k of coveredKeys) coverage += metaShareByColors[k] || 0
        if (coverage < MIN_META_COVERAGE) continue

        const wrs = agg.archStats.map(a => a.wr)
        const mean = wrs.reduce((a, b) => a + b, 0) / wrs.length
        const variance = wrs.reduce((s, v) => s + (v - mean) ** 2, 0) / wrs.length
        const std = Math.sqrt(variance)
        eligible.push({ name, std })
        stdDevByName[name] = std
      }

      // Bottom 15% by stddev = the flattest performers = pivots.
      eligible.sort((a, b) => a.std - b.std)
      const cut = eligible.length > 0 ? Math.max(1, Math.round(eligible.length * PIVOT_PERCENTILE)) : 0
      const pivotNames = new Set(eligible.slice(0, cut).map(e => e.name))

      return { pivotNames, stdDevByName, eligibleCount: eligible.length }
    },
    enabled: enabled && !!activeSet,
    staleTime: 5 * 60_000,
  })
}
