import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface SetInfo {
  code: string
  name?: string
  active: boolean
  start_date?: string
}

export function useAllSets() {
  return useQuery({
    queryKey: [...queryKeys.sets, 'all'],
    queryFn: async (): Promise<SetInfo[]> => {
      const { data, error } = await supabase
        .from('sets')
        .select('code, name, active, start_date')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data || []) as SetInfo[]
    },
  })
}
