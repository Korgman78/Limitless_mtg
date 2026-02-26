import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { getCardImage } from '../../../utils/helpers';
import type { TrophyMover } from './types';

interface Props {
  gaining: TrophyMover[];
  losing: TrophyMover[];
}

const MoverRow: React.FC<{ card: TrophyMover; isGaining: boolean; index: number }> = ({ card, isGaining, index }) => {
  const deltaColor = isGaining ? 'text-emerald-400' : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg"
    >
      <img
        src={getCardImage(card.name)}
        alt={card.name}
        className="w-12 h-auto rounded flex-shrink-0"
        loading="lazy"
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 truncate">{card.name}</div>
        {card.archetype && (
          <div className="text-[10px] text-slate-500 truncate">{card.archetype}</div>
        )}
      </div>

      <div className={`text-base font-bold flex-shrink-0 ${deltaColor}`}>
        {card.delta > 0 ? '+' : ''}{(card.delta * 100).toFixed(0)}%
      </div>
    </motion.div>
  );
};

export const TrophyMovers: React.FC<Props> = ({ gaining, losing }) => {
  if (gaining.length === 0 && losing.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        <Trophy className="w-4 h-4" />
        Trophy Movers
      </h3>

      {gaining.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" /> Gaining
          </div>
          {gaining.map((card, i) => (
            <MoverRow key={card.name} card={card} isGaining index={i} />
          ))}
        </div>
      )}

      {losing.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <TrendingDown className="w-3.5 h-3.5" /> Losing
          </div>
          {losing.map((card, i) => (
            <MoverRow key={card.name} card={card} isGaining={false} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};
