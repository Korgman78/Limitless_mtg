import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface CardMapPoint {
  card_name: string
  x: number
  y: number
  community: number
  degree: number
}

const PAGE = 1000

/**
 * Charge les coordonnées 2D précalculées (UMAP des cartes) + la communauté
 * Louvain de chaque carte pour un set/format depuis `card_map`. Alimente les
 * modes "Map" et "Communities" de la pop-up Card Graphs.
 *
 * Lazy : `enabled` reste false tant que l'utilisateur n'ouvre pas un mode
 * graphe (le mode WR/ALSA par défaut n'a besoin d'aucune donnée précalculée).
 */
export function useCardMap(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cardMap(activeSet, activeFormat),
    queryFn: async (): Promise<Map<string, CardMapPoint>> => {
      const out = new Map<string, CardMapPoint>()
      if (!activeSet) return out

      const { count, error: countErr } = await supabase
        .from('card_map')
        .select('card_name', { count: 'exact', head: true })
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
      if (countErr) throw countErr

      const total = count || 0
      if (total === 0) return out

      const pages = Math.ceil(total / PAGE)
      const requests = Array.from({ length: pages }, (_, i) =>
        supabase
          .from('card_map')
          .select('card_name,x,y,community,degree')
          .eq('set_code', activeSet)
          .eq('format', activeFormat)
          .order('card_name', { ascending: true })
          .range(i * PAGE, i * PAGE + PAGE - 1)
      )

      const results = await Promise.all(requests)
      for (const r of results) {
        if (r.error) throw r.error
        for (const row of (r.data || []) as CardMapPoint[]) {
          out.set(row.card_name, row)
        }
      }
      return out
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}
