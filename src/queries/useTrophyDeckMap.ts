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
  is_archetypal: boolean
}

const PAGE = 1000

/**
 * Charge les coordonnées 2D précalculées (UMAP) des decks trophées pour un
 * set/format depuis `trophy_deck_map`. Récupère d'abord le total puis fetch
 * toutes les pages EN PARALLÈLE (au lieu de séquentiel) pour rester réactif
 * même avec 15k+ points.
 */
export function useTrophyDeckMap(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trophyDeckMap(activeSet, activeFormat),
    queryFn: async (): Promise<TrophyMapPoint[]> => {
      if (!activeSet) return []

      const { count, error: countErr } = await supabase
        .from('trophy_deck_map')
        .select('aggregate_id', { count: 'exact', head: true })
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
      if (countErr) throw countErr

      const total = count || 0
      if (total === 0) return []

      const pages = Math.ceil(total / PAGE)
      const requests = Array.from({ length: pages }, (_, i) =>
        supabase
          .from('trophy_deck_map')
          .select('aggregate_id,archetype,colors,wins,x,y,cluster,cluster_label,is_archetypal')
          .eq('set_code', activeSet)
          .eq('format', activeFormat)
          .order('aggregate_id', { ascending: true })
          .range(i * PAGE, i * PAGE + PAGE - 1)
      )

      const results = await Promise.all(requests)
      const all: TrophyMapPoint[] = []
      for (const r of results) {
        if (r.error) throw r.error
        all.push(...((r.data || []) as TrophyMapPoint[]))
      }
      return all
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
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
