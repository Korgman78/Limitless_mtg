import React from 'react';
import { MessageCircle } from 'lucide-react';
import type { PulseCommunityBuzz } from './types';

interface Props {
  items: PulseCommunityBuzz[];
}

export const CommunityBuzz: React.FC<Props> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        <MessageCircle className="w-4 h-4" />
        Community Buzz
      </h3>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{item.title}</div>
              <div className="text-xs text-slate-500">{item.source}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.sentiment_pct >= 70 ? 'bg-emerald-500' : item.sentiment_pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${item.sentiment_pct}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right">{item.sentiment_pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
