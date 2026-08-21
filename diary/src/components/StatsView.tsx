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

  // Format retenu pour les cartes : celui choisi, sinon le plus joué.
  const cardFormats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data?.events ?? []) {
      if (e.wins + e.losses === 0) continue
      counts.set(e.format, (counts.get(e.format) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  }, [data])

  const activeCardFormat = cardFormat ?? cardFormats[0] ?? null

  // Les cartes sont agrégées sur leur propre format, et sur l'extension du
  // filtre général.
  const cards = useMemo(() => {
    const scoped = (data?.events ?? []).filter(
      (e) =>
        e.wins + e.losses > 0 &&
        e.format === activeCardFormat &&
        (setCode === 'all' || e.setCode === setCode),
    )

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
  }, [data, activeCardFormat, setCode])

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
        <Tile
          label={anyBo3 ? 'Matchs / parties' : 'Matchs'}
          value={anyBo3 ? `${games} / ${gameTotal}` : String(games)}
        />
        <Tile label="Trophées" value={String(trophies)} />
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

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-semibold text-slate-200">Cartes les plus jouées</h2>

          {/* Filtre propre a la section : un WR ne se compare pas d'un format
              a l'autre, les melanger produirait un chiffre sans signification. */}
          <div className="flex items-center gap-1">
            {cardFormats.map((f) => (
              <button
                key={f}
                onClick={() => setCardFormat(f)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  activeCardFormat === f
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {FORMAT_LABELS[f] ?? f}
              </button>
            ))}
          </div>
        </div>

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
