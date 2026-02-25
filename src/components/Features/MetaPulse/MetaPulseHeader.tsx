import React from 'react';
import { Activity, Calendar, Gamepad2 } from 'lucide-react';
import type { MetaPulseData } from './types';

const scoreColor = (score: number): string => {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 5) return 'bg-lime-500';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-red-500';
};

const classificationStyle: Record<string, string> = {
  PRINCE: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  BALANCED: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  PAUPER: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
};

interface Props {
  data: MetaPulseData;
}

export const MetaPulseHeader: React.FC<Props> = ({ data }) => {
  const { format_label, period, total_games, format_health } = data;

  return (
    <div className="space-y-4">
      {/* Format + Period */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span className="flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-indigo-400" />
          {format_label}
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-slate-500" />
          {period.from} → {period.to}
        </span>
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="w-4 h-4 text-slate-500" />
          {total_games.toLocaleString()} games
        </span>
      </div>

      {/* Format Health */}
      {format_health && (
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">Format Health</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${classificationStyle[format_health.classification] || classificationStyle.BALANCED}`}>
              {format_health.classification}
            </span>
          </div>

          {/* Archetype score bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Archetype Balance</span>
              <span>{format_health.archetype_score}/10</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColor(format_health.archetype_score)}`}
                style={{ width: `${format_health.archetype_score * 10}%` }}
              />
            </div>
          </div>

          {/* Color score bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Color Balance</span>
              <span>{format_health.color_score}/10</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreColor(format_health.color_score)}`}
                style={{ width: `${format_health.color_score * 10}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
