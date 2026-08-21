import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { registerCardImages } from '@limitless/utils/helpers'

export interface CardMeta {
  name: string
  cmc: number
  type: string
  rarity: string
  colors: string
}

/**
 * Métadonnées des cartes du set : CMC, type et rareté, nécessaires pour
 * empiler un deck par courbe de mana comme dans Limitless.
 *
 * Enregistre au passage les URLs d'images dans le registre lu par
 * getCardImage() — sans ça chaque carte retomberait sur l'API Scryfall,
 * bien plus lente qu'un accès CDN direct.
 */
export function useCardMeta(setCode: string | null) {
  return useQuery({
    queryKey: ['diary', 'cardMeta', setCode ?? ''],
    enabled: Boolean(setCode),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Map<string, CardMeta>> => {
      const { data, error } = await supabase
        .from('card_list')
        .select('card_name, card_cmc, card_type, rarity, colors, image_url')
        .eq('set_code', setCode!)

      if (error) throw error

      const images: Record<string, string> = {}
      const meta = new Map<string, CardMeta>()

      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const name = row.card_name as string
        if (!name) continue

        if (row.image_url) images[name] = row.image_url as string

        meta.set(name, {
          name,
          cmc: Number(row.card_cmc ?? 0),
          type: (row.card_type as string) ?? '',
          rarity: (row.rarity as string) ?? 'C',
          colors: (row.colors as string) ?? '',
        })
      }

      registerCardImages(images)
      return meta
    },
  })
}
