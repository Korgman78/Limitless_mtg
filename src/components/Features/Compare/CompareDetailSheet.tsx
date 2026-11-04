import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { ManaIcons } from '../../Common/ManaIcons';
import CardImage from '../../Common/CardImage';
import { getCardImage } from '../../../utils/helpers';
import { Dumbbell } from './Dumbbell';
import type { CompareRow, CompareSettings } from './compareModel';
import { fmtGames, fmtShift, fmtValue, shiftTone, sideLabel, TONE_TEXT, valueKind } from './compareModel';

interface Props {
  row: CompareRow;
  settings: CompareSettings;
  domain: [number, number];
  onClose: () => void;
  onOpen: (row: CompareRow) => void;
}

/** Phrase de lecture, la meme que l'utilisateur formulerait a voix haute. */
function sentence(r: CompareRow, s: CompareSettings): string {
  const abs = Math.abs(r.shift).toFixed(1);
  const a = sideLabel(s, 'a'), b = sideLabel(s, 'b');
  const kind = valueKind(s);
  const [hi, lo] = r.shift > 0 ? [a, b] : [b, a];
  const prep = s.axis === 'skill' ? 'for' : 'in';
  if (Math.abs(r.shift) < 0.05) return `About the same ${prep} ${a} and ${prep} ${b}.`;
  if (kind === 'share') return `More played in ${hi} than in ${lo}: ${abs} points of meta share.`;
  const what = kind !== 'delta' ? ''
    : s.axis === 'skill' ? ', beyond the usual gap between the two levels'
    : ', once each format’s average is taken into account';
  return `${abs} points better ${prep} ${hi} than ${prep} ${lo}${what}.`;
}

export const CompareDetailSheet: React.FC<Props> = ({ row: r, settings: s, domain, onClose, onOpen }) => {
  const kind = valueKind(s);
  const tone = shiftTone(r.shift);

  const side = (which: 'a' | 'b') => {
    const v = which === 'a' ? r.a : r.b;
    const games = which === 'a' ? r.gamesA : r.gamesB;
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {which === 'a'
            ? <span className="h-2 w-2 rounded-full bg-emerald-400" />
            : <span className="h-2 w-2 rounded-full border-2 border-slate-400" />}
          <span className="truncate">{sideLabel(s, which)}</span>
        </div>
        <div className="mt-1 text-lg font-black tabular-nums text-white">{fmtValue(v, kind)}</div>
        <div className="text-[11px] text-slate-500">
          {games !== null && <>{fmtGames(games)} {r.kind === 'card' ? 'games in hand' : 'games'}</>}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="fixed inset-0 z-[950] flex items-end bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={r.label}
        className="w-full rounded-t-2xl border-t border-slate-700 bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
        <div className="flex items-start gap-3">
          {r.kind === 'card'
            ? <CardImage src={getCardImage(r.id)} alt="" className="h-20 w-14 flex-shrink-0 rounded-md border border-slate-700 bg-black object-cover" />
            : <ManaIcons colors={r.colors} size="lg" isSplash={r.isSplash} />}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black leading-tight text-white">{r.label}</h3>
            <p className="mt-1 text-xs leading-snug text-slate-400">{sentence(r, s)}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className={`text-2xl font-black tabular-nums ${TONE_TEXT[tone]}`}>{fmtShift(r.shift)}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">pts</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 p-1 text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        <Dumbbell a={r.a} b={r.b} domain={domain} reference={kind === 'delta' ? 0 : null} className="my-4" />

        <div className="grid grid-cols-2 gap-2">{side('a')}{side('b')}</div>

        {r.smallSample && (
          <p className="mt-3 text-[11px] text-amber-300/80">Small sample: this shift may be noise.</p>
        )}

        <button
          onClick={() => onOpen(r)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
        >
          {r.kind === 'card' ? 'Open card details' : 'Open archetype'} <ArrowRight size={15} />
        </button>
      </motion.div>
    </motion.div>
  );
};
