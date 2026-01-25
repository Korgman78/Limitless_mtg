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
            // Query where the card is card_a
            const { data: dataA, error: errorA } = await supabase
                .from('synergy_scores')
                .select('*')
                .eq('set_code', activeSet)
                .eq('format', activeFormat)
                .eq('card_a', cardName)

            // Query where the card is card_b
            const { data: dataB, error: errorB } = await supabase
                .from('synergy_scores')
                .select('*')
                .eq('set_code', activeSet)
                .eq('format', activeFormat)
                .eq('card_b', cardName)

            if (errorA) console.error('Error fetching synergies (A):', errorA)
            if (errorB) console.error('Error fetching synergies (B):', errorB)

            const synergies: CardSynergy[] = []

            if (dataA) {
                dataA.forEach((item: any) => {
                    synergies.push({
                        partner: item.card_b,
                        synergy_score: item.synergy_score,
                        lift_score: item.lift_score,
                        confidence: item.confidence_a_to_b,
                    })
                })
            }

            if (dataB) {
                dataB.forEach((item: any) => {
                    synergies.push({
                        partner: item.card_a,
                        synergy_score: item.synergy_score,
                        lift_score: item.lift_score,
                        confidence: item.confidence_b_to_a,
                    })
                })
            }

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
