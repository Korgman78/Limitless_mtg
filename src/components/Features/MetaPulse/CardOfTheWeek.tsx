import React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { RARITY_STYLES } from '../../../constants';
import { getCardImage } from '../../../utils/helpers';
import type { MetaPulseData } from './types';

const gradeColors: Record<string, string> = {
  S: 'text-purple-400 bg-purple-500/20 border-purple-500',
  A: 'text-emerald-400 bg-emerald-500/20 border-emerald-500',
  B: 'text-lime-400 bg-lime-500/20 border-lime-500',
  C: 'text-yellow-400 bg-yellow-500/20 border-yellow-500',
  D: 'text-orange-400 bg-orange-500/20 border-orange-500',
  F: 'text-red-700 bg-red-900/20 border-red-800',
};

interface Props {
  card: NonNullable<MetaPulseData['card_of_the_week']>;
}

export const CardOfTheWeek: React.FC<Props> = ({ card }) => {
  const rarityStyle = RARITY_STYLES[card.rarity] || RARITY_STYLES.C;
  const gradeStyle = gradeColors[card.grade] || gradeColors.C;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        <Star className="w-4 h-4" />
        Card of the Week
      </h3>

      <div className="flex gap-4 p-4 bg-slate-800/50 rounded-xl border border-indigo-500/20">
        {/* Card image */}
        <motion.div
          className="flex-shrink-0"
          animate={{ boxShadow: ['0 0 15px rgba(99,102,241,0.3)', '0 0 25px rgba(99,102,241,0.5)', '0 0 15px rgba(99,102,241,0.3)'] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <img
            src={getCardImage(card.name)}
            alt={card.name}
            className="w-32 sm:w-40 rounded-lg"
            loading="lazy"
          />
        </motion.div>

        {/* Card info */}
        <div className="flex flex-col justify-center gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-white truncate">{card.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${rarityStyle}`}>{card.rarity}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-bold ${gradeStyle}`}>{card.grade}</span>
          </div>

          <div className="space-y-1 text-sm">
            <div className="text-slate-300">
              GIH WR: <span className="text-white font-semibold">{card.gih_wr.toFixed(1)}%</span>
              <span className={`ml-2 ${card.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {card.delta >= 0 ? '▲' : '▼'} {Math.abs(card.delta).toFixed(1)}pp
              </span>
            </div>
            {card.best_archetype && (
              <div className="text-slate-400">
                Best in <span className="text-slate-200">{card.best_archetype}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
