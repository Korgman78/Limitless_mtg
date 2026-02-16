import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Layers,
  Search,
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

type BuildCurveRow = {
  cmc: number;
  count: number;
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
  return [1, 2, 3, 4, 5, 6, 7].map((cmc) => ({ cmc, count: curve[cmc] || 0 }));
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

interface PoolAnalysisModalProps {
  poolAnalysis: PoolAnalysisCache | null;
  isLoading: boolean;
  loadingProgress?: PoolOptimizationProgress | null;
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

// â”€â”€â”€ Unified section header style â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}> = ({ icon, title, trailing }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-2">
      {icon}
      <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
        {title}
      </h4>
    </div>
    {trailing}
  </div>
);

export const PoolAnalysisModal: React.FC<PoolAnalysisModalProps> = ({
  poolAnalysis,
  isLoading,
  loadingProgress,
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
  const [expandedCurveComponentId, setExpandedCurveComponentId] = useState<string | null>(null);
  const result = poolAnalysis?.result;
  const metaByName = poolAnalysis?.metaByName || {};
  const computeTimeMs = poolAnalysis?.computeTimeMs ?? null;
  const selectedBuild =
    selectedTab === 'user' && userDeckBuild
      ? userDeckBuild
      : result?.builds[selectedBuildIndex] || result?.builds[0] || null;

  const curveRows = useMemo(
    () => (selectedBuild ? buildSpellCurve(selectedBuild, metaByName) : []),
    [selectedBuild, metaByName],
  );
  const maxCurveValue = useMemo(
    () => Math.max(...curveRows.map((row) => row.count), 1),
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
      ? 'Initializing optimizer'
      : progressDone >= progressTotal
        ? 'Finalizing recommendations'
        : progressRunning > 0
          ? 'Exploring deck variants'
          : progressQueued > 0
            ? 'Waiting for shard workers'
            : 'Preparing shard queue';
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

    const shardProfiles = [
      { key: 'skeleton', title: 'Skeleton guided', subtitle: 'Archetype trophy baseline' },
      { key: 'power_mana_safe', title: 'Power mana-safe', subtitle: 'WR focused, stable castability' },
      { key: 'power_greedy_splash', title: 'Greedy splash bombs', subtitle: 'Higher risk, higher ceiling' },
      { key: 'curve_creatures', title: 'Curve creatures', subtitle: 'Tempo + board presence plan' },
      { key: 'synergy_if_online', title: 'Synergy online', subtitle: 'Enable payoff thresholds' },
    ];
    const shardCards = Array.from({ length: hasShardProgress ? progressTotal : shardProfiles.length }).map((_, i) => {
      const profile = shardProfiles[i] ?? {
        key: `shard_${i + 1}`,
        title: `Shard ${i + 1}`,
        subtitle: 'Exploration worker',
      };
      return {
        ...profile,
        index: i,
        status: (shardStates[i] ?? 'queued') as ShardState,
      };
    });

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
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold">
                Pool Optimization Dashboard
              </p>
              <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
                Analyzing Pool
              </h3>
              <p className="text-xs mt-1 text-slate-300">
                Running sealed optimizer and evaluating top 3 builds...
              </p>
              <p className="text-[11px] mt-2 text-indigo-200 font-semibold">
                {phaseLabel}
              </p>
              {progressTotal > 0 && (
                <p className="text-[11px] mt-1 text-slate-400">
                  Shards: {progressDone}/{progressTotal} done
                  {' | '}running {progressRunning}
                  {' | '}queued {progressQueued}
                  {progressFailed > 0 ? ` | failed ${progressFailed}` : ''}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
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
                <p className="text-[11px] text-slate-400 mt-1">overall progress</p>
              </div>
            </div>

            <div className="space-y-3">
              {hasShardProgress && shardStates.length > 0 && (
                <div
                  className="grid gap-1.5 rounded-xl border border-slate-800 bg-slate-950/45 p-2.5 w-full"
                  style={{ gridTemplateColumns: `repeat(${Math.max(1, progressTotal)}, minmax(0, 1fr))` }}
                >
                  {shardStates.map((state, index) => (
                    <motion.div
                      key={`${state}-${index}`}
                      title={`Shard ${index + 1}: ${state}`}
                      className={`h-3.5 rounded-md ${
                        state === 'done'
                          ? 'bg-emerald-400'
                          : state === 'running'
                            ? 'bg-cyan-400'
                            : state === 'failed'
                              ? 'bg-rose-400'
                              : 'bg-slate-600'
                      }`}
                      animate={state === 'running' ? { opacity: [0.45, 1, 0.45] } : undefined}
                      transition={state === 'running' ? { repeat: Infinity, duration: 1 } : undefined}
                    />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {shardCards.map((item, index) => (
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
                      <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">
                        Shard {item.index + 1}
                      </p>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          item.status === 'done'
                            ? 'text-emerald-200 bg-emerald-500/25'
                            : item.status === 'running'
                              ? 'text-cyan-200 bg-cyan-500/25'
                              : item.status === 'failed'
                                ? 'text-rose-200 bg-rose-500/25'
                                : 'text-slate-300 bg-slate-700/45'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-white leading-tight">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                      {item.subtitle}
                    </p>
                  </motion.div>
                ))}
              </div>
              {waitingForWorkers && (
                <p className="text-[11px] text-amber-300/90">
                  Waiting for available workers. Processing resumes automatically.
                </p>
              )}
            </div>
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

  const b = selectedBuild.scoreBreakdown;
  const synergyBaseNormalized = Number.isFinite(b.synergyBaseNormalized)
    ? b.synergyBaseNormalized
    : b.synergyNormalized - b.dependencyAdjustment;
  const curveBaseScore = Number.isFinite(b.curveBaseScore)
    ? b.curveBaseScore
    : b.curveScore - b.removalAdjustment;
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
      tooltip: 'Penalizes distance from trophy skeleton curve for this archetype.',
      raw: curveSkeletonPenalty,
      scale: curveSkeletonScale,
      delta: curveSkeletonDelta,
    },
    {
      id: 'early-creature',
      label: 'Early Creature',
      tooltip: 'Penalizes missing creature presence in CMC 2-3 buckets.',
      raw: curveEarlyCreaturePenalty,
      scale: curveEarlyCreatureScale,
      delta: curveEarlyCreatureDelta,
    },
    {
      id: 'creature-corridor',
      label: 'Creature Corridor',
      tooltip: 'Penalizes total creature count outside the configured corridor.',
      raw: curveCreatureCorridorPenalty,
      scale: curveCreatureCorridorScale,
      delta: curveCreatureCorridorDelta,
    },
    {
      id: 'removal',
      label: 'Removal',
      tooltip: 'Removal profile adjustment: >=4 removals no penalty, 3 => -3, <=2 => -6.',
      raw: b.removalAdjustment,
      scale: removalAxisScale,
      delta: removalAxisDelta,
    },
  ] as const;

  const axisRows = [
    {
      id: 'power' as AxisKey,
      label: 'Power',
      value: b.wrNormalized,
      weight: result.weightsApplied.power,
      color: 'from-emerald-500 to-teal-400',
    },
    {
      id: 'synergy' as AxisKey,
      label: 'Synergy',
      value: b.synergyNormalized,
      weight: result.weightsApplied.synergy,
      color: 'from-fuchsia-500 to-violet-400',
    },
    {
      id: 'consistency' as AxisKey,
      label: 'Consistency',
      value: b.consistencyScore,
      weight: result.weightsApplied.consistency,
      color: 'from-cyan-500 to-sky-400',
    },
    {
      id: 'curve' as AxisKey,
      label: 'Curve & Structure',
      value: b.curveScore,
      weight: result.weightsApplied.curve,
      color: 'from-amber-500 to-orange-400',
    },
  ];

  const selectedAxis = axisRows.find((row) => row.id === activeAxis) || axisRows[0];
  const axisTheme: Record<
    AxisKey,
    {
      tabActive: string;
      tabInactive: string;
      tabInactiveText: string;
      cardActive: string;
      cardInactive: string;
      chip: string;
    }
  > = {
    power: {
      tabActive: 'border-emerald-400/55 bg-emerald-500/12 text-emerald-100',
      tabInactive: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100/90 hover:border-emerald-400/45 hover:bg-emerald-500/[0.10]',
      tabInactiveText: 'text-emerald-200/80',
      cardActive: 'border-emerald-400/65 bg-emerald-500/12 shadow-[0_0_0_1px_rgba(52,211,153,0.25),0_0_35px_rgba(16,185,129,0.15)]',
      cardInactive: 'border-emerald-500/25 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.08] hover:border-emerald-400/40',
      chip: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
    },
    synergy: {
      tabActive: 'border-fuchsia-400/55 bg-fuchsia-500/12 text-fuchsia-100',
      tabInactive: 'border-fuchsia-500/30 bg-fuchsia-500/[0.06] text-fuchsia-100/90 hover:border-fuchsia-400/45 hover:bg-fuchsia-500/[0.10]',
      tabInactiveText: 'text-fuchsia-200/80',
      cardActive: 'border-fuchsia-400/65 bg-fuchsia-500/12 shadow-[0_0_0_1px_rgba(244,114,182,0.25),0_0_35px_rgba(217,70,239,0.15)]',
      cardInactive: 'border-fuchsia-500/25 bg-fuchsia-500/[0.05] hover:bg-fuchsia-500/[0.08] hover:border-fuchsia-400/40',
      chip: 'bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/30',
    },
    consistency: {
      tabActive: 'border-cyan-400/55 bg-cyan-500/12 text-cyan-100',
      tabInactive: 'border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-100/90 hover:border-cyan-400/45 hover:bg-cyan-500/[0.10]',
      tabInactiveText: 'text-cyan-200/80',
      cardActive: 'border-cyan-400/65 bg-cyan-500/12 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_35px_rgba(14,165,233,0.15)]',
      cardInactive: 'border-cyan-500/25 bg-cyan-500/[0.05] hover:bg-cyan-500/[0.08] hover:border-cyan-400/40',
      chip: 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30',
    },
    curve: {
      tabActive: 'border-amber-400/55 bg-amber-500/12 text-amber-100',
      tabInactive: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100/90 hover:border-amber-400/45 hover:bg-amber-500/[0.10]',
      tabInactiveText: 'text-amber-200/80',
      cardActive: 'border-amber-400/65 bg-amber-500/12 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_35px_rgba(249,115,22,0.15)]',
      cardInactive: 'border-amber-500/25 bg-amber-500/[0.05] hover:bg-amber-500/[0.08] hover:border-amber-400/40',
      chip: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    },
  };
  const selectedAxisContributionByKey: Record<AxisKey, number> = {
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
  const axisRowsWithContribution = axisRows.map((axis) => {
    const contribution = selectedAxisContributionByKey[axis.id];
    return {
      ...axis,
      contribution,
      weightSharePct: (axis.weight / Math.max(1e-6, totalWeight)) * 100,
      contributionSharePct: (Math.max(0, contribution) / Math.max(1e-6, baseScore)) * 100,
    };
  });
  const selectedAxisMetric =
    axisRowsWithContribution.find((row) => row.id === selectedAxis.id) || axisRowsWithContribution[0];
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
    tooltip: 'Dependency safety adjustment translated into synergy axis points.',
  } as const;
  const synergyComponentByStepLabel: Record<string, string> = {
    'dependency delta': 'dependency',
  };
  const consistencyRawDelta = -(b.manaPenalty * 450);
  const consistencyClampDelta = b.consistencyScore - (100 + consistencyRawDelta);
  const axisDetails: Record<
    AxisKey,
    {
      title: string;
      subtitle: string;
      formula: string;
      waterfall: Array<{
        label: string;
        value: number;
        kind: 'base' | 'delta' | 'final';
        tooltip?: string;
      }>;
      rows: Array<{ label: string; value: string; tone?: 'neutral' | 'good' | 'bad' }>;
    }
  > = {
    power: {
      title: 'Power Axis',
      subtitle: 'Card quality from contextual WR.',
      formula: 'Axis score = WR normalized',
      waterfall: [
        {
          label: 'Axis score',
          value: b.wrNormalized,
          kind: 'final',
          tooltip: 'Normalized contextual WR for the selected build.',
        },
      ],
      rows: [
        { label: 'Raw WR', value: `${toFixed2NoRound(b.wrScore)}%` },
        { label: 'Normalized axis', value: toFixed2NoRound(b.wrNormalized) },
      ],
    },
    synergy: {
      title: 'Synergy Axis',
      subtitle: 'Base synergy + dependency safety adjustment.',
      formula: 'Synergy axis = Synergy base + (Dependency raw x Dependency scale)',
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
        {
          label: 'Final axis',
          value: b.synergyNormalized,
          kind: 'final',
        },
      ],
      rows: [
        { label: 'Base synergy axis', value: toFixed2NoRound(synergyBaseNormalized) },
        { label: 'Dependency scale', value: `x${toFixed2NoRound(dependencyAxisScale)}` },
        {
          label: 'Dependency adjustment (raw)',
          value: signed(b.dependencyAdjustment),
          tone: b.dependencyAdjustment >= 0 ? 'good' : 'bad',
        },
        {
          label: 'Dependency axis delta',
          value: signed(dependencyAxisDelta),
          tone: dependencyAxisDelta >= 0 ? 'good' : 'bad',
        },
        { label: 'Final synergy axis', value: toFixed2NoRound(b.synergyNormalized) },
      ],
    },
    consistency: {
      title: 'Consistency Axis',
      subtitle: 'Mana castability reliability.',
      formula: 'Consistency axis = 100 - (Mana penalty x 450), clamped to [0, 100]',
      waterfall: [
        {
          label: 'Start',
          value: 100,
          kind: 'base',
          tooltip: 'Consistency starts at 100 and decreases with mana strain.',
        },
        {
          label: 'Mana penalty delta',
          value: consistencyRawDelta,
          kind: 'delta',
          tooltip: 'Computed from castability pressure across card requirements.',
        },
        {
          label: 'Clamp delta',
          value: consistencyClampDelta,
          kind: 'delta',
          tooltip: 'Clamp correction to keep axis in [0, 100].',
        },
        { label: 'Final axis', value: b.consistencyScore, kind: 'final' },
      ],
      rows: [
        { label: 'Mana penalty', value: b.manaPenalty.toFixed(4) },
        { label: 'Consistency axis', value: toFixed2NoRound(b.consistencyScore) },
      ],
    },
    curve: {
      title: 'Curve & Structure Axis',
      subtitle: 'Starts at 100, then each component applies its own scaled delta.',
      formula: 'Curve axis = 100 + sum(curve deltas) + removal delta',
      waterfall: [
        { label: 'Start', value: 100, kind: 'base' },
        { label: 'Top heavy delta', value: curveTopHeavyDelta, kind: 'delta' },
        { label: 'Skeleton delta', value: curveSkeletonDelta, kind: 'delta' },
        { label: 'Early creature delta', value: curveEarlyCreatureDelta, kind: 'delta' },
        { label: 'Creature corridor delta', value: curveCreatureCorridorDelta, kind: 'delta' },
        { label: 'Removal delta', value: removalAxisDelta, kind: 'delta' },
        { label: 'Final axis', value: b.curveScore, kind: 'final' },
      ],
      rows: [],
    },
  };
  const selectedAxisDetail = axisDetails[selectedAxis.id];

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
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold">
              Pool Optimization Dashboard
            </p>
            <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
              <span>{selectedTab === 'user' ? 'User Deck:' : 'Best Build:'}</span>
              <ManaIcons colors={selectedBuild.mainColors.join('')} size="sm" />
              <span className="text-indigo-300">{selectedBuild.archetype}</span>
            </h3>
            <p className="text-xs mt-1 text-slate-300">
              {result.format} | {result.poolSize} cards in pool
              {computeTimeMs != null && (
                <span className="text-slate-500"> | {computeTimeMs}ms</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.builds.map((build, index) => (
                <button
                  key={`${build.archetype}-${index}`}
                  onClick={() => onSelectBuild(index)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    selectedTab === 'build' && index === selectedBuildIndex
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/70 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
                  }`}
                >
                  {index === 0 ? 'Best Build' : `Alternative ${index}`}
                </button>
              ))}
              {userDeckBuild && (
                <button
                  onClick={onSelectUserDeck}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    selectedTab === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/70 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
                  }`}
                >
                  User Deck
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          {/* â”€â”€ Recommended Deck List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div>
            <SectionHeader
              icon={<Layers size={13} className="text-indigo-300" />}
              title="Recommended Deck List"
              trailing={(
                <button
                  onClick={copyDeckList}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 text-indigo-200 text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  <Copy size={11} />
                  {didCopy ? 'Copied' : 'Copy Decklist'}
                </button>
              )}
            />
            <p className="text-[10px] text-slate-500 mb-3">
              {selectedBuild.stats.totalCards} cards
              {selectedBuild.splashColor ? ` | splash ${selectedBuild.splashColor}` : ''}
            </p>
            <div className="-mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">
              <div className="flex flex-nowrap items-start gap-0 md:gap-1 min-w-[700px] [&>div]:flex-1 [&>div]:min-w-0 [&>div]:w-auto">
                {cmcRange.map((cmc) => (
                  <CmcStack
                    key={cmc}
                    cmc={cmc}
                    cards={cmcStacks[cmc] || []}
                    onCardSelect={(card) => onZoomCard(card.name)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* â”€â”€ Global Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="rounded-3xl border border-indigo-500/25 bg-indigo-500/10 p-4 md:p-5">
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-indigo-300" />
              <p className="text-[11px] md:text-xs font-extrabold text-indigo-300 uppercase tracking-[0.14em]">
                Global Score
              </p>
              <Tooltip
                content={
                  <div className="max-w-[230px] space-y-1">
                    <p className="text-[10px] text-slate-200 font-semibold">
                      Final score used to rank builds.
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Formula: weighted composite of Power, Synergy, Consistency, and Curve & Structure.
                    </p>
                  </div>
                }
              >
                <button
                  type="button"
                  className="w-4 h-4 rounded-full border border-indigo-400/40 text-[10px] font-bold text-indigo-300/90 hover:text-white hover:border-indigo-300 transition-colors flex items-center justify-center"
                >
                  ?
                </button>
              </Tooltip>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl md:text-5xl font-black text-white">
                {toFixed2NoRound(selectedBuild.score)}
              </span>
              
            </div>
            <p className="mt-2 text-[11px] text-slate-300">
              Final = Weighted Axes Composite ({toFixed2NoRound(baseScore)}).
            </p>
          </div>

          {/* Composite Axes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="self-start rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5 space-y-4 relative overflow-hidden">
              <div className="absolute -top-16 -left-12 w-40 h-40 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -right-10 w-44 h-44 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
              <SectionHeader
                icon={<Sparkles size={13} className="text-indigo-300" />}
                title="Composite Axes"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative">
                {axisRowsWithContribution.map((axis) => (
                  <button
                    key={axis.id}
                    type="button"
                    onClick={() => setActiveAxis(axis.id)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      selectedAxis.id === axis.id
                        ? axisTheme[axis.id].cardActive
                        : axisTheme[axis.id].cardInactive
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-200">
                        {axis.label}
                      </p>
                      <div className="text-right">
                        <p className="text-lg font-black text-white leading-none">
                          {toFixed2NoRound(axis.value)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {toFixed2NoRound(axis.contributionSharePct)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${axisTheme[axis.id].chip}`}>
                        Weight {toFixed2NoRound(axis.weight)}x
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-900/70 border border-slate-700 text-slate-200">
                        Contrib {toFixed2NoRound(axis.contribution)} ({toFixed2NoRound(axis.contributionSharePct)}%)
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 rounded-full bg-slate-800/90 overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${axis.color}`}
                        style={{ width: `${clamp(axis.value)}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>

            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5 space-y-3">
              <SectionHeader
                icon={<Search size={13} className="text-cyan-300" />}
                title="Composite Axis Analysis"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {axisRowsWithContribution.map((axis) => (
                  <button
                    key={axis.id}
                    type="button"
                    onClick={() => setActiveAxis(axis.id)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-colors ${
                      selectedAxis.id === axis.id
                        ? axisTheme[axis.id].tabActive
                        : axisTheme[axis.id].tabInactive
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide">{axis.label}</p>
                    <p className={`text-[11px] mt-0.5 ${selectedAxis.id === axis.id ? 'text-slate-200' : axisTheme[axis.id].tabInactiveText}`}>
                      {toFixed2NoRound(axis.value)}
                    </p>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-700/45 bg-slate-900/60 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-[0.12em] font-bold">
                      {selectedAxisDetail.title}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {selectedAxisDetail.subtitle}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {selectedAxisDetail.formula}
                    </p>
                  </div>
                  <p className="text-3xl font-black text-white">
                    {toFixed2NoRound(selectedAxisMetric.value)}
                    <span className="ml-2 text-sm font-semibold text-slate-300">
                      ({toFixed2NoRound(selectedAxisMetric.contributionSharePct)}%)
                    </span>
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-700/45 bg-slate-900/60 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Axis Weight</p>
                    <p className="text-sm font-black text-slate-100">
                      {toFixed2NoRound(selectedAxisMetric.weight)}x
                      <span className="text-[11px] text-slate-400 ml-1">
                        ({toFixed2NoRound(selectedAxisMetric.weightSharePct)}%)
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-700/45 bg-slate-900/60 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Weighted Contribution</p>
                    <p className="text-sm font-black text-slate-100">
                      {toFixed2NoRound(selectedAxisMetric.contribution)}
                      <span className="text-[11px] text-slate-400 ml-1">
                        ({toFixed2NoRound(selectedAxisMetric.contributionSharePct)}%)
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/55 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-bold">Computation Steps</p>
                <div className="mt-2 space-y-1.5">
                  {selectedAxisDetail.waterfall.map((step, index) => {
                    const stepKey = step.label.toLowerCase();
                    const curveLinkedId =
                      selectedAxis.id === 'curve'
                        ? curveComponentByStepLabel[stepKey]
                        : undefined;
                    const linkedComponent =
                      selectedAxis.id === 'curve' && curveLinkedId != null
                        ? curveComponents.find((component) => component.id === curveLinkedId) || null
                        : selectedAxis.id === 'synergy' && synergyComponentByStepLabel[stepKey] != null
                          ? synergyComponent
                          : null;
                    const isExpandable = linkedComponent != null;
                    const isExpanded =
                      linkedComponent != null && expandedCurveComponentId === linkedComponent.id;
                    const tooltipText =
                      step.tooltip ||
                      linkedComponent?.tooltip ||
                      'Computed step in this axis formula.';

                    return (
                      <div key={`${step.label}-${index}`} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isExpandable || !linkedComponent) return;
                            setExpandedCurveComponentId((prev) =>
                              prev === linkedComponent.id ? null : linkedComponent.id,
                            );
                          }}
                          className={`w-full grid items-center gap-2 rounded-lg border border-slate-800/55 bg-slate-950/45 px-2 py-1.5 ${
                            isExpandable ? 'cursor-pointer hover:bg-slate-900/70 transition-colors' : 'cursor-default'
                          }`}
                          style={{
                            gridTemplateColumns: isExpandable ? '18px 1fr auto 14px' : '18px 1fr auto',
                          }}
                        >
                          <span className="text-[10px] text-slate-500 font-semibold">{index + 1}</span>
                          <div className="min-w-0 flex items-center gap-1.5">
                            <p className="text-[11px] text-slate-200 truncate">{step.label}</p>
                            <Tooltip
                              content={(
                                <div className="max-w-[220px] text-[10px] text-slate-300">
                                  {tooltipText}
                                </div>
                              )}
                            >
                              <span className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center">
                                ?
                              </span>
                            </Tooltip>
                          </div>
                          <span
                            className={`text-[11px] font-black ${
                              step.kind === 'delta'
                                ? step.value >= 0
                                  ? 'text-emerald-300'
                                  : 'text-rose-300'
                                : 'text-slate-100'
                            }`}
                          >
                            {step.kind === 'delta' ? signed(step.value) : toFixed2NoRound(step.value)}
                          </span>
                          {isExpandable && (
                            isExpanded ? (
                              <ChevronDown size={14} className="text-slate-400" />
                            ) : (
                              <ChevronRight size={14} className="text-slate-500" />
                            )
                          )}
                        </button>
                        {isExpanded && linkedComponent && (
                          <div className="ml-6 rounded-lg border border-slate-800/60 bg-slate-900/55 px-3 py-2">
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              <div>
                                <p className="text-slate-500">Raw</p>
                                <p className="font-semibold text-slate-100">{signed(linkedComponent.raw)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Scale</p>
                                <p className="font-semibold text-slate-100">x{toFixed2NoRound(linkedComponent.scale)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Delta</p>
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
                </div>
              </div>
              {selectedAxis.id !== 'synergy' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedAxisDetail.rows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl border border-slate-800/60 bg-slate-900/60 px-3 py-2"
                    >
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {row.label}
                      </p>
                      <p
                        className={`text-sm font-black ${
                          row.tone === 'good'
                            ? 'text-emerald-300'
                            : row.tone === 'bad'
                              ? 'text-rose-300'
                              : 'text-slate-100'
                        }`}
                      >
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Spell Curve + Composition */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
              <SectionHeader
                icon={<BarChart3 size={13} className="text-indigo-300" />}
                title="Spell Curve"
                trailing={
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 rounded-full border border-slate-800/30">
                    <Clock size={12} className="text-indigo-400" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                      AVG: <span className="text-white">{selectedBuild.stats.avgCmc.toFixed(2)}</span>
                    </span>
                  </div>
                }
              />

              <div className="flex items-end justify-between h-28 gap-2 px-4 border-b border-slate-800 pb-1">
                {curveRows.map((row) => {
                  const height = Math.max((row.count / maxCurveValue) * 100, 2);
                  return (
                    <div
                      key={row.cmc}
                      className="flex-1 flex flex-col items-center gap-2 group h-full justify-end"
                    >
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        className="w-full rounded-t-md relative border-x border-t shadow-lg transition-colors bg-gradient-to-t from-indigo-600 to-cyan-400 border-indigo-400/10"
                      >
                        <div className="absolute -top-6 left-0 right-0 text-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-all uppercase">
                          {row.count}
                        </div>
                      </motion.div>
                      <span className="text-[10px] font-black text-slate-500 uppercase">
                        {row.cmc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
              <SectionHeader
                icon={<Users size={13} className="text-emerald-300" />}
                title="Composition & Mana Base"
              />
              <div className="grid grid-cols-3 gap-2 h-[100px]">
                <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl lg:text-4xl font-black text-emerald-400 tracking-tighter">{creatureRatio}</span>
                    <span className="text-xl text-slate-600 font-bold">/</span>
                    <span className="text-3xl lg:text-4xl font-black text-indigo-400 tracking-tighter">{spellRatio}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] font-bold text-emerald-500/60 uppercase">Crea</span>
                    <span className="text-[8px] font-bold text-indigo-500/60 uppercase">Spells</span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <span className="text-3xl lg:text-4xl font-black text-white tracking-tighter">{landCount}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">LANDS</span>
                </div>

                <div className="flex flex-col items-center justify-center p-2 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                  <div className="flex items-center justify-center gap-2">
                    {COLOR_ORDER.filter((color) => colorDistribution[color] > 0).map(
                      (color) => (
                        <div key={color} className="flex flex-col items-center">
                          <div className="relative">
                            <img
                              src={`https://svgs.scryfall.io/card-symbols/${color}.svg`}
                              alt={color}
                              className="w-7 h-7 lg:w-8 lg:h-8 drop-shadow-lg"
                            />
                            <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-[9px] font-black px-1 rounded-full border border-slate-700 min-w-[16px] text-center">
                              {colorDistribution[color]}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                  <span className="text-[8px] font-bold text-slate-600 uppercase mt-2">Cards by Color</span>
                </div>
              </div>

            </div>
          </div>

        </div>

        <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-wrap justify-center md:justify-end gap-2">
          <button
            onClick={onNewPool}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Load New Pool
          </button>
          <button
            onClick={onTestCustomDeck}
            className="px-4 py-2 rounded-xl border border-indigo-500/50 text-indigo-200 hover:text-white hover:border-indigo-400 text-xs font-bold uppercase tracking-wider transition-colors"
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


