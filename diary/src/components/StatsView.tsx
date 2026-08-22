import { useMemo } from 'react'
import { BarChart3, Layers, LineChart, Swords, Target, Users } from 'lucide-react'
import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import { ManaIcons } from '@limitless/components/Common/ManaIcons'
import { useStats } from '../queries/useStats'
import { FORMAT_LABELS, isBestOfThree, trophyThreshold } from '../constants'
import { WinRateChart, type ChartPoint } from './WinRateChart'
import { CardTitle, ErrorBox } from './ui'
import type { StatsFilterState } from './StatsFilters'

const MIN_EVENTS_FOR_CARD = 2
const TOP_CARDS = 10

/**
 * Tableau de bord. Les filtres vivent dans la barre latérale : ici, rien que
 * des cartes de données.
 */
export function StatsView({ filters }: { filters: StatsFilterState }) {
  const { data, isLoading, error } = useStats()
  const { format, setCode } = filters

  const events = useMemo(
    () =>
      (data?.events ?? []).filter(
        (e) =>
          (format === 'all' || e.format === format) &&
          (setCode === 'all' || e.setCode === setCode),
      ),
    [data, format, setCode],
  )

  const played = events.filter((e) => e.wins + e.losses > 0)
  const wins = played.reduce((n, e) => n + e.wins, 0)
  const losses = played.reduce((n, e) => n + e.losses, 0)
  const games = wins + losses
  const winRate = games ? (wins / games) * 100 : null
  // Le seuil depend du format : 3-0 en Traditional, 7-x en BO1.
  const trophies = played.filter((e) => e.wins >= trophyThreshold(e.format)).length

  // Maille parties : disponible seulement si les matchs ont ete importes.
  const gamesWon = played.reduce((n, e) => n + e.gamesWon, 0)
  const gamesLost = played.reduce((n, e) => n + e.gamesLost, 0)
  const gameTotal = gamesWon + gamesLost
  const gameWinRate = gameTotal ? (gamesWon / gameTotal) * 100 : null
  const anyBo3 = played.some((e) => isBestOfThree(e.format))

  // Archetypes affrontes, les plus frequents d'abord.
  const opponents = (() => {
    const counts = new Map<string, { faced: number; beaten: number }>()
    for (const e of played) {
      for (const colors of e.opponentColors) {
        const cur = counts.get(colors) ?? { faced: 0, beaten: 0 }
        cur.faced += 1
        counts.set(colors, cur)
      }
    }
    return [...counts.entries()]
      .map(([colors, c]) => ({ colors, faced: c.faced }))
      .sort((a, b) => b.faced - a.faced)
  })()

  // WR cumulé : une moyenne courante lisse le bruit d'un événement isolé.
  const points: ChartPoint[] = useMemo(() => {
    let w = 0
    let l = 0
    return played.map((e) => {
      w += e.wins
      l += e.losses
      return {
        label: new Date(e.playedAt).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
        }),
        value: (w / (w + l)) * 100,
        detail: `${FORMAT_LABELS[e.format] ?? e.format} ${e.wins}-${e.losses}`,
      }
    })
  }, [played])

  // Format retenu pour les sections d'analyse : celui choisi, sinon le plus joué.
  const cardFormats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data?.events ?? []) {
      if (e.wins + e.losses === 0) continue
      counts.set(e.format, (counts.get(e.format) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  }, [data])

  const activeCardFormat = filters.cardFormat ?? cardFormats[0] ?? null

  // Base commune des sections par format : un WR ne se compare pas d'un
  // format a l'autre, tout ce qui suit est donc calcule sur ce sous-ensemble.
  const scoped = useMemo(
    () =>
      (data?.events ?? []).filter(
        (e) =>
          e.wins + e.losses > 0 &&
          e.format === activeCardFormat &&
          (setCode === 'all' || e.setCode === setCode),
      ),
    [data, activeCardFormat, setCode],
  )

  // Archétypes joués, avec leur bilan en matchs.
  const playedArchetypes = useMemo(() => {
    const acc = new Map<string, { events: number; wins: number; losses: number }>()
    for (const e of scoped) {
      if (!e.archetype) continue
      const cur = acc.get(e.archetype) ?? { events: 0, wins: 0, losses: 0 }
      cur.events += 1
      cur.wins += e.wins
      cur.losses += e.losses
      acc.set(e.archetype, cur)
    }
    return [...acc.entries()]
      .map(([colors, a]) => ({
        colors,
        events: a.events,
        wins: a.wins,
        losses: a.losses,
        winRate: a.wins + a.losses ? (a.wins / (a.wins + a.losses)) * 100 : 0,
      }))
      .sort((a, b) => b.events - a.events || b.winRate - a.winRate)
  }, [scoped])

  // Table de matchups : mon archétype × archétype adverse.
  const matchups = useMemo(() => {
    const cells = new Map<string, { won: number; lost: number }>()
    const mine = new Set<string>()
    const theirs = new Set<string>()

    for (const e of scoped) {
      if (!e.archetype) continue
      for (const m of e.matchups) {
        if (!m.opponent) continue
        mine.add(e.archetype)
        theirs.add(m.opponent)
        const key = `${e.archetype}|${m.opponent}`
        const cur = cells.get(key) ?? { won: 0, lost: 0 }
        if (m.won) cur.won += 1
        else cur.lost += 1
        cells.set(key, cur)
      }
    }

    return {
      rows: [...mine].sort(),
      cols: [...theirs].sort(),
      cells,
    }
  }, [scoped])

  const cards = useMemo(() => {
    const acc = new Map<string, { events: number; wins: number; losses: number }>()
    for (const e of scoped) {
      for (const name of e.cards) {
        const cur = acc.get(name) ?? { events: 0, wins: 0, losses: 0 }
        cur.events += 1
        cur.wins += e.wins
        cur.losses += e.losses
        acc.set(name, cur)
      }
    }

    const gih = new Map((data?.cards ?? []).map((c) => [c.name, c.gihWr]))

    return [...acc.entries()]
      .filter(([, agg]) => agg.events >= MIN_EVENTS_FOR_CARD)
      .map(([name, agg]) => {
        const g = agg.wins + agg.losses
        return {
          name,
          events: agg.events,
          record: `${agg.wins}-${agg.losses}`,
          winRate: g ? (agg.wins / g) * 100 : 0,
          gihWr: gih.get(name) ?? null,
        }
      })
      .sort((a, b) => b.events - a.events || b.winRate - a.winRate)
      .slice(0, TOP_CARDS)
  }, [scoped, data])

  if (isLoading) {
    return (
      <p className="py-12 text-center text-sm font-bold text-ink-faint">
        Chargement des stats…
      </p>
    )
  }
  if (error) return <ErrorBox error={error} />

  return (
    <div className="space-y-5">
      {/* Le chiffre est le graphe : pas de camembert à deux parts */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label={anyBo3 ? 'WR en matchs' : 'Win rate'}
          value={winRate == null ? '—' : `${winRate.toFixed(1)}%`}
          hero
        />
        <Tile
          label={anyBo3 ? 'WR en parties' : 'Bilan'}
          value={
            anyBo3
              ? gameWinRate == null
                ? '—'
                : `${gameWinRate.toFixed(1)}%`
              : `${wins}–${losses}`
          }
        />
        <Tile label="Trophées" value={String(trophies)} />
        <Tile
          label="Taux de trophée"
          value={played.length ? `${((trophies / played.length) * 100).toFixed(0)}%` : '—'}
        />
      </div>

      {points.length > 1 ? (
        <section className="card p-4">
          <CardTitle
            icon={<LineChart size={13} strokeWidth={2.5} />}
            title="Win rate cumulé"
          >
            <span className="pill-ink">
              {played.length} événement{played.length > 1 ? 's' : ''}
            </span>
          </CardTitle>
          <div className="mt-4">
            <WinRateChart points={points} />
          </div>
        </section>
      ) : (
        <p className="card border-dashed py-8 text-center text-sm font-bold text-ink-soft shadow-none">
          Au moins deux événements joués sont nécessaires pour tracer une évolution.
        </p>
      )}

      {activeCardFormat && (
        <div className="flex items-center gap-2">
          <span className="micro text-ink-faint">Sections suivantes</span>
          <span className="pill-brand">
            {FORMAT_LABELS[activeCardFormat] ?? activeCardFormat}
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {playedArchetypes.length > 0 && (
          <section className="card p-4">
            <CardTitle icon={<Target size={13} strokeWidth={2.5} />} title="Archétypes joués" />
            <p className="mb-3 mt-2 text-[11px] font-semibold leading-relaxed text-ink-soft">
              Déduits des cartes de ton deck construit : les deux couleurs
              dominantes, plus une troisième seulement si elle rivalise avec la
              deuxième. Sinon c'est un splash.
            </p>
            <div className="space-y-2">
              {playedArchetypes.map((arch) => (
                <div key={arch.colors} className="flex items-center gap-3">
                  <span className="flex w-24 shrink-0 items-center gap-2">
                    <ManaIcons colors={arch.colors} size="sm" />
                    <span className="text-xs font-extrabold">{arch.colors}</span>
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paper-sunk">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${Math.min(100, arch.winRate)}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-display text-base font-black tabular-nums">
                    {arch.winRate.toFixed(0)}%
                  </span>
                  <span className="w-[92px] shrink-0 text-right text-[10px] font-bold tabular-nums text-ink-faint">
                    {arch.wins}–{arch.losses} · {arch.events} ev.
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {opponents.length > 0 && (
          <section className="card p-4">
            <CardTitle
              icon={<Users size={13} strokeWidth={2.5} />}
              title="Archétypes affrontés"
            />
            <p className="mb-3 mt-2 text-[11px] font-semibold leading-relaxed text-ink-soft">
              Couleurs déduites des cartes que l'adversaire a réellement jouées — une
              couleur splash ou jamais piochée peut manquer.
            </p>
            <div className="flex flex-wrap gap-2">
              {opponents.map((opponent) => (
                <span key={opponent.colors} className="pill-soft">
                  <ManaIcons colors={opponent.colors} size="sm" />
                  {opponent.colors}
                  <span className="text-ink-faint">×{opponent.faced}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {matchups.rows.length > 0 && (
        <section className="card p-4">
          <CardTitle icon={<Swords size={13} strokeWidth={2.5} />} title="Matchups" />
          <p className="mb-3 mt-2 text-[11px] font-semibold leading-relaxed text-ink-soft">
            Bilan en matchs de chacun de tes archétypes contre chaque archétype
            rencontré. Les échantillons sont minuscules au début — une case à
            100 % sur un seul match ne dit rien.
          </p>

          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="micro px-2 py-1 text-left text-ink-faint">
                    Moi \ Adverse
                  </th>
                  {matchups.cols.map((col) => (
                    <th key={col} className="px-1 py-1">
                      <span className="flex flex-col items-center gap-1">
                        <ManaIcons colors={col} size="sm" />
                        <span className="micro text-ink-soft">{col}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchups.rows.map((row) => (
                  <tr key={row}>
                    <th className="px-2 py-1 text-left">
                      <span className="flex items-center gap-1.5">
                        <ManaIcons colors={row} size="sm" />
                        <span className="text-xs font-extrabold">{row}</span>
                      </span>
                    </th>
                    {matchups.cols.map((col) => (
                      <MatchupCell
                        key={col}
                        cell={matchups.cells.get(`${row}|${col}`)}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-4">
        <CardTitle
          icon={<Layers size={13} strokeWidth={2.5} />}
          title="Cartes les plus jouées"
        />

        <p className="mb-3 mt-2 text-[11px] font-semibold leading-relaxed text-ink-soft">
          Cartes présentes dans le deck construit, sur au moins{' '}
          {MIN_EVENTS_FOR_CARD} événements. Le GIH 17Lands est donné pour
          référence : c'est un taux <strong className="text-ink">en partie</strong>{' '}
          quand la carte est en main, là où le tien est un taux{' '}
          <strong className="text-ink">en match</strong>.
        </p>

        {cards.length === 0 ? (
          <p className="py-6 text-center text-sm font-bold text-ink-soft">
            Aucune carte jouée sur au moins {MIN_EVENTS_FOR_CARD} événements en{' '}
            {FORMAT_LABELS[activeCardFormat ?? ''] ?? activeCardFormat ?? 'ce format'}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th className="micro py-2 pr-2 text-ink-soft">Carte</th>
                  <th className="micro px-2 py-2 text-right text-ink-soft">Events</th>
                  <th className="micro px-2 py-2 text-right text-ink-soft">Bilan</th>
                  <th className="micro px-2 py-2 text-right text-ink-soft">Mon WR</th>
                  <th className="micro py-2 pl-2 text-right text-ink-soft">GIH 17L</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.name} className="border-b border-ink/15">
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-2">
                        <CardImage
                          src={getCardImage(card.name)}
                          alt=""
                          className="h-[33px] w-6 shrink-0 rounded border-2 border-ink object-cover"
                        />
                        <span className="truncate font-bold">{card.name}</span>
                      </span>
                    </td>
                    <td className="px-2 text-right font-semibold tabular-nums text-ink-soft">
                      {card.events}
                    </td>
                    <td className="px-2 text-right font-semibold tabular-nums text-ink-faint">
                      {card.record}
                    </td>
                    <td className="px-2 text-right font-extrabold tabular-nums">
                      {card.winRate.toFixed(1)}%
                    </td>
                    <td className="pl-2 text-right font-semibold tabular-nums text-ink-soft">
                      {card.gihWr == null ? '—' : `${card.gihWr.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Une case de matchup. Le bilan chiffré est toujours écrit : la teinte ne fait
 * que renforcer, elle ne porte jamais seule l'information.
 */
function MatchupCell({ cell }: { cell?: { won: number; lost: number } }) {
  if (!cell) {
    return <td className="px-1 py-1 text-center text-xs text-ink-faint/50">·</td>
  }

  const total = cell.won + cell.lost
  const rate = (cell.won / total) * 100
  const shade =
    rate >= 60 ? 'bg-brand' : rate <= 40 ? 'bg-loss-soft' : 'bg-paper-sunk'

  return (
    <td className="px-0.5 py-0.5">
      <span
        className={`flex min-w-[56px] flex-col items-center rounded-lg border-2 border-ink px-1.5 py-1 ${shade}`}
        title={`${cell.won} victoire(s), ${cell.lost} défaite(s)`}
      >
        <span className="font-display text-sm font-black tabular-nums">
          {cell.won}–{cell.lost}
        </span>
        <span className="micro text-ink-soft">{rate.toFixed(0)}%</span>
      </span>
    </td>
  )
}

function Tile({
  label,
  value,
  hero,
}: {
  label: string
  value: string
  hero?: boolean
}) {
  return (
    <div className={`${hero ? 'card-tint' : 'card'} px-4 py-3.5`}>
      <div className="flex items-center gap-2">
        <span className="micro text-ink-soft">{label}</span>
        {hero && <BarChart3 size={12} strokeWidth={3} className="ml-auto text-brand-ink" />}
      </div>
      <div
        className={`mt-1.5 font-display font-black leading-none ${
          hero ? 'text-4xl' : 'text-3xl'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
