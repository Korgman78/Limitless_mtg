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

interface Props {
  data: MetaPulseData;
}

export const MetaPulseHeader: React.FC<Props> = ({ data }) => {
  const { format_label, period, total_games, format_health } = data;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/40 rounded-lg p-3 text-center">
          <Activity className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500">Format</div>
          <div className="text-sm font-medium text-slate-200">{format_label}</div>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 text-center">
          <Calendar className="w-4 h-4 text-slate-500 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500">Period</div>
          <div className="text-sm font-medium text-slate-200">
            {period.from} <span className="text-slate-600">&rarr;</span> {period.to}
          </div>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 text-center">
          <Gamepad2 className="w-4 h-4 text-slate-500 mx-auto mb-1" />
          <div className="text-[10px] text-slate-500">Sample</div>
          <div className="text-sm font-medium text-slate-200">{total_games.toLocaleString()}</div>
        </div>
      </div>

      {/* Format Health */}
      {format_health && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
          <span className="text-sm font-medium text-slate-300">Format Health</span>

          {/* Archetype score bar */}
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

          {/* Color score bar */}
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
