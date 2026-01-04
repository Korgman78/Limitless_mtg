import React from 'react';
import type { ManaIconsProps } from '../../types';

export const ManaIcons: React.FC<ManaIconsProps> = ({ colors, size = "md", isSplash = false }) => {
  const sizeClass = size === "lg" ? "w-6 h-6" : "w-5 h-5";
  const cleanColors = (!colors) ? [] : colors.replace(/[^WUBRG]/g, '').split('');

  return (
    <div className="flex -space-x-1.5 items-center relative z-0">
      {cleanColors.map((sym: string, i: number) => (
        <div key={sym} className="relative rounded-full shadow-sm" style={{ zIndex: 20 - i }}>
          <img src={`https://svgs.scryfall.io/card-symbols/${sym}.svg`} alt={sym} className={`${sizeClass} drop-shadow-md`} loading="lazy" />
        </div>
      ))}
      {isSplash && <div className={`${sizeClass} rounded-full z-0 bg-transparent border-2 border-dashed border-amber-400 opacity-80 box-border ml-1`} title="Splash" />}
    </div>
  );
};
