import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { extractColors } from '../utils/helpers'

export function useArchetypeCards(deckColors: string, activeFormat: string, activeSet: string) {
  const baseColor = extractColors(deckColors)

  return useQuery({
    queryKey: queryKeys.archetypeCards(activeSet, activeFormat, baseColor),
    queryFn: async () => {
      if (!baseColor || baseColor.length > 3) return []

      const chars = baseColor.split('')
      const permutations: string[] = []

      if (chars.length === 2) {
        permutations.push(chars[0] + chars[1], chars[1] + chars[0])
      } else if (chars.length === 3) {
        const [a, b, c] = chars
        permutations.push(a + b + c, a + c + b, b + a + c, b + c + a, c + a + b, c + b + a)
      } else {
        permutations.push(baseColor)
      }

      // Fetch deck-specific card stats
      const { data: deckData, error: deckError } = await supabase
        .from('card_stats')
        .select('*')
        .eq('set_code', activeSet)
        .eq('format', activeFormat.trim())
        .in('filter_context', permutations)
        .range(0, 5000)

      // Fetch global card stats for comparison
      const { data: globalData, error: globalError } = await supabase
        .from('card_stats')
        .select('card_name, gih_wr, alsa')
        .eq('set_code', activeSet)
        .eq('filter_context', 'Global')
        .eq('format', activeFormat.trim())

      if (deckError || globalError) throw deckError || globalError

      if (!deckData || deckData.length === 0) return []

      // Merge deck data with global data
      const merged = deckData.map((dc: any) => {
        const gc = globalData?.find((g: any) => g.card_name === dc.card_name)
        return {
          ...dc,
          name: dc.card_name,
          global_wr: gc?.gih_wr || null,
          global_alsa: gc?.alsa || null,
        }
      })

      return merged.sort((a: any, b: any) => (b.gih_wr || 0) - (a.gih_wr || 0))
    },
    enabled: !!baseColor && baseColor.length <= 3,
  })
}
