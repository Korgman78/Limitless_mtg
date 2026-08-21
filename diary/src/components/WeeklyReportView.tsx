import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { CalendarDays, Sparkles } from 'lucide-react'
import { useWeeklyReports } from '../queries/useWeeklyReports'

/**
 * Synthèses hebdomadaires produites par l'IA à partir du journal : bilan de
 * win rate, motifs récurrents dans les commentaires qualitatifs, et écarts
 * entre les cartes jouées et les stats 17Lands.
 *
 * La génération vit dans `backend/etl_diary_weekly.py`, déclenchée par un cron
 * GitHub Actions — la clé Gemini reste dans les secrets du dépôt et ne touche
 * jamais le navigateur.
 */
export function WeeklyReportView() {
  const { data: reports, isLoading, error } = useWeeklyReports()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Sélectionne le rapport le plus récent dès qu'il arrive.
  useEffect(() => {
    if (!selectedId && reports?.length) setSelectedId(reports[0].id)
  }, [reports, selectedId])

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-slate-600">Chargement des rapports…</p>
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        {String(error)}
      </div>
    )
  }

  if (!reports?.length) return <EmptyState />

  const selected = reports.find((r) => r.id === selectedId) ?? reports[0]

  return (
    <div className="grid gap-5 md:grid-cols-[180px_1fr]">
      {/* Sélecteur de semaine */}
      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => setSelectedId(report.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm transition md:shrink ${
              selected.id === report.id
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="block font-medium">{formatWeek(report.week_start)}</span>
            <span className="block text-[11px] text-slate-600">
              {report.event_count} event{report.event_count > 1 ? 's' : ''}
            </span>
          </button>
        ))}
      </nav>

      <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            <CalendarDays size={16} className="text-slate-500" />
            Semaine du {formatWeek(selected.week_start)}
          </h2>
          <span className="text-[11px] text-slate-600">
            généré le{' '}
            {new Date(selected.generated_at).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'long',
            })}
          </span>
        </header>

        {/* prose-invert : le rendu markdown hérite du thème sombre */}
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-strong:text-slate-100 prose-li:marker:text-slate-600">
          <ReactMarkdown>{selected.body_md}</ReactMarkdown>
        </div>
      </article>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
      <Sparkles size={22} className="mx-auto mb-3 text-slate-700" />
      <p className="text-slate-400">Aucun rapport pour l'instant.</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
        La synthèse est produite chaque lundi par{' '}
        <code className="text-slate-500">backend/etl_diary_weekly.py</code>, via un cron
        GitHub Actions. Pour en générer une tout de suite, lance le workflow
        <span className="text-slate-500"> Diary Weekly Report </span>
        à la main depuis l'onglet Actions du dépôt.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-slate-700">
        Il faut au moins un événement joué dans la semaine couverte.
      </p>
    </div>
  )
}

/** "2026-08-17" → "17 août" */
function formatWeek(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  })
}
