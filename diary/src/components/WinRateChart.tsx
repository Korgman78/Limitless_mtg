import { useMemo, useState } from 'react'

export interface ChartPoint {
  label: string
  /** WR cumulé à cet événement, en %. */
  value: number
  /** Score de l'événement lui-même, pour l'infobulle. */
  detail: string
}

interface Props {
  points: ChartPoint[]
}

// Palette papier : la courbe est tracée à l'encre, le vert ne sert qu'au
// remplissage et aux marqueurs. Une ligne verte sur crème perdrait en lisibilité
// ce qu'elle gagnerait en cohérence.
const INK = '#141310'
const AREA = '#DFF3E7'
const MARK = '#10B981'
const MUTED = '#6E6A5E'
const GRID = 'rgba(20,19,16,0.12)'

const W = 720
const H = 210
const PAD = { top: 16, right: 50, bottom: 28, left: 36 }

/**
 * Évolution du win rate cumulé. Une seule série : pas de légende, le titre la
 * nomme. Ligne de référence à 50 % en pointillés — c'est un seuil, pas une
 * grille.
 */
export function WinRateChart({ points }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const { path, area, coords, yTicks, min, max } = useMemo(() => {
    const values = points.map((p) => p.value)
    // Bande resserrée autour des données, mais toujours 50 % inclus pour que la
    // ligne de référence garde du sens.
    const lo = Math.min(40, Math.floor((Math.min(...values, 50) - 5) / 5) * 5)
    const hi = Math.max(60, Math.ceil((Math.max(...values, 50) + 5) / 5) * 5)

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom

    const x = (i: number) =>
      PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH

    const coords = points.map((p, i) => ({ x: x(i), y: y(p.value), ...p }))
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
    const base = PAD.top + plotH
    const area = `${path} L${coords[coords.length - 1].x},${base} L${coords[0].x},${base} Z`

    const ticks: { v: number; y: number }[] = []
    for (let v = lo; v <= hi; v += 10) ticks.push({ v, y: y(v) })

    return { path, area, coords, yTicks: ticks, min: lo, max: hi }
  }, [points])

  if (!points.length) return null

  const plotH = H - PAD.top - PAD.bottom
  const y50 = PAD.top + plotH - ((50 - min) / (max - min)) * plotH
  // Au plus ~6 dates en abscisse : au-dela elles se chevauchent.
  const xStep = Math.max(1, Math.ceil(coords.length / 6))
  const last = coords[coords.length - 1]
  const active = hover != null ? coords[hover] : null

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label="Évolution du win rate cumulé"
        onMouseLeave={() => setHover(null)}
      >
        {/* Grille : hairlines, une nuance au-dessus du papier */}
        {yTicks.map((tick) => (
          <g key={tick.v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={tick.y}
              y2={tick.y}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={tick.y + 3}
              textAnchor="end"
              fontSize={9}
              fontWeight={700}
              fill={MUTED}
              className="tabular-nums"
            >
              {tick.v}
            </text>
          </g>
        ))}

        {/* Axe des dates : etiquetage espace, jamais un label par point */}
        {coords.map((c, i) =>
          i % xStep === 0 || i === coords.length - 1 ? (
            <text
              key={`x-${i}`}
              x={c.x}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle'}
              fontSize={9}
              fontWeight={700}
              fill={MUTED}
            >
              {c.label}
            </text>
          ) : null,
        )}

        <path d={area} fill={AREA} />

        {/* Seuil 50 % : un seuil se dessine en pointillés, pas la grille */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y50}
          y2={y50}
          stroke={INK}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          opacity={0.55}
        />
        <text x={W - PAD.right + 5} y={y50 + 3} fontSize={9} fontWeight={700} fill={MUTED}>
          50%
        </text>

        <path
          d={path}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Marqueurs : cerclés d'encre, comme tout le reste de l'interface */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={hover === i ? 5.5 : 4}
            fill={MARK}
            stroke={INK}
            strokeWidth={2}
          />
        ))}

        {/* Étiquette directe sur le point final uniquement */}
        <text
          x={last.x + 9}
          y={last.y + 4}
          fontSize={12}
          fontWeight={800}
          fill={INK}
          className="tabular-nums"
        >
          {last.value.toFixed(1)}%
        </text>

        {/* Zones de survol larges : la cible dépasse le marqueur */}
        {coords.map((c, i) => (
          <rect
            key={`hit-${i}`}
            x={c.x - 14}
            y={PAD.top}
            width={28}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke={INK}
            strokeWidth={1}
            opacity={0.4}
          />
        )}
      </svg>

      <figcaption className="mt-1 flex h-4 items-center justify-center text-[11px] font-semibold text-ink-soft">
        {active ? (
          <span>
            <span className="font-extrabold text-ink">{active.label}</span> ·{' '}
            {active.detail} · cumulé{' '}
            <span className="font-extrabold tabular-nums text-ink">
              {active.value.toFixed(1)}%
            </span>
          </span>
        ) : (
          <span className="text-ink-faint">
            Survole un point pour le détail de l'événement
          </span>
        )}
      </figcaption>
    </figure>
  )
}
