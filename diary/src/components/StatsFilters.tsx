import { useMemo } from 'react'
import { useStats } from '../queries/useStats'
import { FORMAT_LABELS } from '../constants'
import { SidebarSection } from './Sidebar'

export interface StatsFilterState {
  format: string
  setCode: string
  /** null = pas encore choisi : on retombe sur le format le plus joué. */
  cardFormat: string | null
}

export const DEFAULT_STATS_FILTERS: StatsFilterState = {
  format: 'all',
  setCode: 'all',
  cardFormat: null,
}

/**
 * Filtres des statistiques, logés dans la colonne de gauche.
 *
 * `useStats` est déjà monté par la vue : React Query dédoublonne sur la clé,
 * ce bloc ne déclenche donc aucune requête supplémentaire.
 */
export function StatsSidebar({
  filters,
  onChange,
}: {
  filters: StatsFilterState
  onChange: (next: StatsFilterState) => void
}) {
  const { data } = useStats()

  const formats = useMemo(
    () => [...new Set((data?.events ?? []).map((e) => e.format))].sort(),
    [data],
  )
  const sets = useMemo(
    () => [...new Set((data?.events ?? []).map((e) => e.setCode))].sort(),
    [data],
  )

  // Formats retenus pour les sections d'analyse : classés par volume, parce
  // qu'un WR ne se compare pas d'un format à l'autre et qu'on veut le plus
  // documenté par défaut.
  const cardFormats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of data?.events ?? []) {
      if (e.wins + e.losses === 0) continue
      counts.set(e.format, (counts.get(e.format) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  }, [data])

  const activeCardFormat = filters.cardFormat ?? cardFormats[0] ?? null

  return (
    <div className="space-y-4">
      <SidebarSection title="Périmètre">
        <div className="space-y-2">
          <ChipRow
            value={filters.format}
            onChange={(format) => onChange({ ...filters, format })}
            options={[
              { value: 'all', label: 'Tous formats' },
              ...formats.map((f) => ({ value: f, label: FORMAT_LABELS[f] ?? f })),
            ]}
          />
          <ChipRow
            value={filters.setCode}
            onChange={(setCode) => onChange({ ...filters, setCode })}
            options={[
              { value: 'all', label: 'Toutes ext.' },
              ...sets.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>
      </SidebarSection>

      {cardFormats.length > 0 && (
        <SidebarSection title="Analyse par format">
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Archétypes, matchups et cartes se lisent sur un seul format —
            mélanger les WR ne produirait rien de signifiant.
          </p>
          <ChipRow
            value={activeCardFormat ?? ''}
            onChange={(cardFormat) => onChange({ ...filters, cardFormat })}
            options={cardFormats.map((f) => ({
              value: f,
              label: FORMAT_LABELS[f] ?? f,
            }))}
          />
        </SidebarSection>
      )}
    </div>
  )
}

function ChipRow({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? 'pill-brand shadow-brut-sm'
              : 'pill-soft text-ink-soft hover:bg-paper'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
