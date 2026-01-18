import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Hammer, Scale, X, Info, TrendingUp, Target, Trash2, Gem, Layers, GitBranch, GitCompareArrows, ChevronRight, Archive, ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { Card } from '../../types';
import { normalizeRarity } from '../../utils/helpers';
import { useIsMobile } from '../../hooks/useIsMobile';
import { haptics } from '../../utils/haptics';
import { useAllSets } from '../../queries/useAllSets';
import { useCompareCards } from '../../queries/useCompareCards';
import { FORMAT_OPTIONS } from '../../constants';

interface PrinceOMeterProps {
  cards: Card[];
  globalMeanWR: number;
  activeSet: string;
  activeFormat: string;
}

interface AxisData {
  key: string;
  label: string;
  shortLabel: string;
  score: number; // 0-10 scale
  description: string;
  icon: React.ReactNode;
  color: string;
}

// Calculate pentagon area using the formula: A = 0.475 × (r1×r2 + r2×r3 + r3×r4 + r4×r5 + r5×r1)
const calculatePentagonArea = (scores: number[]): number => {
  if (scores.length !== 5) return 0;
  const [r1, r2, r3, r4, r5] = scores;
  return 0.475 * (r1 * r2 + r2 * r3 + r3 * r4 + r4 * r5 + r5 * r1);
};

// Clamp value between 0 and 10
const clamp = (value: number): number => Math.max(0, Math.min(10, value));

// Get format classification based on area score
const getFormatClassification = (area: number): {
  type: string;
  icon: React.ReactNode;
  gradient: string;
  bgGradient: string;
  description: string;
  emoji: string;
  leaning?: 'prince' | 'pauper';
} => {
  // Max theoretical area is ~237.5 (all axes at 10)
  // Prince format (like VOW) ~170, Pauper ~32
  if (area >= 90) {
    return {
      type: 'PRINCE',
      icon: <Crown className="w-6 h-6" />,
      gradient: 'from-amber-400 via-yellow-500 to-orange-500',
      bgGradient: 'from-amber-500/20 to-orange-500/20',
      description: 'Bombs reign supreme. Play rares aggressively and prioritize premium removal.',
      emoji: '👑'
    };
  }
  if (area >= 60) {
    // Determine leaning for BALANCED
    let leaning: 'prince' | 'pauper' | undefined;
    if (area >= 80 && area < 90) {
      leaning = 'prince';
    } else if (area >= 60 && area < 70) {
      leaning = 'pauper';
    }
    return {
      type: 'BALANCED',
      icon: <Scale className="w-6 h-6" />,
      gradient: 'from-indigo-400 via-purple-500 to-pink-500',
      bgGradient: 'from-indigo-500/20 to-purple-500/20',
      description: 'Healthy equilibrium. Both synergy and raw power matter.',
      emoji: '⚖️',
      leaning
    };
  }
  return {
    type: 'PAUPER',
    icon: <Hammer className="w-6 h-6" />,
    gradient: 'from-emerald-400 via-teal-500 to-cyan-500',
    bgGradient: 'from-emerald-500/20 to-teal-500/20',
    description: 'Commons and uncos shine bright. Synergy is king—build around archetypes, not bombs.',
    emoji: '🔨'
  };
};

