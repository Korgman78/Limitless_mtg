import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SparklineProps } from '../../types';
import { Tooltip } from '../Common/Tooltip';

export const Sparkline: React.FC<SparklineProps & { width?: number; height?: number }> = ({
  data,
  width = 40,
  height = 20
}) => {
  const safeData: number[] = (data && data.length > 0) ? data : [0, 0];

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;

  const points = safeData.map((d: number, i: number) => {
    const x = (i / ((safeData.length - 1) || 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const first = safeData[0];
  const last = safeData[safeData.length - 1];
  const delta = last - first;
  const isRising = delta > 0;
  const isFalling = delta < 0;
  const isStable = delta === 0;
  const days = safeData.length;

  const colorClass = isRising ? 'text-emerald-400' : isFalling ? 'text-red-400' : 'text-slate-400';
  const strokeColor = isRising ? '#10b981' : isFalling ? '#ef4444' : '#64748b';
  const Icon = isRising ? TrendingUp : isFalling ? TrendingDown : Minus;

  const tooltipContent = (
    <div className="flex flex-col items-center gap-1 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={colorClass} />
        <span className={`text-sm font-black ${colorClass}`}>
          {isRising ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="text-[10px] text-slate-400">
        {first.toFixed(1)}% → {last.toFixed(1)}%
      </div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">
        over {days} days
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div
        className="relative flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity cursor-help"
        style={{
          width: width + 16,
          height: height + 12,
          padding: '6px 8px',
          margin: '-6px -8px',
        }}
      >
        <svg width={width} height={height} className="overflow-visible">
          <polyline
            points={points}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Tooltip>
  );
};
