import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { Card } from '../types'

interface CompareCardsResult {
  cards: Card[]
  globalMeanWR: number
}

export function useCompareCards(setCode: string | null, format: string | null) {
  return useQuery({
    queryKey: [...queryKeys.cards(setCode || '', format || '', 'Global'), 'compare'],
    queryFn: async (): Promise<CompareCardsResult> => {
      if (!setCode || !format) return { cards: [], globalMeanWR: 55.0 }

      // Fetch global mean WR
      const { data: globalDeck } = await supabase
        .from('archetype_stats')
        .select('win_rate')
        .eq('set_code', setCode)
        .eq('format', format)
        .eq('archetype_name', 'All Decks')
        .single()

      const globalMeanWR = globalDeck?.win_rate || 55.0

      // Fetch cards (always Global context for comparison)
      const { data, error } = await supabase
        .from('card_stats')
        .select('*')
        .eq('set_code', setCode)
        .eq('filter_context', 'Global')
        .eq('format', format)

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
      }))

      return { cards: formattedCards, globalMeanWR }
    },
    enabled: !!setCode && !!format,
  })
}
