import { useMemo, useState } from 'react'
import { BarChart3, Hand, LayoutGrid, LineChart, Swords, Target } from 'lucide-react'
import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import { ManaIcons } from '@limitless/components/Common/ManaIcons'
import { metaKey, useStats, type StatEvent } from '../queries/useStats'
import { FORMAT_LABELS, isBestOfThree, trophyThreshold } from '../constants'
import { WinRateChart, type ChartPoint } from './WinRateChart'
import { CardTitle, ErrorBox } from './ui'
import type { StatsFilterState } from './StatsFilters'

const TOP_PICKS = 16

/** Une ligne d'archétype, quel que soit le côté de la table. */
interface ArchetypeRow {
  colors: string
  /** Ton WR : en jouant l'archétype, ou contre lui selon le mode. */
  winRate: number
  wins: number
  losses: number
  /** Nombre d'événements joués, ou de matchs affrontés. */
  count: number
  /** WR de l'archétype dans le format, moyenné sur tes extensions. */
  metaWr: number | null
}

/**
 * Tableau de bord. Les filtres vivent dans la barre latérale : ici, rien que
 * des cartes de données.
 */
export function StatsView({ filters }: { filters: StatsFilterState }) {
  const { data, isLoading, error } = useStats()
  const { format, setCode } = filters
  const [facing, setFacing] = useState(false)

  const events = useMemo(
    () =>
      (data?.events ?? []).filter(
        (e) =>
          (format === 'all' || e.format === format) &&
          (setCode === 'all' || e.setCode === setCode),
      ),
    [data, format, setCode],
  )

  const played = useMemo(() => events.filter((e) => e.wins + e.losses > 0), [events])
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

  const metaWr = data?.metaWr

  // Archétypes joués : ton bilan en matchs quand tu pilotais ces couleurs.
  const archetypesPlayed = useMemo(() => {
    const acc = new Map<string, Agg>()
    for (const e of played) {
      if (!e.archetype) continue
      const cur = take(acc, e.archetype)
      cur.count += 1
      cur.wins += e.wins
      cur.losses += e.losses
      addMeta(cur, metaWr, e, e.archetype, e.wins + e.losses)
    }
    return toRows(acc)
  }, [played, metaWr])

  // Archétypes affrontés : ton bilan en matchs CONTRE ces couleurs.
  const archetypesFaced = useMemo(() => {
    const acc = new Map<string, Agg>()
    for (const e of played) {
      for (const m of e.matchups) {
        if (!m.opponent) continue
        const cur = take(acc, m.opponent)
        cur.count += 1
        if (m.won) cur.wins += 1
        else cur.losses += 1
        addMeta(cur, metaWr, e, m.opponent, 1)
      }
    }
    return toRows(acc)
  }, [played, metaWr])

  // Table de matchups : mon archétype × archétype adverse.
  const matchups = useMemo(() => {
    const cells = new Map<string, { won: number; lost: number }>()
    const mine = new Set<string>()
    const theirs = new Set<string>()

    for (const e of played) {
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

    return { rows: [...mine].sort(), cols: [...theirs].sort(), cells }
  }, [played])

  // Cartes pickées : un décompte brut, sur tous les événements du périmètre.
  // Les événements sans score comptent aussi — tu les as pickées quand même.
  const picks = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      for (const name of e.picks) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_PICKS)
  }, [events])

  if (isLoading) {
    return (
      <p className="py-12 text-center text-sm font-bold text-ink-faint">
        Chargement des stats…
      </p>
    )
  }
  if (error) return <ErrorBox error={error} />

  const archetypes = facing ? archetypesFaced : archetypesPlayed

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

      {(archetypesPlayed.length > 0 || archetypesFaced.length > 0) && (
        <section className="card p-4">
          <CardTitle
            icon={
              facing ? (
                <Swords size={13} strokeWidth={2.5} />
              ) : (
                <Target size={13} strokeWidth={2.5} />
              )
            }
            title={facing ? 'Archétypes affrontés' : 'Archétypes joués'}
          >
            {/* Un seul interrupteur : les deux listes se lisent pareil, elles
                n'ont aucune raison d'occuper deux colonnes en parallèle. */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setFacing(false)}
                className={facing ? 'pill-soft text-ink-soft' : 'pill-brand shadow-brut-sm'}
              >
                Joués
              </button>
              <button
                onClick={() => setFacing(true)}
                className={facing ? 'pill-brand shadow-brut-sm' : 'pill-soft text-ink-soft'}
              >
                Affrontés
              </button>
            </div>
          </CardTitle>

          {archetypes.length === 0 ? (
            <p className="py-6 text-center text-sm font-bold text-ink-soft">
              Rien à afficher sur ce périmètre.
            </p>
          ) : (
            /* Réparti en deux colonnes qui se lisent de haut en bas : la
               première prend la moitié haute, arrondie au supérieur. */
            <div className="mt-4 grid gap-2.5 md:grid-cols-2">
              {splitInTwo(archetypes).map((column, i) => (
                <div key={i} className="space-y-2.5">
                  {column.map((row) => (
                    <ArchetypeCard key={row.colors} row={row} facing={facing} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {matchups.rows.length > 0 && (
        <section className="card p-4">
          <CardTitle icon={<LayoutGrid size={13} strokeWidth={2.5} />} title="Matchups" />

          <div className="mt-4 overflow-x-auto">
            <table className="border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  {/* Coin de matrice : chaque axe est nommé de son côté, la
                      flèche pointe vers ce qu'il gouverne. */}
                  <th className="px-2 py-1 align-bottom">
                    <span className="micro block text-right text-ink-faint">
                      Adverse →
                    </span>
                    <span className="micro mt-1 block text-left text-ink-faint">
                      ↓ Moi
                    </span>
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
        <CardTitle icon={<Hand size={13} strokeWidth={2.5} />} title="Cartes les plus pickées">
          {picks.length > 0 && <span className="pill-ink">top {picks.length}</span>}
        </CardTitle>

        {picks.length === 0 ? (
          <p className="py-6 text-center text-sm font-bold text-ink-soft">
            Aucun pick enregistré sur ce périmètre — l'overlay ne tournait pas.
          </p>
        ) : (
          /* Liste nue, séparée par des filets : seize cartes encadrées à
             l'encre feraient une grille de prison. */
          <div className="mt-4 grid gap-x-6 md:grid-cols-2">
            {splitInTwo(picks).map((column, i) => (
              <div key={i}>
                {column.map((pick, j) => (
                  <div
                    key={pick.name}
                    className="flex items-center gap-2.5 border-b border-ink/10 py-1.5 last:border-b-0"
                  >
                    <span className="micro w-4 shrink-0 text-ink-faint">
                      {i * Math.ceil(picks.length / 2) + j + 1}
                    </span>
                    <CardImage
                      src={getCardImage(pick.name)}
                      alt=""
                      className="h-[33px] w-6 shrink-0 rounded border border-ink/20 object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {pick.name}
                    </span>
                    <span className="shrink-0 font-display text-base font-black tabular-nums">
                      ×{pick.count}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Une ligne d'archétype : couleurs, ton WR, la barre, le rappel du format.
 *
 * Bloc léger — pas de bordure ni d'ombre. À dix ou douze exemplaires dans une
 * carte, le cadre d'encre du reste de l'interface écrase la donnée.
 */
function ArchetypeCard({ row, facing }: { row: ArchetypeRow; facing: boolean }) {
  // L'écart n'a de sens que sur les archétypes JOUÉS : là, ton WR et celui du
  // format mesurent la même chose. Contre un archétype, les deux chiffres ne
  // sont pas comparables — on ne montre que la référence, brute.
  const delta = !facing && row.metaWr != null ? row.winRate - row.metaWr : null

  return (
    <div className="space-y-1.5 rounded-xl bg-brand-wash px-3 py-2">
      <div className="flex items-center gap-2">
        <ManaIcons colors={row.colors} size="sm" />
        <span className="text-xs font-extrabold">{row.colors}</span>
        <span className="ml-auto font-display text-lg font-black leading-none">
          {row.winRate.toFixed(0)}%
        </span>
        {delta != null && <DeltaChip delta={delta} metaWr={row.metaWr!} />}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(100, Math.max(0, row.winRate))}%` }}
        />
      </div>

      <div className="micro flex items-center justify-between text-ink-faint">
        <span>
          {row.wins}–{row.losses} · {row.count} {facing ? 'match' : 'event'}
          {row.count > 1 ? 's' : ''}
        </span>
        <span>
          {row.metaWr == null ? 'format —' : `format ${row.metaWr.toFixed(1)}%`}
        </span>
      </div>
    </div>
  )
}

function DeltaChip({ delta, metaWr }: { delta: number; metaWr: number }) {
  // Sous un demi-point, l'écart n'est pas un signal : ton neutre.
  const tone =
    delta >= 0.5
      ? 'bg-brand text-ink'
      : delta <= -0.5
        ? 'bg-loss-soft text-ink'
        : 'bg-ink/10 text-ink-soft'

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none tabular-nums ${tone}`}
      title={`WR de cet archétype dans le format : ${metaWr.toFixed(1)}%`}
    >
      {delta >= 0 ? '+' : '−'}
      {Math.abs(delta).toFixed(1)}
    </span>
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
  const shade = rate >= 60 ? 'bg-brand' : rate <= 40 ? 'bg-loss-soft' : 'bg-paper-sunk'

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

// ─── Agrégation des archétypes ───────────────────────────────────────────────

interface Agg {
  count: number
  wins: number
  losses: number
  /** Somme pondérée des WR de format, et son poids — pour la moyenne finale. */
  metaSum: number
  metaWeight: number
}

function take(acc: Map<string, Agg>, key: string): Agg {
  const existing = acc.get(key)
  if (existing) return existing
  const created: Agg = { count: 0, wins: 0, losses: 0, metaSum: 0, metaWeight: 0 }
  acc.set(key, created)
  return created
}

/**
 * Le WR de format dépend de l'extension ET du format : quand le périmètre en
 * mélange plusieurs, on moyenne au prorata de ce que tu y as réellement joué.
 */
function addMeta(
  agg: Agg,
  metaWr: Map<string, number> | undefined,
  event: StatEvent,
  colors: string,
  weight: number,
) {
  const wr = metaWr?.get(metaKey(event.setCode, event.format, colors))
  if (wr == null || weight <= 0) return
  agg.metaSum += wr * weight
  agg.metaWeight += weight
}

function toRows(acc: Map<string, Agg>): ArchetypeRow[] {
  return [...acc.entries()]
    .map(([colors, a]) => ({
      colors,
      wins: a.wins,
      losses: a.losses,
      count: a.count,
      winRate: a.wins + a.losses ? (a.wins / (a.wins + a.losses)) * 100 : 0,
      metaWr: a.metaWeight > 0 ? a.metaSum / a.metaWeight : null,
    }))
    .sort((a, b) => b.count - a.count || b.winRate - a.winRate)
}

/** [1..7] → [[1,2,3,4], [5,6,7]] : la première colonne prend la moitié haute. */
function splitInTwo<T>(items: T[]): [T[], T[]] {
  const cut = Math.ceil(items.length / 2)
  return [items.slice(0, cut), items.slice(cut)]
}
