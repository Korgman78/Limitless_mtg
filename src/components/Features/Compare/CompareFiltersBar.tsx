import React from 'react';
import { Search, X } from 'lucide-react';
import { RARITY_STYLES } from '../../../constants';
import type { ArchType, CompareFilters } from './compareModel';

const COLOR_CHIPS = ['W', 'U', 'B', 'R', 'G'];
const RARITY_CHIPS = [
  { value: 'M', label: 'Mythic' },
  { value: 'R', label: 'Rare' },
  { value: 'U', label: 'Uncommon' },
  { value: 'C', label: 'Common' },
];
const ARCH_TYPES: { value: ArchType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '2color', label: '2 colours' },
  { value: 'splash', label: '2 colours + splash' },
  { value: '3color', label: '3 colours' },
];

export const countActiveFilters = (f: CompareFilters, isCards: boolean) =>
  isCards ? f.colors.length + f.rarities.length + (f.search ? 1 : 0) : f.archType !== 'all' ? 1 : 0;

interface Props {
  filters: CompareFilters;
  onChange: (patch: Partial<CompareFilters>) => void;
  isCards: boolean;
  /** Pas de taille d'echantillon par niveau de joueur : option masquee. */
  showSampleToggle: boolean;
  hiddenSmall: number;
  /** Disposition verticale (panneau mobile). */
  stacked?: boolean;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

const chipBase = 'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors';
const chipOff = 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200';

export const CompareFiltersBar: React.FC<Props> = ({ filters: f, onChange, isCards, showSampleToggle, hiddenSmall, stacked }) => {
  const hasCardFilters = f.colors.length > 0 || f.rarities.length > 0;
  return (
    <div className={`flex gap-3 ${stacked ? 'flex-col' : 'flex-wrap items-center'}`}>
      {isCards ? (
        <>
          <div className={`relative ${stacked ? 'w-full' : 'w-56'}`}>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={f.search}
              onChange={e => onChange({ search: e.target.value })}
              placeholder="Search a card…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-indigo-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Colours">
            {COLOR_CHIPS.map(c => {
              const on = f.colors.includes(c);
              return (
                <button
                  key={c}
                  aria-pressed={on}
                  aria-label={`Colour ${c}`}
                  onClick={() => onChange({ colors: toggle(f.colors, c) })}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${on ? 'border-white' : 'border-transparent opacity-50 grayscale hover:opacity-80'}`}
                >
                  <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} alt="" className="h-full w-full" />
                </button>
              );
            })}
            <button
              aria-pressed={f.colors.includes('multi')}
              onClick={() => onChange({ colors: toggle(f.colors, 'multi') })}
              className={`${chipBase} ${f.colors.includes('multi') ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : chipOff}`}
            >
              Multicolour
            </button>
            <button
              aria-pressed={f.colors.includes('colorless')}
              onClick={() => onChange({ colors: toggle(f.colors, 'colorless') })}
              className={`${chipBase} ${f.colors.includes('colorless') ? 'border-slate-300/60 bg-slate-300/10 text-slate-200' : chipOff}`}
            >
              Colourless
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rarity">
            {RARITY_CHIPS.map(r => {
              const on = f.rarities.includes(r.value);
              return (
                <button
                  key={r.value}
                  aria-pressed={on}
                  onClick={() => onChange({ rarities: toggle(f.rarities, r.value) })}
                  className={`${chipBase} ${on ? RARITY_STYLES[r.value] : chipOff}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {hasCardFilters && (
            <button
              onClick={() => onChange({ colors: [], rarities: [] })}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white"
            >
              <X size={12} /> Clear
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Archetype type">
          {ARCH_TYPES.map(t => (
            <button
              key={t.value}
              aria-pressed={f.archType === t.value}
              onClick={() => onChange({ archType: t.value })}
              className={`${chipBase} ${f.archType === t.value ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200' : chipOff}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {showSampleToggle && (
        <label className={`inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-400 ${stacked ? '' : 'ml-auto'}`}>
          <input
            type="checkbox"
            checked={f.hideSmallSamples}
            onChange={e => onChange({ hideSmallSamples: e.target.checked })}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          Hide small samples
          {f.hideSmallSamples && hiddenSmall > 0 && <span className="font-normal text-slate-500">({hiddenSmall} hidden)</span>}
        </label>
      )}
    </div>
  );
};
