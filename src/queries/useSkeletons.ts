import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface ArchetypalSkeleton {
    id: string
    set_code: string
    format: string
    archetype_name: string
    avg_mana_curve: Record<string, number>
    creature_ratio: number
    avg_lands: number
    deck_list: Array<{
        name: string
        cmc: number
        type: string
        cost: string
        rarity: string
    }>
    updated_at: string
    sample_size?: number
}

export function useSkeletons(activeSet: string, activeFormat: string) {
    return useQuery({
        queryKey: queryKeys.skeletons(activeSet, activeFormat),
        queryFn: async (): Promise<ArchetypalSkeleton[]> => {
            if (!activeSet) return []

            const { data, error } = await supabase
                .from('archetypal_skeletons')
                .select('*')
                .eq('set_code', activeSet)
                .eq('format', activeFormat)

            if (error) throw error
            return data || []
        },
        enabled: !!activeSet,
    })
}
