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
 * Seuil de lift au-delà duquel une paire compte comme une vraie synergie.
 * `synergy_scores` contient aussi, depuis le rattrapage "confidence" de l'ETL,
 * des paires à faible lift (deux staples qui se croisent souvent sans se
 * chercher) : les inclure gonflerait artificiellement toute mesure de cohésion.
 */
export const MIN_SIGNIFICANT_LIFT = 1.2

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
          .gte('synergy_score', MIN_SIGNIFICANT_LIFT)
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
  /** Ligne de type brute (repérage des terres dans le builder). */
  type: string | null
  /** Coût mana ("{1}{W}") — sert au calcul de manabase (Auto lands). */
  cost: string | null
  /** Couleurs produites par la carte (terres non-base, dorks, artefacts). */
  producedColours: string | null
  isManaProducer: boolean
}

type CardListMetaRow = {
  card_name: string
  card_type: string | null
  card_cmc: number | null
  colors: string | null
  card_cost?: string | null
  produced_colours?: string | null
  is_mana_producer?: boolean | null
}

const FULL_META_COLS = 'card_name, card_type, card_cmc, colors, card_cost, produced_colours, is_mana_producer'
const BASE_META_COLS = 'card_name, card_type, card_cmc, colors'

/**
 * Méta des cartes d'un set pour le builder de deck : tri (couleur/CMC/type) et
 * calcul de la manabase (coût, production de mana). Une seule requête
 * `card_list` (~250 lignes), cachée. Les colonnes mana n'existent pas sur les
 * anciens schémas → fallback sur les colonnes de base. `enabled` permet de
 * rendre la requête paresseuse (chargée seulement en phase build).
 */
export function useDraftCardMeta(activeSet: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.cards(activeSet, '', 'meta'), 'draftBuilder'],
    queryFn: async (): Promise<Record<string, DraftCardMeta>> => {
      if (!activeSet) return {}
      const full = await supabase.from('card_list').select(FULL_META_COLS).eq('set_code', activeSet)
      const fallback = full.error
        ? await supabase.from('card_list').select(BASE_META_COLS).eq('set_code', activeSet)
        : null
      const rows = (full.error ? fallback?.data : full.data) as CardListMetaRow[] | null | undefined
      const error = full.error ? fallback?.error : null
      if (error) throw error
      const m: Record<string, DraftCardMeta> = {}
      for (const r of rows || []) {
        m[r.card_name] = {
          colors: r.colors ?? null,
          cmc: Number(r.card_cmc ?? 0),
          isCreature: typeof r.card_type === 'string' && r.card_type.toLowerCase().includes('creature'),
          type: r.card_type ?? null,
          cost: r.card_cost ?? null,
          producedColours: r.produced_colours ?? null,
          isManaProducer: r.is_mana_producer ?? false,
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
