import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Tooltip } from '../Common/Tooltip';

interface TrendIndicatorProps {
  history: number[] | null | undefined;
}

export const TrendIndicator: React.FC<TrendIndicatorProps> = ({ history }) => {
  if (!history || history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const delta = last - first;

  // Seuil de significativité pour afficher la flèche
  if (Math.abs(delta) < 0.1) return null;

  const isPositive = delta > 0;
  const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400';
  const bgGlow = isPositive ? 'shadow-emerald-500/20' : 'shadow-red-500/20';
  const Icon = isPositive ? TrendingUp : TrendingDown;

  const tooltipContent = (
    <div className="flex flex-col items-center gap-1 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={colorClass} />
        <span className={`text-sm font-black ${colorClass}`}>
          {isPositive ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="text-[10px] text-slate-400">
        {first.toFixed(1)}% → {last.toFixed(1)}%
      </div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">
        over 14 days
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} position="left">
      <div
        className="relative flex items-center justify-center cursor-help"
        style={{
          width: 40,
          height: 40,
          margin: '-8px',
        }}
      >
        <div
          className={`flex items-center justify-center w-6 h-6 rounded-full bg-slate-900/80 border border-white/10 ${colorClass} hover:bg-slate-800 hover:border-white/20 transition-all shadow-lg ${bgGlow}`}
        >
          <Icon size={14} strokeWidth={2.5} />
        </div>
      </div>
    </Tooltip>
  );
};
