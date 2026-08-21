import { useQuery } from '@tanstack/react-query'
import {
  analyzeDeckText,
  scoreDeckAnalysis,
  type DeckScore,
} from '@limitless/utils/analyzeDeckPipeline'
import type { DeckAnalysisResult } from '@limitless/utils/deckAnalysisCore'

export interface DeckScoreResult {
  analysis: DeckAnalysisResult
  score: DeckScore
}

/**
 * Score et suggestions d'un deck, via exactement le même moteur que « Test my
 * deck » dans Limitless : l'edge function `deck-analysis`, puis le scoring de
 * `analyzeDeckPipeline`. Rien n'est recalculé ici.
 *
 * Chargé à la demande — l'analyse est un aller-retour serveur, on ne la
 * déclenche que si tu ouvres le panneau.
 */
export function useDeckScore(
  setCode: string,
  format: string,
  decklistRaw: string | null,
  enabled: boolean,
) {
  return useQuery({
    // Le texte du deck fait partie de la clé : changer de version relance
    // l'analyse sans intervention.
    queryKey: ['diary', 'deckScore', setCode, format, decklistRaw ?? ''],
    enabled: enabled && Boolean(decklistRaw),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<DeckScoreResult | null> => {
      // Squelettes non fournis : le repli local n'est pas utilisé ici, l'edge
      // function est la même que celle de Test my deck en production.
      const analysis = await analyzeDeckText(setCode, format, decklistRaw!, [])
      if (!analysis) return null
      return { analysis, score: scoreDeckAnalysis(analysis) }
    },
  })
}
