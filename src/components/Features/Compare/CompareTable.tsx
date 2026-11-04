import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import CardImage from '../../Common/CardImage';
import { getCardImage } from '../../../utils/helpers';
import { Dumbbell } from './Dumbbell';
import type { CompareRow, CompareSettings, SortKey } from './compareModel';
import { fmtGames, fmtShift, fmtValue, shiftTone, sideShort, TONE_TEXT, valueKind } from './compareModel';

interface Props {
  rows: CompareRow[];
  settings: CompareSettings;
  domain: [number, number];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onSelect: (row: CompareRow) => void;
  showGames: boolean;
}

const PAGE = 40;
const GRID = 'grid grid-cols-[minmax(0,2.4fr)_76px_76px_minmax(140px,2fr)_70px_64px] items-center gap-3';
const GRID_NO_GAMES = 'grid grid-cols-[minmax(0,2.4fr)_76px_76px_minmax(140px,2fr)_70px] items-center gap-3';

const Thumb: React.FC<{ row: CompareRow; size: 'sm' | 'md' }> = ({ row, size }) =>
  row.kind === 'card' ? (
    <CardImage
      src={getCardImage(row.id)}
      alt=""
      className={`${size === 'md' ? 'h-10 w-7' : 'h-9 w-[26px]'} flex-shrink-0 rounded-[4px] border border-slate-700 bg-black object-cover`}
    />
  ) : (
    <span className="flex-shrink-0"><ManaIcons colors={row.colors} size="md" isSplash={row.isSplash} /></span>
  );

interface SortHeaderProps {
  k: SortKey;
  label: string;
  align?: 'left' | 'right';
  title?: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({ k, label, align = 'right', title, sortKey, sortDir, onSort }) => {
  const active = sortKey === k;
  return (
    <button
      onClick={() => onSort(k)}
      title={title}
      aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
        active ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
      } ${align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      {label}
      {active && (sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
    </button>
  );
};

export const CompareTable: React.FC<Props> = ({ rows, settings, domain, sortKey, sortDir, onSort, onSelect, showGames }) => {
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const kind = valueKind(settings);
  const reference = kind === 'delta' ? 0 : null;

  useEffect(() => { setVisible(PAGE); }, [rows]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) setVisible(v => v + PAGE); }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rows, visible]);

  const shown = rows.slice(0, visible);
  const grid = showGames ? GRID : GRID_NO_GAMES;
  const header = (k: SortKey, label: string, align: 'left' | 'right' = 'right', title?: string) => (
    <SortHeader k={k} label={label} align={align} title={title} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
  );

  const aLabel = sideShort(settings, 'a');
  const bLabel = sideShort(settings, 'b');
  const unitHint = kind === 'delta' ? 'pts vs format average' : kind === 'share' ? 'share of games' : 'win rate';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      {/* En-tete de colonnes, desktop */}
      <div className={`${grid} sticky top-0 z-10 hidden border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 backdrop-blur md:grid`}>
        {header('name', settings.axis === 'skill' || settings.subject === 'cards' ? 'Card' : 'Archetype', 'left')}
        {header('a', aLabel, 'right', `${aLabel} · ${unitHint}`)}
        {header('b', bLabel, 'right', `${bLabel} · ${unitHint}`)}
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />{aLabel}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-slate-400" />{bLabel}</span>
        </div>
        {header('shift', 'Shift', 'right', `${aLabel} minus ${bLabel}, in percentage points`)}
        {showGames && header('games', 'Games', 'right', 'Smallest sample of the two sides')}
      </div>

      <ul className="divide-y divide-slate-800/70">
        {shown.map(r => {
          const tone = shiftTone(r.shift);
          const games = r.gamesA !== null && r.gamesB !== null ? Math.min(r.gamesA, r.gamesB) : null;
          return (
            <li key={r.key}>
              <button
                onClick={() => onSelect(r)}
                className={`w-full text-left transition-colors hover:bg-slate-800/50 focus-visible:bg-slate-800/50 focus-visible:outline-none ${r.smallSample ? 'opacity-50' : ''}`}
              >
                {/* Desktop */}
                <div className={`${grid} hidden px-4 py-2 md:grid`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb row={r} size="md" />
                    <span className="truncate text-sm font-semibold text-slate-100">{r.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-slate-300">{fmtValue(r.a, kind)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-slate-100">{fmtValue(r.b, kind)}</div>
                  </div>
                  <Dumbbell a={r.a} b={r.b} domain={domain} reference={reference} />
                  <div className={`text-right text-base font-black tabular-nums ${TONE_TEXT[tone]}`}>{fmtShift(r.shift)}</div>
                  {showGames && (
                    <div className="text-right text-xs tabular-nums text-slate-500" title={r.smallSample ? 'Small sample' : undefined}>
                      {fmtGames(games)}
                    </div>
                  )}
                </div>

                {/* Mobile */}
                <div className="flex items-center gap-3 px-3 py-2.5 md:hidden">
                  <Thumb row={r} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-slate-100">{r.label}</span>
                      <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-500">
                        {fmtValue(r.a, kind)} <span className="text-slate-600">→</span> <span className="text-slate-300">{fmtValue(r.b, kind)}</span>
                      </span>
                    </div>
                    <Dumbbell a={r.a} b={r.b} domain={domain} reference={reference} className="mt-1.5" />
                  </div>
                  <div className={`w-12 flex-shrink-0 text-right text-[15px] font-black tabular-nums ${TONE_TEXT[tone]}`}>{fmtShift(r.shift)}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {visible < rows.length && <div ref={sentinel} className="h-10" />}
    </div>
  );
};
