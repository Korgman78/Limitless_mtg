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
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col h-full">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
        META SHARE
      </h3>

      <div className="space-y-2 flex-1 overflow-y-auto pr-4 custom-scrollbar">
        {pairStats.sort((a, b) => b.value - a.value).map(p => (
          <div key={p.code} className="flex items-center gap-3 text-xs">
            <div className="w-8 font-bold text-slate-400 tabular-nums">
              {p.code}
            </div>

            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500 ease-out"
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

      <div className="text-[9px] text-center text-slate-600 italic pt-2 border-t border-slate-800/50 mt-2">
        *Share of all 2-Color & 2-Color + Splash
      </div>
    </div>
  );
};
