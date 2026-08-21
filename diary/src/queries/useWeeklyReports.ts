import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'

export interface WeeklyReport {
  id: string
  /** Lundi de la semaine couverte, format ISO. */
  week_start: string
  body_md: string
  event_count: number
  generated_at: string
}

export function useWeeklyReports() {
  return useQuery({
    queryKey: ['diary', 'weeklyReports'],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyReport[]> => {
      const { data, error } = await supabase
        .from('diary_weekly_reports')
        .select('*')
        .order('week_start', { ascending: false })

      if (error) throw error
      return (data ?? []) as unknown as WeeklyReport[]
    },
  })
}
