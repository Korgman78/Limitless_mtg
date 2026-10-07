import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Droplets,
  Layers,
  ListChecks,
  Minus,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { ManaIcons, Tooltip } from '../../Common';
import { CmcStack, type SkeletonCard } from '../CmcStack';
import type {
  PoolAnalysisCache,
  PoolOptimizationProgress,
  SealedDeckResult,
} from '../../../hooks/usePoolAnalysis';
import {
  WR_POINTS_PER_SCORE_POINT,
  buildTabLabel,
  diffBuilds,
  formatSigned,
  scoreDeltaToWr,
  summarizeBuild,
  type PoolPreview,
  type SummaryLine,
} from './poolExplain';

type BuildCurveRow = {
  cmc: number;
  count: number;
  target: number | null;
};

type AxisKey = 'power' | 'synergy' | 'consistency' | 'curve';

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;

const totalQty = (rows: Array<{ qty: number }>): number =>
  rows.reduce((sum, row) => sum + row.qty, 0);

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const extractCostColors = (cost: string | null | undefined): string[] => {
  if (!cost) return [];
  const symbols = [...cost.toUpperCase().matchAll(/\{([^}]+)\}/g)].map(
    (m) => m[1].trim(),
  );
  const found = new Set<string>();
  for (const symbol of symbols) {
    if (/^[WUBRG]$/.test(symbol)) found.add(symbol);
    if (symbol.includes('/')) {
      for (const part of symbol.split('/')) {
        if (/^[WUBRG]$/.test(part)) found.add(part);
      }
    }
  }
  return [...found];
};

const buildSpellCurve = (
  build: SealedDeckResult,
  metaByName: PoolAnalysisCache['metaByName'],
): BuildCurveRow[] => {
  const curve: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const card of build.cards) {
    const cmcRaw = Number(metaByName[card.name]?.cmc ?? 0);
    const bucket = Math.max(1, Math.min(7, Math.round(cmcRaw)));
    curve[bucket] += card.qty;
  }
  const target = build.explanation?.targetCurve ?? null;
  return [1, 2, 3, 4, 5, 6, 7].map((cmc) => ({
    cmc,
    count: curve[cmc] || 0,
    target: target ? Number(target[String(cmc)] ?? 0) : null,
  }));
};

const buildColorDistribution = (
  build: SealedDeckResult,
  metaByName: PoolAnalysisCache['metaByName'],
): Record<(typeof COLOR_ORDER)[number], number> => {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of build.cards) {
    const meta = metaByName[card.name];
    const fromCost = extractCostColors(meta?.cost);
    const fromColors = (meta?.colors || '')
      .toUpperCase()
      .split('')
      .filter((c) => COLOR_ORDER.includes(c as (typeof COLOR_ORDER)[number]));
    const colors = [...new Set([...fromCost, ...fromColors])];
    for (const color of colors) {
      counts[color as (typeof COLOR_ORDER)[number]] += card.qty;
    }
  }
  return counts;
};

const buildCmcStacks = (
  build: SealedDeckResult,
  metaByName: PoolAnalysisCache['metaByName'],
): Record<number, SkeletonCard[]> => {
  const stacks: Record<number, SkeletonCard[]> = {};
  for (let cmc = 0; cmc <= 7; cmc += 1) stacks[cmc] = [];

  for (const card of build.cards) {
    const meta = metaByName[card.name];
    const cmc = Math.max(0, Math.min(7, Math.round(Number(meta?.cmc ?? 0))));
    for (let i = 0; i < card.qty; i += 1) {
      stacks[cmc].push({
        name: card.name,
        cmc,
        type: meta?.type || '',
        cost: meta?.cost || '',
        rarity: meta?.rarity || '',
      });
    }
  }

  // Inject lands in CMC 0 column so mana base is visible in recommended list.
  for (const land of build.lands) {
    const meta = metaByName[land.name];
    for (let i = 0; i < land.qty; i += 1) {
      stacks[0].push({
        name: land.name,
        cmc: 0,
        type: meta?.type || 'Land',
        cost: meta?.cost || '',
        rarity: meta?.rarity || '',
      });
    }
  }

  return stacks;
};

// Badges de role des cartes (en haut a gauche, seule zone visible dans la pile).
const CARD_BADGES = {
  bomb: { label: 'B', title: 'Bomb: win rate well above the format average', cls: 'bg-purple-500 text-white' },
  removal: { label: 'R', title: 'Removal', cls: 'bg-rose-500 text-white' },
  splash: { label: 'S', title: 'Splash card', cls: 'bg-amber-400 text-slate-950' },
  unmet: { label: '!', title: 'Payoff without enough support in this deck', cls: 'bg-red-600 text-white' },
} as const;

const Badge: React.FC<{ kind: keyof typeof CARD_BADGES }> = ({ kind }) => (
  <span
    title={CARD_BADGES[kind].title}
    className={`h-4 min-w-[16px] px-1 rounded-full text-[11px] leading-4 font-black text-center shadow ${CARD_BADGES[kind].cls}`}
  >
    {CARD_BADGES[kind].label}
  </span>
);

const TONE_ICON: Record<SummaryLine['tone'], React.ReactNode> = {
  good: <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />,
  neutral: <Minus size={14} className="text-slate-400 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />,
};

interface PoolAnalysisModalProps {
  poolAnalysis: PoolAnalysisCache | null;
  isLoading: boolean;
  loadingProgress?: PoolOptimizationProgress | null;
  poolPreview?: PoolPreview | null;
  selectedBuildIndex: number;
  selectedTab: 'build' | 'user';
  userDeckBuild: SealedDeckResult | null;
  onSelectBuild: (index: number) => void;
  onSelectUserDeck: () => void;
  onTestCustomDeck: () => void;
  onClose: () => void;
  onNewPool: () => void;
  onOpenArchetype: () => void;
  onZoomCard: (name: string) => void;
}

