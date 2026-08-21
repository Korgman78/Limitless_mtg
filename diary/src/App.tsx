import { useState } from 'react'
import { BarChart3, BookOpen, Sparkles } from 'lucide-react'
import { DiaryView } from './components/DiaryView'
import { StatsView } from './components/StatsView'
import { WeeklyReportView } from './components/WeeklyReportView'

type Tab = 'diary' | 'stats' | 'weekly'

const TABS: { key: Tab; label: string; icon: typeof BookOpen }[] = [
  { key: 'diary', label: 'Diary', icon: BookOpen },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'weekly', label: 'Rapport hebdo', icon: Sparkles },
]

/**
 * Navigation à trois onglets. Tout ce qui est propre au journal — sélecteur
 * d'extension, création d'entrée — vit dans DiaryView, pas dans l'en-tête :
 * ces contrôles n'ont aucun sens sur les deux autres onglets.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('diary')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 px-5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <h1 className="text-lg font-semibold text-slate-100">Training Diary</h1>

          <nav className="flex items-center gap-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === key
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {tab === 'diary' && <DiaryView />}
        {tab === 'stats' && <StatsView />}
        {tab === 'weekly' && <WeeklyReportView />}
      </main>
    </div>
  )
}
