const WEEKS = 14
const DAY_MS = 86_400_000

// Du lavis au plein : quatre paliers suffisent, au-delà l'œil ne distingue plus.
const LEVELS = [
  'bg-paper-sunk',
  'bg-brand-soft',
  'bg-brand-mid',
  'bg-brand',
  'bg-brand-ink',
]

/**
 * Assiduité sur les 14 dernières semaines : une colonne par semaine, une case
 * par jour, l'intensité donne le nombre d'événements joués.
 *
 * Le sujet n'est pas la performance mais la régularité — c'est le seul endroit
 * de l'app où un trou dans le calendrier se voit.
 */
export function ActivityGrid({ dates }: { dates: string[] }) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  // On aligne la grille sur le lundi : une colonne = une semaine réelle.
  const offsetToMonday = (today.getDay() + 6) % 7
  const lastMonday = new Date(today.getTime() - offsetToMonday * DAY_MS)
  const start = new Date(lastMonday.getTime() - (WEEKS - 1) * 7 * DAY_MS)

  const counts = new Map<string, number>()
  for (const iso of dates) {
    const key = dayKey(new Date(iso))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const columns = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS)
      return {
        key: dayKey(date),
        date,
        count: counts.get(dayKey(date)) ?? 0,
        future: date.getTime() > today.getTime(),
      }
    }),
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {columns.map((week, w) => (
          <div key={w} className="flex shrink-0 flex-col gap-[3px]">
            {week.map((day) => (
              <span
                key={day.key}
                title={`${day.date.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                })} · ${day.count} événement${day.count > 1 ? 's' : ''}`}
                className={`h-[13px] w-[13px] rounded-[3px] border border-ink ${
                  day.future ? 'border-dashed border-ink/25 bg-transparent' : LEVELS[level(day.count)]
                }`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className="micro text-ink-faint">Moins</span>
        {LEVELS.map((tone) => (
          <span key={tone} className={`h-[11px] w-[11px] rounded-[3px] border border-ink ${tone}`} />
        ))}
        <span className="micro text-ink-faint">Plus</span>
      </div>
    </div>
  )
}

/** 0 · 1 · 2 · 3 · 4+ événements dans la journée. */
function level(count: number): number {
  if (count === 0) return 0
  return Math.min(4, count)
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
