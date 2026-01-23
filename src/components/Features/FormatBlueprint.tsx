import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronRight,
  Gem, CircleDot, BarChart3, Trophy, Skull, Sparkles, Zap, HelpCircle, ScatterChart, X, ZoomIn, RotateCcw
} from 'lucide-react';
import type { Card, Deck } from '../../types';
import { normalizeRarity, extractColors } from '../../utils/helpers';
import { Tooltip } from '../Common/Tooltip';
import { PrinceOMeter } from './PrinceOMeter';
import { useFormatBalance } from '../../queries/useFormatBalance';
import { FORMAT_OPTIONS, RARITY_STYLES } from '../../constants';

interface FormatBlueprintProps {
  cards: Card[];
  decks: Deck[];
  globalMeanWR: number;
  activeSet: string;
  activeFormat: string;
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

// Calculate weighted standard deviation for decks (weighted by games)
const calcWeightedStdDev = (items: { wr: number; games: number }[]): number => {
  if (items.length < 2) return 0;
  const totalWeight = items.reduce((sum, d) => sum + d.games, 0);
  if (totalWeight === 0) return 0;

  // Weighted mean
  const weightedMean = items.reduce((sum, d) => sum + d.wr * d.games, 0) / totalWeight;

  // Weighted variance
  const weightedVariance = items.reduce((sum, d) => {
    return sum + d.games * Math.pow(d.wr - weightedMean, 2);
  }, 0) / totalWeight;

  return Math.sqrt(weightedVariance);
};

// Archetype Balance Score: σ_archetypes in [1.0, 3.25] → score [10, 0]
// Non-weighted, excludes decks < 1% meta share
// Formula: score = 10 × (3.25 - σ) / 2.25
const archetypeStdDevToScore = (stdDev: number): number => {
  const score = 10 * (3.25 - stdDev) / 2.25;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
};

// Color Balance Score: σ_colors in [0.25, 1.75] → score [10, 0]
// Formula: score = 10 × (1.75 - σ) / 1.5
const colorStdDevToScore = (stdDev: number): number => {
  const score = 10 * (1.75 - stdDev) / 1.5;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
};

// Get balance status label and color based on score
const getBalanceStatus = (score: number): { label: string; color: string } => {
  if (score >= 7) return { label: 'Balanced', color: 'text-emerald-400' };
  if (score >= 5) return { label: 'Slightly Balanced', color: 'text-lime-400' };
  if (score >= 4) return { label: 'Slightly Unbalanced', color: 'text-amber-400' };
  return { label: 'Unbalanced', color: 'text-red-400' };
};

// Helper to get short format label
const getFormatShort = (format: string): string => {
  return FORMAT_OPTIONS.find(f => f.value === format)?.short || format;
};

export const FormatBlueprint: React.FC<FormatBlueprintProps> = ({ cards, decks, globalMeanWR, activeSet, activeFormat, onCardSelect }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'rarity' | 'color'>('rarity');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [statsMode, setStatsMode] = useState<'all' | 'top10' | 'bottom10'>('all');
  const [isBalanceChartOpen, setIsBalanceChartOpen] = useState(false);

  // Cross-filters: color filter when on rarity tab, rarity filter when on color tab
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [rarityFilters, setRarityFilters] = useState<string[]>([]);
  const [hoveredSet, setHoveredSet] = useState<{ setCode: string; archetypeScore: number; colorScore: number; x: number; y: number } | null>(null);

  // Zoom state for scatter chart
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);

  // Reset zoom when modal closes
  useEffect(() => {
    if (!isBalanceChartOpen) {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [isBalanceChartOpen]);

  // Mouse wheel zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoomLevel(prev => Math.max(1, Math.min(4, prev + delta)));
  }, []);

