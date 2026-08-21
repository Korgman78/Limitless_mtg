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

// Palette validée contre la surface #0f172a (voir validate_palette.js).
const SERIES = '#3987e5'
const GRID = '#2c2c2a'
const MUTED = '#898781'

const W = 720
const H = 200
const PAD = { top: 14, right: 46, bottom: 26, left: 34 }

/**
 * Évolution du win rate cumulé. Une seule série : pas de légende, le titre la
 * nomme. Ligne de référence à 50 % en pointillés — c'est un seuil, pas une
 * grille.
 */
export function WinRateChart({ points }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const { path, coords, yTicks, min, max } = useMemo(() => {
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

    const ticks: { v: number; y: number }[] = []
    for (let v = lo; v <= hi; v += 10) ticks.push({ v, y: y(v) })

    return { path, coords, yTicks: ticks, min: lo, max: hi }
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
        {/* Grille : hairlines pleines, une nuance au-dessus de la surface */}
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
              fill={MUTED}
            >
              {c.label}
            </text>
          ) : null,
        )}

        {/* Seuil 50 % : un seuil se dessine en pointillés, pas la grille */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y50}
          y2={y50}
          stroke={MUTED}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text x={W - PAD.right + 4} y={y50 + 3} fontSize={9} fill={MUTED}>
          50%
        </text>

        <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" />

        {/* Marqueurs : anneau de surface pour les décoller de la ligne */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={hover === i ? 5 : 3.5}
            fill={SERIES}
            stroke="#0f172a"
            strokeWidth={2}
          />
        ))}

        {/* Étiquette directe sur le point final uniquement */}
        <text
          x={last.x + 8}
          y={last.y + 3}
          fontSize={11}
          fontWeight={700}
          fill={SERIES}
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
            stroke={MUTED}
            strokeWidth={1}
            opacity={0.5}
          />
        )}
      </svg>

      <figcaption className="mt-1 flex h-4 items-center justify-center text-[11px] text-slate-500">
        {active ? (
          <span>
            <span className="text-slate-300">{active.label}</span> · {active.detail} ·
            cumulé <span className="tabular-nums text-slate-300">{active.value.toFixed(1)}%</span>
          </span>
        ) : (
          <span className="text-slate-600">
            Survole un point pour le détail de l'événement
          </span>
        )}
      </figcaption>
    </figure>
  )
}
