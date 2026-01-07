import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { Card } from '../types'

interface CardsResult {
  cards: Card[]
  globalMeanWR: number
}

export function useCards(activeSet: string, activeFormat: string, archetypeFilter: string) {
  return useQuery({
    queryKey: queryKeys.cards(activeSet, activeFormat, archetypeFilter),
    queryFn: async (): Promise<CardsResult> => {
      if (!activeSet) return { cards: [], globalMeanWR: 55.0 }

      // Fetch global mean WR
      const { data: globalDeck } = await supabase
        .from('archetype_stats')
        .select('win_rate')
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
        .eq('archetype_name', 'All Decks')
        .single()

      const globalMeanWR = globalDeck?.win_rate || 55.0

      // Fetch cards
      const { data, error } = await supabase
        .from('card_stats')
        .select('*')
        .eq('set_code', activeSet)
        .eq('filter_context', archetypeFilter)
        .eq('format', activeFormat)

      if (error) throw error
      if (!data) return { cards: [], globalMeanWR }

      const formattedCards: Card[] = data.map((c: any) => ({
        id: c.id,
        name: c.card_name,
        rarity: c.rarity,
        colors: c.colors,
        gih_wr: c.gih_wr,
        alsa: c.alsa,
        img_count: c.img_count,
        win_rate_history: c.win_rate_history,
      }))

      return { cards: formattedCards, globalMeanWR }
    },
    enabled: !!activeSet,
  })
}