// Extract analysis calculation to reusable function
const calculateAnalysis = (cards: Card[], globalMeanWR: number) => {
    const validCards = cards.filter(c => c.gih_wr !== null && c.gih_wr !== undefined);

    // Group by rarity
    const byRarity: Record<string, Card[]> = { M: [], R: [], U: [], C: [] };
    validCards.forEach(c => {
      const r = normalizeRarity(c.rarity);
      if (byRarity[r]) byRarity[r].push(c);
    });

    // Sort each group by WR
    const sortedRM = [...byRarity.M, ...byRarity.R].sort((a, b) => b.gih_wr! - a.gih_wr!);
    const sortedU = [...byRarity.U].sort((a, b) => b.gih_wr! - a.gih_wr!);
    const sortedC = [...byRarity.C].sort((a, b) => b.gih_wr! - a.gih_wr!);
    const sortedCU = [...byRarity.C, ...byRarity.U].sort((a, b) => b.gih_wr! - a.gih_wr!);

    // Helper to get avg WR of top N cards
    const avgTopN = (cards: Card[], n: number): number => {
      const top = cards.slice(0, Math.min(n, cards.length));
      if (top.length === 0) return globalMeanWR;
      return top.reduce((sum, c) => sum + c.gih_wr!, 0) / top.length;
    };

    // === AXIS 1: Bomb Dominance (R/M) ===
    // Ratio = Top 15 R/M avg / Format avg
    // Score = (Ratio - 1) * 50
    const top15RMAvg = avgTopN(sortedRM, 15);
    const axis1Ratio = top15RMAvg / globalMeanWR;
    const axis1Score = clamp((axis1Ratio - 1) * 50);
    const axis1Delta = ((axis1Ratio - 1) * 100); // % above average

    // === AXIS 2: Best Commons Power (inverted for radar) ===
    // Ratio = Top 10 C avg / Format avg
    // Score = (1.15 - Ratio) * 60 (inverted: weak commons = high score = Prince)
    const top10CAvg = avgTopN(sortedC, 10);
    const axis2Ratio = top10CAvg / globalMeanWR;
    const axis2Score = clamp((1.15 - axis2Ratio) * 60);
    const axis2Delta = ((axis2Ratio - 1) * 100); // % above average (displayed positive)

    // === AXIS 3: Best Uncommons Power (inverted for radar) ===
    // Ratio = Top 10 U avg / Format avg
    // Score = (1.15 - Ratio) * 60 (inverted: weak uncommons = high score = Prince)
    const top10UAvg = avgTopN(sortedU, 10);
    const axis3Ratio = top10UAvg / globalMeanWR;
    const axis3Score = clamp((1.15 - axis3Ratio) * 60);
    const axis3Delta = ((axis3Ratio - 1) * 100); // % above average (displayed positive)

    // === AXIS 4: Rarity Gap ===
    // Ratio = Top 20 R/M avg / ((Top 10 C avg + Top 10 U avg) / 2)
    // Score = (Ratio - 1) * 60
    const top20RMAvg = avgTopN(sortedRM, 20);
    const avgCU = (top10CAvg + top10UAvg) / 2;
    const axis4Ratio = top20RMAvg / avgCU;
    const axis4Score = clamp((axis4Ratio - 1) * 60);
    const axis4Delta = ((axis4Ratio - 1) * 100); // % above C/U average

    // === AXIS 5: Chaff Ratio ===
    // Ratio = % of C/U cards with WR < (mean - 2%)
    // Score = Ratio * 20
    const chaffThreshold = globalMeanWR - 2;
    const totalCU = sortedCU.length;
    const chaffCount = sortedCU.filter(c => c.gih_wr! < chaffThreshold).length;
    const axis5Ratio = totalCU > 0 ? chaffCount / totalCU : 0;
    const axis5Score = clamp(axis5Ratio * 20);

    // Build axis data
    const axes: AxisData[] = [
      {
        key: 'bombs dominance',
        label: 'Bombs Dominance',
        shortLabel: 'Bombs Dominance',
        score: axis1Score,
        description: `Top 15 R/M are ${axis1Delta >= 0 ? '+' : ''}${axis1Delta.toFixed(1)}% above format average`,
        icon: <Crown size={14} />,
        color: 'text-amber-400'
      },
      {
        key: 'best commons power',
        label: 'Top commons Weakness',
        shortLabel: 'Top commons Weakness',
        score: axis2Score,
        description: `Top 10 commons are ${axis2Delta >= 0 ? '+' : ''}${axis2Delta.toFixed(1)}% above format average`,
        icon: <Layers size={14} />,
        color: 'text-slate-400'
      },
      {
        key: 'best uncommons power',
        label: 'Top Uncos Weakness',
        shortLabel: 'Top Uncos Weakness',
        score: axis3Score,
        description: `Top 10 uncommons are ${axis3Delta >= 0 ? '+' : ''}${axis3Delta.toFixed(1)}% above format average`,
        icon: <Gem size={14} />,
        color: 'text-blue-400'
      },
      {
        key: 'rarity power gap',
        label: 'Rarity Power Gap',
        shortLabel: 'Rarity Power Gap',
        score: axis4Score,
        description: `Top 20 R/M are ${axis4Delta >= 0 ? '+' : ''}${axis4Delta.toFixed(1)}% above top 10 C + top 10 U average`,
        icon: <GitBranch size={14} />,
        color: 'text-purple-400'
      },
      {
        key: 'chaff ratio',
        label: 'Chaff Ratio',
        shortLabel: 'Chaff Ratio',
        score: axis5Score,
        description: `${(axis5Ratio * 100).toFixed(0)}% of C/U are 2 points below format average (${chaffThreshold.toFixed(1)}%)`,
        icon: <Trash2 size={14} />,
        color: 'text-red-400'
      }
    ];

    // Calculate area using pentagon formula
    const scores = axes.map(a => a.score);
    const area = calculatePentagonArea(scores);
    const maxArea = calculatePentagonArea([10, 10, 10, 10, 10]); // ~237.5

    const classification = getFormatClassification(area);

    // Calculate radar points for visualization (normalized to 0-1 for SVG)
    const center = 100;
    const maxRadius = 80;
    const points = axes.map((axis, i) => {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2; // Start from top
      const radius = (axis.score / 10) * maxRadius;
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle)
      };
    });

    return {
      axes,
      points,
      area,
      maxArea,
      areaPercent: (area / maxArea) * 100,
      classification,
      stats: {
        top15RMAvg,
        top10CAvg,
        top10UAvg,
        top20RMAvg,
        chaffCount,
        totalCU,
        chaffThreshold
      }
    };
};

