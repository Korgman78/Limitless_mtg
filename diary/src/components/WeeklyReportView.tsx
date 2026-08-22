import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { CalendarDays, Sparkles } from 'lucide-react'
import { useWeeklyReports } from '../queries/useWeeklyReports'
import { ErrorBox } from './ui'

interface Props {
  weekId: string | null
  /** Remonte la semaine retenue par défaut : la plus récente. */
  onWeekResolved: (id: string) => void
}

/**
 * Synthèses hebdomadaires produites par l'IA à partir du journal : bilan de
 * win rate, motifs récurrents dans les commentaires qualitatifs, et écarts
 * entre les cartes jouées et les stats 17Lands.
 *
 * La génération vit dans `backend/etl_diary_weekly.py`, déclenchée par un cron
 * GitHub Actions — la clé Gemini reste dans les secrets du dépôt et ne touche
 * jamais le navigateur.
 *
 * Le choix de la semaine est dans la barre latérale.
 */
export function WeeklyReportView({ weekId, onWeekResolved }: Props) {
  const { data: reports, isLoading, error } = useWeeklyReports()

  // Sélectionne le rapport le plus récent dès qu'il arrive.
  useEffect(() => {
    if (!weekId && reports?.length) onWeekResolved(reports[0].id)
  }, [reports, weekId, onWeekResolved])

  if (isLoading) {
    return (
      <p className="py-12 text-center text-sm font-bold text-ink-faint">
        Chargement des rapports…
      </p>
    )
  }

  if (error) return <ErrorBox error={error} />
  if (!reports?.length) return <EmptyState />

  const selected = reports.find((r) => r.id === weekId) ?? reports[0]

  return (
    <article className="card p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-dashed border-ink/25 pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-brand-soft">
          <CalendarDays size={15} strokeWidth={2.5} />
        </span>
        <h2 className="font-display text-2xl font-black leading-none">
          Semaine du {formatWeek(selected.week_start)}
        </h2>
        <span className="pill-soft ml-auto">
          {selected.event_count} événement{selected.event_count > 1 ? 's' : ''}
        </span>
        <span className="micro w-full text-ink-faint">
          Généré le{' '}
          {new Date(selected.generated_at).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
          })}
        </span>
      </header>

      {/* Rendu markdown sur papier : titres en serif, listes puces vertes. */}
      <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:font-black prose-headings:text-ink prose-p:text-ink-soft prose-strong:text-ink prose-li:text-ink-soft prose-li:marker:text-brand-ink prose-code:rounded prose-code:border-2 prose-code:border-ink prose-code:bg-paper-sunk prose-code:px-1 prose-code:py-0.5 prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown>{selected.body_md}</ReactMarkdown>
      </div>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="card border-dashed px-6 py-14 text-center shadow-none">
      <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-brand-soft">
        <Sparkles size={18} strokeWidth={2.5} />
      </span>
      <p className="font-display text-xl font-bold">Aucun rapport pour l'instant.</p>
      <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-relaxed text-ink-soft">
        La synthèse est produite chaque lundi par{' '}
        <code className="rounded border-2 border-ink bg-paper-sunk px-1.5 py-0.5 text-xs">
          backend/etl_diary_weekly.py
        </code>
        , via un cron GitHub Actions. Pour en générer une tout de suite, lance le
        workflow <strong className="text-ink">Diary Weekly Report</strong> à la main
        depuis l'onglet Actions du dépôt.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs font-semibold text-ink-faint">
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
