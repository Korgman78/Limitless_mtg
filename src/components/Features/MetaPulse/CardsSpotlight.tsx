import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { getCardImage } from '../../../utils/helpers';
import type { SpotlightCard } from './types';

interface Props {
  rising: SpotlightCard[];
  falling: SpotlightCard[];
}

const SpotlightRow: React.FC<{
  cards: SpotlightCard[];
  direction: 'rising' | 'falling';
}> = ({ cards, direction }) => {
  if (cards.length === 0) return null;

  const isRising = direction === 'rising';
  const Icon = isRising ? TrendingUp : TrendingDown;
  const glowColor = isRising
    ? 'border-emerald-500/40 shadow-emerald-500/10'
    : 'border-red-500/40 shadow-red-500/10';
  const labelColor = isRising ? 'text-emerald-400' : 'text-red-400';
  const deltaBg = isRising
    ? 'bg-emerald-500/20 text-emerald-300'
    : 'bg-red-500/20 text-red-300';

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${labelColor}`}>
        <Icon className="w-4 h-4" />
        {isRising ? 'Rising' : 'Falling'}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.name}
            initial={{ opacity: 0, y: isRising ? 16 : -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className={`rounded-xl overflow-hidden border shadow-lg ${glowColor} bg-slate-800/60`}
          >
            <div className="relative">
              <img
                src={getCardImage(card.name)}
                alt={card.name}
                className="w-full aspect-[488/680] object-cover"
                loading="lazy"
              />
              <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-xs font-bold backdrop-blur-sm ${
                card.gih_wr >= 57 ? 'bg-emerald-600/80 text-white' :
                card.gih_wr >= 53 ? 'bg-slate-700/80 text-slate-200' :
                'bg-red-600/80 text-white'
              }`}>
                {card.gih_wr.toFixed(1)}%
              </div>
            </div>

            <div className="px-2.5 py-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">WR Delta</span>
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${deltaBg}`}>
                  {card.wr_delta >= 0 ? '+' : ''}{card.wr_delta.toFixed(1)}pp
                </span>
              </div>

              {card.alsa != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Pick (ALSA)</span>
                  <span className="text-xs text-slate-300">
                    P{card.alsa.toFixed(1)}{' '}
                    {card.alsa_delta != null && (
                      <span className={`font-medium ${card.alsa_delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ({card.alsa_delta <= 0 ? '' : '+'}{card.alsa_delta.toFixed(1)})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {card.trophy_freq_delta != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Trophy Delta</span>
                  <span className={`text-xs font-medium ${card.trophy_freq_delta > 0 ? 'text-amber-400' : card.trophy_freq_delta < 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                    {card.trophy_freq_delta > 0 ? '+' : ''}{(card.trophy_freq_delta * 100).toFixed(1)}pp
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export const CardsSpotlight: React.FC<Props> = ({ rising, falling }) => {
  if (rising.length === 0 && falling.length === 0) return null;

  return (
    <div className="space-y-5 p-4 bg-slate-900/45 border border-slate-800 rounded-xl">
      <div>
        <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
          Cards Spotlight
        </h3>
        <p className="text-xs text-slate-500 mt-1">Top movers by WR delta, trophy share shift and pick trend.</p>
      </div>
      <SpotlightRow cards={rising} direction="rising" />
      <SpotlightRow cards={falling} direction="falling" />
    </div>
  );
};
