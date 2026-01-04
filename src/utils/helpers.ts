import type { GradeResult } from '../types';

export const areColorsEqual = (c1: string | null | undefined, c2: string | null | undefined): boolean => {
  if (!c1 || !c2) return false;
  const s1 = c1.replace(/[^WUBRG]/g, '').split('').sort().join('');
  const s2 = c2.replace(/[^WUBRG]/g, '').split('').sort().join('');
  return s1 === s2;
};

export const extractColors = (s: string | null | undefined): string => {
  if (!s) return "";
  return s.replace(' + Splash', '').replace(/[^WUBRG]/g, '');
};

export const normalizeRarity = (r: string | null | undefined): string => {
  if (!r) return 'C';
  const first = r.charAt(0).toUpperCase();
  return ['M', 'R', 'U', 'C'].includes(first) ? first : 'C';
};

export const getDeltaStyle = (wr: number | null | undefined, avgWr: number | null | undefined): string => {
  if (!wr || !avgWr) return 'text-slate-500';
  const delta = wr - avgWr;

  if (delta >= 9.0) return 'text-purple-400 font-black drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]';
  if (delta >= 6.0) return 'text-emerald-500 font-extrabold';
  if (delta >= 3.0) return 'text-emerald-400 font-bold';
  if (delta >= 0.0) return 'text-lime-400 font-bold';
  if (delta >= -3.0) return 'text-yellow-400 font-medium';
  if (delta >= -6.0) return 'text-orange-400 font-medium';
  if (delta >= -9.0) return 'text-red-400 font-medium';
  return 'text-red-800 font-bold opacity-80';
};

export const calculateGrade = (cardArchWr: number | null | undefined, deckMeanWr: number | null | undefined): GradeResult => {
  if (!cardArchWr || !deckMeanWr) return { letter: '-', color: 'text-slate-500' };
  const delta = cardArchWr - deckMeanWr;

  if (delta >= 5.5) return { letter: 'S', color: 'text-purple-400 border-purple-500 bg-purple-500/20' };
  if (delta >= 3.0) return { letter: 'A', color: 'text-emerald-400 border-emerald-500 bg-emerald-500/20' };
  if (delta >= 0.5) return { letter: 'B', color: 'text-lime-400 border-lime-500 bg-lime-500/20' };
  if (delta >= -1.5) return { letter: 'C', color: 'text-yellow-400 border-yellow-500 bg-yellow-500/20' };
  if (delta >= -3.5) return { letter: 'D', color: 'text-orange-400 border-orange-500 bg-orange-500/20' };

  return { letter: 'F', color: 'text-red-700 border-red-800 bg-red-900/20' };
};

export const getCardImage = (name: string): string =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=border_crop`;
