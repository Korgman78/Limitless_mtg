import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { EMBARGOED_SETS } from '../constants'

export function useSets() {
  return useQuery({
    queryKey: queryKeys.sets,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sets')
        .select('code')
        .eq('active', true)
        .order('start_date', { ascending: false })
      if (error) throw error
      // Filter out embargoed sets
      const filteredSets = (data || []).filter(s => !EMBARGOED_SETS.includes(s.code))
      return filteredSets
    },
  })
}
