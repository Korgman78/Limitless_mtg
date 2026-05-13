import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PulseTimeWindow = '3d' | '1w' | '3w' | 'start'

export interface ArchetypePulseItem {
  name: string
  colors: string
  wr: number
  wrDelta: number
  history: number[]
}

export interface CardPulseItem {
  name: string
  rarity: string
  colors: string
  wr: number
  wrDelta: number
  alsa: number | null
  alsaDelta: number | null
  wrHistory: number[]
}

export interface TrophyPulseItem {
  name: string
  freq: number
  delta: number
}

export interface MetagamePulseData {
  archetypes: { rising: ArchetypePulseItem[]; falling: ArchetypePulseItem[] }
  cards: {
    risingByWr: CardPulseItem[]
    fallingByWr: CardPulseItem[]
    risingByAlsa: CardPulseItem[]
    fallingByAlsa: CardPulseItem[]
  }
  trophyMovers: { gaining: TrophyPulseItem[]; losing: TrophyPulseItem[] }
  sampleSize: { trophyDecks: number; totalGames: number }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'])

const LOOKBACK: Record<PulseTimeWindow, number> = {
  '3d': 3,
  '1w': 7,
  '3w': 21,
  'start': Infinity, // handled specially
}

function deltaFromHistory(history: number[] | null, lookback: number): number | null {
  if (!history || history.length < 2) return null
  const current = history[history.length - 1]
  if (lookback === Infinity) {
    // "since start" — compare last vs first
    return Math.round((current - history[0]) * 100) / 100
  }
  const idx = Math.max(0, history.length - 1 - lookback)
  const previous = history[idx]
  return Math.round((current - previous) * 100) / 100
}

function previousValueFromHistory(history: number[] | null, lookback: number): number | null {
  if (!history || history.length < 2) return null
  if (lookback === Infinity) return history[0]
  const idx = Math.max(0, history.length - 1 - lookback)
  return history[idx]
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

function computeTrophyFreqs(trophies: any[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of trophies) {
    let cardlist = t.cardlist
    if (typeof cardlist === 'string') {
      try { cardlist = JSON.parse(cardlist) } catch { cardlist = {} }
    }
    if (!cardlist || typeof cardlist !== 'object') continue
    for (const name of Object.keys(cardlist)) {
      if (BASIC_LANDS.has(name)) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }
  const total = trophies.length
  if (total === 0) return counts
  const freqs = new Map<string, number>()
  for (const [name, count] of counts) {
    freqs.set(name, count / total)
  }
  return freqs
}

// ── Supabase fetchers ──────────────────────────────────────────────────────────

async function fetchAllPages(table: string, query: any) {
  // supabase-js handles pagination automatically for select
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function fetchTrophyDecks(
  setCode: string,
  format: string,
  from: Date,
  to: Date,
): Promise<any[]> {
  const { data, error } = await supabase
    .from('trophy_decks')
    .select('cardlist')
    .eq('set_code', setCode)
    .eq('format', format)
    .gte('trophy_time', from.toISOString())
    .lt('trophy_time', to.toISOString())
  if (error) throw error
  return data || []
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useMetagamePulse(
  activeSet: string,
  activeFormat: string,
  timeWindow: PulseTimeWindow,
) {
  return useQuery({
    queryKey: queryKeys.metagamePulse(activeSet, activeFormat, timeWindow),
    queryFn: async (): Promise<MetagamePulseData> => {
      const now = new Date()
      const isDraft = activeFormat === 'PremierDraft' || activeFormat === 'TradDraft'
      const lookback = LOOKBACK[timeWindow]

      // ── 1. Compute trophy time windows ────────────────────────────────────

      let currentFrom: Date
      let previousFrom: Date
      let previousTo: Date
      let startDate: string | null = null

      if (timeWindow === 'start') {
        // Fetch set start_date
        const { data: setData } = await supabase
          .from('sets')
          .select('start_date')
          .eq('code', activeSet)
          .single()
        startDate = setData?.start_date || null
        const setStart = startDate ? new Date(startDate) : subDays(now, 90)
        const midpoint = new Date((setStart.getTime() + now.getTime()) / 2)
        previousFrom = setStart
        previousTo = midpoint
        currentFrom = midpoint
      } else {
        const days = { '3d': 3, '1w': 7, '3w': 21 }[timeWindow]
        currentFrom = subDays(now, days)
        previousFrom = subDays(now, days * 2)
        previousTo = currentFrom
      }

      // ── 2. Parallel data fetch ────────────────────────────────────────────

      const [archetypesRaw, cardsRaw, currentTrophies, previousTrophies] =
        await Promise.all([
          // Archetypes
          fetchAllPages(
            'archetype_stats',
            supabase
              .from('archetype_stats')
              .select('archetype_name, colors, win_rate, win_rate_history, games_count, initial_wr')
              .eq('set_code', activeSet)
              .eq('format', activeFormat),
          ),
          // Cards — commons & uncommons, Global context only
          fetchAllPages(
            'card_stats',
            supabase
              .from('card_stats')
              .select('card_name, rarity, colors, gih_wr, win_rate_history, alsa, alsa_history, initial_wr, initial_alsa')
              .eq('set_code', activeSet)
              .eq('format', activeFormat)
              .eq('filter_context', 'Global')
              .in('rarity', ['common', 'uncommon']),
          ),
          // Trophy decks — current window
          fetchTrophyDecks(activeSet, activeFormat, currentFrom, now),
          // Trophy decks — previous window
          fetchTrophyDecks(activeSet, activeFormat, previousFrom, previousTo),
        ])

      // ── 3. Archetypes pulse ───────────────────────────────────────────────

      const totalGames = archetypesRaw.reduce(
        (sum: number, a: any) => sum + (a.games_count || 0), 0,
      )

      // Filter out aggregate rows
      const validArchetypes = archetypesRaw.filter(
        (a: any) =>
          a.colors &&
          a.colors.length >= 2 &&
          a.colors.length <= 3 &&
          !['All Decks', 'Two-color', 'Two-color + Splash', 'Three-color', 'Three-color + Splash', 'Mono-color', 'Mono-color + Splash'].includes(a.archetype_name),
      )

      const validGames = validArchetypes.reduce(
        (sum: number, a: any) => sum + (a.games_count || 0), 0,
      )

      const archetypePulseItems: ArchetypePulseItem[] = validArchetypes
        .map((a: any) => {
          // Filter archetypes below 1% meta share
          const metaShare = validGames > 0 ? (a.games_count || 0) / validGames : 0
          if (metaShare < 0.01) return null

          const history: number[] = a.win_rate_history || []
          const wr = a.win_rate || 0

          let wrDelta: number | null
          if (timeWindow === 'start' && a.initial_wr != null) {
            wrDelta = Math.round((wr - a.initial_wr) * 100) / 100
          } else {
            wrDelta = deltaFromHistory(history, lookback)
          }
          if (wrDelta == null) return null

          // Filter false positives: exclude if previous value was 0 or null
          if (timeWindow === 'start') {
            if (a.initial_wr == null || a.initial_wr === 0) return null
          } else {
            const prev = previousValueFromHistory(history, lookback)
            if (prev == null || prev === 0) return null
          }

          return {
            name: a.archetype_name,
            colors: a.colors,
            wr: Math.round(wr * 100) / 100,
            wrDelta,
            history,
          }
        })
        .filter(Boolean) as ArchetypePulseItem[]

      const sortedArchRising = [...archetypePulseItems]
        .filter((a) => a.wrDelta > 0)
        .sort((a, b) => b.wrDelta - a.wrDelta)
        .slice(0, 3)

      const sortedArchFalling = [...archetypePulseItems]
        .filter((a) => a.wrDelta < 0)
        .sort((a, b) => a.wrDelta - b.wrDelta)
        .slice(0, 3)

      // ── 4. Cards pulse ────────────────────────────────────────────────────

      const cardPulseItems: CardPulseItem[] = cardsRaw
        .map((c: any) => {
          const wr = c.gih_wr
          if (!wr || wr <= 0) return null

          const wrHistory: number[] = c.win_rate_history || []
          const alsaHistory: number[] = c.alsa_history || []

          let wrDelta: number | null
          if (timeWindow === 'start' && c.initial_wr != null) {
            wrDelta = Math.round((wr - c.initial_wr) * 100) / 100
          } else {
            wrDelta = deltaFromHistory(wrHistory, lookback)
          }
          if (wrDelta == null) return null

          // False positive filter for WR
          if (timeWindow === 'start') {
            if (c.initial_wr == null || c.initial_wr === 0) return null
          } else {
            const prev = previousValueFromHistory(wrHistory, lookback)
            if (prev == null || prev === 0) return null
          }

          let alsaDelta: number | null = null
          if (isDraft && c.alsa != null && c.alsa > 0) {
            if (timeWindow === 'start' && c.initial_alsa != null) {
              alsaDelta = Math.round((c.alsa - c.initial_alsa) * 100) / 100
            } else {
              alsaDelta = deltaFromHistory(alsaHistory, lookback)
            }
            // Filter false positive for ALSA
            if (timeWindow === 'start') {
              if (c.initial_alsa == null || c.initial_alsa === 0) alsaDelta = null
            } else {
              const prevAlsa = previousValueFromHistory(alsaHistory, lookback)
              if (prevAlsa == null || prevAlsa === 0) alsaDelta = null
            }
          }

          return {
            name: c.card_name,
            rarity: (c.rarity || 'common').charAt(0).toUpperCase(),
            colors: c.colors || '',
            wr: Math.round(wr * 100) / 100,
            wrDelta,
            alsa: isDraft ? c.alsa : null,
            alsaDelta,
            wrHistory,
          }
        })
        .filter(Boolean) as CardPulseItem[]

      const risingByWr = [...cardPulseItems]
        .filter((c) => c.wrDelta > 0)
        .sort((a, b) => b.wrDelta - a.wrDelta)
        .slice(0, 5)

      const fallingByWr = [...cardPulseItems]
        .filter((c) => c.wrDelta < 0)
        .sort((a, b) => a.wrDelta - b.wrDelta)
        .slice(0, 5)

      // For ALSA: lower = picked earlier = positive signal → rising = negative alsaDelta
      const withAlsa = cardPulseItems.filter((c) => c.alsaDelta != null)
      const risingByAlsa = [...withAlsa]
        .filter((c) => c.alsaDelta! < 0) // picked earlier = rising
        .sort((a, b) => a.alsaDelta! - b.alsaDelta!) // most negative first
        .slice(0, 5)

      const fallingByAlsa = [...withAlsa]
        .filter((c) => c.alsaDelta! > 0) // picked later = falling
        .sort((a, b) => b.alsaDelta! - a.alsaDelta!)
        .slice(0, 5)

      // ── 5. Trophy decks pulse ─────────────────────────────────────────────

      const currentFreqs = computeTrophyFreqs(currentTrophies)
      const previousFreqs = computeTrophyFreqs(previousTrophies)

      const allTrophyDeltas: TrophyPulseItem[] = []
      for (const [name, freq] of currentFreqs) {
        const prevFreq = previousFreqs.get(name) || 0
        // Filter false positive: card must exist in previous period
        if (prevFreq === 0) continue
        const delta = Math.round((freq - prevFreq) * 10000) / 10000
        if (delta !== 0) {
          allTrophyDeltas.push({ name, freq, delta })
        }
      }

      const trophyGaining = [...allTrophyDeltas]
        .filter((t) => t.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)

      const trophyLosing = [...allTrophyDeltas]
        .filter((t) => t.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 5)

      // ── 6. Return ─────────────────────────────────────────────────────────

      return {
        archetypes: { rising: sortedArchRising, falling: sortedArchFalling },
        cards: { risingByWr, fallingByWr, risingByAlsa, fallingByAlsa },
        trophyMovers: { gaining: trophyGaining, losing: trophyLosing },
        sampleSize: {
          trophyDecks: currentTrophies.length,
          totalGames,
        },
      }
    },
    enabled: !!activeSet,
    staleTime: 5 * 60 * 1000, // 5 min
  })
}
