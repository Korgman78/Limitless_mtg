import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, BarChart3, Target, X } from 'lucide-react';
import { ManaIcons, Tooltip, Skeleton } from '../../Common';
import { getCardImage } from '../../../utils/helpers';
import CardImage from '../../Common/CardImage';
import type {
  DeckAnalysisResult,
  CoreCardStatus,
  CurveRow,
} from '../../../utils/deckAnalysisCore';
import type { CreatureStatus } from '../../../hooks/useDeckAnalysis';

// ─── Analysis tab definitions ────────────────────────────────────────────────

type AnalysisTab = 'overview' | 'curve' | 'core' | 'cuts';
const TABS: { key: AnalysisTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'curve', label: 'Curve' },
  { key: 'core', label: 'Core' },
  { key: 'cuts', label: 'Cuts / Adds' },
];

// ─── Skeleton loader ─────────────────────────────────────────────────────────

const AnalysisSkeleton: React.FC = () => (
  <div className="p-4 md:p-6 space-y-5 animate-pulse">
    {/* Tab nav skeleton */}
    <div className="flex gap-1.5">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-lg" />
      ))}
    </div>
    {/* Creature count skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Skeleton className="h-56 rounded-3xl" />
      <Skeleton className="h-56 rounded-3xl" />
    </div>
    {/* Curve skeleton */}
    <Skeleton className="h-72 rounded-3xl" />
    {/* Low synergy / adds skeleton */}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Skeleton className="h-48 rounded-3xl" />
      <Skeleton className="h-48 rounded-3xl" />
    </div>
  </div>
);

// ─── Props ───────────────────────────────────────────────────────────────────

