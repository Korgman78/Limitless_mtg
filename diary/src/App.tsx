import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DiaryView } from './components/DiaryView'
import { StatsView } from './components/StatsView'
import { WeeklyReportView } from './components/WeeklyReportView'
import { SetPicker, Sidebar, TABS, WeekPicker, type Tab } from './components/Sidebar'
import {
  DEFAULT_STATS_FILTERS,
  StatsSidebar,
  type StatsFilterState,
} from './components/StatsFilters'

/**
 * Coquille de l'application : colonne de contrôles à gauche, données à droite.
 *
 * L'état d'interface des trois onglets est tenu ici, et non dans chaque vue,
 * parce que les contrôles ont déménagé dans la barre latérale : c'est le prix
 * — assumé — d'une zone principale qui ne contient que des cartes de données.
 * Les blocs latéraux montent uniquement avec leur onglet, donc aucune vue ne
 * paie les requêtes d'une autre.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('diary')

  // Journal
  const [setCode, setSetCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Statistiques
  const [statsFilters, setStatsFilters] =
    useState<StatsFilterState>(DEFAULT_STATS_FILTERS)

  // Rapports hebdo
  const [weekId, setWeekId] = useState<string | null>(null)

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 p-4 lg:grid-cols-[268px_minmax(0,1fr)] lg:items-start lg:p-5">
      <Sidebar tab={tab} onTabChange={setTab}>
        {tab === 'diary' && (
          <SetPicker
            setCode={setCode}
            onSelect={(code) => {
              setSetCode(code)
              setCreating(false)
            }}
            onCreate={() => setCreating((v) => !v)}
          />
        )}
        {tab === 'stats' && (
          <StatsSidebar filters={statsFilters} onChange={setStatsFilters} />
        )}
        {tab === 'weekly' && <WeekPicker weekId={weekId} onSelect={setWeekId} />}
      </Sidebar>

      <main className="min-w-0 space-y-5">
        <TopBar tab={tab} />

        {tab === 'diary' && (
          <DiaryView
            setCode={setCode}
            onSetCodeResolved={setSetCode}
            creating={creating}
            onCreatingChange={setCreating}
          />
        )}
        {tab === 'stats' && <StatsView filters={statsFilters} />}
        {tab === 'weekly' && (
          <WeeklyReportView weekId={weekId} onWeekResolved={setWeekId} />
        )}
      </main>
    </div>
  )
}

/**
 * En-tête de la zone principale : salutation, contexte, date du jour. Rien
 * d'actionnable — c'est un repère, pas une barre d'outils.
 */
function TopBar({ tab }: { tab: Tab }) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 6 ? 'Bonne nuit' : hour < 13 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="min-w-0">
        <span className="pill border-brand-ink bg-transparent text-brand-ink">
          {TABS.find((t) => t.key === tab)?.label}
        </span>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-black leading-none sm:text-4xl">
          {greeting}
          <Spark />
        </h1>
      </div>

      <span className="pill-soft ml-auto shadow-brut-sm">
        <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-ink bg-brand">
          <CalendarDays size={11} strokeWidth={3} />
        </span>
        {now.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        })}
      </span>
    </header>
  )
}

/** L'étoile à quatre branches de la maquette, en vert de marque. */
function Spark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path
        d="M12 1c.6 6 4.4 9.6 11 11-6.6 1.4-10.4 5-11 11-.6-6-4.4-9.6-11-11C7.6 10.6 11.4 7 12 1Z"
        fill="#10B981"
        stroke="#141310"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
