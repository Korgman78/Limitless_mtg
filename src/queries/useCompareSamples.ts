import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface CompareSamples {
  /** WR moyen du format (archetype "All Decks"), par format. */
  baselines: Record<string, number>
  /** Taille d'echantillon par format puis par nom : games_count (archetypes)
   *  ou img_count (cartes, parties avec la carte en main). */
  games: Record<string, Record<string, number>>
}

const PAGE = 1000

/**
 * Complete les vues pivot de comparaison, qui n'exposent que des WR : la
 * taille d'echantillon de chaque ligne (pour signaler les ecarts peu fiables)
 * et le WR moyen de chaque format (la reference des valeurs ajustees).
 */
export function useCompareSamples(
  activeSet: string,
  subject: 'archetypes' | 'cards',
  formatA: string,
  formatB: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.compareSamples(activeSet, subject, formatA, formatB),
    queryFn: async (): Promise<CompareSamples> => {
      const formats = [formatA, formatB]
      const games: Record<string, Record<string, number>> = { [formatA]: {}, [formatB]: {} }

      const baselineQuery = supabase
        .from('archetype_stats')
        .select('format, win_rate')
        .eq('set_code', activeSet)
        .eq('archetype_name', 'All Decks')
        .in('format', formats)

      if (subject === 'archetypes') {
        const [baseRes, archRes] = await Promise.all([
          baselineQuery,
          supabase
            .from('archetype_stats')
            .select('colors, format, games_count')
            .eq('set_code', activeSet)
            .in('format', formats),
        ])
        if (baseRes.error) throw baseRes.error
        if (archRes.error) throw archRes.error
        for (const r of archRes.data || []) {
          if (r.colors && games[r.format]) games[r.format][r.colors] = r.games_count ?? 0
        }
        return { baselines: toBaselines(baseRes.data), games }
      }

      // card_stats depasse la limite de 1000 lignes de PostgREST : pagination.
      const baseRes = await baselineQuery
      if (baseRes.error) throw baseRes.error
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('card_stats')
          .select('card_name, format, img_count')
          .eq('set_code', activeSet)
          .eq('filter_context', 'Global')
          .in('format', formats)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const r of data || []) {
          if (games[r.format]) games[r.format][r.card_name] = r.img_count ?? 0
        }
        if (!data || data.length < PAGE) break
      }
      return { baselines: toBaselines(baseRes.data), games }
    },
    enabled: enabled && !!activeSet && formatA !== formatB,
    staleTime: 5 * 60_000,
  })
}

function toBaselines(rows: { format: string; win_rate: number | null }[] | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows || []) if (r.win_rate != null) out[r.format] = r.win_rate
  return out
}
