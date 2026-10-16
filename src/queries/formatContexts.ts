import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

/**
 * Raw cross-archetype data of a format, shared by the FLEX and NICHE filters:
 * every card_stats row of the set/format (one per card × archetype context)
 * plus the archetype_stats rows. Both filters go through fetchFormatContexts,
 * so activating the second one doesn't re-download ~7k rows.
 */

export interface ContextRow {
  card_name: string
  rarity: string
  colors: string | null
  filter_context: string
  gih_wr: number | null
  img_count: number
}

export interface ArchetypeRow {
  archetype_name: string
  colors: string | null
  win_rate: number | null
  games_count: number | null
}

export interface FormatContexts {
  rows: ContextRow[]
  archRows: ArchetypeRow[]
}

// Sorted colour identity of an archetype code/colours string, e.g. "RU" -> "RU".
export const colorKey = (s: string | null | undefined) =>
  String(s ?? '').replace(' + Splash', '').replace(/[^WUBRG]/g, '').split('').sort().join('')

// archetype_stats aggregate rows that are not individual decks.
export const AGGREGATE_NAMES = new Set([
  'All Decks', 'Two-color', 'Two-color + Splash', 'Three-color',
  'Three-color + Splash', 'Mono-color', 'Mono-color + Splash',
])

async function loadFormatContexts(activeSet: string, activeFormat: string): Promise<FormatContexts> {
  // A set/format holds ~7k card_stats rows (≈250 cards × ~20 archetype
  // contexts), well over the server's hard 1000-row cap, so we must page.
  // Ordering is by (card_name, filter_context) — a deterministic total
  // order so range paging never skips/duplicates rows. (Ordering by `id`
  // is NOT indexed for this filter and times out.)
  const COLS = 'card_name, rarity, colors, filter_context, gih_wr, img_count'
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

  // Archetype stats + first card page (with total count), in parallel.
  const [archResult, firstPage] = await Promise.all([
    supabase
      .from('archetype_stats')
      .select('archetype_name, colors, win_rate, games_count')
      .eq('set_code', activeSet)
      .eq('format', activeFormat),
    page(0, true),
  ])

  if (archResult.error) throw archResult.error
  if (firstPage.error) throw firstPage.error
  const total = firstPage.count ?? firstPage.data?.length ?? 0
  const rows = [...(firstPage.data ?? [])] as ContextRow[]

  // Remaining pages fetched in parallel (count is known up front).
  const reqs = []
  for (let from = PAGE; from < total; from += PAGE) reqs.push(page(from, false))
  for (const res of await Promise.all(reqs)) {
    if (res.error) throw res.error
    rows.push(...((res.data ?? []) as ContextRow[]))
  }

  return { rows, archRows: (archResult.data ?? []) as ArchetypeRow[] }
}

export function fetchFormatContexts(queryClient: QueryClient, activeSet: string, activeFormat: string) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.formatContexts(activeSet, activeFormat),
    queryFn: () => loadFormatContexts(activeSet, activeFormat),
    staleTime: 5 * 60_000,
  })
}
