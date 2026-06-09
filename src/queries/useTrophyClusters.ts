import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'

export interface ClusterCard { name: string; freq: number; lift: number }
export interface ArchetypeCards {
  colors: string
  label: string | null
  size: number | null
  top_cards: ClusterCard[]
}

/** Cartes signature par archétype (identité couleur) — table trophy_map_archetype_cards. */
export function useTrophyArchetypeCards(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: ['trophyArchetypeCards', activeSet, activeFormat],
    queryFn: async (): Promise<Record<string, ArchetypeCards>> => {
      if (!activeSet) return {}
      const { data, error } = await supabase
        .from('trophy_map_archetype_cards')
        .select('colors,label,size,top_cards')
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
      if (error) throw error
      const map: Record<string, ArchetypeCards> = {}
      for (const row of (data || []) as ArchetypeCards[]) map[row.colors] = row
      return map
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
  })
}

/** aggregate_ids des decks jouant une carte donnée (RPC decks_with_card + index GIN). */
export function useDecksWithCard(activeSet: string, activeFormat: string, card: string | null) {
  return useQuery({
    queryKey: ['decksWithCard', activeSet, activeFormat, card],
    queryFn: async (): Promise<Set<string>> => {
      if (!card) return new Set()
      const { data, error } = await supabase.rpc('decks_with_card', {
        p_set: activeSet, p_format: activeFormat, p_card: card,
      })
      if (error) throw error
      return new Set((data || []).map((r: { aggregate_id: string }) => r.aggregate_id))
    },
    enabled: !!card && !!activeSet,
    staleTime: 10 * 60_000,
  })
}

/** Liste des noms de cartes du set (pour l'autocomplétion de recherche). */
export function useSetCardNames(activeSet: string, enabled = true) {
  return useQuery({
    queryKey: ['setCardNames', activeSet],
    queryFn: async (): Promise<string[]> => {
      if (!activeSet) return []
      const { data, error } = await supabase
        .from('card_list')
        .select('card_name')
        .eq('set_code', activeSet)
      if (error) throw error
      const names = Array.from(new Set((data || []).map((r: { card_name: string }) => r.card_name)))
      names.sort((a, b) => a.localeCompare(b))
      return names
    },
    enabled: enabled && !!activeSet,
    staleTime: 60 * 60_000,
  })
}
