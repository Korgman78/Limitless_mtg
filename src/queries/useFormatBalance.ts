import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

interface FormatBalanceRow {
  set_code: string
  format: string
  archetype_score: number
  archetype_stddev: number
  color_score: number
  color_stddev: number
}

interface SetExtreme {
  setCode: string
  score: number
}

interface BalanceStats {
  average: number
  best: SetExtreme
  worst: SetExtreme
}

export interface FormatBalanceResult {
  archetype: BalanceStats
  color: BalanceStats
}

// Fetch balance stats across all SETS for a given FORMAT
export function useFormatBalance(format: string) {
  return useQuery({
    queryKey: queryKeys.formatBalance(format),
    queryFn: async (): Promise<FormatBalanceResult | null> => {
      if (!format) return null

      const { data, error } = await supabase
        .from('format_balance')
        .select('*')
        .eq('format', format)

      if (error) throw error
      if (!data || data.length === 0) return null

      const rows = data as FormatBalanceRow[]

      // Calculate archetype stats across sets
      const archetypeScores = rows.map(r => ({ setCode: r.set_code, score: r.archetype_score }))
      const archetypeAvg = archetypeScores.reduce((sum, r) => sum + r.score, 0) / archetypeScores.length
      const archetypeBest = archetypeScores.reduce((best, r) => r.score > best.score ? r : best)
      const archetypeWorst = archetypeScores.reduce((worst, r) => r.score < worst.score ? r : worst)

      // Calculate color stats across sets
      const colorScores = rows.map(r => ({ setCode: r.set_code, score: r.color_score }))
      const colorAvg = colorScores.reduce((sum, r) => sum + r.score, 0) / colorScores.length
      const colorBest = colorScores.reduce((best, r) => r.score > best.score ? r : best)
      const colorWorst = colorScores.reduce((worst, r) => r.score < worst.score ? r : worst)

      return {
        archetype: {
          average: archetypeAvg,
          best: archetypeBest,
          worst: archetypeWorst,
        },
        color: {
          average: colorAvg,
          best: colorBest,
          worst: colorWorst,
        },
      }
    },
    enabled: !!format,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
