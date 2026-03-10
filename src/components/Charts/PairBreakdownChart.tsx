import React from 'react';
import type { PairBreakdownChartProps, Deck, ColorPair } from '../../types';
import { PAIRS } from '../../constants';
import { extractColors, areColorsEqual } from '../../utils/helpers';

export const PairBreakdownChart: React.FC<PairBreakdownChartProps> = ({ decks }) => {
  const totalBicoloreGames = decks.reduce((acc: number, d: Deck) => {
    if (d.type === 'Two colors' || d.type === 'Two colors + splash') {
      return acc + d.games;
    }
    return acc;
  }, 0);

  const pairStats = PAIRS.map((pair: ColorPair) => {
    const pairGames = decks
      .filter((d: Deck) => {
        const deckColors = extractColors(d.colors);
        const isPair = areColorsEqual(deckColors, pair.code);
        const isCorrectType = d.type === 'Two colors' || d.type === 'Two colors + splash';
        return isPair && isCorrectType;
      })
      .reduce((acc: number, curr: Deck) => acc + curr.games, 0);

    return { ...pair, value: pairGames };
  });

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_40px_-38px_rgba(99,102,241,0.28)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(99,102,241,0.08),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(2,6,23,0.18))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-white/20 to-transparent" />

      <h3 className="relative mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
        META SHARE
      </h3>

      <div className="relative flex-1 space-y-2 overflow-y-auto pr-4 custom-scrollbar">
        {pairStats.sort((a, b) => b.value - a.value).map(p => (
          <div key={p.code} className="flex items-center gap-3 text-xs">
            <div className="w-8 font-bold text-slate-400 tabular-nums">
              {p.code}
            </div>

            <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800/90 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                style={{
                  width: totalBicoloreGames > 0
                    ? `${Math.min(((p.value / totalBicoloreGames) * 100) * 2, 100)}%`
                    : '0%'
                }}
              />
            </div>

            <div className="w-12 text-right font-mono text-slate-300 tabular-nums text-[10px] flex-shrink-0">
              {totalBicoloreGames > 0 ? ((p.value / totalBicoloreGames) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-center text-slate-400 italic pt-2 border-t border-slate-800/50 mt-2">
        *Share of all 2-Color & 2-Color + Splash
      </div>
    </div>
  );
};
