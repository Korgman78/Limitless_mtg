import { Swords } from 'lucide-react'
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
      <div className="well p-3.5">
        <p className="text-sm font-semibold text-ink-soft">
          Aucun match importé — lance{' '}
          <code className="rounded border-2 border-ink bg-paper-raised px-1.5 py-0.5 text-xs">
            diary-sync.bat
          </code>{' '}
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
    <section className="well p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised">
          <Swords size={13} strokeWidth={2.5} />
        </span>
        <h3 className="h-card">Matchs</h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="pill-soft">
            {matchesWon}–{matches.length - matchesWon} en matchs
          </span>
          {bo3 && (
            <span className="pill-soft">
              {gamesWon}–{gamesLost} en parties
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-1.5">
        {matches.map((match, i) => (
          <li
            key={match.id}
            className="flex items-center gap-2.5 rounded-lg border-2 border-ink bg-paper-raised px-2.5 py-1.5"
          >
            <span className="micro w-4 shrink-0 text-ink-faint">
              {match.match_number ?? i + 1}
            </span>

            {/* Le résultat est porté par un mot, pas seulement par la couleur */}
            <span
              className={`w-[52px] shrink-0 rounded-full border-2 border-ink px-1.5 py-0.5 text-center text-[10px] font-extrabold uppercase tracking-micro ${
                match.won ? 'bg-brand text-ink' : 'bg-loss-soft text-ink'
              }`}
            >
              {match.won ? 'Gagné' : 'Perdu'}
            </span>

            <span className="w-10 shrink-0 font-display text-base font-black tabular-nums">
              {match.games_won}–{match.games_lost}
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              {match.opponent_colors ? (
                <>
                  <ManaIcons colors={match.opponent_colors} size="sm" />
                  <span className="text-xs font-bold text-ink-soft">
                    {match.opponent_colors}
                  </span>
                </>
              ) : (
                <span className="text-xs italic text-ink-faint">couleurs inconnues</span>
              )}
            </span>

            <span className="ml-auto truncate text-xs font-semibold text-ink-faint">
              {match.opponent_name ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
