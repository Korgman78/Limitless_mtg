import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { areColorsEqual, extractColors } from '../utils/helpers'
import type { Deck, CrossPerformance } from '../types'

interface CardCrossPerfResult {
  globalStats: {
    gih_wr: number | null
    alsa: number | null
    win_rate_history: number[] | null
  }
  crossPerf: CrossPerformance[]
}

export function useCardCrossPerf(
  cardName: string,
  activeFormat: string,
  activeSet: string,
  decks: Deck[]
) {
  return useQuery({
    queryKey: queryKeys.cardCrossPerf(activeSet, activeFormat, cardName),
    queryFn: async (): Promise<CardCrossPerfResult> => {
      // Fetch global stats for display
      const { data: globalStat, error: globalError } = await supabase
        .from('card_stats')
        .select('gih_wr, alsa, win_rate_history')
        .eq('set_code', activeSet)
        .eq('card_name', cardName)
        .eq('filter_context', 'Global')
        .eq('format', activeFormat)
        .single()

      if (globalError && globalError.code !== 'PGRST116') {
        console.error('Error fetching global stat:', globalError)
      }

      const globalStats = {
        gih_wr: globalStat?.gih_wr || null,
        alsa: globalStat?.alsa || null,
        win_rate_history: globalStat?.win_rate_history || null,
      }

      const avgCardWr = globalStat?.gih_wr || 55.0

      // Fetch all card stats across archetypes
      const { data, error: dataError } = await supabase
        .from('card_stats')
        .select('*')
        .eq('set_code', activeSet)
        .eq('card_name', cardName)
        .eq('format', activeFormat)

      if (dataError) throw dataError

      if (!data || decks.length === 0) {
        return { globalStats, crossPerf: [] }
      }

      const minGames = activeFormat.toLowerCase().includes('sealed') ? 10 : 500

      const perfs = data
        .filter((d: any) => d.filter_context !== 'Global')
        .map((d: any) => {
          if (!d.gih_wr || d.img_count < minGames) return null

          const deck = decks.find((dk: Deck) =>
            areColorsEqual(extractColors(dk.colors), d.filter_context)
          )

          if (deck) {
            if (deck.type !== 'Two colors' && deck.type !== 'Three colors') return null
          } else {
            if (d.filter_context.length !== 2 && d.filter_context.length !== 3) return null
          }

          return {
            deckName: deck ? deck.name : `${d.filter_context} Deck`,
            deckColors: d.filter_context,
            deckWr: deck ? deck.wr : 55.0,
            cardWr: d.gih_wr,
            avgCardWr: avgCardWr,
          }
        })
        .filter(Boolean)
        .filter(
          (v: any, i: number, a: any[]) =>
            a.findIndex((t: any) => t.deckName === v.deckName) === i
        ) as CrossPerformance[]

      return { globalStats, crossPerf: perfs }
    },
    enabled: !!cardName && !!activeSet,
  })
}