// ─── Unified section header style ───────────────────────────────────────────
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}> = ({ icon, title, trailing }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-2">
      {icon}
      <h4 className="text-xs text-slate-200 uppercase tracking-[0.12em] font-extrabold">
        {title}
      </h4>
    </div>
    {trailing}
  </div>
);

const HelpDot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Tooltip content={<div className="max-w-[260px] text-[11px] text-slate-200 space-y-1">{children}</div>}>
    <span className="w-4 h-4 rounded-full border border-slate-500 text-[11px] font-bold text-slate-300 hover:text-white hover:border-slate-300 transition-colors flex items-center justify-center cursor-help">
      ?
    </span>
  </Tooltip>
);

const STRATEGIES = [
  { key: 'skeleton', title: 'Trophy-deck template', subtitle: 'Builds close to winning decks of the archetype' },
  { key: 'power_mana_safe', title: 'Power, safe mana', subtitle: 'Best cards, stable castability' },
  { key: 'power_greedy_splash', title: 'Greedy splash', subtitle: 'Splashes bombs, explores 3 colors' },
  { key: 'curve_creatures', title: 'Curve & creatures', subtitle: 'Tempo and board presence' },
  { key: 'synergy_if_online', title: 'Synergy', subtitle: 'Payoffs when their support is there' },
];

