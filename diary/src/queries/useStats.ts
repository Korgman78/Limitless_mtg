import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { parseMtgaDeck } from '@limitless/utils/deckAnalysisCore'

export interface StatEvent {
  id: string
  setCode: string
  format: string
  eventType: string
  playedAt: string
  wins: number
  losses: number
  /** Cartes du dernier build, hors terrains — la version qui a réellement joué. */
  cards: string[]
  /** Parties gagnées/perdues, agrégées depuis les matchs. 0-0 si non importés. */
  gamesWon: number
  gamesLost: number
  /** Archétypes affrontés, ex ['UB', 'RG']. */
  opponentColors: string[]
}

export interface CardStat {
  name: string
  events: number
  wins: number
  losses: number
  /** WR au match, sur les événements où la carte était au deck. */
  winRate: number
  /** GIH WR 17Lands pour ce set/format, ou null si absent. */
  gihWr: number | null
}

export interface DiaryStats {
  events: StatEvent[]
  cards: CardStat[]
}

/**
 * GIH d'une carte, avec repli sur la face avant : 17Lands ne connait que
 * "Smaug, the Great Calamity" la ou card_list stocke "... // Spew Flame".
 */
function lookupGih(source: Map<string, number>, key: string): number | null {
  const direct = source.get(key)
  if (direct != null) return direct

  const [setCode, format, ...rest] = key.split('|')
  const name = rest.join('|')
  if (!name.includes(' // ')) return null

  return source.get(`${setCode}|${format}|${name.split(' // ')[0].trim()}`) ?? null
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
  diary_matches:
    | { games_won: number; games_lost: number; opponent_colors: string | null }[]
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
            ' diary_matches(games_won, games_lost, opponent_colors)',
        )
        .is('deleted_at', null)
        .order('played_at')

      if (error) throw error

      const rows = (data ?? []) as unknown as RawEvent[]

      // Métadonnées de cartes : sert à écarter les terrains du décompte.
      const setCodes = [...new Set(rows.map((r) => r.set_code))]
      const landNames = new Set<string>()
      const gihBySetFormat = new Map<string, number>()

      if (setCodes.length) {
        const [metaRes, statsRes] = await Promise.all([
          supabase
            .from('card_list')
            .select('card_name, card_type')
            .in('set_code', setCodes),
          supabase
            .from('card_stats')
            .select('card_name, gih_wr, set_code, format')
            .in('set_code', setCodes)
            .eq('filter_context', 'Global'),
        ])

        for (const row of metaRes.data ?? []) {
          const type = ((row as Record<string, unknown>).card_type as string) ?? ''
          if (type.toLowerCase().includes('land')) {
            landNames.add((row as Record<string, unknown>).card_name as string)
          }
        }

        for (const row of statsRes.data ?? []) {
          const r = row as Record<string, unknown>
          if (r.gih_wr == null) continue
          gihBySetFormat.set(
            `${r.set_code}|${r.format}|${r.card_name}`,
            Number(r.gih_wr),
          )
        }
      }

      const events: StatEvent[] = rows.map((row) => {
        // La dernière version est celle qui a fini l'événement.
        const latest = [...(row.diary_deck_versions ?? [])].sort(
          (a, b) => b.version_no - a.version_no,
        )[0]

        const cards = latest
          ? parseMtgaDeck(latest.decklist_raw)
              .mainCards.map((c) => c.name)
              .filter((name) => !landNames.has(name))
          : []

        const matches = row.diary_matches ?? []

        return {
          gamesWon: matches.reduce((n, m) => n + (m.games_won ?? 0), 0),
          gamesLost: matches.reduce((n, m) => n + (m.games_lost ?? 0), 0),
          opponentColors: matches
            .map((m) => m.opponent_colors)
            .filter((c): c is string => Boolean(c)),
          id: row.id,
          setCode: row.set_code,
          format: row.format,
          eventType: row.event_type,
          playedAt: row.played_at,
          wins: row.wins,
          losses: row.losses,
          cards,
        }
      })

      // Agrégat par carte, sur les événements ayant au moins un match joué.
      const acc = new Map<string, { events: number; wins: number; losses: number; key: string }>()
      for (const event of events) {
        if (event.wins + event.losses === 0) continue
        for (const name of event.cards) {
          const current = acc.get(name) ?? {
            events: 0,
            wins: 0,
            losses: 0,
            key: `${event.setCode}|${event.format}|${name}`,
          }
          current.events += 1
          current.wins += event.wins
          current.losses += event.losses
          acc.set(name, current)
        }
      }

      const cards: CardStat[] = [...acc.entries()]
        .map(([name, agg]) => {
          const games = agg.wins + agg.losses
          const winRate = games ? (agg.wins / games) * 100 : 0
          return {
            name,
            events: agg.events,
            wins: agg.wins,
            losses: agg.losses,
            winRate,
            gihWr: lookupGih(gihBySetFormat, agg.key),
          }
        })
        .sort((a, b) => b.events - a.events || b.winRate - a.winRate)

      return { events, cards }
    },
  })
}
