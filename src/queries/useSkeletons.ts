import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface SleeperCard {
    name: string
    alsa: number
    frequency: number
    score: number
}

export interface TrendingCard {
    name: string
    recent_freq: number
    old_freq: number
    delta: number
}

export interface ImportanceCard {
    name: string
    importance: number
    is_core?: boolean
    core_rank?: number | null
    // Composantes individuelles (0-100)
    freq_score: number
    synergy_score: number
    wr_score: number
    // Données brutes
    frequency: number
    gih_wr: number | null
}

export interface CoreCard {
    name: string
    rank: number
    frequency: number
}

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
        is_core?: boolean
    }>
    updated_at: string
    sample_size?: number
    // Nouvelles métriques
    sleeper_cards?: SleeperCard[]
    trending_cards?: TrendingCard[]
    declining_cards?: TrendingCard[]
    openness_score?: number
    openness_cards?: number
    importance_cards?: ImportanceCard[]
    core_cards?: CoreCard[]
    is_alternative?: boolean
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
        staleTime: 5 * 60_000,
    })
}
