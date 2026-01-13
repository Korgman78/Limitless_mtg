import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { MetagamePieChartProps, Deck } from '../../types';

export const MetagamePieChart: React.FC<MetagamePieChartProps> = ({ decks, totalGames, globalMeanWR }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const counts: Record<string, number> = { 'Mono': 0, '2 Color': 0, '2+Splash': 0, '3 Color': 0, '>3 Color': 0 };

  decks.forEach((d: Deck) => {
    if (d.games === 0) return;
    if (d.type === 'Mono-color') counts['Mono'] += d.games;
    else if (d.type === 'Two colors') counts['2 Color'] += d.games;
    else if (d.type === 'Two colors + splash') counts['2+Splash'] += d.games;
    else if (d.type === 'Three colors') counts['3 Color'] += d.games;
    else counts['>3 Color'] += d.games;
  });

  const data = [
    { label: 'Mono', value: counts['Mono'], color: '#94a3b8' },
    { label: '2 Color', value: counts['2 Color'], color: '#6366f1' },
    { label: '2+Splash', value: counts['2+Splash'], color: '#a855f7' },
    { label: '3 Color', value: counts['3 Color'], color: '#f59e0b' },
    { label: '>3 Color', value: counts['>3 Color'], color: '#ea580c' },
  ];

  const total = totalGames || 1;
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number): [number, number] => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col bg-slate-900 p-4 rounded-xl border border-slate-800 h-full overflow-hidden">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
        COLORS BREAKDOWN (NUMBER OF GAMES)
      </h3>

      <div className="flex items-start gap-3 md:gap-6 flex-1 pt-1 md:pt-0">
        <div className="relative w-32 h-32 md:w-36 md:h-36 flex-shrink-0">
          <svg viewBox="-1.1 -1.1 2.2 2.2" className="transform -rotate-90">
            <defs>
              <filter id="pressed">
                <feColorMatrix type="matrix" values="0.7 0 0 0 0  0 0.7 0 0 0  0 0 0.7 0 0  0 0 0 1 0" />
              </filter>
            </defs>
            {data.map((slice, i) => {
              if (slice.value === 0) return null;
              const startPercent = cumulativePercent;
              const slicePercent = slice.value / total;
              cumulativePercent += slicePercent;
              const endPercent = cumulativePercent;

              const [startX, startY] = getCoordinatesForPercent(startPercent);
              const [endX, endY] = getCoordinatesForPercent(endPercent);

              const largeArcFlag = slicePercent > 0.5 ? 1 : 0;
              const pathData = slicePercent >= 0.999
                ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`
                : `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              const isHovered = hoveredIndex === i;

              return (
                <path
                  key={i}
                  d={pathData}
                  fill={slice.color}
                  stroke="#0f172a"
                  strokeWidth={isHovered ? "0.08" : "0.05"}
                  filter={isHovered ? "url(#pressed)" : undefined}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
            <circle cx="0" cy="0" r="0.65" fill="#0f172a" />
          </svg>

          {/* Center info - shows hovered slice or default */}
          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            {hoveredIndex !== null && data[hoveredIndex] ? (
              <>
                <span className="text-[8px] text-slate-400 font-bold uppercase">{data[hoveredIndex].label}</span>
                <span className="text-sm font-black text-white tabular-nums">
                  {((data[hoveredIndex].value / total) * 100).toFixed(1)}%
                </span>
                <span className="text-[8px] text-slate-500 tabular-nums">
                  {(data[hoveredIndex].value / 1000).toFixed(1)}k games
                </span>
              </>
            ) : (
              <>
                <span className="text-[9px] text-slate-400 font-bold uppercase">Total</span>
                <span className="text-xs font-black text-white">{(total / 1000).toFixed(0)}k</span>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 flex justify-end">
          <div className="w-full max-w-[130px] md:max-w-[150px] space-y-1">
            {data.map((d, i) => (
              <div
                key={i}
                className="flex justify-between items-center text-[10px] md:text-[11px] p-1 md:p-1.5 rounded-md border border-transparent transition-all hover:bg-slate-800/50 hover:border-slate-700"
                style={{
                  borderLeftColor: d.value > 0 ? d.color : 'transparent',
                  borderLeftWidth: '3px'
                }}
              >
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-slate-300 font-medium whitespace-nowrap">{d.label}</span>
                </div>
                <span className="font-bold text-slate-400 tabular-nums">
                  {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Format WR Baseline - Mobile only */}
      {globalMeanWR !== undefined && (
        <div className="md:hidden mt-2 pt-2 border-t border-slate-800/50">
          <div className="flex items-center justify-center">
            <div className="relative group">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 rounded-full blur-xl opacity-60" />

              {/* Stat card */}
              <div className="relative flex items-center gap-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-slate-800/80 to-slate-800/60 border border-slate-700/50 shadow-lg">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
                  <TrendingUp size={10} className="text-indigo-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[7px] font-bold uppercase tracking-wider text-slate-500">Format WR Baseline</span>
                  <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300 tabular-nums leading-tight">
                    {globalMeanWR.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
