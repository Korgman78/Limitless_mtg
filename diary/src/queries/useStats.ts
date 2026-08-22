import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { parseMtgaDeck } from '@limitless/utils/deckAnalysisCore'
import { deduceArchetype } from '../utils/archetype'

export interface StatEvent {
  id: string
  setCode: string
  format: string
  eventType: string
  playedAt: string
  wins: number
  losses: number
  /** Cartes réellement pickées pendant le draft. Vide en sealed ou sans overlay. */
  picks: string[]
  /** Parties gagnées/perdues, agrégées depuis les matchs. 0-0 si non importés. */
  gamesWon: number
  gamesLost: number
  /** Archétypes affrontés, ex ['UB', 'RG']. */
  opponentColors: string[]
  /** Archétype joué, déduit des cartes du deck construit. Null si pas de deck. */
  archetype: string | null
  /** Un élément par match, pour la table de matchups. */
  matchups: { opponent: string | null; won: boolean }[]
}

export interface DiaryStats {
  events: StatEvent[]
  /**
   * WR du métagame par archétype, clé `setCode|format|couleurs`. Permet de
   * situer ton résultat par rapport au format plutôt que dans l'absolu.
   */
  metaWr: Map<string, number>
}

/**
 * Clé de correspondance avec `archetype_stats`.
 *
 * Deux pièges dans cette table : `colors` peut porter " + Splash", et les
 * couleurs y sont triées ALPHABÉTIQUEMENT ("BU", "GRW") là où le diary trie en
 * ordre WUBRG ("UB", "WRG"). On retrie donc les deux côtés dans le même ordre —
 * sans ça, aucune clé ne tombe juste et la colonne reste vide sans rien dire.
 */
export const metaKey = (setCode: string, format: string, colors: string): string => {
  const canonical = [...colors.replace(/[^WUBRG]/g, '')].sort().join('')
  return `${setCode}|${format}|${canonical}`
}

interface RawEvent {
  id: string
  set_code: string
  format: string
  event_type: string
  played_at: string
  wins: number
  losses: number
  diary_deck_versions: { version_no: number; decklist_raw: string }[] | null
  diary_picks: { picked_card: string | null }[] | null
  diary_matches:
    | {
        games_won: number
        games_lost: number
        opponent_colors: string | null
        won: boolean | null
      }[]
    | null
}

/**
 * Agrégats du journal. Volume attendu : quelques centaines d'événements au
 * plus, donc tout est chargé puis filtré côté client — pas de vue SQL à
 * maintenir en parallèle.
 */
export function useStats() {
  return useQuery({
    queryKey: ['diary', 'stats'],
    staleTime: 60_000,
    queryFn: async (): Promise<DiaryStats> => {
      const { data, error } = await supabase
        .from('diary_events')
        .select(
          'id, set_code, format, event_type, played_at, wins, losses,' +
            ' diary_deck_versions(version_no, decklist_raw),' +
            ' diary_picks(picked_card),' +
            ' diary_matches(games_won, games_lost, opponent_colors, won)',
        )
        .is('deleted_at', null)
        .order('played_at')

      if (error) throw error

      const rows = (data ?? []) as unknown as RawEvent[]

      // Couleurs des cartes : sert uniquement à déduire ton archétype.
      const setCodes = [...new Set(rows.map((r) => r.set_code))]
      const cardColors = new Map<string, { colors: string | null; type: string | null }>()
      const metaWr = new Map<string, number>()

      if (setCodes.length) {
        const [metaRes, archRes] = await Promise.all([
          supabase
            .from('card_list')
            .select('card_name, card_type, colors')
            .in('set_code', setCodes),
          supabase
            .from('archetype_stats')
            .select('set_code, format, colors, win_rate, games_count')
            .in('set_code', setCodes),
        ])

        for (const row of metaRes.data ?? []) {
          const r = row as Record<string, unknown>
          cardColors.set(r.card_name as string, {
            colors: (r.colors as string) ?? null,
            type: (r.card_type as string) ?? '',
          })
        }

        // "WU" et "WU + Splash" retombent sur la même clé : on garde la ligne
        // la mieux échantillonnée plutôt que la dernière arrivée.
        const bestSample = new Map<string, number>()
        for (const row of archRes.data ?? []) {
          const r = row as Record<string, unknown>
          const colors = (r.colors as string) ?? ''
          if (r.win_rate == null || !colors.replace(/[^WUBRG]/g, '')) continue

          const key = metaKey(r.set_code as string, r.format as string, colors)
          const games = Number(r.games_count ?? 0)
          if (games < (bestSample.get(key) ?? -1)) continue

          bestSample.set(key, games)
          metaWr.set(key, Number(r.win_rate))
        }
      }

      const events: StatEvent[] = rows.map((row) => {
        // La dernière version est celle qui a fini l'événement.
        const latest = [...(row.diary_deck_versions ?? [])].sort(
          (a, b) => b.version_no - a.version_no,
        )[0]

        const mainCards = latest ? parseMtgaDeck(latest.decklist_raw).mainCards : []

        const archetype = deduceArchetype(
          mainCards.map((c) => ({
            colors: cardColors.get(c.name)?.colors ?? null,
            type: cardColors.get(c.name)?.type ?? null,
            qty: c.qty,
          })),
        )

        const matches = row.diary_matches ?? []

        return {
          gamesWon: matches.reduce((n, m) => n + (m.games_won ?? 0), 0),
          gamesLost: matches.reduce((n, m) => n + (m.games_lost ?? 0), 0),
          opponentColors: matches
            .map((m) => m.opponent_colors)
            .filter((c): c is string => Boolean(c)),
          archetype,
          matchups: matches.map((m) => ({
            opponent: m.opponent_colors,
            won: Boolean(m.won),
          })),
          id: row.id,
          setCode: row.set_code,
          format: row.format,
          eventType: row.event_type,
          playedAt: row.played_at,
          wins: row.wins,
          losses: row.losses,
          picks: (row.diary_picks ?? [])
            .map((p) => p.picked_card)
            .filter((n): n is string => Boolean(n)),
        }
      })

      return { events, metaWr }
    },
  })
}
