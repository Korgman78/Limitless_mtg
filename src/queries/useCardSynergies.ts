import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'

const SYNERGY_COLUMNS =
    'card_a, card_b, synergy_score, lift_score, co_occurrence_count, confidence_a_to_b, confidence_b_to_a'

export interface CardSynergy {
    partner: string
    synergy_score: number
    lift_score: number
    /** P(partner | carte de référence) — "quand j'ai la carte, le partenaire est là X% du temps" */
    confidence: number
    /** P(carte de référence | partner) — le sens inverse */
    confidence_reverse: number
    co_occurrence: number
}

export interface CardSynergiesResult {
    /** Toutes les synergies de la carte, triées par confidence décroissante */
    topConfidence: CardSynergy[]
    /** Toutes les synergies de la carte, triées par lift décroissant */
    topSynergy: CardSynergy[]
}

/**
 * Synergies d'une carte donnée. Renvoie les listes complètes triées — les
 * consommateurs découpent selon leur besoin (3 dans le détail carte, 10 dans
 * l'explorateur de synergies) pour partager le même cache.
 */
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
                        .select(SYNERGY_COLUMNS)
                        .eq('set_code', activeSet)
                        .eq('format', activeFormat)
                        .eq('card_a', cardName),
                    supabase
                        .from('synergy_scores')
                        .select(SYNERGY_COLUMNS)
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
                        confidence_reverse: isCardA ? item.confidence_b_to_a : item.confidence_a_to_b,
                        co_occurrence: item.co_occurrence_count ?? 0,
                    }
                })

                const topConfidence = [...synergies].sort((a, b) => b.confidence - a.confidence)
                const topSynergy = [...synergies].sort((a, b) => b.lift_score - a.lift_score)

                return { topConfidence, topSynergy }
            } catch (err) {
                console.error('Error in useCardSynergies:', err)
                return { topConfidence: [], topSynergy: [] }
            }
        },
        enabled: !!cardName && !!activeSet && !!activeFormat,
        staleTime: 5 * 60_000,
    })
}

/** Paire non orientée, classée par lift. */
export interface SynergyPair {
    cardA: string
    cardB: string
    lift: number
    coOccurrence: number
    confidenceAtoB: number
    confidenceBtoA: number
}

/** Paire orientée : "quand j'ai `from`, `to` est là `confidence` du temps". */
export interface DirectedSynergyPair {
    from: string
    to: string
    confidence: number
    lift: number
    coOccurrence: number
}

export interface TopFormatSynergiesResult {
    topLift: SynergyPair[]
    topPlayedWith: DirectedSynergyPair[]
}

/**
 * Meilleures combinaisons du format : top lift (synergie pure) et top
 * "often played with" (confidence, orientée). Le tri se fait côté Postgres —
 * on ne rapatrie jamais toute la table.
 *
 * On ramène un *vivier* (quelques centaines de paires) et non le top 20 final :
 * le filtre couleur du front découpe dedans, sinon filtrer sur le blanc ne
 * laisserait que deux lignes.
 */
export function useTopFormatSynergies(
    activeSet: string,
    activeFormat: string,
    limit = 300,
    enabled = true
) {
    return useQuery({
        queryKey: queryKeys.topFormatSynergies(activeSet, activeFormat, limit),
        queryFn: async (): Promise<TopFormatSynergiesResult> => {
            const base = () =>
                supabase
                    .from('synergy_scores')
                    .select(SYNERGY_COLUMNS)
                    .eq('set_code', activeSet)
                    .eq('format', activeFormat)

            // La confidence max d'une paire peut être dans l'un ou l'autre sens :
            // on récupère les meilleurs de chaque colonne puis on fusionne.
            const [liftRes, abRes, baRes] = await Promise.all([
                base().order('lift_score', { ascending: false }).limit(limit),
                base().order('confidence_a_to_b', { ascending: false }).limit(limit),
                base().order('confidence_b_to_a', { ascending: false }).limit(limit),
            ])

            if (liftRes.error) throw liftRes.error
            if (abRes.error) throw abRes.error
            if (baRes.error) throw baRes.error

            const topLift: SynergyPair[] = (liftRes.data || []).map((r: any) => ({
                cardA: r.card_a,
                cardB: r.card_b,
                lift: r.lift_score,
                coOccurrence: r.co_occurrence_count ?? 0,
                confidenceAtoB: r.confidence_a_to_b,
                confidenceBtoA: r.confidence_b_to_a,
            }))

            const directed: DirectedSynergyPair[] = [
                ...(abRes.data || []).map((r: any) => ({
                    from: r.card_a,
                    to: r.card_b,
                    confidence: r.confidence_a_to_b,
                    lift: r.lift_score,
                    coOccurrence: r.co_occurrence_count ?? 0,
                })),
                ...(baRes.data || []).map((r: any) => ({
                    from: r.card_b,
                    to: r.card_a,
                    confidence: r.confidence_b_to_a,
                    lift: r.lift_score,
                    coOccurrence: r.co_occurrence_count ?? 0,
                })),
            ]

            // Une paire n'apparaît qu'une fois, dans son sens le plus fort :
            // "A→B 92%" et "B→A 88%" côte à côte n'apprennent rien de plus.
            const bestByPair = new Map<string, DirectedSynergyPair>()
            for (const d of directed) {
                const key = [d.from, d.to].sort().join('|')
                const current = bestByPair.get(key)
                if (!current || d.confidence > current.confidence) bestByPair.set(key, d)
            }

            const topPlayedWith = [...bestByPair.values()]
                .sort((a, b) => b.confidence - a.confidence)

            return { topLift, topPlayedWith }
        },
        enabled: enabled && !!activeSet && !!activeFormat,
        staleTime: 30 * 60_000,
        gcTime: 60 * 60_000,
    })
}
