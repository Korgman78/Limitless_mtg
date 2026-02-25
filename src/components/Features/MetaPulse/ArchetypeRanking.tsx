import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import type { PulseArchetype } from './types';

interface Props {
  top: PulseArchetype[];
  rising: PulseArchetype[];
  falling: PulseArchetype[];
}

const DeltaBadge: React.FC<{ delta: number }> = ({ delta }) => {
  if (Math.abs(delta) < 0.1) return null;
  const positive = delta > 0;
  return (
    <span className={`text-xs font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
    </span>
  );
};

export const ArchetypeRanking: React.FC<Props> = ({ top, rising, falling }) => {
  const maxWr = Math.max(...top.map(a => a.wr), 55);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Top Archetypes</h3>

      <div className="space-y-2">
        {top.map((arch, i) => (
          <div key={arch.colors} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
            <span className="text-sm font-bold text-slate-500 w-5 text-center">{i + 1}</span>
            <ManaIcons colors={arch.colors} size="sm" />
            <span className="text-sm text-slate-200 flex-shrink-0 w-28 truncate">{arch.name}</span>
            <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${(arch.wr / maxWr) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-white w-14 text-right">{arch.wr.toFixed(1)}%</span>
            <div className="w-12">
              <DeltaBadge delta={arch.delta} />
            </div>
          </div>
        ))}
      </div>

      {/* Rising / Falling movers */}
      {(rising.length > 0 || falling.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {rising.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <TrendingUp className="w-3.5 h-3.5" /> Rising
              </div>
              {rising.map(a => (
                <div key={a.colors} className="flex items-center gap-2 text-xs">
                  <ManaIcons colors={a.colors} size="sm" />
                  <span className="text-slate-300 truncate">{a.name}</span>
                  <span className="text-emerald-400 ml-auto">+{a.delta.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
          {falling.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-red-400 font-medium">
                <TrendingDown className="w-3.5 h-3.5" /> Falling
              </div>
              {falling.map(a => (
                <div key={a.colors} className="flex items-center gap-2 text-xs">
                  <ManaIcons colors={a.colors} size="sm" />
                  <span className="text-slate-300 truncate">{a.name}</span>
                  <span className="text-red-400 ml-auto">{a.delta.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
