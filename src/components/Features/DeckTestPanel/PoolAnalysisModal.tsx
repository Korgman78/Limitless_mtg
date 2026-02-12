import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock, Copy, Layers, Sparkles, Target, Users, X, Zap } from 'lucide-react';
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
  const baseScore = b.qualityScore;
  const structureAdjustment = b.totalAdjustment;

  const axisRows = [
    {
      label: 'Power',
      value: b.wrNormalized,
      raw: `${b.wrScore.toFixed(2)} WR`,
      weight: result.weightsApplied.power,
      color: 'from-emerald-500 to-teal-400',
    },
    {
      label: 'Synergy',
      value: b.synergyNormalized,
      raw: b.synergyScore.toFixed(3),
      weight: result.weightsApplied.synergy,
      color: 'from-fuchsia-500 to-violet-400',
    },
    {
      label: 'Consistency',
      value: b.consistencyScore,
      raw: `mana penalty ${b.manaPenalty.toFixed(3)}`,
      weight: result.weightsApplied.consistency,
      color: 'from-cyan-500 to-sky-400',
    },
    {
      label: 'Curve',
      value: b.curveScore,
      raw: `curve penalty ${b.curvePenalty.toFixed(3)}`,
      weight: result.weightsApplied.curve,
      color: 'from-amber-500 to-orange-400',
    },
  ];

  const adjustments = [
    { label: 'Skeleton Fit', value: b.skeletonAdjustment },
    { label: 'Creature Profile', value: b.creatureAdjustment },
    { label: 'Removal Profile', value: b.removalAdjustment },
    { label: 'Dependency Safety', value: b.dependencyAdjustment },
  ];

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
                      Formula: Base Axes + Structure Adjustments.
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
                {selectedBuild.score.toFixed(2)}
              </span>
              
            </div>
            <p className="mt-2 text-[11px] text-slate-300">
              Final = Base Axes {baseScore.toFixed(2)} + Structure{' '}
              {structureAdjustment >= 0 ? '+' : ''}
              {structureAdjustment.toFixed(2)}
            </p>
          </div>

          {/* â”€â”€ Composite Axes + Structure Adjustments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5 space-y-3">
              <SectionHeader
                icon={<Sparkles size={13} className="text-indigo-300" />}
                title="Composite Axes"
              />
              {axisRows.map((axis) => (
                <div key={axis.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-slate-200 font-semibold">
                        {axis.label}
                      </p>
                      <Tooltip
                        content={
                          <div className="max-w-[230px] space-y-1">
                            <p className="text-[10px] text-slate-200 font-semibold">
                              {axis.label}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {axis.label === 'Power' &&
                                `Normalized card quality from contextual WR in this build. Weight: ${axis.weight}x in final composite.`}
                              {axis.label === 'Synergy' &&
                                `Internal pair synergy quality of selected cards. Weight: ${axis.weight}x in final composite.`}
                              {axis.label === 'Consistency' &&
                                `Mana castability reliability (Karsten-style source adequacy). Weight: ${axis.weight}x in final composite.`}
                              {axis.label === 'Curve' &&
                                `How close the mana curve is to target shape. Weight: ${axis.weight}x in final composite.`}
                            </p>
                          </div>
                        }
                      >
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      w{axis.weight} | {axis.value.toFixed(1)}
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${axis.color}`}
                      style={{ width: `${clamp(axis.value)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">{axis.raw}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-5 space-y-3">
              <SectionHeader
                icon={<Target size={13} className="text-cyan-300" />}
                title="Structure Adjustments"
              />
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                    Total Structure
                  </p>
                  <Tooltip
                    content={
                      <div className="max-w-[230px] space-y-1">
                        <p className="text-[10px] text-slate-200 font-semibold">
                          Sum of structure-level adjustments.
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Includes skeleton fit, creature profile, removal profile, and dependency safety.
                        </p>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
                    >
                      ?
                    </button>
                  </Tooltip>
                </div>
                <p
                  className={`text-base font-black ${
                    structureAdjustment >= 0
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }`}
                >
                  {structureAdjustment >= 0 ? '+' : ''}
                  {structureAdjustment.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {adjustments.map((adj) => (
                  <div
                    key={adj.label}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        {adj.label}
                      </p>
                      <Tooltip
                        content={
                          <div className="max-w-[220px] text-[10px] text-slate-400">
                            {adj.label === 'Skeleton Fit' &&
                              'Adjustment from weighted Jaccard similarity vs archetype skeleton.'}
                            {adj.label === 'Creature Profile' &&
                              'Adjustment from creature count corridor + archetype target + creature distribution across CMC buckets (penalizes spell-heavy early buckets, especially CMC 2/3).'}
                            {adj.label === 'Removal Profile' &&
                              'Adjustment from removal threshold (>=4 recommended).'}
                            {adj.label === 'Dependency Safety' &&
                              'Penalty when hard dependency thresholds are not fully supported.'}
                          </div>
                        }
                      >
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <p
                      className={`text-sm font-black ${
                        adj.value >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {adj.value >= 0 ? '+' : ''}
                      {adj.value.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* â”€â”€ Spell Curve + Composition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

