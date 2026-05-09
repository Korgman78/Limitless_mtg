import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import type { MovingArchetype } from './types';

interface Props {
  rising: MovingArchetype[];
  falling: MovingArchetype[];
}

const ArchetypeRow: React.FC<{
  arch: MovingArchetype;
  isRising: boolean;
  index: number;
  maxShare: number;
}> = ({ arch, isRising, index, maxShare }) => {
  const shareDelta = typeof arch.meta_share_delta === 'number' ? arch.meta_share_delta : null;
  const shareDeltaPositive = (shareDelta ?? 0) >= 0;
  const shareDeltaColor = shareDeltaPositive ? 'text-emerald-400' : 'text-red-400';
  const normalizedWidth = maxShare > 0 ? Math.max(8, (arch.meta_share / maxShare) * 100) : 8;

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

        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isRising ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
              style={{ width: `${normalizedWidth}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 w-9 text-right flex-shrink-0">
            {(arch.meta_share * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-bold ${shareDeltaColor}`}>
          {shareDelta != null ? `${shareDelta >= 0 ? '+' : ''}${(shareDelta * 100).toFixed(1)}pp` : 'n/a'}
        </div>
        <div className="text-[10px] text-slate-500">
          WR {arch.wr_delta >= 0 ? '+' : ''}{arch.wr_delta.toFixed(1)}pp
        </div>
      </div>
    </motion.div>
  );
};

export const MovingArchetypes: React.FC<Props> = ({ rising, falling }) => {
  const filteredRising = useMemo(() => rising.filter(a => a.meta_share >= 0.01), [rising]);
  const filteredFalling = useMemo(() => falling.filter(a => a.meta_share >= 0.01), [falling]);

  if (filteredRising.length === 0 && filteredFalling.length === 0) return null;

  const maxShare = useMemo(() => {
    const all = [...filteredRising, ...filteredFalling];
    if (all.length === 0) return 0;
    return all.reduce((acc, cur) => Math.max(acc, cur.meta_share || 0), 0);
  }, [filteredRising, filteredFalling]);

  return (
    <div className="space-y-3 p-4 bg-slate-900/45 border border-slate-800 rounded-xl">
      <div>
        <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
          Moving Archetypes
        </h3>
        <p className="text-xs text-slate-500 mt-1">Meta share shifts between this period and the previous one.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" /> Rising
          </div>
          {filteredRising.length > 0 ? filteredRising.map((arch, i) => (
            <ArchetypeRow key={arch.colors} arch={arch} isRising index={i} maxShare={maxShare} />
          )) : <div className="text-xs text-slate-500 p-2">No rising archetype this period.</div>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <TrendingDown className="w-3.5 h-3.5" /> Falling
          </div>
          {filteredFalling.length > 0 ? filteredFalling.map((arch, i) => (
            <ArchetypeRow key={arch.colors} arch={arch} isRising={false} index={i} maxShare={maxShare} />
          )) : <div className="text-xs text-slate-500 p-2">No falling archetype this period.</div>}
        </div>
      </div>
    </div>
  );
};
