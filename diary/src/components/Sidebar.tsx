import { Archive, BarChart3, BookOpen, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useDiarySets } from '../queries/useDiarySets'
import { useWeeklyReports } from '../queries/useWeeklyReports'

export type Tab = 'diary' | 'stats' | 'weekly'

export const TABS: { key: Tab; label: string; icon: typeof BookOpen }[] = [
  { key: 'diary', label: 'Journal', icon: BookOpen },
  { key: 'stats', label: 'Statistiques', icon: BarChart3 },
  { key: 'weekly', label: 'Rapport hebdo', icon: Sparkles },
]

/**
 * Colonne de gauche persistante : identité, navigation, puis le bloc de
 * contrôles propre à l'onglet actif.
 *
 * Le parti pris : la zone principale ne contient que des données, jamais de
 * filtres. Tout ce qui pilote l'affichage vit ici — c'est ce qui permet aux
 * cartes de droite de rester des blocs pleins, sans barre d'outils en tête.
 *
 * Sous `lg`, la colonne redevient une carte horizontale posée au-dessus du
 * contenu : la même information, empilée.
 */
export function Sidebar({
  tab,
  onTabChange,
  children,
}: {
  tab: Tab
  onTabChange: (tab: Tab) => void
  children?: React.ReactNode
}) {
  return (
    <aside className="card flex flex-col gap-4 p-4 lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)]">
      {/* Identité */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-brand font-display text-xl font-black">
          M
        </span>
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold leading-tight">
            Training Diary
          </span>
          <span className="micro block text-ink-faint">MTG Limited</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`w-auto shrink-0 lg:w-full lg:shrink ${tab === key ? 'nav-item-active' : 'nav-item'}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-paper-raised">
              <Icon size={13} strokeWidth={2.5} />
            </span>
            {label}
          </button>
        ))}
      </nav>

      {/* Bloc contextuel de l'onglet */}
      {children && (
        <div className="min-h-0 flex-1 overflow-y-auto lg:pr-1">{children}</div>
      )}

    </aside>
  )
}

/** Petit intitulé de section dans la colonne. */
export function SidebarSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <span className="micro block text-ink-faint">{title}</span>
      {children}
    </div>
  )
}

/**
 * Sélecteur d'extension du journal. Les sets sans entrée sont repliés : Arena
 * marque beaucoup d'extensions comme actives, les afficher toutes noierait
 * celles où tu joues vraiment.
 */
export function SetPicker({
  setCode,
  onSelect,
  onCreate,
}: {
  setCode: string | null
  onSelect: (code: string) => void
  onCreate: () => void
}) {
  const { data: sets } = useDiarySets()
  const [showArchives, setShowArchives] = useState(false)

  const withEntries = sets?.filter((s) => s.entryCount > 0) ?? []
  const newestActive = sets?.find((s) => s.active)
  const primarySets =
    newestActive && !withEntries.some((s) => s.code === newestActive.code)
      ? [newestActive, ...withEntries]
      : withEntries

  const otherSets = (sets ?? []).filter(
    (s) => !primarySets.some((p) => p.code === s.code),
  )
  const visibleSets = showArchives ? [...primarySets, ...otherSets] : primarySets

  return (
    <div className="space-y-3">
      <SidebarSection title="Tes extensions">
        <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {visibleSets.map((set) => (
            <button
              key={set.code}
              onClick={() => onSelect(set.code)}
              className={`w-auto shrink-0 justify-between lg:w-full lg:shrink ${
                setCode === set.code ? 'nav-item-active' : 'nav-item'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {/* Le liseré vertical de la maquette : il tient lieu de puce. */}
                <span
                  className={`h-4 w-1.5 rounded-full ${
                    set.active ? 'bg-brand-ink' : 'bg-ink/30'
                  }`}
                />
                {set.code}
              </span>
              {set.entryCount > 0 && (
                <span className="micro text-ink-soft">{set.entryCount}</span>
              )}
            </button>
          ))}

          {otherSets.length > 0 && (
            <button
              onClick={() => setShowArchives((v) => !v)}
              className="btn-bare shrink-0 self-start"
            >
              <Archive size={12} strokeWidth={2.5} />
              {showArchives ? 'Réduire' : `Archives (${otherSets.length})`}
            </button>
          )}
        </div>
      </SidebarSection>

      <button
        onClick={onCreate}
        disabled={!setCode}
        className="btn-primary w-full uppercase tracking-micro"
      >
        <Plus size={15} strokeWidth={3} />
        Nouvelle entrée
      </button>
    </div>
  )
}

/** Sélecteur de semaine pour les rapports IA. */
export function WeekPicker({
  weekId,
  onSelect,
}: {
  weekId: string | null
  onSelect: (id: string) => void
}) {
  const { data: reports } = useWeeklyReports()
  if (!reports?.length) return null

  const selectedId = weekId ?? reports[0].id

  return (
    <SidebarSection title="Semaines">
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => onSelect(report.id)}
            className={`w-auto shrink-0 justify-between lg:w-full lg:shrink ${
              selectedId === report.id ? 'nav-item-active' : 'nav-item'
            }`}
          >
            <span className="whitespace-nowrap">
              {new Date(`${report.week_start}T12:00:00`).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
              })}
            </span>
            <span className="micro text-ink-soft">{report.event_count} ev.</span>
          </button>
        ))}
      </div>
    </SidebarSection>
  )
}
