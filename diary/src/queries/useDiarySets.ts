import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface DiarySet {
  code: string
  /** true si le set est encore actif sur Arena → onglet visible par défaut. */
  active: boolean
  entryCount: number
}

/**
 * Liste des sets à afficher : ceux marqués actifs dans la table `sets` de
 * Limitless, plus tous ceux qui ont déjà une entrée au journal (archivés).
 *
 * L'archivage est ainsi dérivé de `sets.active` — pas de flag à maintenir à la
 * main dans le diary, donc pas d'oubli au changement d'extension.
 */
export function useDiarySets() {
  return useQuery({
    queryKey: queryKeys.sets,
    queryFn: async (): Promise<DiarySet[]> => {
      const [setsRes, eventsRes] = await Promise.all([
        supabase.from('sets').select('code, start_date').eq('active', true),
        supabase.from('diary_events').select('set_code').is('deleted_at', null),
      ])

      if (setsRes.error) throw setsRes.error
      if (eventsRes.error) throw eventsRes.error

      const activeCodes = (setsRes.data ?? []).map((s) => s.code as string)

      const counts = new Map<string, number>()
      for (const row of eventsRes.data ?? []) {
        const code = row.set_code as string
        counts.set(code, (counts.get(code) ?? 0) + 1)
      }

      const codes = new Set<string>([...activeCodes, ...counts.keys()])

      return [...codes]
        .map((code) => ({
          code,
          active: activeCodes.includes(code),
          entryCount: counts.get(code) ?? 0,
        }))
        .sort((a, b) => {
          // Sets actifs d'abord, puis par volume d'entrées.
          if (a.active !== b.active) return a.active ? -1 : 1
          if (b.entryCount !== a.entryCount) return b.entryCount - a.entryCount
          return a.code.localeCompare(b.code)
        })
    },
  })
}
