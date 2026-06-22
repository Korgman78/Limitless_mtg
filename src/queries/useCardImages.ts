import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { registerCardImages } from '../utils/helpers'

/**
 * Charge les URLs CDN directes (card_list.image_url) pour le set actif et les
 * enregistre dans le registre lu par getCardImage. Une seule requete legere par
 * set (name + url), cachee 30min. Les cartes sans image_url (ou hors-set)
 * retombent sur le fallback API de getCardImage.
 *
 * A monter haut dans l'arbre (App) : quand les donnees arrivent, le re-render
 * fait basculer les <img> du fallback API vers le CDN direct.
 */
export function useCardImages(activeSet: string) {
  return useQuery({
    queryKey: queryKeys.cardImages(activeSet),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('card_list')
        .select('card_name, image_url')
        .eq('set_code', activeSet)
        .not('image_url', 'is', null)

      if (error) throw error

      const entries: Record<string, string> = {}
      for (const row of data ?? []) {
        if (row.card_name && row.image_url) entries[row.card_name] = row.image_url
      }
      registerCardImages(entries)
      return Object.keys(entries).length
    },
    enabled: !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}
