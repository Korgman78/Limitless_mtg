import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Calendar, Gamepad2 } from 'lucide-react';
import type { MetaPulseData } from './types';

const scoreColor = (score: number): string => {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 5) return 'bg-lime-500';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-red-500';
};

const DeltaSpan: React.FC<{ delta: number }> = ({ delta }) => {
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <motion.span
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className={`ml-1.5 text-xs font-bold ${positive ? 'text-emerald-400' : 'text-red-400'}`}
    >
      {positive ? '+' : ''}{delta.toFixed(1)}
    </motion.span>
  );
};

const formatDateLabel = (isoDate: string): string => {
  const d = new Date(isoDate);
  if (!Number.isFinite(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface Props {
  data: MetaPulseData;
}

export const MetaPulseHeader: React.FC<Props> = ({ data }) => {
  const { format_label, period, total_games, format_health, period_sample, lifetime_games } = data;
  const periodSample = typeof period_sample === 'number' ? period_sample : null;
  const lifetimeSample = typeof lifetime_games === 'number' ? lifetime_games : total_games;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-800/40 rounded-lg p-3 text-center border border-slate-700/40">
          <Activity className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Format</div>
          <div className="text-sm font-medium text-slate-200">{format_label}</div>
        </div>

        <div className="bg-slate-800/40 rounded-lg p-3 text-center border border-slate-700/40">
          <Calendar className="w-4 h-4 text-slate-500 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Period</div>
          <div className="text-sm font-medium text-slate-200">
            {formatDateLabel(period.from)} <span className="text-slate-600">to</span> {formatDateLabel(period.to)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {period.from} to {period.to}
          </div>
        </div>

        <div className="bg-slate-800/40 rounded-lg p-3 text-center border border-slate-700/40">
          <Gamepad2 className="w-4 h-4 text-slate-500 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Period Sample</div>
          <div className="text-sm font-medium text-slate-200">
            {periodSample !== null ? periodSample.toLocaleString() : '-'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Lifetime: {lifetimeSample.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 uppercase tracking-wide">
          All deltas compare to previous period
        </span>
        <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-300 uppercase tracking-wide">
          WR metrics use rolling history
        </span>
      </div>

      {format_health && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-300">Format Health (lifetime snapshot)</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Not period-scoped</span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Archetype Balance</span>
              <span className="flex items-center font-medium text-slate-300">
                {format_health.archetype_score}/10
                <DeltaSpan delta={format_health.archetype_delta} />
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${format_health.archetype_score * 10}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${scoreColor(format_health.archetype_score)}`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Color Balance</span>
              <span className="flex items-center font-medium text-slate-300">
                {format_health.color_score}/10
                <DeltaSpan delta={format_health.color_delta} />
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${format_health.color_score * 10}%` }}
                transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                className={`h-full rounded-full ${scoreColor(format_health.color_score)}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
