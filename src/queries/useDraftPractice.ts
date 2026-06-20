import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import { buildPairMap, type SynergyRow } from '../utils/deckAnalysisCore'

export type PairMap = Record<string, Record<string, number>>

export interface DraftPick {
  pack: number
  pick: number
  options: string[]
  taken: string
}

/** Métadonnées légères d'une session (sans les picks) pour la sélection. */
export interface DraftSessionMeta {
  aggregate_id: string
  colors: string | null
  rank: string | null
  mythic_rank: number | null
  mythic_pct: number | null
  wins: number | null
  losses: number | null
}

export interface DraftSession extends DraftSessionMeta {
  set_code: string
  format: string
  picks: DraftPick[]
  /** Maindeck final du joueur {nom: qté} — peut être null (deck non récupéré). */
  cardlist: Record<string, number> | null
}

/**
 * Liste légère des replays de draft mythic disponibles pour un set/format
 * (sans les picks), triée du meilleur joueur au moins bon. Sert à choisir une
 * session à rejouer dans Draft Practice.
 */
export function useDraftPracticeSessions(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.draftPracticeList(activeSet, activeFormat),
    queryFn: async (): Promise<DraftSessionMeta[]> => {
      if (!activeSet) return []
      const { data, error } = await supabase
        .from('trophy_draft_picks')
        .select('aggregate_id, colors, rank, mythic_rank, mythic_pct, wins, losses')
        .eq('set_code', activeSet)
        .eq('format', activeFormat)
      if (error) throw error
      const rows = (data || []) as DraftSessionMeta[]
      // Meilleur d'abord : leaderboard #N croissant (nulls en dernier), puis percentile décroissant
      return rows.sort((a, b) => {
        const la = a.mythic_rank ?? Number.POSITIVE_INFINITY
        const lb = b.mythic_rank ?? Number.POSITIVE_INFINITY
        if (la !== lb) return la - lb
        return (b.mythic_pct ?? 0) - (a.mythic_pct ?? 0)
      })
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}

/**
 * Charge toutes les synergies (lift par paire) d'un set/format et renvoie une
 * matrice paire→score. Sert à mesurer la *cohésion* d'un pool dans le recap
 * (synergie moyenne entre les cartes piochées, en complément du WR).
 */
export function useFormatSynergies(activeSet: string, activeFormat: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.formatSynergies(activeSet, activeFormat),
    queryFn: async (): Promise<PairMap> => {
      if (!activeSet) return {}
      const PAGE = 1000
      const rows: SynergyRow[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('synergy_scores')
          .select('card_a, card_b, synergy_score')
          .eq('set_code', activeSet)
          .eq('format', activeFormat)
          .order('card_a', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as SynergyRow[]
        rows.push(...batch)
        if (batch.length < PAGE) break
      }
      return buildPairMap(rows)
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}

export interface DraftCardMeta {
  colors: string | null
  cmc: number
  isCreature: boolean
}

/**
 * Méta légère des cartes d'un set (couleur + CMC + créature/non) pour le tri du
 * builder. Une seule requête `card_list` (~250 lignes), cachée. `enabled`
 * permet de la rendre paresseuse (chargée seulement en phase build).
 */
export function useDraftCardMeta(activeSet: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.cards(activeSet, '', 'meta'), 'draftBuilder'],
    queryFn: async (): Promise<Record<string, DraftCardMeta>> => {
      if (!activeSet) return {}
      const { data, error } = await supabase
        .from('card_list')
        .select('card_name, card_type, card_cmc, colors')
        .eq('set_code', activeSet)
      if (error) throw error
      const m: Record<string, DraftCardMeta> = {}
      for (const r of (data || []) as Array<{ card_name: string; card_type: string | null; card_cmc: number | null; colors: string | null }>) {
        m[r.card_name] = {
          colors: r.colors ?? null,
          cmc: Number(r.card_cmc ?? 0),
          isCreature: typeof r.card_type === 'string' && r.card_type.toLowerCase().includes('creature'),
        }
      }
      return m
    },
    enabled: enabled && !!activeSet,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}

/** Charge une session complète (avec la séquence de picks) à la demande. */
export function useDraftPracticeSession(aggregateId: string | null) {
  return useQuery({
    queryKey: queryKeys.draftPractice(aggregateId || ''),
    queryFn: async (): Promise<DraftSession | null> => {
      if (!aggregateId) return null
      const { data, error } = await supabase
        .from('trophy_draft_picks')
        .select('aggregate_id, set_code, format, colors, rank, mythic_rank, mythic_pct, wins, losses, picks, cardlist')
        .eq('aggregate_id', aggregateId)
        .single()
      if (error) throw error
      if (!data) return null
      const picks = ((data.picks as DraftPick[]) || [])
        .slice()
        .sort((a, b) => (a.pack - b.pack) || (a.pick - b.pick))
      return { ...(data as any), picks } as DraftSession
    },
    enabled: !!aggregateId,
    staleTime: 30 * 60_000,
  })
}
