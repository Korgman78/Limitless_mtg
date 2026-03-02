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
  const absDeltaPp = Math.abs(card.delta * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
    >
      <img
        src={getCardImage(card.name)}
        alt={card.name}
        className="w-16 h-auto rounded flex-shrink-0"
        loading="lazy"
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 truncate">{card.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {card.archetype && (
            <span className="text-[10px] text-slate-500 truncate">{card.archetype}</span>
          )}
          <span className="text-[10px] text-slate-500">
            {(card.freq * 100).toFixed(1)}% trophy share
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {absDeltaPp >= 5 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
            HOT
          </span>
        )}
        <span className={`text-sm font-bold ${deltaColor}`}>
          {card.delta > 0 ? '+' : ''}{(card.delta * 100).toFixed(1)}pp
        </span>
      </div>
    </motion.div>
  );
};

export const TrophyMovers: React.FC<Props> = ({ gaining, losing }) => {
  if (gaining.length === 0 && losing.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-slate-900/45 border border-slate-800 rounded-xl">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
          <Trophy className="w-4 h-4" />
          Trophy Movers
        </h3>
        <p className="text-xs text-slate-500 mt-1">Cards with the largest trophy share changes vs previous period.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" /> Gaining
          </div>
          {gaining.length > 0 ? gaining.map((card, i) => (
            <MoverRow key={card.name} card={card} isGaining index={i} />
          )) : <div className="text-xs text-slate-500 p-2">No significant gaining card this period.</div>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <TrendingDown className="w-3.5 h-3.5" /> Losing
          </div>
          {losing.length > 0 ? losing.map((card, i) => (
            <MoverRow key={card.name} card={card} isGaining={false} index={i} />
          )) : <div className="text-xs text-slate-500 p-2">No significant losing card this period.</div>}
        </div>
      </div>
    </div>
  );
};
