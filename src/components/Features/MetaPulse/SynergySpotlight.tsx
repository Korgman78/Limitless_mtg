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
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        <Zap className="w-4 h-4" />
        Synergy Spotlight
      </h3>

      <div className="space-y-3">
        {synergies.slice(0, 5).map((syn, i) => (
          <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
            <img
              src={getCardImage(syn.card_a)}
              alt={syn.card_a}
              className="w-16 h-auto rounded"
              loading="lazy"
            />
            <span className="text-slate-500 text-xs">+</span>
            <img
              src={getCardImage(syn.card_b)}
              alt={syn.card_b}
              className="w-16 h-auto rounded"
              loading="lazy"
            />
            <div className="flex flex-col gap-0.5 ml-auto text-right">
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
