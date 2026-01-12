import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronRight,
  Gem, CircleDot, BarChart3, Trophy, Skull, Sparkles, Zap
} from 'lucide-react';
import type { Card } from '../../types';
import { normalizeRarity, extractColors } from '../../utils/helpers';
import { Tooltip } from '../Common/Tooltip';
import { PrinceOMeter } from './PrinceOMeter';

interface FormatBlueprintProps {
  cards: Card[];
  globalMeanWR: number;
  onCardSelect?: (card: Card) => void;
}

interface CardStat {
  card: Card;
  name: string;
  wr: number;
  delta: number;
}

interface StatRow {
  key: string;
  label: string;
  icon: React.ReactNode;
  wr: number;
  delta: number;
  variance: number;
  color: string;
  bgColor: string;
  top10: CardStat[];
  bottom10: CardStat[];
}

// Calculate standard deviation
const calcVariance = (values: number[], mean: number): number => {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
};

// Delta color styling
const getDeltaColor = (delta: number): string => {
  if (delta >= 3) return 'text-emerald-400';
  if (delta >= 1) return 'text-emerald-300/80';
  if (delta <= -3) return 'text-red-400';
  if (delta <= -1) return 'text-red-300/80';
  return 'text-slate-400';
};

const getDeltaBg = (delta: number): string => {
  if (delta >= 3) return 'bg-emerald-500/20';
  if (delta >= 1) return 'bg-emerald-500/10';
  if (delta <= -3) return 'bg-red-500/20';
  if (delta <= -1) return 'bg-red-500/10';
  return 'bg-slate-500/10';
};

