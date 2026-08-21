import { ManaIcons } from '@limitless/components/Common/ManaIcons'
import { isBestOfThree } from '../constants'
import type { DiaryMatch } from '../types'

interface Props {
  matches: DiaryMatch[]
  format: string
}

/**
 * Détail des matchs de l'événement : adversaire, son archétype, et le score en
 * parties. En BO3 c'est la seule façon de voir qu'un 2-1 en matchs cachait un
 * 5-4 en parties.
 */
export function MatchesPanel({ matches, format }: Props) {
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-sm text-slate-600">
          Aucun match importé — lance <code className="text-slate-500">diary-sync.bat</code>{' '}
          après ta session.
        </p>
      </div>
    )
  }

  const bo3 = isBestOfThree(format)
  const gamesWon = matches.reduce((n, m) => n + m.games_won, 0)
  const gamesLost = matches.reduce((n, m) => n + m.games_lost, 0)
  const matchesWon = matches.filter((m) => m.won).length

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Matchs
        </span>
        <span className="text-xs text-slate-500">
          <span className="tabular-nums text-slate-300">
            {matchesWon}–{matches.length - matchesWon}
          </span>{' '}
          en matchs
          {bo3 && (
            <>
              {' · '}
              <span className="tabular-nums text-slate-300">
                {gamesWon}–{gamesLost}
              </span>{' '}
              en parties
            </>
          )}
        </span>
      </div>

      <ul className="space-y-1">
        {matches.map((match, i) => (
          <li
            key={match.id}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 odd:bg-slate-950/40"
          >
            <span className="w-4 shrink-0 text-[11px] tabular-nums text-slate-600">
              {match.match_number ?? i + 1}
            </span>

            {/* Le résultat est porté par un mot, pas seulement par la couleur */}
            <span
              className={`w-14 shrink-0 text-xs font-semibold ${
                match.won ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {match.won ? 'Gagné' : 'Perdu'}
            </span>

            <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-slate-200">
              {match.games_won}–{match.games_lost}
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              {match.opponent_colors ? (
                <>
                  <ManaIcons colors={match.opponent_colors} size="sm" />
                  <span className="text-xs font-medium text-slate-400">
                    {match.opponent_colors}
                  </span>
                </>
              ) : (
                <span className="text-xs italic text-slate-600">couleurs inconnues</span>
              )}
            </span>

            <span className="ml-auto truncate text-xs text-slate-600">
              {match.opponent_name ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
