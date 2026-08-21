import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type {
  DiaryDeckVersion,
  DiaryEventDetail,
  DiaryMatch,
  DiaryNote,
  DiaryPoolCard,
} from '../types'

/** Forme brute renvoyée par PostgREST avec les ressources embarquées. */
interface EventRow {
  diary_deck_versions: DiaryDeckVersion[] | null
  diary_notes: DiaryNote[] | null
  diary_pool_cards: DiaryPoolCard[] | null
  diary_picks: { count: number }[] | null
  diary_matches: DiaryMatch[] | null
  [key: string]: unknown
}

export function useDiaryEvents(setCode: string | null) {
  return useQuery({
    queryKey: queryKeys.events(setCode ?? ''),
    enabled: Boolean(setCode),
    queryFn: async (): Promise<DiaryEventDetail[]> => {
      const { data, error } = await supabase
        .from('diary_events')
        .select(
          '*, diary_deck_versions(*), diary_notes(*), diary_pool_cards(*),' +
            ' diary_picks(count), diary_matches(*)',
        )
        .eq('set_code', setCode!)
        .is('deleted_at', null)
        .order('played_at', { ascending: false })

      if (error) throw error

      return ((data ?? []) as unknown as EventRow[]).map((row) => {
        const notes: Record<string, string> = {}
        for (const note of row.diary_notes ?? []) {
          notes[note.section] = note.body
        }

        const deckVersions = [...(row.diary_deck_versions ?? [])].sort(
          (a, b) => a.version_no - b.version_no,
        )

        const {
          diary_deck_versions: _dv,
          diary_notes: _n,
          diary_pool_cards: _pc,
          diary_picks: _p,
          diary_matches: _m,
          ...event
        } = row

        return {
          ...(event as unknown as DiaryEventDetail),
          deckVersions,
          notes,
          poolCards: [...(row.diary_pool_cards ?? [])].sort((a, b) =>
            a.card_name.localeCompare(b.card_name),
          ),
          matches: [...(row.diary_matches ?? [])].sort(
            (a, b) => (a.match_number ?? 0) - (b.match_number ?? 0),
          ),
          pickCount: row.diary_picks?.[0]?.count ?? 0,
        }
      })
    },
  })
}
