import { useMemo, useState } from 'react'
import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import { ManaIcons } from '@limitless/components/Common/ManaIcons'
import { useStats } from '../queries/useStats'
import { FORMAT_LABELS, isBestOfThree, trophyThreshold } from '../constants'
import { WinRateChart, type ChartPoint } from './WinRateChart'

const MIN_EVENTS_FOR_CARD = 2
const TOP_CARDS = 10

export function StatsView() {
  const { data, isLoading, error } = useStats()
  const [format, setFormat] = useState<string>('all')
  const [setCode, setSetCode] = useState<string>('all')
  // Filtre distinct pour les cartes : un WR n'a aucun sens melange entre
  // formats. null = pas encore initialise, on prend le plus joue.
  const [cardFormat, setCardFormat] = useState<string | null>(null)

  const formats = useMemo(
    () => [...new Set((data?.events ?? []).map((e) => e.format))].sort(),
    [data],
  )
  const sets = useMemo(
    () => [...new Set((data?.events ?? []).map((e) => e.setCode))].sort(),
    [data],
  )

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

  const activeCardFormat = cardFormat ?? cardFormats[0] ?? null

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
    return <p className="py-12 text-center text-sm text-slate-600">Chargement des stats…</p>
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        {String(error)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filtres : une seule rangée, au-dessus des graphes */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={format} onChange={setFormat} label="Format">
          <option value="all">Tous formats</option>
          {formats.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f] ?? f}
            </option>
          ))}
        </Select>
        <Select value={setCode} onChange={setSetCode} label="Extension">
          <option value="all">Toutes extensions</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <span className="text-xs text-slate-600">
          {played.length} événement{played.length > 1 ? 's' : ''} joué
          {played.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Le chiffre est le graphe : pas de camembert à deux parts */}
      <div className="grid gap-3 sm:grid-cols-4">
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
          label="Trophy rate"
          value={
            played.length ? `${((trophies / played.length) * 100).toFixed(0)}%` : '—'
          }
        />
      </div>

      {points.length > 1 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            Win rate cumulé dans le temps
          </h2>
          <WinRateChart points={points} />
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-800 py-8 text-center text-sm text-slate-600">
          Au moins deux événements joués sont nécessaires pour tracer une évolution.
        </p>
      )}

      {/* Un seul selecteur pour tout ce qui suit : melanger des WR de formats
          differents produirait des chiffres sans signification. */}
      {cardFormats.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Analyse par format
          </span>
          {cardFormats.map((f) => (
            <button
              key={f}
              onClick={() => setCardFormat(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeCardFormat === f
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {FORMAT_LABELS[f] ?? f}
            </button>
          ))}
        </div>
      )}

      {playedArchetypes.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">
            Archétypes joués
          </h2>
          <p className="mb-3 text-[11px] text-slate-500">
            Déduits des cartes de ton deck construit : les deux couleurs
            dominantes, plus une troisième seulement si elle rivalise avec la
            deuxième. Sinon c'est un splash.
          </p>
          <div className="space-y-1.5">
            {playedArchetypes.map((arch) => (
              <div key={arch.colors} className="flex items-center gap-3">
                <span className="flex w-24 shrink-0 items-center gap-2">
                  <ManaIcons colors={arch.colors} size="sm" />
                  <span className="text-xs font-medium text-slate-300">
                    {arch.colors}
                  </span>
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    style={{ width: `${Math.min(100, arch.winRate)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-200">
                  {arch.winRate.toFixed(0)}%
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-600">
                  {arch.wins}–{arch.losses} · {arch.events} event
                  {arch.events > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {opponents.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">
            Archétypes affrontés
          </h2>
          <p className="mb-3 text-[11px] text-slate-500">
            Couleurs déduites des cartes que l'adversaire a réellement jouées — une
            couleur splash ou jamais piochée peut manquer.
          </p>
          <div className="flex flex-wrap gap-2">
            {opponents.map((opponent) => (
              <span
                key={opponent.colors}
                className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-1.5"
              >
                <ManaIcons colors={opponent.colors} size="sm" />
                <span className="text-xs font-medium text-slate-300">
                  {opponent.colors}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  ×{opponent.faced}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {matchups.rows.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Matchups</h2>
          <p className="mb-3 text-[11px] text-slate-500">
            Bilan en matchs de chacun de tes archétypes contre chaque archétype
            rencontré. Les échantillons sont minuscules au début — une case à
            100 % sur un seul match ne dit rien.
          </p>

          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-slate-600">
                    Moi \ Adverse
                  </th>
                  {matchups.cols.map((col) => (
                    <th key={col} className="px-1 py-1">
                      <span className="flex flex-col items-center gap-0.5">
                        <ManaIcons colors={col} size="sm" />
                        <span className="text-[10px] text-slate-500">{col}</span>
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
                        <span className="text-xs font-medium text-slate-300">{row}</span>
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

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Cartes les plus jouées</h2>

        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-500">
          Cartes présentes dans le deck construit, sur au moins{' '}
          {MIN_EVENTS_FOR_CARD} événements. Le GIH 17Lands est donné pour
          référence : c'est un taux <strong className="text-slate-400">en partie</strong>{' '}
          quand la carte est en main, là où le tien est un taux{' '}
          <strong className="text-slate-400">en match</strong>.
        </p>

        {cards.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600">
            Aucune carte jouée sur au moins {MIN_EVENTS_FOR_CARD} événements en{' '}
            {FORMAT_LABELS[activeCardFormat ?? ''] ?? activeCardFormat ?? 'ce format'}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">Carte</th>
                  <th className="px-2 py-1.5 text-right font-medium">Events</th>
                  <th className="px-2 py-1.5 text-right font-medium">Bilan</th>
                  <th className="px-2 py-1.5 text-right font-medium">Mon WR</th>
                  <th className="py-1.5 pl-2 text-right font-medium">GIH 17L</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.name} className="border-b border-slate-800/50">
                    <td className="py-1 pr-2">
                      <span className="flex items-center gap-2">
                        <CardImage
                          src={getCardImage(card.name)}
                          alt=""
                          className="h-[33px] w-6 shrink-0 rounded border border-slate-800 object-cover"
                        />
                        <span className="truncate text-slate-300">{card.name}</span>
                      </span>
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-400">
                      {card.events}
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-500">
                      {card.record}
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-200">
                      {card.winRate.toFixed(1)}%
                    </td>
                    <td className="pl-2 text-right tabular-nums text-slate-500">
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
    return <td className="px-1 py-1 text-center text-xs text-slate-800">·</td>
  }

  const total = cell.won + cell.lost
  const rate = (cell.won / total) * 100
  const shade =
    rate >= 60
      ? 'bg-emerald-500/15 text-emerald-300'
      : rate <= 40
        ? 'bg-rose-500/15 text-rose-300'
        : 'bg-slate-800/60 text-slate-300'

  return (
    <td className="px-1 py-1">
      <span
        className={`flex min-w-[52px] flex-col items-center rounded-md px-1.5 py-1 ${shade}`}
        title={`${cell.won} victoire(s), ${cell.lost} défaite(s)`}
      >
        <span className="text-xs font-bold tabular-nums">
          {cell.won}–{cell.lost}
        </span>
        <span className="text-[9px] tabular-nums opacity-70">
          {rate.toFixed(0)}%
        </span>
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
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      {/* Chiffres proportionnels sur le héros : tabular-nums delave les grands corps */}
      <div
        className={
          hero
            ? 'mt-0.5 text-3xl font-bold text-slate-100'
            : 'mt-0.5 text-xl font-semibold tabular-nums text-slate-200'
        }
      >
        {value}
      </div>
    </div>
  )
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 focus:border-slate-600 focus:outline-none"
      >
        {children}
      </select>
    </label>
  )
}