  // Touch handlers for pinch zoom and pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenterRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      // Pan start (only when zoomed)
      isPanningRef.current = true;
      lastPanPointRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  }, [zoomLevel]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      // Pinch zoom
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / lastTouchDistRef.current;

      setZoomLevel(prev => Math.max(1, Math.min(4, prev * scale)));
      lastTouchDistRef.current = dist;
    } else if (e.touches.length === 1 && isPanningRef.current && lastPanPointRef.current) {
      // Pan
      e.preventDefault();
      const dx = e.touches[0].clientX - lastPanPointRef.current.x;
      const dy = e.touches[0].clientY - lastPanPointRef.current.y;

      // Limit pan based on zoom level
      const maxPan = (zoomLevel - 1) * 50;
      setPanOffset(prev => ({
        x: Math.max(-maxPan, Math.min(maxPan, prev.x + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, prev.y + dy))
      }));

      lastPanPointRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  }, [zoomLevel]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistRef.current = null;
    lastTouchCenterRef.current = null;
    isPanningRef.current = false;
    lastPanPointRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Mouse drag for panning on desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [zoomLevel]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current && lastPanPointRef.current) {
      const dx = e.clientX - lastPanPointRef.current.x;
      const dy = e.clientY - lastPanPointRef.current.y;

      const maxPan = (zoomLevel - 1) * 50;
      setPanOffset(prev => ({
        x: Math.max(-maxPan, Math.min(maxPan, prev.x + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, prev.y + dy))
      }));

      lastPanPointRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [zoomLevel]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    lastPanPointRef.current = null;
  }, []);

  // Fetch cross-set balance data for the current format
  const { data: formatBalanceData } = useFormatBalance(activeFormat);

  const stats = useMemo(() => {
    const validCards = cards.filter(c => c.gih_wr !== null && c.gih_wr !== undefined);

    // Apply cross-filters based on active tab
    const getFilteredCards = (cardList: Card[], forTab: 'rarity' | 'color'): Card[] => {
      let filtered = cardList;

      // When viewing rarity stats, apply color filter
      if (forTab === 'rarity' && colorFilters.length > 0) {
        filtered = filtered.filter(c => {
          const cColors = extractColors(c.colors);
          if (colorFilters.includes('M') && cColors.length > 1) return true;
          if (colorFilters.includes('C') && cColors.length === 0) return true;
          const monoFilters = colorFilters.filter(f => ['W', 'U', 'B', 'R', 'G'].includes(f));
          if (monoFilters.length > 0) {
            for (const f of monoFilters) {
              if (cColors.includes(f)) return true;
            }
          }
          return false;
        });
      }

      // When viewing color stats, apply rarity filter
      if (forTab === 'color' && rarityFilters.length > 0) {
        filtered = filtered.filter(c => rarityFilters.includes(normalizeRarity(c.rarity)));
      }

      return filtered;
    };

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

    // By Rarity (apply color filter if active)
    const filteredForRarity = getFilteredCards(validCards, 'rarity');
    const rarityGroups: Record<string, Card[]> = { M: [], R: [], U: [], C: [] };
    filteredForRarity.forEach(c => {
      const r = normalizeRarity(c.rarity);
      if (rarityGroups[r]) rarityGroups[r].push(c);
    });

    const rarityStats: StatRow[] = [
      buildStats(rarityGroups.M, 'M', 'Mythic', <Gem size={14} />, 'text-orange-400', 'bg-orange-500'),
      buildStats(rarityGroups.R, 'R', 'Rare', <Sparkles size={14} />, 'text-amber-400', 'bg-amber-500'),
      buildStats(rarityGroups.U, 'U', 'Uncommon', <CircleDot size={14} />, 'text-slate-300', 'bg-slate-400'),
      buildStats(rarityGroups.C, 'C', 'Common', <CircleDot size={14} />, 'text-slate-500', 'bg-slate-600'),
    ];

    // By Color (apply rarity filter if active)
    const filteredForColor = getFilteredCards(validCards, 'color');
    const colorGroups: Record<string, Card[]> = { W: [], U: [], B: [], R: [], G: [], M: [], C: [] };
    filteredForColor.forEach(c => {
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

    // --- BALANCE CALCULATIONS ---
    // 1. Archetype Balance: NON-weighted stddev of deck WRs
    // Filter: exclude decks < 1% meta share (evaluates "by design" balance)
    // Bornes: σ=1.0 → 10/10, σ=3.25 → 0/10
    const totalGamesAll = decks.reduce((sum, d) => sum + d.games, 0);
    const metaThreshold = totalGamesAll * 0.01; // 1% meta
    const validDecks = decks.filter(d => d.games >= metaThreshold && d.wr > 0);

    // Simple (non-weighted) stddev of archetype WRs
    const archetypeWRs = validDecks.map(d => d.wr);
    const archetypeMean = archetypeWRs.length > 0 ? archetypeWRs.reduce((a, b) => a + b, 0) / archetypeWRs.length : 0;
    const archetypeStdDev = archetypeWRs.length > 1 ? calcVariance(archetypeWRs, archetypeMean) : 0;
    const archetypeScore = archetypeStdDevToScore(archetypeStdDev);

    // 2. Color Balance: stddev of average GIH WR per color (W, U, B, R, G)
    // Only use cards with GIH WR data (played cards)
    // Bornes: σ=0.25 → 10/10, σ=1.75 → 0/10
    const colorAvgWRs = ['W', 'U', 'B', 'R', 'G']
      .map(c => colorGroups[c])
      .filter(g => g.length > 0)
      .map(g => {
        const validCards = g.filter(card => card.gih_wr !== null && card.gih_wr !== undefined);
        if (validCards.length === 0) return null;
        return validCards.reduce((sum, card) => sum + card.gih_wr!, 0) / validCards.length;
      })
      .filter((wr): wr is number => wr !== null);

    // Simple stddev of the 5 color averages
    const colorMean = colorAvgWRs.length > 0 ? colorAvgWRs.reduce((a, b) => a + b, 0) / colorAvgWRs.length : 0;
    const colorStdDev = colorAvgWRs.length > 1 ? calcVariance(colorAvgWRs, colorMean) : 0;
    const colorScore = colorStdDevToScore(colorStdDev);

    const formatBalance = {
      archetypeScore,
      archetypeStdDev,
      colorScore,
      colorStdDev,
      deckCount: validDecks.length
    };

    return { rarityStats, colorStats, overallVariance, totalCards: validCards.length, formatBalance };
  }, [cards, decks, globalMeanWR, statsMode, colorFilters, rarityFilters]);

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
              <PrinceOMeter cards={cards} globalMeanWR={globalMeanWR} activeSet={activeSet} activeFormat={activeFormat} />

              {/* Tab Switcher + Stats Mode Toggle */}
              <div className="space-y-3">
                {/* Row 1: Category tabs + Stats mode */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category tabs */}
                  <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg flex-1 sm:flex-none">
                    {(['rarity', 'color'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setExpandedRow(null); }}
                        className={`flex-1 sm:flex-none py-2 px-3 sm:px-4 rounded-md text-[11px] sm:text-xs font-bold transition-all ${activeTab === tab
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
                        className={`py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${statsMode === 'all'
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
                        className={`flex items-center gap-1 py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${statsMode === 'top10'
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
                        className={`flex items-center gap-1 py-2 px-2.5 sm:px-3 rounded-md text-[10px] sm:text-xs font-bold transition-all ${statsMode === 'bottom10'
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

                {/* Row 2: Cross-filters */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    {activeTab === 'rarity' ? 'Filter by color' : 'Filter by rarity'}
                  </span>
                  {activeTab === 'rarity' ? (
                    // Color filter when viewing by rarity
                    <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
                      {['W', 'U', 'B', 'R', 'G'].map(c => (
                        <button
                          key={c}
                          onClick={() => setColorFilters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                          className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center border transition-all relative ${colorFilters.includes(c) ? 'scale-110 shadow-md z-10 border-white' : 'opacity-50 hover:opacity-80 grayscale border-transparent'}`}
                        >
                          <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="w-full h-full" alt={c} />
                        </button>
                      ))}
                      <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
                      <button
                        onClick={() => setColorFilters(prev => prev.includes('M') ? prev.filter(x => x !== 'M') : [...prev, 'M'])}
                        className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 border flex items-center justify-center text-[7px] md:text-[8px] font-black text-white shadow-sm transition-all ${colorFilters.includes('M') ? 'border-white scale-110' : 'border-transparent opacity-50 grayscale hover:opacity-80'}`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => setColorFilters(prev => prev.includes('C') ? prev.filter(x => x !== 'C') : [...prev, 'C'])}
                        className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-400 border flex items-center justify-center text-[7px] md:text-[8px] font-black text-slate-900 shadow-sm transition-all ${colorFilters.includes('C') ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`}
                      >
                        C
                      </button>
                      {colorFilters.length > 0 && (
                        <button
                          onClick={() => setColorFilters([])}
                          className="p-1 text-slate-500 hover:text-white transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ) : (
                    // Rarity filter when viewing by color
                    <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
                      {['M', 'R', 'U', 'C'].map(r => {
                        const isActive = rarityFilters.includes(r);
                        return (
                          <button
                            key={r}
                            onClick={() => setRarityFilters(prev => prev.includes(r) ? prev.filter(item => item !== r) : [...prev, r])}
                            className={`w-5 h-5 md:w-6 md:h-6 rounded flex items-center justify-center text-[9px] md:text-[10px] font-black transition-all border ${isActive ? `${RARITY_STYLES[r]} border-white/40 scale-105 shadow-lg` : 'bg-slate-800 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}
                          >
                            {r}
                          </button>
                        );
                      })}
                      {rarityFilters.length > 0 && (
                        <button
                          onClick={() => setRarityFilters([])}
                          className="p-1 text-slate-500 hover:text-white transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}
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
                        className={`w-full flex items-center py-3 px-3 rounded-xl transition-all ${isOpen ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
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
                                      className={`w-[3px] rounded-sm transition-all ${i < Math.min(5, Math.ceil(stat.variance / 1.2))
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

              {/* Balance Gauges */}
              {stats.formatBalance.deckCount > 0 && (() => {
                // Cross-set stats for tooltips (best/worst sets in this format)
                const crossSetStats = formatBalanceData;

                // Arc gauge component with cross-set comparison
                const ArcGauge: React.FC<{
                  score: number;
                  stdDev: number;
                  label: string;
                  description: string;
                  crossSet?: { average: number; best: { setCode: string; score: number }; worst: { setCode: string; score: number } };
                }> = ({ score, stdDev, label, description, crossSet }) => {
                  const radius = 44;
                  const strokeWidth = 7;
                  const normalizedRadius = radius - strokeWidth / 2;
                  const circumference = normalizedRadius * Math.PI; // Half circle
                  const progress = Math.min(score / 10, 1);
                  const strokeDashoffset = circumference * (1 - progress);

                  // Color based on score (HIGH = balanced = green, LOW = unbalanced = red)
                  const getColor = (s: number) => {
                    if (s >= 7) return { stroke: '#10b981', text: 'text-emerald-400' };
                    if (s >= 5) return { stroke: '#84cc16', text: 'text-lime-400' };
                    if (s >= 4) return { stroke: '#f59e0b', text: 'text-amber-400' };
                    return { stroke: '#ef4444', text: 'text-red-400' };
                  };
                  const colors = getColor(score);
                  const status = getBalanceStatus(score);

                  // Tooltip content for cross-set stats
                  const crossSetTooltip = crossSet ? (
                    <div className="min-w-[140px] text-center space-y-2">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        {getFormatShort(activeFormat)} across sets
                      </div>
                      <div className="border-t border-slate-700 pt-2">
                        <div className="text-[10px] text-slate-500">Average</div>
                        <div className="text-sm font-bold text-white">{crossSet.average.toFixed(1)}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-emerald-500/10 rounded px-2 py-1">
                          <div className="text-emerald-400 font-semibold">Best</div>
                          <div className="text-white font-bold">{crossSet.best.setCode}</div>
                          <div className="text-emerald-300">{crossSet.best.score.toFixed(1)}</div>
                        </div>
                        <div className="bg-red-500/10 rounded px-2 py-1">
                          <div className="text-red-400 font-semibold">Worst</div>
                          <div className="text-white font-bold">{crossSet.worst.setCode}</div>
                          <div className="text-red-300">{crossSet.worst.score.toFixed(1)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null;

                  return (
                    <div className="flex flex-col items-center">
                      {/* Label with help icon */}
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
                        <Tooltip content={
                          <div className="max-w-[200px] text-center">
                            <div className="text-[10px] text-slate-300 leading-relaxed">{description}</div>
                          </div>
                        }>
                          <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                        </Tooltip>
                      </div>

                      {/* Gauge - wrapped in Tooltip for cross-set stats */}
                      <Tooltip content={crossSetTooltip} enabled={!!crossSet}>
                        <div className="relative cursor-help" style={{ width: radius * 2, height: radius + 12 }}>
                          <svg width={radius * 2} height={radius + 12}>
                            {/* Background arc */}
                            <path
                              d={`M ${strokeWidth / 2} ${radius} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 - strokeWidth / 2} ${radius}`}
                              fill="none"
                              stroke="rgba(51, 65, 85, 0.4)"
                              strokeWidth={strokeWidth}
                              strokeLinecap="round"
                            />
                            {/* Progress arc */}
                            <motion.path
                              d={`M ${strokeWidth / 2} ${radius} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 - strokeWidth / 2} ${radius}`}
                              fill="none"
                              stroke={colors.stroke}
                              strokeWidth={strokeWidth}
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              initial={{ strokeDashoffset: circumference }}
                              animate={{ strokeDashoffset }}
                              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                            />
                          </svg>
                          {/* Score display */}
                          <div className="absolute inset-0 flex items-end justify-center pb-1">
                            <div className="text-center">
                              <span className={`text-2xl font-black tabular-nums ${colors.text}`}>
                                {score.toFixed(1)}
                              </span>
                              <span className="text-[10px] text-slate-600 ml-0.5">/10</span>
                            </div>
                          </div>
                        </div>
                      </Tooltip>

                      {/* Status label */}
                      <div className={`text-sm font-bold mt-1 ${status.color}`}>
                        {status.label}
                      </div>

                      {/* Stddev info */}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        σ = {stdDev.toFixed(2)}%
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="pt-5 mt-1 border-t border-slate-800/50">
                    <div className="grid grid-cols-2 gap-4 justify-items-center">
                      <ArcGauge
                        score={stats.formatBalance.archetypeScore}
                        stdDev={stats.formatBalance.archetypeStdDev}
                        label="Archetype Balance"
                        description="Standard deviation of win rates across archetypes with ≥1% meta share. Score = 10 × (3.25 - σ) / 2.25. A σ of 1.0% = 10/10, σ of 3.25% = 0/10."
                        crossSet={crossSetStats?.archetype}
                      />
                      <ArcGauge
                        score={stats.formatBalance.colorScore}
                        stdDev={stats.formatBalance.colorStdDev}
                        label="Colour Balance"
                        description="Standard deviation of average GIH win rates across the 5 colors (WUBRG). Score = 10 × (1.75 - σ) / 1.5. A σ of 0.25% = 10/10 (perfect), σ of 1.75% = 0/10 (one color dominates)."
                        crossSet={crossSetStats?.color}
                      />
                    </div>
                    {/* Compare across sets button */}
                    {crossSetStats?.allSets && crossSetStats.allSets.length > 1 && (
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={() => setIsBalanceChartOpen(true)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 text-xs font-medium text-slate-400 hover:text-white transition-all"
                        >
                          <ScatterChart size={14} />
                          <span>Compare across sets</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balance Scatter Chart Modal */}
      <AnimatePresence>
        {isBalanceChartOpen && formatBalanceData?.allSets && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsBalanceChartOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <ScatterChart size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Balance Comparison</h3>
                    <p className="text-[10px] text-slate-500">{getFormatShort(activeFormat)} across all sets</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsBalanceChartOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                >
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              {/* Scatter Plot */}
              <div className="p-4">
                <div className="relative bg-slate-800/30 rounded-xl p-4">
                  {/* Y-axis label */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                    Colour Balance
                  </div>

                  {/* Zoom controls */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                    {zoomLevel > 1 && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={resetZoom}
                        className="p-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        title="Reset zoom"
                      >
                        <RotateCcw size={14} />
                      </motion.button>
                    )}
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/60 text-[10px] text-slate-400">
                      <ZoomIn size={12} />
                      <span>{zoomLevel.toFixed(1)}x</span>
                    </div>
                  </div>

                  {/* Chart container with zoom */}
                  <div
                    ref={chartContainerRef}
                    className={`relative overflow-hidden rounded-lg touch-none select-none ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
                    onWheel={handleWheel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <motion.div
                      animate={{
                        scale: zoomLevel,
                        x: panOffset.x,
                        y: panOffset.y
                      }}
                      transition={{ type: 'tween', duration: 0.1 }}
                      style={{ transformOrigin: 'center center' }}
                    >
                    <svg viewBox="0 0 220 220" className="w-full h-auto">
                    {/* Grid lines */}
                    {[0, 2.5, 5, 7.5, 10].map((v) => (
                      <g key={v}>
                        <line
                          x1={20 + (v / 10) * 180}
                          y1={20}
                          x2={20 + (v / 10) * 180}
                          y2={200}
                          stroke="rgba(148, 163, 184, 0.1)"
                          strokeWidth={1}
                        />
                        <line
                          x1={20}
                          y1={200 - (v / 10) * 180}
                          x2={200}
                          y2={200 - (v / 10) * 180}
                          stroke="rgba(148, 163, 184, 0.1)"
                          strokeWidth={1}
                        />
                        <text x={20 + (v / 10) * 180} y={212} textAnchor="middle" className="fill-slate-600 text-[8px]">
                          {v}
                        </text>
                        <text x={12} y={200 - (v / 10) * 180 + 3} textAnchor="middle" className="fill-slate-600 text-[8px]">
                          {v}
                        </text>
                      </g>
                    ))}

                    {/* Quadrant backgrounds */}
                    <rect x={110} y={20} width={90} height={90} fill="rgba(16, 185, 129, 0.05)" />
                    <rect x={20} y={110} width={90} height={90} fill="rgba(239, 68, 68, 0.05)" />

                    {/* Average lines */}
                    {formatBalanceData.archetype && (
                      <line
                        x1={20 + (formatBalanceData.archetype.average / 10) * 180}
                        y1={20}
                        x2={20 + (formatBalanceData.archetype.average / 10) * 180}
                        y2={200}
                        stroke="#6366f1"
                        strokeWidth={1}
                        strokeDasharray="4 2"
                        opacity={0.5}
                      />
                    )}
                    {formatBalanceData.color && (
                      <line
                        x1={20}
                        y1={200 - (formatBalanceData.color.average / 10) * 180}
                        x2={200}
                        y2={200 - (formatBalanceData.color.average / 10) * 180}
                        stroke="#6366f1"
                        strokeWidth={1}
                        strokeDasharray="4 2"
                        opacity={0.5}
                      />
                    )}

                    {/* Data points */}
                    {formatBalanceData.allSets.map((set, idx) => {
                      const x = 20 + (set.archetypeScore / 10) * 180;
                      const y = 200 - (set.colorScore / 10) * 180;
                      const isCurrentSet = set.setCode === activeSet;

                      return (
                        <g
                          key={set.setCode}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredSet({ ...set, x, y })}
                          onMouseLeave={() => setHoveredSet(null)}
                        >
                          <circle
                            cx={x}
                            cy={y}
                            r={8}
                            fill="transparent"
                          />
                          <motion.circle
                            cx={x}
                            cy={y}
                            r={isCurrentSet ? 3.5 : 2.5}
                            fill={isCurrentSet ? '#8b5cf6' : '#64748b'}
                            stroke={isCurrentSet ? '#a78bfa' : '#475569'}
                            strokeWidth={1}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="pointer-events-none"
                          />
                          <text
                            x={x}
                            y={y - 5}
                            textAnchor="middle"
                            className={`text-[5px] font-bold pointer-events-none ${isCurrentSet ? 'fill-purple-300' : 'fill-slate-400'}`}
                          >
                            {set.setCode}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                    </motion.div>

                    {/* Custom tooltip - positioned accounting for zoom/pan */}
                    <AnimatePresence>
                      {hoveredSet && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.1 }}
                          className="absolute pointer-events-none bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-lg px-2.5 py-1.5 shadow-xl z-10"
                          style={{
                            // Calculate position with zoom and pan offset
                            left: `calc(50% + ${((hoveredSet.x / 220 - 0.5) * zoomLevel * 100)}% + ${panOffset.x}px)`,
                            top: `calc(50% + ${((hoveredSet.y / 220 - 0.5) * zoomLevel * 100)}% + ${panOffset.y}px)`,
                            transform: 'translate(-50%, -130%)'
                          }}
                        >
                          <div className="text-center">
                            <div className="text-[11px] font-bold text-white">{hoveredSet.setCode}</div>
                            <div className="text-[9px] text-slate-300 space-y-0.5">
                              <div>Archetype: <span className="font-semibold text-white">{hoveredSet.archetypeScore.toFixed(1)}</span></div>
                              <div>Colour: <span className="font-semibold text-white">{hoveredSet.colorScore.toFixed(1)}</span></div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* X-axis label */}
                  <div className="text-center mt-1 text-[10px] font-semibold text-slate-500">
                    Archetype Balance
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 border border-purple-400" />
                      <span className="text-slate-400">Current set</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-slate-500 border border-slate-600" />
                      <span className="text-slate-400">Other sets</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-[1px] bg-indigo-500" style={{ borderStyle: 'dashed' }} />
                      <span className="text-slate-400">Average</span>
                    </div>
                  </div>

                  {/* Zoom hint */}
                  <div className="text-center mt-2 text-[9px] text-slate-600">
                    <span className="hidden sm:inline">Scroll to zoom • Drag to pan</span>
                    <span className="sm:hidden">Pinch to zoom • Drag to pan</span>
                  </div>
                </div>

                {/* Quadrant explanation */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-[10px]">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-500/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-400">Top-right: Well balanced</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-red-400">Bottom-left: Strongly unbalanced</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};