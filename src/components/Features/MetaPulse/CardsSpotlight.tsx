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
  const glowColor = isRising ? 'border-emerald-500/40 shadow-emerald-500/10' : 'border-red-500/40 shadow-red-500/10';
  const labelColor = isRising ? 'text-emerald-400' : 'text-red-400';
  const deltaColor = isRising ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${labelColor}`}>
        <Icon className="w-4 h-4" />
        {isRising ? 'Rising' : 'Falling'}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.name}
            initial={{ opacity: 0, y: isRising ? 16 : -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className={`relative rounded-xl overflow-hidden border shadow-lg ${glowColor} bg-slate-800/50`}
          >
            <img
              src={getCardImage(card.name)}
              alt={card.name}
              className="w-full aspect-[488/680] object-cover"
              loading="lazy"
            />

            {/* Stats overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 py-2">
              <div className="space-y-0.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-white">
                    {card.gih_wr.toFixed(1)}%
                  </span>
                  <span className={`text-[11px] font-bold ${deltaColor}`}>
                    {card.wr_delta >= 0 ? '+' : ''}{card.wr_delta.toFixed(1)}pp
                  </span>
                </div>

                {card.alsa != null && card.alsa_delta != null && (
                  <div className="flex items-baseline justify-between text-[10px]">
                    <span className="text-slate-400">P{card.alsa.toFixed(1)}</span>
                    <span className={card.alsa_delta <= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {card.alsa_delta <= 0 ? '' : '+'}{card.alsa_delta.toFixed(1)}
                    </span>
                  </div>
                )}

                {card.trophy_freq_delta != null && card.trophy_freq_delta !== 0 && (
                  <div className={`text-[10px] font-medium ${card.trophy_freq_delta > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    Trophy {card.trophy_freq_delta > 0 ? '+' : ''}{(card.trophy_freq_delta * 100).toFixed(0)}%
                  </div>
                )}
              </div>
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
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">
        Cards Spotlight
      </h3>
      <SpotlightRow cards={rising} direction="rising" />
      <SpotlightRow cards={falling} direction="falling" />
    </div>
  );
};