export const FormatBlueprint: React.FC<FormatBlueprintProps> = ({ cards, globalMeanWR, onCardSelect }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'rarity' | 'color'>('rarity');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [statsMode, setStatsMode] = useState<'all' | 'top10' | 'bottom10'>('all');

  const stats = useMemo(() => {
    const validCards = cards.filter(c => c.gih_wr !== null && c.gih_wr !== undefined);

    const buildStats = (
      cardList: Card[],
      key: string,
      label: string,
      icon: React.ReactNode,
      color: string,
      bgColor: string
    ): StatRow => {
      // Sort by WR for top/bottom
      const sorted = [...cardList].sort((a, b) => b.gih_wr! - a.gih_wr!);
      const top10 = sorted.slice(0, 10).map(c => ({
        card: c,
        name: c.name,
        wr: c.gih_wr!,
        delta: c.gih_wr! - globalMeanWR
      }));
      const bottom10 = sorted.slice(-10).reverse().map(c => ({
        card: c,
        name: c.name,
        wr: c.gih_wr!,
        delta: c.gih_wr! - globalMeanWR
      }));

      // Calculate stats based on statsMode
      const statsCards = statsMode === 'top10'
        ? sorted.slice(0, 10)
        : statsMode === 'bottom10'
          ? sorted.slice(-10)
          : cardList;
      const wrs = statsCards.map(c => c.gih_wr!);
      const avg = wrs.length > 0 ? wrs.reduce((a, b) => a + b, 0) / wrs.length : 0;
      const delta = avg - globalMeanWR;
      const variance = calcVariance(wrs, avg);

      return { key, label, icon, wr: avg, delta, variance, color, bgColor, top10, bottom10 };
    };

    // By Rarity
    const rarityGroups: Record<string, Card[]> = { M: [], R: [], U: [], C: [] };
    validCards.forEach(c => {
      const r = normalizeRarity(c.rarity);
      if (rarityGroups[r]) rarityGroups[r].push(c);
    });

    const rarityStats: StatRow[] = [
      buildStats(rarityGroups.M, 'M', 'Mythic', <Gem size={14} />, 'text-orange-400', 'bg-orange-500'),
      buildStats(rarityGroups.R, 'R', 'Rare', <Sparkles size={14} />, 'text-amber-400', 'bg-amber-500'),
      buildStats(rarityGroups.U, 'U', 'Uncommon', <CircleDot size={14} />, 'text-slate-300', 'bg-slate-400'),
      buildStats(rarityGroups.C, 'C', 'Common', <CircleDot size={14} />, 'text-slate-500', 'bg-slate-600'),
    ];

    // By Color
    const colorGroups: Record<string, Card[]> = { W: [], U: [], B: [], R: [], G: [], M: [], C: [] };
    validCards.forEach(c => {
      const colors = extractColors(c.colors);
      if (colors.length === 0) colorGroups.C.push(c);
      else if (colors.length > 1) colorGroups.M.push(c);
      else if (colorGroups[colors[0]]) colorGroups[colors[0]].push(c);
    });

    const colorMeta: Record<string, { label: string; color: string; bgColor: string }> = {
      W: { label: 'White', color: 'text-yellow-100', bgColor: 'bg-yellow-100' },
      U: { label: 'Blue', color: 'text-blue-400', bgColor: 'bg-blue-500' },
      B: { label: 'Black', color: 'text-violet-400', bgColor: 'bg-violet-600' },
      R: { label: 'Red', color: 'text-red-400', bgColor: 'bg-red-500' },
      G: { label: 'Green', color: 'text-green-400', bgColor: 'bg-green-500' },
      M: { label: 'Multi', color: 'text-amber-400', bgColor: 'bg-gradient-to-r from-amber-400 to-rose-500' },
      C: { label: 'Colorless', color: 'text-slate-400', bgColor: 'bg-slate-500' },
    };

    const colorStats: StatRow[] = ['W', 'U', 'B', 'R', 'G', 'M', 'C']
      .map(key => buildStats(
        colorGroups[key],
        key,
        colorMeta[key].label,
        <div className={`w-3 h-3 rounded-full ${colorMeta[key].bgColor}`} />,
        colorMeta[key].color,
        colorMeta[key].bgColor
      ))
      .sort((a, b) => b.delta - a.delta);

    const allWRs = validCards.map(c => c.gih_wr!);
    const overallVariance = calcVariance(allWRs, globalMeanWR);

    return { rarityStats, colorStats, overallVariance, totalCards: validCards.length };
  }, [cards, globalMeanWR, statsMode]);

  const activeStats = activeTab === 'rarity' ? stats.rarityStats : stats.colorStats;

  const toggleRow = (key: string) => {
    setExpandedRow(prev => prev === key ? null : key);
  };

  // Card list component for top/bottom
  const CardList: React.FC<{ cards: CardStat[]; type: 'top' | 'bottom' }> = ({ cards: cardList, type }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        {type === 'top' ? (
          <Trophy size={12} className="text-amber-400" />
        ) : (
          <Skull size={12} className="text-slate-500" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {type === 'top' ? 'Best Performers' : 'Worst Performers'}
        </span>
      </div>
      {cardList.map((c, idx) => (
        <motion.button
          key={c.name}
          initial={{ opacity: 0, x: type === 'top' ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.03 }}
          onClick={() => onCardSelect?.(c.card)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg ${getDeltaBg(c.delta)} hover:brightness-125 transition-all group`}
        >
          <span className="text-[10px] text-slate-600 font-mono w-4">{idx + 1}.</span>
          <span className="flex-1 text-xs font-medium text-slate-300 truncate text-left group-hover:text-white transition-colors">
            {c.name}
          </span>
          <span className="text-[11px] font-bold tabular-nums text-slate-400">
            {c.wr.toFixed(1)}%
          </span>
          <span className={`text-[11px] font-black tabular-nums min-w-[3rem] text-right ${getDeltaColor(c.delta)}`}>
            {c.delta >= 0 ? '+' : ''}{c.delta.toFixed(1)}
          </span>
        </motion.button>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl"
    >
      {/* Ambient glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full relative z-10 flex items-center justify-between p-4 md:p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center">
              <Zap size={10} className="text-amber-400" />
            </div>
          </div>
          <div className="text-left">
            <h3 className="text-sm md:text-base font-black text-white tracking-tight">Format Blueprint</h3>
            <p className="text-[10px] md:text-xs text-slate-500 font-medium">{stats.totalCards} cards analyzed</p>
          </div>
        </div>

        {/* Key Stats - Premium badge design */}
        <div className="hidden sm:flex items-center gap-2 mr-2">
          <Tooltip content={<span className="text-slate-200 text-xs">Format baseline win rate</span>}>
            <div className="group relative px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-help">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 group-hover:animate-pulse" />
                <span className="text-[10px] font-medium text-slate-400">WR</span>
                <span className="text-sm font-bold text-indigo-300">{globalMeanWR.toFixed(1)}%</span>
              </div>
            </div>
          </Tooltip>
          <Tooltip content={<span className="text-slate-200 text-xs">Win rate standard deviation</span>}>
            <div className="group relative px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-help">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:animate-pulse" />
                <span className="text-[10px] font-medium text-slate-400">VAR</span>
                <span className="text-sm font-bold text-amber-300">±{stats.overallVariance.toFixed(1)}</span>
              </div>
            </div>
          </Tooltip>
        </div>

        {/* Mobile: Compact inline badges with tooltips */}
        <div className="flex sm:hidden items-center gap-1.5 mr-2">
          <Tooltip content={<span className="text-slate-200 text-xs">Format baseline win rate</span>}>
            <div className="px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 cursor-help">
              <span className="text-xs font-bold text-indigo-300">{globalMeanWR.toFixed(1)}%</span>
            </div>
          </Tooltip>
          <Tooltip content={<span className="text-slate-200 text-xs">Win rate standard deviation</span>}>
            <div className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 cursor-help">
              <span className="text-xs font-bold text-amber-300">±{stats.overallVariance.toFixed(1)}</span>
            </div>
          </Tooltip>
        </div>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center flex-shrink-0"
        >
          <ChevronDown size={16} className="text-slate-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 md:px-5 pb-5 space-y-5">
              {/* Prince-O-Meter */}
              <PrinceOMeter cards={cards} globalMeanWR={globalMeanWR} />

              {/* Tab Switcher + Stats Mode Toggle */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Category tabs */}
                <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg flex-1 sm:flex-none">
                  {(['rarity', 'color'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); setExpandedRow(null); }}
                      className={`flex-1 sm:flex-none py-2 px-3 sm:px-4 rounded-md text-[11px] sm:text-xs font-bold transition-all ${
                        activeTab === tab
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                          : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <span className="sm:hidden">{tab === 'rarity' ? 'Rarity' : 'Color'}</span>
                      <span className="hidden sm:inline">{tab === 'rarity' ? 'By Rarity' : 'By Color'}</span>
                    </button>
                  ))}
                </div>

                <div className="w-[1px] h-6 bg-slate-700/50 hidden sm:block" />

                {/* Stats mode: All / Top 10 / Bottom 10 */}
                <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                  <Tooltip content={<span className="text-[10px]">Show stats for all cards</span>}>
                    <button
                      onClick={() => setStatsMode('all')}
                      className={`py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${
                        statsMode === 'all'
                          ? 'bg-slate-600 text-white'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      ALL
                    </button>
                  </Tooltip>
                  <Tooltip content={<span className="text-[10px]">Stats for top 10 cards only</span>}>
                    <button
                      onClick={() => setStatsMode('top10')}
                      className={`flex items-center gap-1 py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${
                        statsMode === 'top10'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <Trophy size={11} />
                      <span className="sm:hidden">TOP</span>
                      <span className="hidden sm:inline">TOP 10</span>
                    </button>
                  </Tooltip>
                  <Tooltip content={<span className="text-[10px]">Stats for bottom 10 cards only</span>}>
                    <button
                      onClick={() => setStatsMode('bottom10')}
                      className={`flex items-center gap-1 py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${
                        statsMode === 'bottom10'
                          ? 'bg-red-600 text-white shadow-lg shadow-red-500/25'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <Skull size={11} />
                      <span className="sm:hidden">BTM</span>
                      <span className="hidden sm:inline">BTM 10</span>
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Stats with Accordion */}
              <div className="space-y-1">
                {/* Column Headers */}
                <div className="flex items-center text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider px-3 py-1">
                  <span className="flex-1">
                    Category
                    {statsMode === 'top10' && <span className="text-emerald-400/70 ml-1">(Top 10)</span>}
                    {statsMode === 'bottom10' && <span className="text-red-400/70 ml-1">(Bottom 10)</span>}
                  </span>
                  <span className="w-14 text-right">GIH</span>
                  <span className="w-14 text-right">Delta</span>
                  <span className="w-16 text-right hidden md:block">Var</span>
                  <span className="w-6"></span>
                </div>

                {/* Rows */}
                {activeStats.map((stat, idx) => {
                  const isOpen = expandedRow === stat.key;
                  const hasCards = stat.top10.length > 0;

                  return (
                    <div key={stat.key} className="relative">
                      {/* Main Row */}
                      <motion.button
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => hasCards && toggleRow(stat.key)}
                        disabled={!hasCards}
                        className={`w-full flex items-center py-3 px-3 rounded-xl transition-all ${
                          isOpen ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                        } ${hasCards ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
                      >
                        {/* Category */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={stat.color}>{stat.icon}</span>
                          <span className="text-sm font-semibold text-slate-200 truncate">{stat.label}</span>
                        </div>

                        {/* WR */}
                        <div className="w-14 text-right">
                          <span className="text-sm font-bold tabular-nums text-slate-300">
                            {stat.wr > 0 ? `${stat.wr.toFixed(1)}%` : '—'}
                          </span>
                        </div>

                        {/* Delta - Highlighted */}
                        <div className="w-14 text-right">
                          {stat.wr > 0 ? (
                            <span className={`inline-flex items-center justify-end px-1.5 py-0.5 rounded text-sm font-black tabular-nums ${getDeltaColor(stat.delta)} ${getDeltaBg(stat.delta)}`}>
                              {stat.delta >= 0 ? '+' : ''}{stat.delta.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>

                        {/* Variance with visual indicator */}
                        <div className="w-16 text-right hidden md:flex items-center justify-end gap-1.5">
                          {stat.wr > 0 ? (
                            <Tooltip content={
                              <div className="text-center">
                                <div className="text-[10px] text-slate-400">Standard Deviation</div>
                                <div className="text-xs font-bold text-white">±{stat.variance.toFixed(2)}%</div>
                                <div className="text-[9px] text-slate-500 mt-1">
                                  {stat.variance < 2 ? 'Very consistent' : stat.variance < 4 ? 'Moderate spread' : 'High variance'}
                                </div>
                              </div>
                            }>
                              <div className="flex items-center gap-1 cursor-help">
                                <div className="flex gap-[2px] items-end">
                                  {[...Array(5)].map((_, i) => (
                                    <div
                                      key={i}
                                      className={`w-[3px] rounded-sm transition-all ${
                                        i < Math.min(5, Math.ceil(stat.variance / 1.2))
                                          ? stat.variance > 4 ? 'bg-amber-400' : 'bg-indigo-400'
                                          : 'bg-slate-700'
                                      }`}
                                      style={{ height: `${6 + i * 2}px` }}
                                    />
                                  ))}
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium">±{stat.variance.toFixed(1)}</span>
                              </div>
                            </Tooltip>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>

                        {/* Expand Icon */}
                        <div className="w-6 flex justify-end">
                          {hasCards && (
                            <motion.div
                              animate={{ rotate: isOpen ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronRight size={14} className="text-slate-500" />
                            </motion.div>
                          )}
                        </div>
                      </motion.button>

                      {/* Expanded Content */}
                      <AnimatePresence>
                        {isOpen && hasCards && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="px-2 py-3 ml-2 border-l-2 border-slate-700/50">
                              {/* Desktop: 2 columns */}
                              <div className="hidden md:grid md:grid-cols-2 gap-4">
                                <CardList cards={stat.top10} type="top" />
                                <CardList cards={stat.bottom10} type="bottom" />
                              </div>
                              {/* Mobile: Stacked with tabs */}
                              <div className="md:hidden space-y-4">
                                <CardList cards={stat.top10} type="top" />
                                <div className="border-t border-slate-800 pt-4">
                                  <CardList cards={stat.bottom10} type="bottom" />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
