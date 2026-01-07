import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { Deck } from '../types'

interface DecksResult {
  decks: Deck[]
  totalGames: number
}

export function useDecks(activeSet: string, activeFormat: string) {
  return useQuery({
    queryKey: queryKeys.decks(activeSet, activeFormat),
    queryFn: async (): Promise<DecksResult> => {
      if (!activeSet) return { decks: [], totalGames: 1 }

      const { data, error } = await supabase
        .from('archetype_stats')
        .select('*')
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
        .order('win_rate', { ascending: false })

      if (error) throw error
      if (!data) return { decks: [], totalGames: 1 }

      const validDecks = data.filter((d: any) =>
        !['All Decks', 'Two-color', 'Two-color + Splash', 'Three-color', 'Three-color + Splash', 'Mono-color', 'Mono-color + Splash'].includes(d.archetype_name)
      )

      const totalGames = validDecks.reduce((acc: number, curr: any) => acc + (curr.games_count || 0), 0) || 1

      const formattedDecks: Deck[] = validDecks.map((d: any) => {
        let type = 'Other'
        const code = d.colors || ''
        const isSplash = code.includes('Splash')
        const baseColors = code.replace(' + Splash', '').replace(/[^WUBRG]/g, '')
        const count = baseColors.length

        if (count === 1) type = 'Mono-color'
        else if (count === 2 && !isSplash) type = 'Two colors'
        else if (count === 2 && isSplash) type = 'Two colors + splash'
        else if (count === 3 && !isSplash) type = 'Three colors'
        else if (count >= 3) type = 'More than 3 colors'

        return {
          id: d.id,
          name: d.archetype_name,
          colors: d.colors,
          wr: d.win_rate,
          games: d.games_count,
          type: type,
          history: d.win_rate_history && d.win_rate_history.length > 1
            ? d.win_rate_history
            : [d.win_rate, d.win_rate],
        }
      })

      return { decks: formattedDecks, totalGames }
    },
    enabled: !!activeSet,
  })
}
