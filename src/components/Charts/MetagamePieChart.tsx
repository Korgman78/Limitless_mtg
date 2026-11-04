import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { MetagamePieChartProps, Deck } from '../../types';

export const MetagamePieChart: React.FC<MetagamePieChartProps> = ({ decks, totalGames, globalMeanWR }) => {
  // Survol a la souris (desktop) et selection au tap (mobile) : le survol prime.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = hoveredIndex ?? selectedIndex;

  const counts: Record<string, number> = { 'Mono': 0, '2 Color': 0, '2+Splash': 0, '3 Color': 0, '>3 Color': 0 };
  // Somme des wr x parties : WR de chaque part pondere par les parties.
  const weightedWins: Record<string, number> = { 'Mono': 0, '2 Color': 0, '2+Splash': 0, '3 Color': 0, '>3 Color': 0 };

  decks.forEach((d: Deck) => {
    if (d.games === 0) return;
    let key: string;
    if (d.type === 'Mono-color') key = 'Mono';
    else if (d.type === 'Two colors') key = '2 Color';
    else if (d.type === 'Two colors + splash') key = '2+Splash';
    else if (d.type === 'Three colors') key = '3 Color';
    else key = '>3 Color';
    counts[key] += d.games;
    weightedWins[key] += d.wr * d.games;
  });

  const wrOf = (key: string) => (counts[key] > 0 ? weightedWins[key] / counts[key] : null);

  const data = [
    { label: 'Mono', fullLabel: 'Mono colour', value: counts['Mono'], wr: wrOf('Mono'), color: '#94a3b8' },
    { label: '2 Color', fullLabel: 'Two colours', value: counts['2 Color'], wr: wrOf('2 Color'), color: '#6366f1' },
    { label: '2+Splash', fullLabel: 'Two colours + splash', value: counts['2+Splash'], wr: wrOf('2+Splash'), color: '#a855f7' },
    { label: '3 Color', fullLabel: 'Three colours', value: counts['3 Color'], wr: wrOf('3 Color'), color: '#f59e0b' },
    { label: '>3 Color', fullLabel: 'Four+ colours', value: counts['>3 Color'], wr: wrOf('>3 Color'), color: '#ea580c' },
  ];

  const active = activeIndex !== null ? data[activeIndex] : null;
  const displayedWR = active ? active.wr : (globalMeanWR ?? null);
  const displayedLabel = active ? `${active.fullLabel} WR` : 'Format WR Baseline';

  // Survol reserve a la souris : sur ecran tactile, le tap passe par onClick
  // (un second tap sur la meme part, ou un tap ailleurs dans la carte, deselectionne).
  const interactionProps = (i: number) => ({
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setHoveredIndex(i); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setHoveredIndex(null); },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedIndex(prev => (prev === i ? null : i));
    },
  });

  const total = totalGames || 1;
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent: number): [number, number] => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div onClick={() => setSelectedIndex(null)} className="relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_40px_-38px_rgba(59,130,246,0.32)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(99,102,241,0.08),transparent_28%),radial-gradient(circle_at_100%_0%,rgba(168,85,247,0.05),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(2,6,23,0.2))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-white/20 to-transparent" />

      <h3 className="relative mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
        COLORS BREAKDOWN (NUMBER OF GAMES)
      </h3>

      <div className="relative flex flex-1 items-start gap-3 pt-1 md:gap-6 md:pt-0">
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

              const isHovered = activeIndex === i;

              return (
                <path
                  key={i}
                  d={pathData}
                  fill={slice.color}
                  stroke="#0f172a"
                  strokeWidth={isHovered ? "0.08" : "0.05"}
                  filter={isHovered ? "url(#pressed)" : undefined}
                  className="cursor-pointer transition-all duration-150"
                  {...interactionProps(i)}
                />
              );
            })}
            <circle cx="0" cy="0" r="0.65" fill="#0f172a" />
          </svg>

          {/* Center info - shows hovered slice or default */}
          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            {active ? (
              <>
                <span className="text-[8px] text-slate-400 font-bold uppercase">{active.label}</span>
                <span className="text-sm font-black text-white tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.08)]">
                  {((active.value / total) * 100).toFixed(1)}%
                </span>
                <span className="text-[8px] text-slate-500 tabular-nums">
                  {(active.value / 1000).toFixed(1)}k games
                </span>
              </>
            ) : (
              <>
                <span className="text-[9px] text-slate-400 font-bold uppercase">Total</span>
                <span className="text-xs font-black text-white drop-shadow-[0_0_10px_rgba(99,102,241,0.25)]">{(total / 1000).toFixed(0)}k</span>
              </>
            )}
          </div>
        </div>

        {/* WR global ou de la part active - Desktop only */}
        <div className="hidden md:flex md:h-36 flex-1 flex-col items-center justify-center text-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{displayedLabel}</span>
          <span className="mt-0.5 text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300 tabular-nums leading-tight">
            {displayedWR !== null ? `${displayedWR.toFixed(1)}%` : '—'}
          </span>
        </div>

        <div className="flex-1 flex justify-end">
          <div className="w-full max-w-[130px] md:max-w-[150px] space-y-1">
            {data.map((d, i) => (
              <div
                key={i}
                {...(d.value > 0 ? interactionProps(i) : {})}
                className={`flex items-center justify-between rounded-md border p-1 text-[10px] transition-all md:p-1.5 md:text-[11px] ${
                  d.value > 0 ? 'cursor-pointer' : ''
                } ${activeIndex === i ? 'border-slate-600 bg-slate-800/50' : 'border-white/5'}`}
                style={{
                  borderLeftColor: d.value > 0 ? d.color : 'transparent',
                  borderLeftWidth: '3px',
                  boxShadow: d.value > 0 ? `0 10px 26px -24px ${d.color}` : undefined,
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

      {/* WR global ou de la part selectionnee - Mobile only */}
      {displayedWR !== null && (
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
                  <span className="text-[7px] font-bold uppercase tracking-wider text-slate-500">{displayedLabel}</span>
                  <span className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300 tabular-nums leading-tight">
                    {displayedWR.toFixed(1)}%
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
