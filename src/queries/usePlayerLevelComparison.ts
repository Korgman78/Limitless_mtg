import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

/**
 * Comparaison des cartes par niveau de joueur (top / middle / bottom)
 * pour un set et un format donnés. Lit la vue pivot `card_player_level_pivot`
 * qui expose, par carte, le WR brut et le delta (vs moyenne du niveau) pour
 * chaque palier de joueur.
 */
export function usePlayerLevelComparison(activeSet: string, format: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.playerLevelComparison(activeSet, format),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_player_level_pivot')
        .select('*')
        .eq('set_code', activeSet)
        .eq('format', format)
      if (error) throw error
      return data || []
    },
    enabled,
    staleTime: 5 * 60_000,
  })
}
