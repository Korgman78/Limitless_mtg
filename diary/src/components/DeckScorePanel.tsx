import { getCardImage } from '@limitless/utils/helpers'
import CardImage from '@limitless/components/Common/CardImage'
import { useDeckScore } from '../queries/useDeckScore'

interface Props {
  setCode: string
  format: string
  decklistRaw: string | null
}

// Mêmes seuils que Draft Practice, pour qu'un score se lise pareil des deux
// côtés. Trois paliers, trois teintes distinctes — le vert reste réservé au
// haut du panier.
const fill = (s: number) => (s >= 72 ? 'bg-brand' : s >= 55 ? 'bg-info' : 'bg-warn')
const stroke = (s: number) => (s >= 72 ? '#10B981' : s >= 55 ? '#3D7BE8' : '#E8A317')
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
    <div className="mt-3 space-y-4 rounded-xl border-2 border-ink bg-paper-raised p-4">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreDial score={score.score} />

        <div className="min-w-[200px] flex-1 space-y-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`pill ${fill(score.score)} text-ink`}>{band(score.score)}</span>
            <span className="text-[11px] font-semibold text-ink-soft">
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
        <div className="grid gap-4 border-t-2 border-dashed border-ink/25 pt-3 md:grid-cols-2">
          <Suggestions
            title="À couper"
            hint="Faible synergie, WR en retrait, ou hors des cartes clés de l'archétype."
            cards={analysis.lowSynergyCards.map((c) => ({
              name: c.name,
              wr: c.wr,
              synergy: c.avgSynergy,
              matches: c.matchCount,
            }))}
            accent="bg-loss-soft"
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
            accent="bg-brand"
          />
        </div>
      )}

      <p className="text-[10px] font-semibold leading-relaxed text-ink-faint">
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
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="#FFFCF6" stroke="#141310" strokeWidth="2" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="#F1EADC" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={stroke(score)}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[34px] font-black leading-none">{score}</span>
        <span className="micro mt-1 text-ink-faint">/ 100</span>
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
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="micro truncate text-ink-soft">
          {label} <span className="text-ink-faint">· {weight}</span>
        </span>
        <span className="shrink-0 text-xs font-extrabold tabular-nums">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border-2 border-ink bg-paper-sunk">
        <div
          className="h-full bg-brand"
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
      <span className={`pill ${accent} text-ink`}>{title}</span>
      <p className="mb-2 mt-1.5 text-[10px] font-semibold leading-relaxed text-ink-faint">
        {hint}
      </p>

      {cards.length === 0 ? (
        <p className="text-xs font-semibold text-ink-soft">Rien à signaler.</p>
      ) : (
        <ul className="space-y-1">
          {cards.slice(0, 6).map((card) => (
            <li key={card.name} className="flex items-center gap-2">
              <CardImage
                src={getCardImage(card.name)}
                alt=""
                className="h-[33px] w-6 shrink-0 rounded border-2 border-ink object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-bold">{card.name}</span>
              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ink-faint">
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

function Shell({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <p
      className={`mt-3 rounded-xl border-2 border-ink p-4 text-sm font-semibold ${
        tone === 'error' ? 'bg-loss-soft text-ink' : 'bg-paper-raised text-ink-soft'
      }`}
    >
      {children}
    </p>
  )
}
