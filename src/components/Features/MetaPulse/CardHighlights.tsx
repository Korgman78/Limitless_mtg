import React from 'react';
import { Flame, TrendingDown, Eye } from 'lucide-react';
import { RARITY_STYLES } from '../../../constants';
import type { PulseCard } from './types';

const gradeColors: Record<string, string> = {
  S: 'text-purple-400 bg-purple-500/20',
  A: 'text-emerald-400 bg-emerald-500/20',
  B: 'text-lime-400 bg-lime-500/20',
  C: 'text-yellow-400 bg-yellow-500/20',
  D: 'text-orange-400 bg-orange-500/20',
  F: 'text-red-700 bg-red-900/20',
};

interface CardRowProps {
  card: PulseCard & { best_in?: string };
  showAlsa?: boolean;
}

const CardRow: React.FC<CardRowProps> = ({ card, showAlsa }) => {
  const rarityStyle = RARITY_STYLES[card.rarity] || RARITY_STYLES.C;
  const gradeStyle = gradeColors[card.grade] || '';

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rarityStyle.split(' ')[0]?.replace('text-', 'bg-') || 'bg-slate-500'}`} />
      <span className="text-slate-200 truncate flex-1 min-w-0">{card.name}</span>
      <span className="text-slate-400 text-xs w-14 text-right">{card.gih_wr.toFixed(1)}%</span>
      <span className={`text-xs w-12 text-right ${card.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {card.delta >= 0 ? '+' : ''}{card.delta.toFixed(1)}
      </span>
      {card.grade && (
        <span className={`text-xs px-1 rounded font-bold ${gradeStyle}`}>{card.grade}</span>
      )}
      {showAlsa && card.alsa != null && card.alsa > 0 && (
        <span className="text-xs text-slate-500 w-10 text-right">P{card.alsa.toFixed(0)}</span>
      )}
    </div>
  );
};

interface Props {
  stars: PulseCard[];
  falling: PulseCard[];
  sleepers: (PulseCard & { best_in?: string })[];
}

export const CardHighlights: React.FC<Props> = ({ stars, falling, sleepers }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Card Highlights</h3>

      {stars.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 mb-1">
            <Flame className="w-3.5 h-3.5" /> Rising Stars
          </div>
          {stars.map(c => <CardRow key={c.name} card={c} />)}
        </div>
      )}

      {falling.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-400 mb-1">
            <TrendingDown className="w-3.5 h-3.5" /> Falling
          </div>
          {falling.map(c => <CardRow key={c.name} card={c} />)}
        </div>
      )}

      {sleepers.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 mb-1">
            <Eye className="w-3.5 h-3.5" /> Sleepers
          </div>
          {sleepers.map(c => (
            <div key={c.name}>
              <CardRow card={c} showAlsa />
              {c.best_in && (
                <div className="text-xs text-slate-500 ml-4 -mt-0.5">Best in {c.best_in}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
