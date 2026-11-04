import React, { useState } from 'react';
import { ArrowLeftRight, ChevronDown, Info, SlidersHorizontal } from 'lucide-react';
import { FORMAT_OPTIONS, PLAYER_LEVEL_OPTIONS } from '../../../constants';
import type { Axis, CompareSettings, Subject } from './compareModel';
import { formatLabel, formatShort, levelLabel, sideLabel } from './compareModel';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', className = '' }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={`inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 ${className}`}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex-1 whitespace-nowrap rounded-md font-bold transition-colors ${
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
            } ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'} ${
              o.disabled ? 'cursor-not-allowed opacity-40 hover:text-slate-400' : ''
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface SideSelectProps {
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (v: string) => void;
  ariaLabel: string;
  accent?: boolean;
}

const SideSelect: React.FC<SideSelectProps> = ({ value, options, onChange, ariaLabel, accent }) => (
  <div className="relative min-w-0 flex-1">
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full cursor-pointer appearance-none truncate rounded-lg border py-2 pl-3 pr-8 text-sm font-bold text-white outline-none transition-colors focus:border-indigo-400 ${
        accent ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-slate-700 bg-slate-800/60'
      }`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

interface CompareHeaderProps {
  settings: CompareSettings;
  onChange: (patch: Partial<CompareSettings>) => void;
  onSwap: () => void;
  /** Niveaux de joueur qui ont des donnees pour ce set/format. */
  availableLevels: Set<string>;
  baselines: Record<string, number>;
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** Filtres affiches en ligne sur desktop. */
  filters: React.ReactNode;
}

export const CompareHeader: React.FC<CompareHeaderProps> = ({
  settings: s, onChange, onSwap, availableLevels, baselines, activeFilterCount, onOpenFilters, filters,
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const isSkill = s.axis === 'skill';
  const isArchetypes = !isSkill && s.subject === 'archetypes';
  const isMeta = isArchetypes && s.metric === 'meta';

  const sideOptions = isSkill
    ? PLAYER_LEVEL_OPTIONS.map(o => ({
        value: o.value,
        label: availableLevels.has(o.value) ? `${o.label} players` : `${o.label} players (no data)`,
        disabled: !availableLevels.has(o.value),
      }))
    : FORMAT_OPTIONS.map(o => ({ value: o.value, label: o.label }));

  const subjectWord = isSkill || s.subject === 'cards' ? 'cards' : 'archetypes';
  const summary = isSkill
    ? `Which cards reward skill in ${formatLabel(s.skillFormat)}: ${levelLabel(s.b)} players compared with ${levelLabel(s.a)} players.`
    : isMeta
      ? `How much each archetype is played in ${formatLabel(s.b)} compared with ${formatLabel(s.a)}.`
      : `How ${subjectWord} perform when you move from ${formatLabel(s.a)} to ${formatLabel(s.b)}.`;

  const baseA = baselines[s.a], baseB = baselines[s.b];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-white md:text-xl">Compare</h2>
          <p className="mt-0.5 text-xs leading-snug text-slate-400 md:text-sm">{summary}</p>
        </div>
        <Segmented<Axis>
          className="w-full md:w-auto"
          value={s.axis}
          onChange={axis => onChange({ axis })}
          options={[
            { value: 'format', label: 'Between formats' },
            { value: 'skill', label: 'Between skill levels' },
          ]}
        />
      </div>

      {/* A -> B */}
      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
        {isSkill && (
          <div className="md:w-48">
            <SideSelect
              ariaLabel="Format"
              value={s.skillFormat}
              options={FORMAT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              onChange={v => onChange({ skillFormat: v })}
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SideSelect ariaLabel="Reference" value={s.a} options={sideOptions} onChange={v => onChange({ a: v })} />
          <button
            onClick={onSwap}
            aria-label="Swap the two sides"
            title="Swap"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-indigo-400 hover:text-white"
          >
            <ArrowLeftRight size={15} />
          </button>
          <SideSelect ariaLabel="Compared with" value={s.b} options={sideOptions} onChange={v => onChange({ b: v })} accent />
        </div>
      </div>

      {/* Sujet, metrique, filtres */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isSkill && (
          <Segmented<Subject>
            size="sm"
            value={s.subject}
            onChange={subject => onChange({ subject })}
            options={[
              { value: 'archetypes', label: 'Archetypes' },
              { value: 'cards', label: 'Cards' },
            ]}
          />
        )}
        {isArchetypes && (
          <Segmented<'wr' | 'meta'>
            size="sm"
            value={s.metric}
            onChange={metric => onChange({ metric })}
            options={[
              { value: 'wr', label: 'Win rate' },
              { value: 'meta', label: 'Meta share' },
            ]}
          />
        )}
        <button
          onClick={onOpenFilters}
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
          className="relative ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-200 md:hidden"
        >
          <SlidersHorizontal size={15} />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
          )}
        </button>
      </div>

      <div className="mt-3 hidden border-t border-slate-800 pt-3 md:block">{filters}</div>

      {/* Mode d'emploi, replie par defaut */}
      <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <button onClick={() => setShowHelp(v => !v)} className="inline-flex items-center gap-1 font-bold text-slate-400 hover:text-slate-200">
          <Info size={12} /> How to read
          {!isSkill && !isMeta && baseA != null && baseB != null && (
            <span className="ml-1 font-normal text-slate-500">
              · avg WR {formatShort(s.a)} {baseA.toFixed(1)}% → {formatShort(s.b)} {baseB.toFixed(1)}%
            </span>
          )}
        </button>
        {showHelp && (
          <p className="mt-1.5 max-w-3xl">
            <span className="mr-1 inline-block h-2 w-2 rounded-full border-2 border-slate-400 align-middle" /> {sideLabel(s, 'a')}
            <span className="mx-1.5 text-slate-600">→</span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" /> {sideLabel(s, 'b')}.{' '}
            <strong className="text-slate-300">Shift</strong> is the change from the first to the second side, in percentage points:
            positive (green) means it does better in {sideLabel(s, 'b')}.{' '}
            {!isSkill && !isMeta &&
              "Values are measured against each format's average win rate, so a format that is easier overall doesn't make every card look better. "}
            {isSkill &&
              "Better players win more with almost every card, so each level is measured against its own average: a positive shift means the card rewards skill more than usual. "}
            {!isSkill && 'Rows with too few games in either format are hidden by default: their shift is mostly noise.'}
          </p>
        )}
      </div>
    </section>
  );
};
