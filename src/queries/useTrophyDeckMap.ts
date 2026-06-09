import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface TrophyMapPoint {
  aggregate_id: string
  archetype: string | null
  colors: string | null
  wins: number | null
  x: number
  y: number
  cluster: number | null
  cluster_label: string | null
}

const PAGE = 1000

/**
 * Charge les coordonnées 2D précalculées (UMAP) des decks trophées pour un
 * set/format depuis la table `trophy_deck_map`. Pagine au-delà de 1000 lignes
 * (limite par défaut de PostgREST).
 */
export function useTrophyDeckMap(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trophyDeckMap(activeSet, activeFormat),
    queryFn: async (): Promise<TrophyMapPoint[]> => {
      if (!activeSet) return []
      const all: TrophyMapPoint[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('trophy_deck_map')
          .select('aggregate_id,archetype,colors,wins,x,y,cluster,cluster_label')
          .eq('set_code', activeSet)
          .eq('format', activeFormat)
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as TrophyMapPoint[]
        all.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
      return all
    },
    enabled: enabled && !!activeSet,
    staleTime: 5 * 60_000,
  })
}

/**
 * Récupère la decklist (maindeck) d'un deck trophée à la demande (au clic sur un point).
 */
export function useTrophyDeckCardlist(aggregateId: string | null) {
  return useQuery({
    queryKey: queryKeys.trophyDeck(aggregateId || ''),
    queryFn: async (): Promise<Record<string, number>> => {
      if (!aggregateId) return {}
      const { data, error } = await supabase
        .from('trophy_decks')
        .select('cardlist')
        .eq('aggregate_id', aggregateId)
        .single()
      if (error) throw error
      return (data?.cardlist as Record<string, number>) || {}
    },
    enabled: !!aggregateId,
    staleTime: 30 * 60_000,
  })
}
