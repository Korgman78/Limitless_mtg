import React from 'react';
import { Zap } from 'lucide-react';
import { getCardImage } from '../../../utils/helpers';
import type { PulseSynergy } from './types';

interface Props {
  synergies: PulseSynergy[];
}

export const SynergySpotlight: React.FC<Props> = ({ synergies }) => {
  if (synergies.length === 0) return null;

  return (
    <div className="space-y-3 p-4 bg-slate-900/45 border border-slate-800 rounded-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            Synergy Spotlight
          </h3>
          <p className="text-xs text-slate-500 mt-1">Top synergy pairs for this format snapshot.</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-400 uppercase tracking-wide">
          Global snapshot
        </span>
      </div>

      <div className="space-y-3">
        {synergies.slice(0, 5).map((syn, i) => (
          <div
            key={`${syn.card_a}-${syn.card_b}-${i}`}
            className="flex items-center gap-3 p-2.5 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            <img
              src={getCardImage(syn.card_a)}
              alt={syn.card_a}
              className="w-16 h-auto rounded flex-shrink-0"
              loading="lazy"
            />
            <div className="w-6 h-6 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
              <Zap className="w-3 h-3 text-amber-400" />
            </div>
            <img
              src={getCardImage(syn.card_b)}
              alt={syn.card_b}
              className="w-16 h-auto rounded flex-shrink-0"
              loading="lazy"
            />
            <div className="flex flex-col gap-0.5 ml-auto text-right flex-shrink-0">
              <span className="text-sm font-bold text-amber-400">+{syn.lift.toFixed(0)}%</span>
              {syn.archetype && (
                <span className="text-xs text-slate-500">{syn.archetype}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
