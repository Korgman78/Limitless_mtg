import React from 'react';
import { Trophy } from 'lucide-react';
import type { PulseTrophyTrends } from './types';

interface Props {
  data: PulseTrophyTrends;
}

export const TrophyTrends: React.FC<Props> = ({ data }) => {
  const maxCount = Math.max(...data.top_archetypes.map(a => a.count), 1);

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        <Trophy className="w-4 h-4" />
        Trophy Trends
      </h3>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-white">{data.total_trophies}</span>
        <span className="text-sm text-slate-400">trophies this period</span>
      </div>

      {/* Top archetypes */}
      <div className="space-y-1.5">
        {data.top_archetypes.map(arch => (
          <div key={arch.name} className="flex items-center gap-2 text-sm">
            <span className="text-slate-300 w-28 truncate">{arch.name}</span>
            <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500/70 rounded-full"
                style={{ width: `${(arch.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-slate-200 text-xs w-8 text-right">{arch.count}</span>
          </div>
        ))}
      </div>

      {/* Gaining cards */}
      {data.gaining_cards.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-medium text-slate-400 mb-1">Popular Trophy Cards</div>
          {data.gaining_cards.map(c => (
            <div key={c.name} className="flex items-center gap-2 text-xs">
              <span className="text-slate-300 truncate flex-1">{c.name}</span>
              <span className="text-amber-400">{(c.freq * 100).toFixed(0)}% of decks</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
