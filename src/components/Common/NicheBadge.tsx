import React from 'react';
import { Crosshair } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { describeNiche, type NicheInfo } from '../../queries/useFormatNiche';
import { sortColorsWUBRG } from '../../utils/helpers';

interface NicheBadgeProps {
  info: NicheInfo;
  /** "list": partner + gap, for the Cards-tab rows. "detail": NICHE label, as the FLEX badge. */
  variant?: 'list' | 'detail';
}

// Small mana symbols: ManaIcons' smallest size is too big for a 9px badge.
const Symbols: React.FC<{ colors: string }> = ({ colors }) => (
  <span className="inline-flex -space-x-1">
    {sortColorsWUBRG(colors).split('').map(c => (
      <img key={c} src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} alt={c} className="w-3.5 h-3.5" loading="lazy" />
    ))}
  </span>
);

/**
 * Badge of a NICHE card. A mono-colour card shows only its partner colour (its
 * own colour is already displayed next to it); a colourless card shows its home
 * pair, having no colour of its own.
 */
export const NicheBadge: React.FC<NicheBadgeProps> = ({ info, variant = 'list' }) => {
  const shown = info.partner ?? info.home;

  return (
    <Tooltip position="bottom" content={
      <div className="text-center max-w-[220px]">
        <div className="text-[10px] font-bold text-teal-300 mb-1">Niche card</div>
        <div className="text-[9px] text-slate-300 leading-relaxed">
          {info.partner
            ? `Over-performs alongside ${info.partner} and is ordinary without it: a hidden ${sortColorsWUBRG(info.home)} card.`
            : `Colourless, but over-performs in ${sortColorsWUBRG(info.home)} and is ordinary in the other pairs.`}
        </div>
        <div className="text-[8px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-700/60">
          {describeNiche(info)}
          <span className="block font-bold text-teal-300/90 mt-0.5">Gap +{info.gap.toFixed(1)} pts</span>
        </div>
      </div>
    }>
      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-black tracking-wide text-teal-300 border-teal-500/40 bg-teal-500/10 cursor-help">
        {variant === 'detail' ? (
          <>
            <Crosshair size={9} className="text-teal-400" />
            NICHE
            <Symbols colors={shown} />
          </>
        ) : (
          <>
            {info.partner && '+'}
            <Symbols colors={shown} />
            +{info.gap.toFixed(1)}
          </>
        )}
      </span>
    </Tooltip>
  );
};
