import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Sparkles, Users, X, Info, TrendingUp, Target, Trash2, Gem, Layers, GitBranch } from 'lucide-react';
import type { Card } from '../../types';
import { normalizeRarity } from '../../utils/helpers';

interface PrinceOMeterProps {
  cards: Card[];
  globalMeanWR: number;
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
} => {
  // Max theoretical area is ~237.5 (all axes at 10)
  // Prince format (like VOW) ~170, Pauper ~32
  if (area >= 120) {
    return {
      type: 'PRINCE',
      icon: <Crown className="w-6 h-6" />,
      gradient: 'from-amber-400 via-yellow-500 to-orange-500',
      bgGradient: 'from-amber-500/20 to-orange-500/20',
      description: 'Bombs reign supreme. First-pick rares aggressively and prioritize premium removal.',
      emoji: '👑'
    };
  }
  if (area >= 60) {
    return {
      type: 'BALANCED',
      icon: <Users className="w-6 h-6" />,
      gradient: 'from-indigo-400 via-purple-500 to-pink-500',
      bgGradient: 'from-indigo-500/20 to-purple-500/20',
      description: 'Healthy equilibrium. Both synergy and raw power matter—adapt to the table.',
      emoji: '⚖️'
    };
  }
  return {
    type: 'PAUPER',
    icon: <Sparkles className="w-6 h-6" />,
    gradient: 'from-emerald-400 via-teal-500 to-cyan-500',
    bgGradient: 'from-emerald-500/20 to-teal-500/20',
    description: 'Commons shine bright. Synergy is king—build around archetypes, not bombs.',
    emoji: '✨'
  };
};

export const PrinceOMeter: React.FC<PrinceOMeterProps> = ({ cards, globalMeanWR }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const analysis = useMemo(() => {
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
        label: 'Best Commons Power',
        shortLabel: 'Best Commons Power',
        score: axis2Score,
        description: `Top 10 commons are ${axis2Delta >= 0 ? '+' : ''}${axis2Delta.toFixed(1)}% above format average`,
        icon: <Layers size={14} />,
        color: 'text-slate-400'
      },
      {
        key: 'best uncommons power',
        label: 'Best Uncommons Power',
        shortLabel: 'Best uncos Power',
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
  }, [cards, globalMeanWR]);

  // State for hovered point tooltip
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // SVG Radar Chart Component
  const RadarChart: React.FC<{ size?: number; animated?: boolean; interactive?: boolean; id?: string }> = ({
    size = 200,
    animated = true,
    interactive = false,
    id = 'main'
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

    // Unique IDs to avoid conflicts between multiple radar instances
    const gradientId = `radarGradient-${id}`;
    const strokeId = `radarStroke-${id}`;

    return (
      <svg width={size} height={size} viewBox="0 0 200 200" className="overflow-visible">
        <defs>
          {/* Gradient for the data polygon */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
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

        {/* Data polygon - no filter for better mobile compatibility */}
        <motion.path
          d={dataPath}
          fill={`url(#${gradientId})`}
          stroke={`url(#${strokeId})`}
          strokeWidth={2.5}
          initial={animated ? { opacity: 0, scale: 0.5 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Data points with interaction */}
        {analysis.points.map((point, i) => (
          <g key={i}>
            <motion.circle
              cx={point.x}
              cy={point.y}
              r={interactive && hoveredPoint === i ? 7 : 5}
              fill={hoveredPoint === i ? '#fff' : 'white'}
              stroke={`url(#${strokeId})`}
              strokeWidth={2}
              initial={animated ? { opacity: 0, scale: 0 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: animated ? 0.4 + i * 0.1 : 0 }}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onMouseEnter={() => interactive && setHoveredPoint(i)}
              onMouseLeave={() => interactive && setHoveredPoint(null)}
              onTouchStart={() => interactive && setHoveredPoint(hoveredPoint === i ? null : i)}
            />
            {/* Tooltip on hover/touch */}
            {interactive && hoveredPoint === i && (
              <g>
                {/* Tooltip background */}
                <rect
                  x={point.x - 32}
                  y={point.y - 38}
                  width={64}
                  height={28}
                  rx={6}
                  fill="rgba(15, 23, 42, 0.95)"
                  stroke="rgba(148, 163, 184, 0.3)"
                  strokeWidth={1}
                />
                {/* Tooltip arrow */}
                <polygon
                  points={`${point.x - 6},${point.y - 10} ${point.x + 6},${point.y - 10} ${point.x},${point.y - 4}`}
                  fill="rgba(15, 23, 42, 0.95)"
                />
                {/* Tooltip text - axis name */}
                <text
                  x={point.x}
                  y={point.y - 27}
                  textAnchor="middle"
                  className="text-[8px] font-medium fill-slate-400"
                >
                  {analysis.axes[i].shortLabel}
                </text>
                {/* Tooltip text - score */}
                <text
                  x={point.x}
                  y={point.y - 16}
                  textAnchor="middle"
                  className="text-[11px] font-bold fill-white"
                >
                  {analysis.axes[i].score.toFixed(1)}/10
                </text>
              </g>
            )}
          </g>
        ))}

        {/* Axis labels */}
        {analysis.axes.map((axis, i) => {
          const angle = axisAngles[i];
          const labelRadius = maxRadius + 18;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);

          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[8px] font-bold fill-slate-400"
            >
              {axis.shortLabel}
            </text>
          );
        })}
      </svg>
    );
  };

  return (
    <>
      {/* Compact Display - Clickable */}
      <motion.button
        onClick={() => setIsModalOpen(true)}
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
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 shadow-2xl"
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
                    <p className="text-xs text-slate-500">Format Power Analysis</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                >
                  <X size={16} className="text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="relative z-10 p-5 space-y-6">
                {/* Score Display */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-slate-800/80 to-slate-800/40 border border-slate-700/50">
                    <span className="text-3xl">{analysis.classification.emoji}</span>
                    <div>
                      <div className={`text-2xl font-black bg-gradient-to-r ${analysis.classification.gradient} bg-clip-text text-transparent`}>
                        {analysis.classification.type}
                      </div>
                      <div className="text-sm text-slate-400">
                        Area Score: <span className="font-bold text-white">{analysis.area.toFixed(1)}</span>
                        <span className="text-slate-500"> / {analysis.maxArea.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Radar Chart */}
                <div className="flex justify-center">
                  <RadarChart size={220} animated={true} />
                </div>

                {/* Axis Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Info size={14} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Axis Breakdown</span>
                  </div>

                  {analysis.axes.map((axis, idx) => (
                    <motion.div
                      key={axis.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + idx * 0.1 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center ${axis.color}`}>
                        {axis.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-200">{axis.label}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            axis.score >= 7 ? 'bg-amber-500/20 text-amber-400' :
                            axis.score >= 4 ? 'bg-slate-500/20 text-slate-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {axis.score.toFixed(1)}/10
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{axis.description}</p>
                      </div>
                      {/* Score bar out of 10 */}
                      <div className="w-20 h-2 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500"
                          style={{
                            background: `linear-gradient(to right,
                              ${axis.score < 4 ? '#10b981' : axis.score < 7 ? '#f59e0b' : '#ef4444'},
                              ${axis.score < 4 ? '#10b981' : axis.score < 7 ? '#f59e0b' : '#ef4444'})`
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(axis.score / 10) * 100}%` }}
                          transition={{ delay: 0.7 + idx * 0.1, duration: 0.5 }}
                        />
                      </div>
                    </motion.div>
                  ))}
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
