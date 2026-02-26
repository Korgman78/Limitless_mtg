import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import type { MovingArchetype } from './types';

interface Props {
  rising: MovingArchetype[];
  falling: MovingArchetype[];
}

const ArchetypeRow: React.FC<{ arch: MovingArchetype; isRising: boolean; index: number }> = ({ arch, isRising, index }) => {
  const deltaColor = isRising ? 'text-emerald-400' : 'text-red-400';
  // Normalize bar: 10% meta share = full width
  const barWidth = Math.min(arch.meta_share * 100 / 10 * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: isRising ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="flex items-center gap-3 p-2.5 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
    >
      <ManaIcons colors={arch.colors} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200 truncate">{arch.name}</span>
          <span className="text-xs font-medium text-slate-300">{arch.wr.toFixed(1)}%</span>
        </div>

        {/* Meta share bar with label */}
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isRising ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 w-8 text-right flex-shrink-0">
            {(arch.meta_share * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-bold ${deltaColor}`}>
          {arch.wr_delta >= 0 ? '+' : ''}{arch.wr_delta.toFixed(1)}pp
        </div>
        {arch.games_delta !== 0 && (
          <div className="text-[10px] text-slate-500">
            {arch.games_delta > 0 ? '+' : ''}{arch.games_delta.toLocaleString()} games
          </div>
        )}
      </div>
    </motion.div>
  );
};

export const MovingArchetypes: React.FC<Props> = ({ rising, falling }) => {
  if (rising.length === 0 && falling.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        Moving Archetypes
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rising.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" /> Rising
            </div>
            {rising.map((arch, i) => (
              <ArchetypeRow key={arch.colors} arch={arch} isRising index={i} />
            ))}
          </div>
        )}

        {falling.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <TrendingDown className="w-3.5 h-3.5" /> Falling
            </div>
            {falling.map((arch, i) => (
              <ArchetypeRow key={arch.colors} arch={arch} isRising={false} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
