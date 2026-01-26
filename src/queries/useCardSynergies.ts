import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

export interface CardSynergy {
    partner: string
    synergy_score: number
    lift_score: number
    confidence: number
}

export interface CardSynergiesResult {
    topConfidence: CardSynergy[]
    topSynergy: CardSynergy[]
}

export function useCardSynergies(
    cardName: string,
    activeFormat: string,
    activeSet: string
) {
    return useQuery({
        queryKey: queryKeys.cardSynergies(activeSet, activeFormat, cardName),
        queryFn: async (): Promise<CardSynergiesResult> => {
            // Single query with OR filter for both card_a and card_b
            const { data, error } = await supabase
                .from('synergy_scores')
                .select('*')
                .eq('set_code', activeSet)
                .eq('format', activeFormat)
                .or(`card_a.eq.${cardName},card_b.eq.${cardName}`)

            if (error) {
                console.error('Error fetching synergies:', error)
                return { topConfidence: [], topSynergy: [] }
            }

            const synergies: CardSynergy[] = (data || []).map((item: any) => {
                const isCardA = item.card_a === cardName
                return {
                    partner: isCardA ? item.card_b : item.card_a,
                    synergy_score: item.synergy_score,
                    lift_score: item.lift_score,
                    confidence: isCardA ? item.confidence_a_to_b : item.confidence_b_to_a,
                }
            })

            // Sort and pick top 3
            const topConfidence = [...synergies]
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 3)

            const topSynergy = [...synergies]
                .sort((a, b) => b.synergy_score - a.synergy_score)
                .slice(0, 3)

            return { topConfidence, topSynergy }
        },
        enabled: !!cardName && !!activeSet && !!activeFormat,
    })
}
