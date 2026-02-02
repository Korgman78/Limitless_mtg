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
            try {
                // Two separate queries to avoid issues with special characters in card names
                const [resultA, resultB] = await Promise.all([
                    supabase
                        .from('synergy_scores')
                        .select('*')
                        .eq('set_code', activeSet)
                        .eq('format', activeFormat)
                        .eq('card_a', cardName),
                    supabase
                        .from('synergy_scores')
                        .select('*')
                        .eq('set_code', activeSet)
                        .eq('format', activeFormat)
                        .eq('card_b', cardName)
                ])

                if (resultA.error) {
                    console.error('Error fetching synergies (card_a):', resultA.error)
                }
                if (resultB.error) {
                    console.error('Error fetching synergies (card_b):', resultB.error)
                }

                // Combine and deduplicate results
                const allData = [...(resultA.data || []), ...(resultB.data || [])]
                const seenPairs = new Set<string>()
                const data = allData.filter(item => {
                    const pairKey = [item.card_a, item.card_b].sort().join('|')
                    if (seenPairs.has(pairKey)) return false
                    seenPairs.add(pairKey)
                    return true
                })

                if (!data.length) {
                    return { topConfidence: [], topSynergy: [] }
                }

                const synergies: CardSynergy[] = data.map((item: any) => {
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
            } catch (err) {
                console.error('Error in useCardSynergies:', err)
                return { topConfidence: [], topSynergy: [] }
            }
        },
        enabled: !!cardName && !!activeSet && !!activeFormat,
    })
}
