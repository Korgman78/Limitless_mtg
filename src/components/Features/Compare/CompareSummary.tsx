import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import CardImage from '../../Common/CardImage';
import { getCardImage } from '../../../utils/helpers';
import type { CompareRow } from './compareModel';
import { fmtShift, NEUTRAL_SHIFT } from './compareModel';

interface Props {
  rows: CompareRow[];
  /** « in Arena Direct Sealed », « for Top players »... */
  sideB: string;
  onSelect: (row: CompareRow) => void;
}

const Item: React.FC<{ row: CompareRow; up: boolean; onSelect: (r: CompareRow) => void }> = ({ row, up, onSelect }) => (
  <li>
    <button
      onClick={() => onSelect(row)}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-800/70"
    >
      {row.kind === 'card' ? (
        <CardImage src={getCardImage(row.id)} alt="" className="h-7 w-5 flex-shrink-0 rounded-[3px] bg-black object-cover" />
      ) : (
        <span className="flex-shrink-0"><ManaIcons colors={row.colors} size="md" /></span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{row.label}</span>
      <span className={`flex-shrink-0 text-xs font-black tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {fmtShift(row.shift)}
      </span>
    </button>
  </li>
);

/** Repond a la question de l'onglet avant toute lecture du tableau. */
export const CompareSummary: React.FC<Props> = ({ rows, sideB, onSelect }) => {
  const sorted = [...rows].sort((x, y) => y.shift - x.shift);
  // 3 par colonne sur mobile, pour ne pas repousser le tableau sous la ligne de flottaison.
  const n = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 5 : 3;
  const gains = sorted.filter(r => r.shift >= NEUTRAL_SHIFT).slice(0, n);
  const losses = sorted.filter(r => r.shift <= -NEUTRAL_SHIFT).reverse().slice(0, n);
  if (gains.length + losses.length === 0) return null;

  const block = (title: string, list: CompareRow[], up: boolean) => (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 md:p-3">
      <h3 className={`mb-1.5 flex items-center gap-1.5 px-1.5 text-[10px] font-black uppercase tracking-widest ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {title}
      </h3>
      {list.length > 0 ? (
        <ul className="space-y-0.5">{list.map(r => <Item key={r.key} row={r} up={up} onSelect={onSelect} />)}</ul>
      ) : (
        <p className="px-1.5 py-2 text-xs text-slate-500">Nothing stands out.</p>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
      {block(`Better ${sideB}`, gains, true)}
      {block(`Worse ${sideB}`, losses, false)}
    </div>
  );
};