export const PoolAnalysisModal: React.FC<PoolAnalysisModalProps> = ({
  poolAnalysis,
  isLoading,
  loadingProgress,
  poolPreview,
  selectedBuildIndex,
  selectedTab,
  userDeckBuild,
  onSelectBuild,
  onSelectUserDeck,
  onTestCustomDeck,
  onClose,
  onNewPool,
  onOpenArchetype,
  onZoomCard,
}) => {
  const [didCopy, setDidCopy] = useState(false);
  const [activeAxis, setActiveAxis] = useState<AxisKey>('power');
  const [showComputation, setShowComputation] = useState(false);
  const [expandedCurveComponentId, setExpandedCurveComponentId] = useState<string | null>(null);
  const result = poolAnalysis?.result;
  const metaByName = poolAnalysis?.metaByName || {};
  const computeTimeMs = poolAnalysis?.computeTimeMs ?? null;
  const selectedBuild =
    selectedTab === 'user' && userDeckBuild
      ? userDeckBuild
      : result?.builds[selectedBuildIndex] || result?.builds[0] || null;
  const bestBuild = result?.builds[0] || null;
  const isBestSelected = selectedTab === 'build' && selectedBuildIndex === 0;

  const curveRows = useMemo(
    () => (selectedBuild ? buildSpellCurve(selectedBuild, metaByName) : []),
    [selectedBuild, metaByName],
  );
  const maxCurveValue = useMemo(
    () => Math.max(...curveRows.map((row) => Math.max(row.count, row.target ?? 0)), 1),
    [curveRows],
  );

  const colorDistribution = useMemo(
    () =>
      selectedBuild
        ? buildColorDistribution(selectedBuild, metaByName)
        : { W: 0, U: 0, B: 0, R: 0, G: 0 },
    [selectedBuild, metaByName],
  );

  const cmcStacks = useMemo(
    () => (selectedBuild ? buildCmcStacks(selectedBuild, metaByName) : {}),
    [selectedBuild, metaByName],
  );
  const maxCmc = useMemo(() => {
    const buckets = Object.keys(cmcStacks).map((k) => Number(k));
    return Math.max(5, ...buckets.filter((cmc) => (cmcStacks[cmc] || []).length > 0));
  }, [cmcStacks]);
  const cmcRange = useMemo(
    () => Array.from({ length: maxCmc + 1 }, (_, i) => i),
    [maxCmc],
  );

  const summary = useMemo(
    () => (selectedBuild ? summarizeBuild(selectedBuild) : []),
    [selectedBuild],
  );
  const diffVsBest = useMemo(
    () => (selectedBuild && bestBuild && !isBestSelected ? diffBuilds(bestBuild, selectedBuild) : null),
    [selectedBuild, bestBuild, isBestSelected],
  );

  // Escape key is handled centrally in DeckTestPanel/index.tsx

  if (isLoading) {
    const progressTotal = Math.max(0, Number(loadingProgress?.total || 0));
    const progressDone = Math.max(0, Number(loadingProgress?.done || 0));
    const progressRunning = Math.max(0, Number(loadingProgress?.running || 0));
    const progressQueued = Math.max(0, Number(loadingProgress?.queued || 0));
    const progressFailed = Math.max(0, Number(loadingProgress?.failed || 0));
    const hasShardProgress = progressTotal > 0;
    const estimatedProgressPct = hasShardProgress
      ? clamp(((progressDone + progressRunning * 0.5) / progressTotal) * 100, 0, 100)
      : null;
    const progressPctLabel = hasShardProgress
      ? `${Math.round(estimatedProgressPct ?? 0)}%`
      : 'Starting...';
    const phaseLabel = !hasShardProgress
      ? 'Reading your pool'
      : progressDone >= progressTotal
        ? 'Picking the 3 best builds'
        : 'Exploring builds';
    const waitingForWorkers =
      hasShardProgress &&
      progressDone < progressTotal &&
      progressRunning === 0 &&
      progressQueued > 0;

    type ShardState = 'done' | 'running' | 'queued' | 'failed';
    const shardStates: ShardState[] = [];
    if (hasShardProgress) {
      for (let i = 0; i < progressDone; i += 1) shardStates.push('done');
      for (let i = 0; i < progressRunning; i += 1) shardStates.push('running');
      for (let i = 0; i < progressQueued; i += 1) shardStates.push('queued');
      for (let i = 0; i < progressFailed; i += 1) shardStates.push('failed');
      while (shardStates.length < progressTotal) shardStates.push('queued');
      if (shardStates.length > progressTotal) shardStates.length = progressTotal;
    }
    const statusLabel: Record<ShardState, string> = {
      done: 'explored',
      running: 'exploring',
      queued: 'next',
      failed: 'skipped',
    };
    const strategyCards = Array.from({ length: hasShardProgress ? progressTotal : STRATEGIES.length }).map((_, i) => ({
      ...(STRATEGIES[i] ?? { key: `strategy_${i + 1}`, title: `Strategy ${i + 1}`, subtitle: '' }),
      index: i,
      status: (shardStates[i] ?? 'queued') as ShardState,
    }));

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.99 }}
          className="w-full max-w-[860px] mx-auto bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl"
        >
          <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold">
                Sealed Pool Optimizer
              </p>
              <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
                Analyzing your pool
              </h3>
              <p className="text-sm mt-1 text-slate-300">
                Several build strategies are explored, then the 3 best distinct builds are kept.
              </p>
              <p className="text-xs mt-2 text-indigo-200 font-semibold">
                {phaseLabel}
                {hasShardProgress && ` · strategies explored: ${progressDone}/${progressTotal}`}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-center gap-5">
              <div className="relative w-20 h-20">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-indigo-400/30"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                />
                <motion.div
                  className="absolute inset-2 rounded-full border-2 border-cyan-400/50 border-t-transparent"
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={18} className="text-indigo-300" />
                </div>
              </div>
              <div className="min-w-[88px]">
                <p className="text-2xl font-black text-white leading-none">
                  {progressPctLabel}
                </p>
                <p className="text-xs text-slate-400 mt-1">overall progress</p>
              </div>
            </div>

            {poolPreview && poolPreview.total > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-300 font-bold mb-3">
                  Your pool · {poolPreview.total} cards
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  {COLOR_ORDER.map((color) => (
                    <div key={color} className="flex flex-col items-center gap-1">
                      <img
                        src={`https://svgs.scryfall.io/card-symbols/${color}.svg`}
                        alt={color}
                        className="w-6 h-6"
                      />
                      <span className="text-sm font-black text-white">{poolPreview.byColor[color]}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-slate-300 h-6 flex items-center">Multi</span>
                    <span className="text-sm font-black text-white">{poolPreview.multicolor}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-slate-300 h-6 flex items-center">Colorless</span>
                    <span className="text-sm font-black text-white">{poolPreview.colorless}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-amber-300 h-6 flex items-center">Rares & mythics</span>
                    <span className="text-sm font-black text-white">{poolPreview.raresMythics}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              {strategyCards.map((item, index) => (
                <motion.div
                  key={`${item.key}-${item.index}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5"
                  animate={item.status === 'running' ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
                  transition={{
                    repeat: item.status === 'running' ? Infinity : 0,
                    duration: 1.2,
                    delay: index * 0.08,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white leading-tight">{item.title}</p>
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        item.status === 'done'
                          ? 'text-emerald-200 bg-emerald-500/25'
                          : item.status === 'running'
                            ? 'text-cyan-200 bg-cyan-500/25'
                            : item.status === 'failed'
                              ? 'text-rose-200 bg-rose-500/25'
                              : 'text-slate-300 bg-slate-700/45'
                      }`}
                    >
                      {statusLabel[item.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 leading-snug">{item.subtitle}</p>
                </motion.div>
              ))}
            </div>
            {waitingForWorkers && (
              <p className="text-xs text-amber-300/90">
                Waiting for a free server slot. It resumes automatically.
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (!result || !selectedBuild) return null;

  const creatureCount = selectedBuild.stats.creatureCount;
  const spellCount = Math.max(0, totalQty(selectedBuild.cards) - creatureCount);
  const landCount = totalQty(selectedBuild.lands);
  const totalNonLand = Math.max(1, creatureCount + spellCount);
  const creatureRatio = Math.round((creatureCount / totalNonLand) * 100);
  const spellRatio = 100 - creatureRatio;
  const roles = selectedBuild.explanation?.cardRoles || {};
  const manaPlan = selectedBuild.explanation?.manaPlan || [];
  const hasTargetCurve = curveRows.some((row) => row.target != null);

  const b = selectedBuild.scoreBreakdown;
  const synergyBaseNormalized = Number.isFinite(b.synergyBaseNormalized)
    ? b.synergyBaseNormalized
    : b.synergyNormalized - b.dependencyAdjustment;
  const baseScore = b.qualityScore;
  const totalWeight =
    result.weightsApplied.power +
    result.weightsApplied.synergy +
    result.weightsApplied.consistency +
    result.weightsApplied.curve;
  const toFixed2NoRound = (value: number): string => {
    if (!Number.isFinite(value)) return '0.00';
    const truncated =
      value < 0
        ? Math.ceil(value * 100) / 100
        : Math.floor(value * 100) / 100;
    return truncated.toFixed(2);
  };
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${toFixed2NoRound(value)}`;
  const dependencyAxisScale =
    Number.isFinite(b.dependencyAxisScale) && b.dependencyAxisScale > 0
      ? b.dependencyAxisScale
      : totalWeight / Math.max(1e-6, result.weightsApplied.synergy);
  const dependencyAxisDelta =
    Number.isFinite(b.dependencyAxisDelta)
      ? b.dependencyAxisDelta
      : b.dependencyAdjustment * dependencyAxisScale;
  const removalAxisScale =
    Number.isFinite(b.removalAxisScale) && b.removalAxisScale > 0
      ? b.removalAxisScale
      : totalWeight / Math.max(1e-6, result.weightsApplied.curve);
  const removalAxisDelta =
    Number.isFinite(b.removalAxisDelta)
      ? b.removalAxisDelta
      : b.removalAdjustment * removalAxisScale;
  const curveTopHeavyPenalty = Number.isFinite(b.curveTopHeavyPenalty) ? b.curveTopHeavyPenalty : 0;
  const curveSkeletonPenalty = Number.isFinite(b.curveSkeletonPenalty) ? b.curveSkeletonPenalty : 0;
  const curveEarlyCreaturePenalty = Number.isFinite(b.curveEarlyCreaturePenalty) ? b.curveEarlyCreaturePenalty : 0;
  const curveCreatureCorridorPenalty = Number.isFinite(b.curveCreatureCorridorPenalty) ? b.curveCreatureCorridorPenalty : 0;
  const curveTopHeavyScale =
    Number.isFinite(b.curveTopHeavyScale) && b.curveTopHeavyScale > 0 ? b.curveTopHeavyScale : 90;
  const curveSkeletonScale =
    Number.isFinite(b.curveSkeletonScale) && b.curveSkeletonScale > 0 ? b.curveSkeletonScale : 90;
  const curveEarlyCreatureScale =
    Number.isFinite(b.curveEarlyCreatureScale) && b.curveEarlyCreatureScale > 0 ? b.curveEarlyCreatureScale : 90;
  const curveCreatureCorridorScale =
    Number.isFinite(b.curveCreatureCorridorScale) && b.curveCreatureCorridorScale > 0
      ? b.curveCreatureCorridorScale
      : 90;
  const curveTopHeavyDelta = -curveTopHeavyScale * curveTopHeavyPenalty;
  const curveSkeletonDelta = -curveSkeletonScale * curveSkeletonPenalty;
  const curveEarlyCreatureDelta = -curveEarlyCreatureScale * curveEarlyCreaturePenalty;
  const curveCreatureCorridorDelta = -curveCreatureCorridorScale * curveCreatureCorridorPenalty;
  const curveComponents = [
    {
      id: 'top-heavy',
      label: 'Top Heavy',
      tooltip: 'Penalizes too many expensive spells compared to early curve stability.',
      raw: curveTopHeavyPenalty,
      scale: curveTopHeavyScale,
      delta: curveTopHeavyDelta,
    },
    {
      id: 'skeleton-shape',
      label: 'Skeleton',
      tooltip: 'Penalizes distance from the trophy-deck curve of this archetype (dashed marks on the curve chart).',
      raw: curveSkeletonPenalty,
      scale: curveSkeletonScale,
      delta: curveSkeletonDelta,
    },
    {
      id: 'early-creature',
      label: 'Early Creature',
      tooltip: 'Penalizes missing creature presence in mana value 2-3.',
      raw: curveEarlyCreaturePenalty,
      scale: curveEarlyCreatureScale,
      delta: curveEarlyCreatureDelta,
    },
    {
      id: 'creature-corridor',
      label: 'Creature Corridor',
      tooltip: 'Penalizes a total creature count outside 12-18.',
      raw: curveCreatureCorridorPenalty,
      scale: curveCreatureCorridorScale,
      delta: curveCreatureCorridorDelta,
    },
    {
      id: 'removal',
      label: 'Removal',
      tooltip: 'Removal adjustment: 4+ removal spells no penalty, 3 => -3, 2 or fewer => -6.',
      raw: b.removalAdjustment,
      scale: removalAxisScale,
      delta: removalAxisDelta,
    },
  ] as const;

  const axisRows = [
    {
      id: 'power' as AxisKey,
      label: 'Power',
      hint: 'Card quality',
      value: b.wrNormalized,
      weight: result.weightsApplied.power,
      color: 'from-emerald-500 to-teal-400',
    },
    {
      id: 'synergy' as AxisKey,
      label: 'Synergy',
      hint: 'Cards that win together',
      value: b.synergyNormalized,
      weight: result.weightsApplied.synergy,
      color: 'from-fuchsia-500 to-violet-400',
    },
    {
      id: 'consistency' as AxisKey,
      label: 'Consistency',
      hint: 'Casting spells on time',
      value: b.consistencyScore,
      weight: result.weightsApplied.consistency,
      color: 'from-cyan-500 to-sky-400',
    },
    {
      id: 'curve' as AxisKey,
      label: 'Curve & Structure',
      hint: 'Curve, creatures, removal',
      value: b.curveScore,
      weight: result.weightsApplied.curve,
      color: 'from-amber-500 to-orange-400',
    },
  ];

  const selectedAxis = axisRows.find((row) => row.id === activeAxis) || axisRows[0];
  const axisTheme: Record<AxisKey, { cardActive: string; cardInactive: string; chip: string }> = {
    power: {
      cardActive: 'border-emerald-400/65 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(52,211,153,0.25),0_0_35px_rgba(16,185,129,0.15)]',
      cardInactive: 'border-emerald-500/25 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.08] hover:border-emerald-400/40',
      chip: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
    },
    synergy: {
      cardActive: 'border-fuchsia-400/65 bg-fuchsia-500/12 shadow-[0_0_0_1px_rgba(244,114,182,0.25),0_0_35px_rgba(217,70,239,0.15)]',
      cardInactive: 'border-fuchsia-500/25 bg-fuchsia-500/[0.05] hover:bg-fuchsia-500/[0.08] hover:border-fuchsia-400/40',
      chip: 'bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30',
    },
    consistency: {
      cardActive: 'border-cyan-400/65 bg-cyan-500/12 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_35px_rgba(14,165,233,0.15)]',
      cardInactive: 'border-cyan-500/25 bg-cyan-500/[0.05] hover:bg-cyan-500/[0.08] hover:border-cyan-400/40',
      chip: 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30',
    },
    curve: {
      cardActive: 'border-amber-400/65 bg-amber-500/12 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_35px_rgba(249,115,22,0.15)]',
      cardInactive: 'border-amber-500/25 bg-amber-500/[0.05] hover:bg-amber-500/[0.08] hover:border-amber-400/40',
      chip: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    },
  };
  const contributionByKey: Record<AxisKey, number> = {
    power: Number.isFinite(b.powerWeightedContribution)
      ? b.powerWeightedContribution
      : (b.wrNormalized * result.weightsApplied.power) / Math.max(1e-6, totalWeight),
    synergy: Number.isFinite(b.synergyWeightedContribution)
      ? b.synergyWeightedContribution
      : (b.synergyNormalized * result.weightsApplied.synergy) / Math.max(1e-6, totalWeight),
    consistency: Number.isFinite(b.consistencyWeightedContribution)
      ? b.consistencyWeightedContribution
      : (b.consistencyScore * result.weightsApplied.consistency) / Math.max(1e-6, totalWeight),
    curve: Number.isFinite(b.curveWeightedContribution)
      ? b.curveWeightedContribution
      : (b.curveScore * result.weightsApplied.curve) / Math.max(1e-6, totalWeight),
  };
  const axisRowsWithContribution = axisRows.map((axis) => ({
    ...axis,
    contribution: contributionByKey[axis.id],
    weightSharePct: (axis.weight / Math.max(1e-6, totalWeight)) * 100,
  }));
  const curveComponentByStepLabel: Record<string, string> = {
    'top heavy delta': 'top-heavy',
    'skeleton delta': 'skeleton-shape',
    'early creature delta': 'early-creature',
    'creature corridor delta': 'creature-corridor',
    'removal delta': 'removal',
  };
  const synergyComponent = {
    id: 'dependency',
    raw: b.dependencyAdjustment,
    scale: dependencyAxisScale,
    delta: dependencyAxisDelta,
    tooltip: 'Penalty for payoff cards whose support (tribe, spell count...) is missing, in axis points.',
  } as const;
  const synergyComponentByStepLabel: Record<string, string> = {
    'dependency delta': 'dependency',
  };
  const consistencyRawDelta = -(b.manaPenalty * 450);
  const consistencyClampDelta = b.consistencyScore - (100 + consistencyRawDelta);
  const axisDetails: Record<
    AxisKey,
    {
      explanation: string;
      formula: string;
      waterfall: Array<{
        label: string;
        value: number;
        kind: 'base' | 'delta' | 'final';
        tooltip?: string;
      }>;
    }
  > = {
    power: {
      explanation: `Average 17Lands win rate of the deck's spells (${b.wrScore.toFixed(1)}%, bomb bonus included), scaled around the format average: average deck = 50, 4 points above = 100.`,
      formula: 'Power = average WR, scaled to 0-100',
      waterfall: [
        {
          label: 'Average WR (incl. bomb bonus)',
          value: b.wrScore,
          kind: 'base',
          tooltip: 'Mean "games in hand" win rate of the spells. Cards far above the format average get a bonus.',
        },
        { label: 'Power axis', value: b.wrNormalized, kind: 'final' },
      ],
    },
    synergy: {
      explanation: 'How often the deck\'s cards appear together in winning decks, minus a penalty when a payoff card lacks its support.',
      formula: 'Synergy = pair synergy + dependency adjustment',
      waterfall: [
        {
          label: 'Base synergy',
          value: synergyBaseNormalized,
          kind: 'base',
          tooltip: 'Pair synergy signal before dependency safety adjustment.',
        },
        {
          label: 'Dependency delta',
          value: dependencyAxisDelta,
          kind: 'delta',
          tooltip: 'Dependency penalty translated into axis points.',
        },
        { label: 'Final axis', value: b.synergyNormalized, kind: 'final' },
      ],
    },
    consistency: {
      explanation: 'Probability of casting each spell on curve with this mana base. Drops when a color lacks sources (see Mana base below).',
      formula: 'Consistency = 100 - mana strain, clamped to 0-100',
      waterfall: [
        {
          label: 'Start',
          value: 100,
          kind: 'base',
          tooltip: 'Consistency starts at 100 and decreases with mana strain.',
        },
        {
          label: 'Mana strain',
          value: consistencyRawDelta,
          kind: 'delta',
          tooltip: 'Computed from castability pressure across card requirements.',
        },
        {
          label: 'Clamp',
          value: consistencyClampDelta,
          kind: 'delta',
          tooltip: 'Correction to keep the axis in [0, 100].',
        },
        { label: 'Final axis', value: b.consistencyScore, kind: 'final' },
      ],
    },
    curve: {
      explanation: 'Starts at 100, then loses points for a top-heavy curve, a shape far from trophy decks, few early creatures, a creature count outside 12-18, or fewer than 4 removal spells.',
      formula: 'Curve = 100 + curve deltas + removal delta',
      waterfall: [
        { label: 'Start', value: 100, kind: 'base' },
        { label: 'Top heavy delta', value: curveTopHeavyDelta, kind: 'delta' },
        { label: 'Skeleton delta', value: curveSkeletonDelta, kind: 'delta' },
        { label: 'Early creature delta', value: curveEarlyCreatureDelta, kind: 'delta' },
        { label: 'Creature corridor delta', value: curveCreatureCorridorDelta, kind: 'delta' },
        { label: 'Removal delta', value: removalAxisDelta, kind: 'delta' },
        { label: 'Final axis', value: b.curveScore, kind: 'final' },
      ],
    },
  };
  const selectedAxisDetail = axisDetails[selectedAxis.id];
  const selectedAxisMetric =
    axisRowsWithContribution.find((row) => row.id === selectedAxis.id) || axisRowsWithContribution[0];

  // Comparaisons de score, traduites en win rate par partie.
  const comparisons: Array<{ label: string; delta: number }> = isBestSelected
    ? result.builds.slice(1).map((other, i) => ({
        label: `vs Alternative ${i + 1} (${other.archetype})`,
        delta: selectedBuild.score - other.score,
      }))
    : bestBuild
      ? [{ label: `vs Best build (${bestBuild.archetype})`, delta: selectedBuild.score - bestBuild.score }]
      : [];

  const copyDeckList = async () => {
    const lines: string[] = ['Deck'];
    for (const card of selectedBuild.cards) {
      lines.push(`${card.qty} ${card.name}`);
    }
    for (const land of selectedBuild.lands) {
      lines.push(`${land.qty} ${land.name}`);
    }
    const payload = lines.join('\n');

    try {
      await navigator.clipboard.writeText(payload);
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1800);
    } catch {
      // Ignore clipboard failures.
    }
  };

  const renderBadges = (card: SkeletonCard) => {
    const r = roles[card.name];
    if (!r) return null;
    return (
      <>
        {r.bomb && <Badge kind="bomb" />}
        {r.removal && <Badge kind="removal" />}
        {r.splash && <Badge kind="splash" />}
        {r.dependency === 'unmet' && <Badge kind="unmet" />}
      </>
    );
  };

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-slate-900/70 border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500'
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        className="w-full max-w-[1360px] mx-auto bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl"
      >
        <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-[0.15em] font-bold">
              Sealed Pool Optimizer
            </p>
            <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
              <span>
                {selectedTab === 'user' ? 'Your deck:' : isBestSelected ? 'Best build:' : `Alternative ${selectedBuildIndex}:`}
              </span>
              <ManaIcons colors={selectedBuild.mainColors.join('')} size="sm" />
              <span className="text-indigo-300">{selectedBuild.archetype}</span>
            </h3>
            <p className="text-xs mt-1 text-slate-300">
              {result.format} · {result.poolSize} cards in pool
              {computeTimeMs != null && (
                <span className="text-slate-400"> · {(computeTimeMs / 1000).toFixed(1)}s</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.builds.map((build, index) => (
                <button
                  key={`${build.archetype}-${index}`}
                  onClick={() => onSelectBuild(index)}
                  className={tabClass(selectedTab === 'build' && index === selectedBuildIndex)}
                >
                  {index === 0 ? 'Best' : `Alt ${index}`} · {buildTabLabel(build)}
                </button>
              ))}
              {userDeckBuild && (
                <button onClick={onSelectUserDeck} className={tabClass(selectedTab === 'user')}>
                  Your deck · {buildTabLabel(userDeckBuild)}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          {/* ── En bref : score, comparaisons, resume ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr] gap-4">
            <div className="rounded-3xl border border-indigo-500/25 bg-indigo-500/10 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-indigo-300" />
                <p className="text-xs font-extrabold text-indigo-200 uppercase tracking-[0.12em]">
                  Deck score
                </p>
                <HelpDot>
                  <p className="font-semibold">Used to rank builds, out of 100.</p>
                  <p className="text-slate-300">
                    Weighted mix of Power, Synergy, Consistency and Curve & Structure (details below).
                  </p>
                </HelpDot>
              </div>
              <p className="mt-2 text-5xl font-black text-white">{selectedBuild.score.toFixed(1)}</p>
              {comparisons.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {comparisons.map((cmp) => (
                    <p key={cmp.label} className="text-sm text-slate-200">
                      <span className={cmp.delta >= 0 ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>
                        {formatSigned(cmp.delta)} pts
                      </span>{' '}
                      {cmp.label}
                      <span className="text-slate-400">
                        {' '}≈ {formatSigned(scoreDeltaToWr(cmp.delta))}% wins per game
                      </span>
                    </p>
                  ))}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400">Estimate, not a guarantee</span>
                    <HelpDot>
                      <p>
                        Measured on 17Lands public Sealed games (MSH and HOB): at equal player skill, each score
                        point is worth about {WR_POINTS_PER_SCORE_POINT} win-rate points per game.
                      </p>
                      <p className="text-slate-300">Card play and opponents matter far more than the deck alone.</p>
                    </HelpDot>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5">
              <SectionHeader icon={<ListChecks size={14} className="text-cyan-300" />} title="At a glance" />
              <ul className="space-y-2">
                {summary.map((line) => (
                  <li key={line.text} className="flex items-start gap-2 text-sm text-slate-200 leading-snug">
                    {TONE_ICON[line.tone]}
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Ecart avec le meilleur build ─────────────────────────────── */}
          {diffVsBest && bestBuild && (diffVsBest.removed.length > 0 || diffVsBest.added.length > 0) && (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5">
              <SectionHeader
                icon={<ArrowRightLeft size={14} className="text-indigo-300" />}
                title={`Changes vs best build (${bestBuild.archetype})`}
              />
              {diffVsBest.colorChange && (
                <p className="text-sm text-slate-300 mb-3">Colors: {diffVsBest.colorChange}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-rose-300 uppercase tracking-wide mb-2">
                    Not in this deck ({totalQty(diffVsBest.removed)})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {diffVsBest.removed.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => onZoomCard(c.name)}
                        className="text-xs px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-100 hover:bg-rose-500/20"
                      >
                        −{c.qty > 1 ? `${c.qty} ` : ''}{c.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wide mb-2">
                    Added in this deck ({totalQty(diffVsBest.added)})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {diffVsBest.added.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => onZoomCard(c.name)}
                        className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/20"
                      >
                        +{c.qty > 1 ? `${c.qty} ` : ''}{c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Liste du deck ─────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              icon={<Layers size={14} className="text-indigo-300" />}
              title={selectedTab === 'user' ? 'Your Deck List' : 'Recommended Deck List'}
              trailing={(
                <button
                  onClick={copyDeckList}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 text-indigo-100 text-xs font-bold transition-colors"
                >
                  <Copy size={12} />
                  {didCopy ? 'Copied' : 'Copy decklist'}
                </button>
              )}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs text-slate-300">
              <span>
                {selectedBuild.stats.totalCards} cards
                {selectedBuild.splashColor ? ` · splash ${selectedBuild.splashColor}` : ''}
              </span>
              {Object.keys(roles).length > 0 && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {(['bomb', 'removal', 'splash', 'unmet'] as const).map((kind) => (
                    <span key={kind} className="inline-flex items-center gap-1">
                      <Badge kind={kind} />
                      <span className="text-slate-400">
                        {kind === 'bomb' ? 'Bomb' : kind === 'removal' ? 'Removal' : kind === 'splash' ? 'Splash' : 'Missing support'}
                      </span>
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="-mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">
              <div className="flex flex-nowrap items-start gap-0 md:gap-1 min-w-[700px] [&>div]:flex-1 [&>div]:min-w-0 [&>div]:w-auto">
                {cmcRange.map((cmc) => (
                  <CmcStack
                    key={cmc}
                    cmc={cmc}
                    cards={cmcStacks[cmc] || []}
                    onCardSelect={(card) => onZoomCard(card.name)}
                    renderBadges={renderBadges}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Detail du score (un seul bloc) ────────────────────────────── */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5 space-y-4">
            <SectionHeader
              icon={<Sparkles size={14} className="text-indigo-300" />}
              title="Score breakdown"
              trailing={<span className="text-xs text-slate-400">Click an axis for details</span>}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {axisRowsWithContribution.map((axis) => (
                <button
                  key={axis.id}
                  type="button"
                  onClick={() => setActiveAxis(axis.id)}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    selectedAxis.id === axis.id ? axisTheme[axis.id].cardActive : axisTheme[axis.id].cardInactive
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-100">{axis.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{axis.hint}</p>
                    </div>
                    <p className="text-2xl font-black text-white leading-none">{Math.round(axis.value)}</p>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-slate-800/90 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${axis.color}`} style={{ width: `${clamp(axis.value)}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-300">
                    <span className={`px-1.5 py-0.5 rounded-md ${axisTheme[axis.id].chip}`}>
                      weight {Math.round(axis.weightSharePct)}%
                    </span>
                    <span className="ml-2">+{axis.contribution.toFixed(1)} pts to the score</span>
                  </p>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-700/45 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-300 uppercase tracking-[0.12em] font-bold">{selectedAxis.label}</p>
                  <p className="text-sm text-slate-200 mt-1 leading-snug">{selectedAxisDetail.explanation}</p>
                </div>
                <p className="text-3xl font-black text-white shrink-0">{Math.round(selectedAxisMetric.value)}</p>
              </div>

              <button
                type="button"
                onClick={() => setShowComputation((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white"
              >
                {showComputation ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showComputation ? 'Hide computation' : 'Show computation'}
              </button>

              {showComputation && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-slate-400">{selectedAxisDetail.formula}</p>
                  {selectedAxisDetail.waterfall.map((step, index) => {
                    const stepKey = step.label.toLowerCase();
                    const curveLinkedId = selectedAxis.id === 'curve' ? curveComponentByStepLabel[stepKey] : undefined;
                    const linkedComponent =
                      selectedAxis.id === 'curve' && curveLinkedId != null
                        ? curveComponents.find((component) => component.id === curveLinkedId) || null
                        : selectedAxis.id === 'synergy' && synergyComponentByStepLabel[stepKey] != null
                          ? synergyComponent
                          : null;
                    const isExpandable = linkedComponent != null;
                    const isExpanded = linkedComponent != null && expandedCurveComponentId === linkedComponent.id;
                    const tooltipText = step.tooltip || linkedComponent?.tooltip || 'Computed step in this axis formula.';

                    return (
                      <div key={`${step.label}-${index}`} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isExpandable || !linkedComponent) return;
                            setExpandedCurveComponentId((prev) => (prev === linkedComponent.id ? null : linkedComponent.id));
                          }}
                          className={`w-full grid items-center gap-2 rounded-lg border border-slate-800/55 bg-slate-950/45 px-2 py-1.5 ${
                            isExpandable ? 'cursor-pointer hover:bg-slate-900/70 transition-colors' : 'cursor-default'
                          }`}
                          style={{ gridTemplateColumns: isExpandable ? '18px 1fr auto 14px' : '18px 1fr auto' }}
                        >
                          <span className="text-[11px] text-slate-400 font-semibold">{index + 1}</span>
                          <div className="min-w-0 flex items-center gap-1.5">
                            <p className="text-xs text-slate-200 truncate">{step.label}</p>
                            <HelpDot>{tooltipText}</HelpDot>
                          </div>
                          <span
                            className={`text-xs font-black ${
                              step.kind === 'delta'
                                ? step.value >= 0 ? 'text-emerald-300' : 'text-rose-300'
                                : 'text-slate-100'
                            }`}
                          >
                            {step.kind === 'delta' ? signed(step.value) : toFixed2NoRound(step.value)}
                          </span>
                          {isExpandable && (
                            isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
                          )}
                        </button>
                        {isExpanded && linkedComponent && (
                          <div className="ml-6 rounded-lg border border-slate-800/60 bg-slate-900/55 px-3 py-2">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-slate-400">Raw</p>
                                <p className="font-semibold text-slate-100">{signed(linkedComponent.raw)}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Scale</p>
                                <p className="font-semibold text-slate-100">x{toFixed2NoRound(linkedComponent.scale)}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Delta</p>
                                <p className={`font-black ${linkedComponent.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                  {signed(linkedComponent.delta)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-400 pt-1">
                    Score {baseScore.toFixed(2)} = sum of the 4 weighted axes.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Courbe + composition / manabase ──────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
              <SectionHeader
                icon={<BarChart3 size={14} className="text-indigo-300" />}
                title="Spell Curve"
                trailing={
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 rounded-full border border-slate-800/30">
                    <Clock size={12} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200 whitespace-nowrap">
                      Avg: <span className="text-white">{selectedBuild.stats.avgCmc.toFixed(2)}</span>
                    </span>
                  </div>
                }
              />

              <div className="flex items-end justify-between h-32 gap-2 px-4 border-b border-slate-800 pb-1">
                {curveRows.map((row) => {
                  const height = Math.max((row.count / maxCurveValue) * 100, 2);
                  const targetPct = row.target != null ? (row.target / maxCurveValue) * 100 : null;
                  return (
                    <div key={row.cmc} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div className="relative w-full h-full flex items-end">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${height}%` }}
                          className="w-full rounded-t-md relative border-x border-t shadow-lg bg-gradient-to-t from-indigo-600 to-cyan-400 border-indigo-400/10"
                        >
                          <div className="absolute -top-5 left-0 right-0 text-center text-xs font-bold text-white">
                            {row.count > 0 ? row.count : ''}
                          </div>
                        </motion.div>
                        {targetPct != null && targetPct > 0 && (
                          <div
                            className="absolute left-0 right-0 border-t-2 border-dashed border-amber-300/80 pointer-events-none"
                            style={{ bottom: `${targetPct}%` }}
                            title={`Trophy decks average: ${row.target}`}
                          />
                        )}
                      </div>
                      <span className="text-xs font-black text-slate-400">{row.cmc}</span>
                    </div>
                  );
                })}
              </div>
              {hasTargetCurve && (
                <p className="mt-3 text-xs text-slate-400 flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dashed border-amber-300/80" />
                  Average curve of trophy decks in this archetype
                </p>
              )}
            </div>

            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
              <SectionHeader
                icon={<Users size={14} className="text-emerald-300" />}
                title="Composition & Mana Base"
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-emerald-400 tracking-tighter">{creatureRatio}</span>
                    <span className="text-xl text-slate-500 font-bold">/</span>
                    <span className="text-3xl font-black text-indigo-400 tracking-tighter">{spellRatio}</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 mt-1">% creatures / spells</span>
                </div>

                <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <span className="text-3xl font-black text-white tracking-tighter">{landCount}</span>
                  <span className="text-[11px] font-bold text-slate-400 mt-1">lands</span>
                </div>

                <div className="flex flex-col items-center justify-center p-2 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <div className="flex items-center justify-center gap-2">
                    {COLOR_ORDER.filter((color) => colorDistribution[color] > 0).map((color) => (
                      <div key={color} className="relative">
                        <img
                          src={`https://svgs.scryfall.io/card-symbols/${color}.svg`}
                          alt={color}
                          className="w-7 h-7 drop-shadow-lg"
                        />
                        <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-[11px] font-black px-1 rounded-full border border-slate-700 min-w-[16px] text-center">
                          {colorDistribution[color]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 mt-2">cards by color</span>
                </div>
              </div>

              {manaPlan.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets size={14} className="text-cyan-300" />
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-200">Mana sources per color</p>
                    <HelpDot>
                      <p>
                        Sources = lands producing the color, plus mana creatures (counted partially, the
                        more expensive the less).
                      </p>
                      <p className="text-slate-300">
                        Needed = what this deck's spells require to be cast on time (Frank Karsten's tables for
                        40-card decks).
                      </p>
                    </HelpDot>
                  </div>
                  <div className="space-y-2">
                    {manaPlan.map((m) => {
                      const ok = m.sources + 0.5 >= m.required;
                      const max = Math.max(m.required, m.sources, 1);
                      return (
                        <div key={m.color} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
                          <img src={`https://svgs.scryfall.io/card-symbols/${m.color}.svg`} alt={m.color} className="w-6 h-6" />
                          <div className="relative h-2.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full ${ok ? 'bg-emerald-500/80' : 'bg-amber-500/80'}`}
                              style={{ width: `${clamp((m.sources / max) * 100)}%` }}
                            />
                            <div
                              className="absolute top-0 bottom-0 border-l-2 border-white/70"
                              style={{ left: `${clamp((m.required / max) * 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold whitespace-nowrap ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {m.sources} / {Math.ceil(m.required)} needed{m.isSplash ? ' · splash' : ''} {ok ? '✓' : '⚠'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-wrap justify-center md:justify-end gap-2">
          <button
            onClick={onNewPool}
            className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:text-white hover:border-slate-400 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Load New Pool
          </button>
          <button
            onClick={onTestCustomDeck}
            className="px-4 py-2 rounded-xl border border-indigo-500/50 text-indigo-100 hover:text-white hover:border-indigo-400 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Test Custom Deck
          </button>
          <button
            onClick={onOpenArchetype}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
          >
            <Target size={12} />
            Open Archetype
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
