import { useMemo } from 'react'
import { useStats } from '../queries/useStats'
import { FORMAT_LABELS } from '../constants'
import { SidebarSection } from './Sidebar'

export interface StatsFilterState {
  format: string
  setCode: string
}

export const DEFAULT_STATS_FILTERS: StatsFilterState = {
  format: 'all',
  setCode: 'all',
}

/**
 * Filtres des statistiques, logés dans la colonne de gauche. Ils pilotent
 * toutes les sections de la vue, y compris les archétypes et les picks.
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

  return (
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
