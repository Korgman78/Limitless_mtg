import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
  const ColorClass = isPositive ? "text-emerald-400" : "text-red-400";
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    // Tooltip complet dans 'title', affichage compact (icône seule)
    <div 
      className={`flex items-center justify-center w-6 h-6 rounded-full bg-slate-900/50 border border-white/5 ${ColorClass} hover:bg-slate-800 transition-colors cursor-help`} 
      title={`${isPositive ? '+' : ''}${delta.toFixed(1)}% since 14 days`}
    >
      <Icon size={14} strokeWidth={3} />
    </div>
  );
};