export const PrinceOMeter: React.FC<PrinceOMeterProps> = ({ cards, globalMeanWR, activeSet, activeFormat }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState<string | null>(null);
  const [compareFormat, setCompareFormat] = useState<string | null>(null);
  const isMobile = useIsMobile(640);

  // Fetch all sets for comparison selector
  const { data: allSets = [] } = useAllSets();

  // Fetch comparison cards
  const { data: compareData, isLoading: isCompareLoading } = useCompareCards(compareSet, compareFormat);

  // Calculate analysis for current format
  const analysis = useMemo(() => calculateAnalysis(cards, globalMeanWR), [cards, globalMeanWR]);

  // Calculate analysis for comparison format
  const compareAnalysis = useMemo(() => {
    if (!compareData?.cards.length) return null;
    return calculateAnalysis(compareData.cards, compareData.globalMeanWR);
  }, [compareData]);

  // State for hovered point tooltip
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Get format label helper
  const getFormatLabel = (formatValue: string) => {
    return FORMAT_OPTIONS.find(f => f.value === formatValue)?.short || formatValue;
  };

  // SVG Radar Chart Component (pure SVG, no tooltip inside)
  const RadarChart: React.FC<{ size?: number; animated?: boolean; interactive?: boolean; id?: string; showComparison?: boolean }> = ({
    size = 200,
    animated = true,
    interactive = false,
    id = 'main',
    showComparison = false
  }) => {
    const center = 100;
    const maxRadius = 80;

    // Generate grid lines (now representing scores 2, 4, 6, 8, 10)
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
    const axisAngles = analysis.axes.map((_, i) => (Math.PI * 2 * i) / 5 - Math.PI / 2);

    // Create path for the data polygon
    const dataPath = analysis.points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ') + ' Z';

    // Create path for comparison polygon
    const compareDataPath = compareAnalysis?.points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ') + ' Z';

    // Unique IDs to avoid conflicts between multiple radar instances
    const gradientId = `radarGradient-${id}`;
    const strokeId = `radarStroke-${id}`;
    const compareGradientId = `compareGradient-${id}`;
    const compareStrokeId = `compareStroke-${id}`;

    // Full labels for radar display with line breaks for long ones
    const radarLabels = [
      'Bomb Dominance',
      'Commons Weakness',
      'Uncos Weakness',
      'Rarity Gap',
      'Chaff Ratio'
    ];

    return (
      <svg width={size} height={size} viewBox="0 0 200 200" className="overflow-visible">
        <defs>
          {/* Gradient for the data polygon (warm - current format) */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={showComparison ? 0.4 : 0.5} />
            <stop offset="50%" stopColor="#f97316" stopOpacity={showComparison ? 0.3 : 0.35} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={showComparison ? 0.4 : 0.5} />
          </linearGradient>
          <linearGradient id={strokeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          {/* Gradient for comparison polygon (cool - compare format) */}
          <linearGradient id={compareGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={compareStrokeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>

        {/* Background grid - concentric pentagons */}
        {gridLevels.map((level, levelIdx) => (
          <polygon
            key={level}
            points={axisAngles.map(angle => {
              const r = level * maxRadius;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            }).join(' ')}
            fill="none"
            stroke={levelIdx === gridLevels.length - 1 ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.1)'}
            strokeWidth={levelIdx === gridLevels.length - 1 ? 1.5 : 1}
          />
        ))}

        {/* Axis lines */}
        {axisAngles.map((angle, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + maxRadius * Math.cos(angle)}
            y2={center + maxRadius * Math.sin(angle)}
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth={1}
          />
        ))}

        {/* Comparison polygon (rendered first, behind current) */}
        {showComparison && compareAnalysis && (
          <path
            d={compareDataPath}
            fill={`url(#${compareGradientId})`}
            stroke={`url(#${compareStrokeId})`}
            strokeWidth={2}
            strokeDasharray="6 3"
            opacity={0.9}
          />
        )}

        {/* Data polygon - current format */}
        <path
          d={dataPath}
          fill={`url(#${gradientId})`}
          stroke={`url(#${strokeId})`}
          strokeWidth={2.5}
        />

        {/* Comparison data points */}
        {showComparison && compareAnalysis?.points.map((point, i) => (
          <circle
            key={`compare-${i}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill="#06b6d4"
            stroke="#0e7490"
            strokeWidth={1.5}
            opacity={0.8}
          />
        ))}

        {/* Current format data points with interaction */}
        {analysis.points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={interactive && hoveredPoint === i ? 7 : 5}
            fill={hoveredPoint === i ? '#fff' : showComparison ? '#fbbf24' : 'white'}
            stroke={`url(#${strokeId})`}
            strokeWidth={2}
            style={{ cursor: interactive ? 'pointer' : 'default', transition: 'r 0.15s ease' }}
            onMouseEnter={() => interactive && setHoveredPoint(i)}
            onMouseLeave={() => interactive && setHoveredPoint(null)}
            onTouchStart={() => interactive && setHoveredPoint(hoveredPoint === i ? null : i)}
          />
        ))}

        {/* Axis labels - positioned around the radar */}
        {radarLabels.map((label, i) => {
          const angle = axisAngles[i];

          // Pentagon angles from top going clockwise:
          // Index 0: top center (12h) - Bomb Dominance
          // Index 1: upper-right (~2h) - Commons Weakness
          // Index 2: lower-right (~4h) - Uncos Weakness
          // Index 3: lower-left (~8h) - Rarity Gap
          // Index 4: upper-left (~10h) - Chaff Ratio

          let labelRadius = maxRadius + 18;
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          let dx = 0;
          let dy = 0;

          if (i === 0) {
            // Top center
            labelRadius = maxRadius + 12;
            textAnchor = 'middle';
            dy = -4;
          } else if (i === 1) {
            // Upper-right
            labelRadius = maxRadius + 8;
            textAnchor = 'start';
            dx = 6;
            dy = 0;
          } else if (i === 2) {
            // Lower-right
            labelRadius = maxRadius + 8;
            textAnchor = 'start';
            dx = 6;
            dy = 4;
          } else if (i === 3) {
            // Lower-left
            labelRadius = maxRadius + 8;
            textAnchor = 'end';
            dx = -6;
            dy = 4;
          } else if (i === 4) {
            // Upper-left
            labelRadius = maxRadius + 8;
            textAnchor = 'end';
            dx = -6;
            dy = 0;
          }

          const x = center + labelRadius * Math.cos(angle) + dx;
          const y = center + labelRadius * Math.sin(angle) + dy;

          // Split "Commons Weakness" on 2 lines for mobile
          const needsSplit = i === 1 && isMobile; // Index 1 = Commons Weakness
          const labelParts = label.split(' ');

          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="text-[8px] font-bold fill-slate-300"
            >
              {needsSplit ? (
                <>
                  <tspan x={x} dy="-0.4em">{labelParts[0]}</tspan>
                  <tspan x={x} dy="1em">{labelParts[1]}</tspan>
                </>
              ) : (
                label
              )}
            </text>
          );
        })}
      </svg>
    );
  };

  // Fixed tooltip component displayed outside radar
  const RadarTooltip: React.FC = () => {
    if (hoveredPoint === null) return null;
    const axis = analysis.axes[hoveredPoint];

    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full ml-3 px-3 py-2 rounded-lg bg-slate-800/95 border border-slate-700/50 shadow-xl min-w-[140px]"
      >
        <div className="text-[10px] font-medium text-slate-400 mb-1">{axis.label}</div>
        <div className="text-lg font-black text-white">{axis.score.toFixed(1)}<span className="text-sm text-slate-400">/10</span></div>
        <div className="text-[9px] text-slate-500 mt-1 leading-tight">{axis.description}</div>
      </motion.div>
    );
  };

  return (
    <>
      {/* Compact Display - Clickable */}
      <motion.button
        onClick={() => { haptics.light(); setIsModalOpen(true); }}
        className="w-full group"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${analysis.classification.gradient} p-[1px]`}>
          <div className="relative bg-slate-900/95 backdrop-blur rounded-xl p-4 flex items-center gap-4">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${analysis.classification.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}
            >
              {analysis.classification.icon}
            </motion.div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-lg md:text-xl font-black bg-gradient-to-r ${analysis.classification.gradient} bg-clip-text text-transparent`}>
                  {analysis.classification.type}
                </span>
                <div className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                  {analysis.area.toFixed(0)} pts
                </div>
                {analysis.classification.leaning && (
                  <span className="text-[10px] font-medium italic text-slate-500">
                    leaning {analysis.classification.leaning === 'prince' ? 'Prince' : 'Pauper'}
                  </span>
                )}
              </div>
              <p className="text-[11px] md:text-xs text-slate-400 leading-relaxed line-clamp-2">
                {analysis.classification.description}
              </p>
            </div>

            {/* Mini radar preview */}
            <div className="hidden sm:block flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              <RadarChart size={64} animated={false} interactive={false} id="preview" />
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center group-hover:bg-slate-700 transition-colors">
                <Target size={14} className="text-slate-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-[9px] text-slate-500 group-hover:text-slate-400 transition-colors whitespace-nowrap">
                <span className="hidden sm:inline">Click for</span> Details
              </span>
            </div>
          </div>
        </div>
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl"
            >
              {/* Ambient glow */}
              <div className={`absolute -top-32 -right-32 w-64 h-64 bg-gradient-to-br ${analysis.classification.bgGradient} rounded-full blur-3xl pointer-events-none opacity-50`} />
              <div className={`absolute -bottom-32 -left-32 w-64 h-64 bg-gradient-to-br ${analysis.classification.bgGradient} rounded-full blur-3xl pointer-events-none opacity-30`} />

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between p-5 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${analysis.classification.gradient} flex items-center justify-center shadow-lg`}>
                    {analysis.classification.icon}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white tracking-tight">Prince-O-Meter</h2>
                    <p className="text-xs text-slate-500">The Prince-Pauper Spectrum</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Compare Button */}
                  <motion.button
                    onClick={() => { haptics.light(); setIsCompareMode(!isCompareMode); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      isCompareMode
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <GitCompareArrows size={14} />
                    <span className="hidden sm:inline">Compare</span>
                  </motion.button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                  >
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="relative z-10 p-5 space-y-6">
                {/* Compare Mode Panel */}
                <AnimatePresence>
                  {isCompareMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GitCompareArrows size={16} className="text-cyan-400" />
                            <span className="text-sm font-bold text-cyan-400">Compare with another format</span>
                          </div>
                          {compareSet && compareFormat && (
                            <button
                              onClick={() => { setCompareSet(null); setCompareFormat(null); }}
                              className="text-xs text-slate-400 hover:text-white transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Set Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Set</label>
                            <div className="relative">
                              <select
                                value={compareSet || ''}
                                onChange={(e) => { setCompareSet(e.target.value || null); setCompareFormat(null); }}
                                className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50"
                              >
                                <option value="">Select set...</option>
                                {allSets.map((set) => (
                                  <option key={set.code} value={set.code}>
                                    {set.code} {!set.active && '(Archive)'}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          </div>

                          {/* Format Selector */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Format</label>
                            <div className="relative">
                              <select
                                value={compareFormat || ''}
                                onChange={(e) => setCompareFormat(e.target.value || null)}
                                disabled={!compareSet}
                                className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <option value="">Select format...</option>
                                {FORMAT_OPTIONS.map((format) => (
                                  <option key={format.value} value={format.value}>
                                    {format.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        {/* Loading indicator */}
                        {isCompareLoading && compareSet && compareFormat && (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <div className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                            <span className="text-xs text-slate-400">Loading comparison data...</span>
                          </div>
                        )}

                        {/* Quick swap button */}
                        {compareAnalysis && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => {
                              // Swap would require parent state - just show the button for now
                              haptics.light();
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800/50 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <ArrowLeftRight size={12} />
                            <span>Comparing: {activeSet} {getFormatLabel(activeFormat)} vs {compareSet} {getFormatLabel(compareFormat!)}</span>
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Score Display */}
                <div className="text-center">
                  {/* Dual score display when comparing */}
                  {compareAnalysis ? (
                    <div className="flex items-stretch justify-center gap-3">
                      {/* Current format */}
                      <div className="flex-1 max-w-[200px] px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" />
                          <span className="text-[10px] font-bold text-amber-400 uppercase">{activeSet} {getFormatLabel(activeFormat)}</span>
                        </div>
                        <div className="text-xl font-black text-white">{analysis.classification.emoji} {analysis.classification.type}</div>
                        <div className="text-xs text-slate-400">{analysis.area.toFixed(0)} pts</div>
                      </div>

                      {/* VS */}
                      <div className="flex items-center">
                        <span className="text-xs font-black text-slate-600">VS</span>
                      </div>

                      {/* Compare format */}
                      <div className="flex-1 max-w-[200px] px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" />
                          <span className="text-[10px] font-bold text-cyan-400 uppercase">{compareSet} {getFormatLabel(compareFormat!)}</span>
                        </div>
                        <div className="text-xl font-black text-white">{compareAnalysis.classification.emoji} {compareAnalysis.classification.type}</div>
                        <div className="text-xs text-slate-400">{compareAnalysis.area.toFixed(0)} pts</div>
                      </div>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-800/40 border border-slate-700/50">
                      <span className="text-3xl">{analysis.classification.emoji}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-black bg-gradient-to-r ${analysis.classification.gradient} bg-clip-text text-transparent`}>
                            {analysis.classification.type}
                          </span>
                          {analysis.classification.leaning && (
                            <span className="text-xs font-medium italic text-slate-500">
                              leaning {analysis.classification.leaning === 'prince' ? 'Prince' : 'Pauper'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-400">
                          Area Score: <span className="font-bold text-white">{analysis.area.toFixed(1)}</span>
                          <span className="text-slate-500"> / {analysis.maxArea.toFixed(0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Radar Chart with fixed tooltip */}
                <div className="flex justify-center">
                  <div className="relative">
                    <RadarChart size={220} animated={true} interactive={true} id="modal" showComparison={!!compareAnalysis} />
                    <AnimatePresence>
                      <RadarTooltip />
                    </AnimatePresence>
                  </div>
                </div>

                {/* Legend when comparing */}
                {compareAnalysis && (
                  <div className="flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500" />
                      <span className="text-[10px] text-slate-400">{activeSet} {getFormatLabel(activeFormat)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ borderStyle: 'dashed' }} />
                      <span className="text-[10px] text-slate-400">{compareSet} {getFormatLabel(compareFormat!)}</span>
                    </div>
                  </div>
                )}

                {/* Axis Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Info size={14} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Axis Breakdown</span>
                  </div>

                  {analysis.axes.map((axis, idx) => {
                    const compareAxis = compareAnalysis?.axes[idx];
                    const delta = compareAxis ? axis.score - compareAxis.score : 0;

                    return (
                      <motion.div
                        key={axis.key}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + idx * 0.1 }}
                        className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
                      >
                        {/* Desktop: single row layout */}
                        <div className="hidden sm:flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 ${axis.color}`}>
                            {axis.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-200">{axis.label}</span>
                              {/* Score badges - show both when comparing */}
                              {compareAnalysis ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                    {axis.score.toFixed(1)}
                                  </span>
                                  <span className="text-[10px] text-slate-600">vs</span>
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                    {compareAxis?.score.toFixed(1)}
                                  </span>
                                  {delta !== 0 && (
                                    <span className={`text-[10px] font-bold ${delta > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  axis.score >= 7 ? 'bg-amber-500/20 text-amber-400' :
                                  axis.score >= 4 ? 'bg-slate-500/20 text-slate-400' :
                                  'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  {axis.score.toFixed(1)}/10
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">{axis.description}</p>
                          </div>
                          {/* Progress bars - dual when comparing */}
                          <div className="w-20 flex-shrink-0 space-y-1">
                            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: compareAnalysis ? 'linear-gradient(to right, #f59e0b, #f97316)' : (axis.score < 4 ? '#10b981' : axis.score < 7 ? '#f59e0b' : '#ef4444') }}
                                initial={{ width: 0 }}
                                animate={{ width: `${(axis.score / 10) * 100}%` }}
                                transition={{ delay: 0.7 + idx * 0.1, duration: 0.5 }}
                              />
                            </div>
                            {compareAnalysis && compareAxis && (
                              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: 'linear-gradient(to right, #06b6d4, #8b5cf6)' }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(compareAxis.score / 10) * 100}%` }}
                                  transition={{ delay: 0.8 + idx * 0.1, duration: 0.5 }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mobile: stacked layout */}
                        <div className="sm:hidden space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 ${axis.color}`}>
                              {axis.icon}
                            </div>
                            <span className="text-sm font-semibold text-slate-200 flex-1">{axis.label}</span>
                            {compareAnalysis ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-amber-400">{axis.score.toFixed(1)}</span>
                                <span className="text-[10px] text-slate-600">/</span>
                                <span className="text-xs font-bold text-cyan-400">{compareAxis?.score.toFixed(1)}</span>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                axis.score >= 7 ? 'bg-amber-500/20 text-amber-400' :
                                axis.score >= 4 ? 'bg-slate-500/20 text-slate-400' :
                                'bg-emerald-500/20 text-emerald-400'
                              }`}>
                                {axis.score.toFixed(1)}/10
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{axis.description}</p>
                          <div className="space-y-1">
                            <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: compareAnalysis ? 'linear-gradient(to right, #f59e0b, #f97316)' : (axis.score < 4 ? '#10b981' : axis.score < 7 ? '#f59e0b' : '#ef4444') }}
                                initial={{ width: 0 }}
                                animate={{ width: `${(axis.score / 10) * 100}%` }}
                                transition={{ delay: 0.7 + idx * 0.1, duration: 0.5 }}
                              />
                            </div>
                            {compareAnalysis && compareAxis && (
                              <div className="w-full h-1 rounded-full bg-slate-700 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: 'linear-gradient(to right, #06b6d4, #8b5cf6)' }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(compareAxis.score / 10) * 100}%` }}
                                  transition={{ delay: 0.8 + idx * 0.1, duration: 0.5 }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Interpretation */}
                <div className={`p-4 rounded-xl bg-gradient-to-r ${analysis.classification.bgGradient} border border-slate-700/30`}>
                  <div className="flex items-start gap-3">
                    <TrendingUp size={18} className="text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-slate-200 mb-1">Strategic Insight</div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {analysis.classification.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
