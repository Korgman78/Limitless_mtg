import type { FormatOption, ColorPair } from './types';

// Sets under 17lands embargo (data is scraped but hidden in prod)
// Remove a set code from this list to make it visible
export const EMBARGOED_SETS: string[] = [
  // 'INR',  // Example: Innistrad Remastered
];

export const FORMAT_OPTIONS: FormatOption[] = [
  { label: 'Premier Draft', value: 'PremierDraft', short: 'PD' },
  { label: 'Trad. Draft', value: 'TradDraft', short: 'TD' },
  { label: 'Sealed', value: 'Sealed', short: 'SEA' },
  { label: 'Arena Direct Sealed', value: 'ArenaDirect_Sealed', short: 'ADS' },
];

export const PAIRS: ColorPair[] = [
  { code: 'WU', name: 'Azorius (WU)' },
  { code: 'UB', name: 'Dimir (UB)' },
  { code: 'BR', name: 'Rakdos (BR)' },
  { code: 'RG', name: 'Gruul (RG)' },
  { code: 'WG', name: 'Selesnya (GW)' },
  { code: 'WB', name: 'Orzhov (WB)' },
  { code: 'UR', name: 'Izzet (UR)' },
  { code: 'BG', name: 'Golgari (BG)' },
  { code: 'WR', name: 'Boros (RW)' },
  { code: 'UG', name: 'Simic (GU)' }
];

export const TRIOS: ColorPair[] = [
  { code: 'WUB', name: 'Esper (WUB)' }, { code: 'WUR', name: 'Jeskai (WUR)' }, { code: 'WUG', name: 'Bant (WUG)' },
  { code: 'WBR', name: 'Mardu (WBR)' }, { code: 'WBG', name: 'Abzan (WBG)' }, { code: 'WRG', name: 'Naya (WRG)' },
  { code: 'UBR', name: 'Grixis (UBR)' }, { code: 'UBG', name: 'Sultai (UBG)' }, { code: 'URG', name: 'Temur (URG)' },
  { code: 'BRG', name: 'Jund (BRG)' }
];

export const RARITY_STYLES: Record<string, string> = {
  M: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
  R: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  U: 'text-blue-300 border-blue-300/30 bg-blue-300/10',
  C: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
};
