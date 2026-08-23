/**
 * Indicateur de win rate.
 *
 * Une jauge linéaire, pas un cadran : un taux se place sur un segment borné,
 * il ne tourne pas. Un cadran gradué suggère un cycle — que 100 % reboucle sur
 * 0 — ce qui ne veut rien dire ici.
 *
 * Le seul repère utile est le trait à 50 %, tracé à l'encre par-dessus le
 * remplissage. Au-dessus tu gagnes, en dessous tu perds : la position de la
 * limite se lit sans légende, elle est au milieu exact d'une échelle 0–100.
 */
export function WinRateMeter({
  winRate,
  wins,
  losses,
}: {
  winRate: number | null
  wins: number
  losses: number
}) {
  const pct = winRate == null ? 0 : Math.max(0, Math.min(100, winRate))

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="font-display font-black leading-none text-ink">
          <span className="text-6xl sm:text-7xl">
            {winRate == null ? '—' : winRate.toFixed(0)}
          </span>
          <span className="text-3xl sm:text-4xl">%</span>
        </span>
        <span className="micro mt-3 block text-brand-ink">Win rate</span>
      </div>

      <div className="relative h-9 overflow-hidden rounded-full border-2 border-ink bg-paper-raised">
        <div
          className="h-full bg-brand transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-ink"
          aria-hidden
        />
      </div>

      <div className="flex items-baseline justify-between">
        <span className="micro text-ink-soft">
          {wins} victoire{wins > 1 ? 's' : ''}
        </span>
        <span className="micro text-ink-soft">
          {losses} défaite{losses > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