interface DeckAnalysisModalProps {
  deckAnalysis: DeckAnalysisResult | null;
  isLoading: boolean;
  creatureDelta: number;
  creatureTone: string;
  creatureStatus: CreatureStatus;
  effectiveCoreCards: CoreCardStatus[];
  corePresent: CoreCardStatus[];
  coreMissing: CoreCardStatus[];
  criticalCurveInsights: string[];
  minorCurveInsights: string[];
  curveMaxReference: number;
  onClose: () => void;
  onNewAnalysis: () => void;
  onOpenArchetype: () => void;
  onZoomCard: (name: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const DeckAnalysisModal: React.FC<DeckAnalysisModalProps> = ({
  deckAnalysis,
  isLoading,
  creatureDelta,
  creatureTone,
  creatureStatus,
  effectiveCoreCards,
  corePresent,
  coreMissing,
  criticalCurveInsights,
  minorCurveInsights,
  curveMaxReference,
  onClose,
  onNewAnalysis,
  onOpenArchetype,
  onZoomCard,
}) => {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');

  const showTab = (tab: AnalysisTab) =>
    activeTab === tab || activeTab === 'overview';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        className="w-full max-w-[1180px] mx-auto bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl"
      >
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold">
              Deck Analysis Dashboard
            </p>
            {deckAnalysis ? (
              <>
                <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
                  <span>Best Match:</span>
                  <ManaIcons colors={deckAnalysis.matchedArchetype} size="sm" />
                  <span className="text-indigo-300">
                    {deckAnalysis.matchedArchetype}
                  </span>
                </h3>
                <p className="text-xs mt-1 text-slate-300">
                  {deckAnalysis.format}
                </p>
              </>
            ) : (
              <Skeleton className="h-8 w-64 rounded mt-1" />
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && <AnalysisSkeleton />}

        {/* Content */}
        {!isLoading && deckAnalysis && (
          <div className="p-4 md:p-6 space-y-5">
            {/* Tab navigation */}
            <div className="flex gap-1.5 p-1 bg-slate-950/40 rounded-xl border border-slate-800/60 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Overview / Creature + Core ── */}
            {showTab('core') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Creature Count */}
                <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                  <p className="text-[11px] md:text-xs uppercase tracking-[0.14em] text-slate-300 font-extrabold">
                    Creature Count
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 md:py-4">
                      <p className="text-[10px] text-amber-200/75 uppercase">
                        Current Deck
                      </p>
                      <p className="text-4xl md:text-5xl font-black leading-none mt-1 text-amber-300">
                        {deckAnalysis.creatureCount}
                      </p>
                    </div>
                    <p className="text-sm md:text-base text-slate-500 font-semibold tracking-wide">
                      VS
                    </p>
                    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 md:py-4 text-right">
                      <p className="text-[10px] text-cyan-200/75 uppercase">
                        Skeleton
                      </p>
                      <p className="text-4xl md:text-5xl font-black leading-none mt-1 text-cyan-300">
                        {deckAnalysis.skeletonCreatureCount}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-xs text-slate-400">Delta </span>
                    <span className={`text-sm font-black ${creatureTone}`}>
                      {creatureDelta > 0 ? '+' : ''}
                      {creatureDelta}
                    </span>
                  </div>
                  <div
                    className={`mt-4 rounded-2xl border ring-1 px-3.5 py-2.5 ${creatureStatus.containerClass}`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={14}
                        className={`${creatureStatus.iconClass} mt-0.5 shrink-0`}
                      />
                      <div className="space-y-1">
                        <p
                          className={`text-[10px] uppercase tracking-widest font-bold ${creatureStatus.titleClass}`}
                        >
                          Creature Status
                        </p>
                        <p
                          className={`text-[12px] font-semibold ${creatureStatus.textClass}`}
                        >
                          {creatureStatus.label}
                        </p>
                        <p
                          className={`text-[12px] font-semibold ${creatureStatus.textClass}`}
                        >
                          {creatureStatus.helper}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Core Cards Coverage */}
                <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] md:text-xs uppercase tracking-[0.14em] text-slate-300 font-extrabold">
                      Core Cards Coverage
                    </p>
                    <p className="text-xl md:text-2xl font-black text-amber-300">
                      {corePresent.length}/{effectiveCoreCards.length}
                    </p>
                  </div>
                  <div className="mt-3 space-y-3">
                    <CardRow
                      label="Present"
                      cards={corePresent}
                      emptyText="No core cards found in current main deck."
                      borderClass="border-amber-400/35"
                      badgeBg="bg-black/80 text-amber-200 border-amber-400/35"
                      onZoom={onZoomCard}
                    />
                    <CardRow
                      label="Missing"
                      cards={coreMissing}
                      emptyText="All core cards are present."
                      emptyClass="text-emerald-300"
                      borderClass="border-slate-600/70"
                      badgeBg="bg-black/80 text-slate-300 border-slate-500/60"
                      dimmed
                      onZoom={onZoomCard}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Mana Curve ── */}
            {showTab('curve') && (
              <CurvePanel
                curveRows={deckAnalysis.curveRows}
                maxReference={curveMaxReference}
                criticalInsights={criticalCurveInsights}
                minorInsights={minorCurveInsights}
              />
            )}

            {/* ── Potential Cuts + Potential Adds ── */}
            {showTab('cuts') && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <PotentialCutsPanel
                  cards={deckAnalysis.lowSynergyCards}
                  onZoom={onZoomCard}
                />
                <PotentialAddsPanel
                  cards={deckAnalysis.potentialAdds}
                  onZoom={onZoomCard}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!isLoading && deckAnalysis && (
          <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-wrap justify-end gap-2">
            <button
              onClick={onNewAnalysis}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Analyze Another Deck
            </button>
            <button
              onClick={onOpenArchetype}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
            >
              <Target size={12} />
              Open Matched Archetype
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ─── Sub-panels ──────────────────────────────────────────────────────────────

/** Reusable horizontal card row for core cards */
const CardRow: React.FC<{
  label: string;
  cards: CoreCardStatus[];
  emptyText: string;
  emptyClass?: string;
  borderClass: string;
  badgeBg: string;
  dimmed?: boolean;
  onZoom: (name: string) => void;
}> = ({
  label,
  cards,
  emptyText,
  emptyClass = 'text-slate-500',
  borderClass,
  badgeBg,
  dimmed,
  onZoom,
}) => (
  <div>
    <p className="text-[10px] text-slate-200 uppercase tracking-wide font-bold mb-1.5">
      {label}
    </p>
    {cards.length === 0 ? (
      <p className={`text-xs ${emptyClass}`}>{emptyText}</p>
    ) : (
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex gap-2 min-w-max">
          {cards.map((card) => (
            <button
              key={card.name}
              type="button"
              className={`group relative ${dimmed ? 'opacity-90' : ''}`}
              title={card.name}
              onClick={() => onZoom(card.name)}
            >
              <div
                className={`w-12 sm:w-14 md:w-16 aspect-[2/3] rounded-md overflow-hidden border ${borderClass} shadow-lg transition-transform duration-200 group-hover:scale-110`}
              >
                <CardImage
                  src={getCardImage(card.name)}
                  alt={card.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                className={`absolute -top-1 -left-1 px-1 py-[1px] rounded text-[8px] font-bold border ${badgeBg}`}
              >
                #{card.rank}
              </div>
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

/** Mana curve bar chart */
const CurvePanel: React.FC<{
  curveRows: CurveRow[];
  maxReference: number;
  criticalInsights: string[];
  minorInsights: string[];
}> = ({ curveRows, maxReference, criticalInsights, minorInsights }) => (
  <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
    <div className="flex items-center gap-2 mb-5">
      <BarChart3 size={13} className="text-indigo-300" />
      <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
        Mana Curve Fit
      </h4>
    </div>

    <div className="grid grid-cols-7 gap-2 md:gap-3 h-56 md:h-64">
      {curveRows.map((row) => {
        const expectedHeight = Math.max(
          (row.expected / maxReference) * 100,
          4,
        );
        const actualHeight = Math.max((row.actual / maxReference) * 100, 4);
        return (
          <div
            key={row.cmc}
            className="flex flex-col items-center justify-end gap-2"
          >
            <div className="text-[10px] text-slate-400 font-bold">
              {row.actual}/{Math.round(row.expected)}
            </div>
            <div className="h-44 md:h-52 w-full rounded-xl bg-slate-900/50 border border-slate-800/60 p-2 flex items-end justify-center gap-1.5">
              <div
                className="w-[42%] rounded-t-md bg-gradient-to-t from-amber-600 to-orange-400"
                style={{ height: `${actualHeight}%` }}
                title={`Current Deck ${row.actual}`}
              />
              <div
                className="w-[42%] rounded-t-md bg-gradient-to-t from-cyan-500 to-indigo-400"
                style={{ height: `${expectedHeight}%` }}
                title={`Skeleton ${row.expected.toFixed(1)}`}
              />
            </div>
            <div className="text-xs font-black text-slate-300">{row.cmc}</div>
          </div>
        );
      })}
    </div>

    <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-slate-500 uppercase tracking-wide">
      <div className="inline-flex items-center gap-1.5">
        <span className="w-3 h-1.5 rounded bg-gradient-to-r from-amber-600 to-orange-400" />
        Current Deck
      </div>
      <div className="inline-flex items-center gap-1.5">
        <span className="w-3 h-1.5 rounded bg-gradient-to-r from-cyan-500 to-indigo-400" />
        Skeleton
      </div>
    </div>

    {criticalInsights.length > 0 && (
      <div className="mt-4 rounded-2xl border border-amber-300/50 bg-amber-500/15 ring-1 ring-amber-300/20 px-3.5 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={14}
            className="text-amber-200 mt-0.5 shrink-0"
          />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-amber-200/90 font-bold">
              Curve Alerts
            </p>
            {criticalInsights.slice(0, 3).map((insight) => (
              <p
                key={insight}
                className="text-[12px] text-amber-100 font-semibold"
              >
                {insight}
              </p>
            ))}
          </div>
        </div>
      </div>
    )}

    {minorInsights.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-2">
        {minorInsights.map((insight) => (
          <span
            key={insight}
            className="px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-700 text-[11px] text-slate-300"
          >
            {insight}
          </span>
        ))}
      </div>
    )}
  </div>
);

/** Potential cuts panel — mirror of Potential Adds with inverted 2/3 rules */
const PotentialCutsPanel: React.FC<{
  cards: DeckAnalysisResult['lowSynergyCards'];
  onZoom: (name: string) => void;
}> = ({ cards, onZoom }) => {
  // Derive badge flags for old cached data missing the new fields
  const enriched = cards.map((card) => {
    const hasWeakSynergy = card.hasWeakSynergy ?? (card.supportPairs >= 3 && card.avgSynergy <= 2.0);
    const hasLowWr = card.hasLowWr ?? false;
    const isNonKey = card.isNonKey ?? true;
    const matchCount = card.matchCount ?? (Number(hasWeakSynergy) + Number(hasLowWr) + Number(isNonKey));
    return { ...card, hasWeakSynergy, hasLowWr, isNonKey, matchCount };
  });

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
            Potential Cuts
          </h4>
          <Tooltip
            content={
              <div className="max-w-[240px] space-y-1.5">
                <p className="text-[10px] text-slate-200 font-semibold">
                  Main deck non-land cards only. Shown if at least 2 of 3 rules
                  match. Core cards are always excluded.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 1: weak synergy with your current main deck cards.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 2: WR at or below archetype baseline.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 3: card is not in the archetype top 25 importance ranking.
                </p>
              </div>
            }
          >
            <button
              type="button"
              aria-label="Potential Cuts rules"
              className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
            >
              ?
            </button>
          </Tooltip>
        </div>
      </div>

      {enriched.length === 0 ? (
        <p className="text-xs text-slate-500">
          No card currently meets at least 2 of the 3 cut conditions.
        </p>
      ) : (
        <div className="space-y-2">
          {enriched.map((card) => (
            <div
              key={card.name}
              className="px-2.5 md:px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  className="group relative shrink-0"
                  title={card.name}
                  onClick={() => onZoom(card.name)}
                >
                  <div className="w-9 sm:w-10 md:w-11 aspect-[2/3] rounded-md overflow-hidden border border-slate-700 transition-transform duration-200 group-hover:scale-110 shadow-lg">
                    <CardImage
                      src={getCardImage(card.name)}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {card.qty > 1 ? `${card.qty}x ` : ''}
                    {card.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {card.hasWeakSynergy && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-red-500/10 border border-red-400/30 text-[8px] md:text-[9px] font-bold text-red-200 whitespace-nowrap">
                        <span className="sm:hidden">Weak syn</span>
                        <span className="hidden sm:inline">Weak synergy</span>
                      </span>
                    )}
                    {card.hasLowWr && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-rose-500/10 border border-rose-400/30 text-[8px] md:text-[9px] font-bold text-rose-200 whitespace-nowrap">
                        WR
                      </span>
                    )}
                    {card.isNonKey && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-orange-500/10 border border-orange-400/30 text-[8px] md:text-[9px] font-bold text-orange-200 whitespace-nowrap">
                        Non-key
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 w-[58px] sm:w-[70px] flex flex-col items-end leading-tight text-right">
                <span className="text-xs font-black text-red-300">
                  {card.matchCount}/3
                </span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  Syn {card.avgSynergy.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  WR {card.wr?.toFixed(1) ?? '--'}{' '}
                  {card.wrSource === 'global' ? '(global)' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Potential adds panel — 2/3 rules system */
const PotentialAddsPanel: React.FC<{
  cards: DeckAnalysisResult['potentialAdds'];
  onZoom: (name: string) => void;
}> = ({ cards, onZoom }) => {
  // Derive badge flags for old cached data missing the new fields
  const enriched = cards.map((card) => {
    const hasStrongSynergy = card.hasStrongSynergy ?? (card.supportPairs >= 3 && card.avgSynergy >= 4.0);
    const hasStrongWr = card.hasStrongWr ?? false;
    const isTop15Importance = card.isTop15Importance ?? false;
    const matchCount = card.matchCount ?? (Number(hasStrongSynergy) + Number(hasStrongWr) + Number(isTop15Importance));
    return { ...card, hasStrongSynergy, hasStrongWr, isTop15Importance, matchCount };
  });

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
            Potential Adds
          </h4>
          <Tooltip
            content={
              <div className="max-w-[240px] space-y-1.5">
                <p className="text-[10px] text-slate-200 font-semibold">
                  Sideboard candidates only. Shown if at least 2 of 3 rules
                  match.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 1: strong synergy with your current main deck cards.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 2: WR above archetype baseline.
                </p>
                <p className="text-[10px] text-slate-400">
                  Rule 3: card is in the archetype top 25 importance ranking.
                </p>
              </div>
            }
          >
            <button
              type="button"
              aria-label="Potential Adds rules"
              className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
            >
              ?
            </button>
          </Tooltip>
        </div>
      </div>

      {enriched.length === 0 ? (
        <p className="text-xs text-slate-500">
          No sideboard card currently meets at least 2 of the 3 add conditions.
        </p>
      ) : (
        <div className="space-y-2">
          {enriched.map((card) => (
            <div
              key={card.name}
              className="px-2.5 md:px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  className="group relative shrink-0"
                  title={card.name}
                  onClick={() => onZoom(card.name)}
                >
                  <div className="w-9 sm:w-10 md:w-11 aspect-[2/3] rounded-md overflow-hidden border border-slate-700 transition-transform duration-200 group-hover:scale-110 shadow-lg">
                    <CardImage
                      src={getCardImage(card.name)}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {card.qty > 1 ? `${card.qty}x ` : ''}
                    {card.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {card.hasStrongSynergy && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-[8px] md:text-[9px] font-bold text-cyan-200 whitespace-nowrap">
                        <span className="sm:hidden">Strong syn</span>
                        <span className="hidden sm:inline">Strong synergy</span>
                      </span>
                    )}
                    {card.hasStrongWr && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-emerald-500/10 border border-emerald-400/30 text-[8px] md:text-[9px] font-bold text-emerald-200 whitespace-nowrap">
                        WR
                      </span>
                    )}
                    {card.isTop15Importance && (
                      <span className="px-1 py-[1px] md:px-1.5 md:py-0.5 rounded bg-amber-500/10 border border-amber-400/30 text-[8px] md:text-[9px] font-bold text-amber-200 whitespace-nowrap">
                        Top 25
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="shrink-0 w-[58px] sm:w-[70px] flex flex-col items-end leading-tight text-right">
                <span className="text-xs font-black text-indigo-300">
                  {card.matchCount}/3
                </span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  Syn {card.avgSynergy.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  WR {card.wr?.toFixed(1) ?? '--'}{' '}
                  {card.wrSource === 'global' ? '(global)' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
