import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { DiaryPick } from '../types'

/**
 * Picks d'un événement. Chargé à la demande : 42 picks portant chacun le
 * contenu complet de leur pack, ce serait trop lourd dans la liste.
 */
export function usePicks(eventId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.picks(eventId ?? ''),
    enabled: Boolean(eventId) && enabled,
    queryFn: async (): Promise<DiaryPick[]> => {
      const { data, error } = await supabase
        .from('diary_picks')
        .select('*')
        .eq('event_id', eventId!)
        .order('pack_number')
        .order('pick_number')
      if (error) throw error
      return (data ?? []) as unknown as DiaryPick[]
    },
  })
}
