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
  const Icon = isPositive ? TrendingUp : TrendingDown;

  // Couleurs et inclinaisons selon l'intensité du mouvement
  let colorClass: string;
  let bgGlow: string;
  let rotation: string;

  if (delta > 0.5) {
    // Forte hausse → vert foncé, flèche plus verticale
    colorClass = 'text-emerald-500';
    bgGlow = 'shadow-emerald-500/30';
    rotation = '-rotate-12';
  } else if (delta > 0.1) {
    // Légère hausse → vert pomme, flèche standard
    colorClass = 'text-lime-400';
    bgGlow = 'shadow-lime-400/20';
    rotation = '';
  } else if (delta < -0.5) {
    // Forte baisse → rouge, flèche plus verticale
    colorClass = 'text-red-400';
    bgGlow = 'shadow-red-500/20';
    rotation = 'rotate-12';
  } else {
    // Légère baisse → orange, flèche standard
    colorClass = 'text-amber-400';
    bgGlow = 'shadow-amber-500/20';
    rotation = '';
  }

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
        over {history.length} days
      </div>
    </div>
  );

  const iconElement = (
    <div
      className={`flex items-center justify-center w-6 h-6 rounded-full bg-slate-900/80 border border-white/10 ${colorClass} hover:bg-slate-800 hover:border-white/20 transition-all shadow-lg ${bgGlow} ${rotation}`}
    >
      <Icon size={14} strokeWidth={2.5} />
    </div>
  );

  return (
    <Tooltip content={tooltipContent} position="left">
      <div className="cursor-help">
        {iconElement}
      </div>
    </Tooltip>
  );
};
