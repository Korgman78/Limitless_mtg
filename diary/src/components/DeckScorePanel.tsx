import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import type { DeckAnalysisResult } from '@limitless/utils/deckAnalysisCore'
import type { DeckScore } from '@limitless/utils/analyzeDeckPipeline'
import { useDeckScore } from '../queries/useDeckScore'

interface Props {
  setCode: string
  format: string
  decklistRaw: string | null
}

// Mêmes seuils que Draft Practice, pour qu'un score se lise pareil des deux côtés.
const tone = (s: number) =>
  s >= 72 ? 'text-emerald-300' : s >= 55 ? 'text-sky-300' : 'text-amber-300'
const stroke = (s: number) => (s >= 72 ? '#34d399' : s >= 55 ? '#38bdf8' : '#fbbf24')
const band = (s: number) => (s >= 72 ? 'Deck-grade' : s >= 55 ? 'Solid' : 'Needs work')

export function DeckScorePanel({ setCode, format, decklistRaw }: Props) {
  const { data, isLoading, error } = useDeckScore(setCode, format, decklistRaw, true)

  if (isLoading) {
    return <Shell>Analyse du deck…</Shell>
  }
  if (error) {
    return <Shell tone="error">Analyse impossible : {String(error)}</Shell>
  }
  if (!data) {
    return (
      <Shell>
        Pas d'archétype de référence pour ce deck — il faut des trophy decks du
        même couple de couleurs pour le comparer.
      </Shell>
    )
  }

  const { analysis, score } = data

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreDial score={score.score} />

        <div className="min-w-[200px] flex-1 space-y-2.5">
          <div className="mb-1 flex items-baseline gap-2 text-[11px]">
            <span className={`font-bold uppercase tracking-wide ${tone(score.score)}`}>
              {band(score.score)}
            </span>
            <span className="text-slate-600">
              comparé aux trophy decks {analysis.matchedArchetype}
            </span>
          </div>

          <Metric
            label="WR moyen des cartes"
            weight="50%"
            value={score.avgWr != null ? `${score.avgWr.toFixed(1)}%` : '—'}
            pct={score.avgWr != null ? (score.avgWr - 50) * 10 : 0}
          />
          <Metric
            label="Couverture des core cards"
            weight="25%"
            value={score.coreTotal > 0 ? `${score.corePresent}/${score.coreTotal}` : '—'}
            pct={(score.coreCoverage ?? 0) * 100}
          />
          <Metric
            label="Équilibre créatures"
            weight="15%"
            value={`${analysis.creatureCount} vs ${analysis.skeletonCreatureCount}`}
            pct={score.creatureFit * 100}
          />
          <Metric
            label="Adéquation de courbe"
            weight="10%"
            value={`${Math.round(score.curveFit * 100)}%`}
            pct={score.curveFit * 100}
          />
        </div>
      </div>

      {(analysis.lowSynergyCards.length > 0 || analysis.potentialAdds.length > 0) && (
        <div className="grid gap-4 border-t border-slate-800 pt-3 md:grid-cols-2">
          <Suggestions
            title="À couper"
            hint="Faible synergie, WR en retrait, ou hors des cartes clés de l'archétype."
            cards={analysis.lowSynergyCards.map((c) => ({
              name: c.name,
              wr: c.wr,
              synergy: c.avgSynergy,
              matches: c.matchCount,
            }))}
            accent="text-rose-400"
          />
          <Suggestions
            title="À ajouter"
            hint="Cartes du pool absentes du deck, fortes en synergie, en WR ou en importance."
            cards={analysis.potentialAdds.map((c) => ({
              name: c.name,
              wr: c.wr,
              synergy: c.avgSynergy,
              matches: c.matchCount,
            }))}
            accent="text-emerald-400"
          />
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-600">
        Même moteur que « Test my deck » : 50 % puissance des cartes, 25 %
        couverture des core cards, 15 % équilibre créatures, 10 % courbe. 55+ est
        un deck solide, 72+ du niveau trophée.
      </p>
    </div>
  )
}

function ScoreDial({ score }: { score: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, score)) / 100

  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={stroke(score)}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[32px] font-black leading-none tabular-nums ${tone(score)}`}>
          {score}
        </span>
        <span className="mt-1 text-[8px] font-bold uppercase tracking-widest text-slate-600">
          / 100
        </span>
      </div>
    </div>
  )
}

function Metric({
  label,
  weight,
  value,
  pct,
}: {
  label: string
  weight: string
  value: string
  pct: number
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
        <span className="truncate font-bold text-slate-500">
          {label} <span className="text-slate-700">· {weight}</span>
        </span>
        <span className="shrink-0 font-black tabular-nums text-slate-300">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  )
}

function Suggestions({
  title,
  hint,
  cards,
  accent,
}: {
  title: string
  hint: string
  cards: { name: string; wr: number | null; synergy: number; matches: number }[]
  accent: string
}) {
  return (
    <div>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${accent}`}>
        {title}
      </div>
      <p className="mb-2 mt-0.5 text-[10px] leading-relaxed text-slate-600">{hint}</p>

      {cards.length === 0 ? (
        <p className="text-xs text-slate-600">Rien à signaler.</p>
      ) : (
        <ul className="space-y-1">
          {cards.slice(0, 6).map((card) => (
            <li key={card.name} className="flex items-center gap-2">
              <CardImage
                src={getCardImage(card.name)}
                alt=""
                className="h-[33px] w-6 shrink-0 rounded border border-slate-800 object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                {card.name}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
                {card.wr != null ? `${card.wr.toFixed(1)}%` : '—'} · syn{' '}
                {card.synergy.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Shell({ children, tone: t }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <p
      className={`mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm ${
        t === 'error' ? 'text-red-400' : 'text-slate-600'
      }`}
    >
      {children}
    </p>
  )
}
