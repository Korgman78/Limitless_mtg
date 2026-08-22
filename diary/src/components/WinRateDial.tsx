const R = 46
const CX = 50
const CY = 50

/** Un tick tous les 9° (40 au total), appuyé tous les 5. */
const TICKS = Array.from({ length: 40 }, (_, i) => i)

/**
 * Cadran de win rate.
 *
 * L'échelle 0–100 % tombe juste sur un cercle : 50 % est exactement le
 * demi-tour. Le seuil de rentabilité se lit donc sans le chercher — c'est la
 * ligne horizontale, et rien d'autre n'a besoin de le dire.
 */
export function WinRateDial({
  winRate,
  wins,
  losses,
}: {
  winRate: number | null
  wins: number
  losses: number
}) {
  const pct = winRate == null ? 0 : Math.max(0, Math.min(100, winRate)) / 100
  const angle = pct * 360
  const rad = ((angle - 90) * Math.PI) / 180
  const knob = { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <circle cx={CX} cy={CY} r={R} fill="#FFFCF6" stroke="#141310" strokeWidth="2" />

        {/* Le secteur rempli. Au-delà de 99.9 % le path d'arc dégénère : on
            bascule sur un disque plein. */}
        {pct >= 0.999 ? (
          <circle cx={CX} cy={CY} r={R} fill="#10B981" />
        ) : pct > 0.001 ? (
          <path
            d={`M ${CX} ${CY} L ${CX} ${CY - R} A ${R} ${R} 0 ${angle > 180 ? 1 : 0} 1 ${knob.x} ${knob.y} Z`}
            fill="#10B981"
          />
        ) : null}

        {/* Graduation par-dessus le secteur : elle doit rester lisible des deux
            côtés de la limite. */}
        {TICKS.map((i) => {
          const a = ((i * 9 - 90) * Math.PI) / 180
          const long = i % 5 === 0
          const inner = R - (long ? 6 : 3)
          return (
            <line
              key={i}
              x1={CX + inner * Math.cos(a)}
              y1={CY + inner * Math.sin(a)}
              x2={CX + (R - 1) * Math.cos(a)}
              y2={CY + (R - 1) * Math.sin(a)}
              stroke="#141310"
              strokeWidth={long ? 1.4 : 0.8}
              strokeLinecap="round"
            />
          )
        })}

        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#141310" strokeWidth="2" />

        {/* Le curseur, hérité de l'anneau réglable de la maquette : ici il ne
            se déplace pas à la main, il marque la position atteinte. */}
        {winRate != null && (
          <circle
            cx={knob.x}
            cy={knob.y}
            r="4.5"
            fill="#DFF3E7"
            stroke="#141310"
            strokeWidth="2"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-black leading-none text-ink">
          <span className="text-[42px] sm:text-[52px]">
            {winRate == null ? '—' : winRate.toFixed(0)}
          </span>
          <span className="text-[22px] sm:text-[26px]">%</span>
        </span>
        <span className="micro mt-2 text-ink-soft">Win rate</span>
        <span className="mt-1.5 font-display text-lg font-bold leading-none">
          {wins}–{losses}
        </span>
      </div>
    </div>
  )
}
