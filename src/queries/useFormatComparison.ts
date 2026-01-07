import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export function useFormatComparison(activeSet: string, compareMode: string) {
  return useQuery({
    queryKey: queryKeys.formatComparison(activeSet, compareMode),
    queryFn: async () => {
      let query
      if (compareMode === 'archetypes') {
        query = supabase.from('archetype_comparison_pivot').select('*').eq('set_code', activeSet)
      } else {
        query = supabase.from('comparison_pivot_v1_3').select('*').eq('set_code', activeSet).eq('filter_context', 'Global')
      }
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}
