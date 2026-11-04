import React from 'react';
import { shiftTone, TONE_BG } from './compareModel';

interface DumbbellProps {
  a: number;
  b: number;
  domain: [number, number];
  /** Valeur de reference tracee en pointille (0 = moyenne du format). */
  reference?: number | null;
  className?: string;
}

/**
 * A (cercle creux) et B (point plein) sur un axe commun a toutes les lignes,
 * relies par un trait colore selon le sens de l'ecart : l'ecart se lit sans
 * calcul, et les lignes se comparent entre elles d'un coup d'oeil.
 */
export const Dumbbell: React.FC<DumbbellProps> = ({ a, b, domain, reference = null, className = '' }) => {
  const [lo, hi] = domain;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const tone = shiftTone(b - a);
  const left = Math.min(a, b), right = Math.max(a, b);

  return (
    <div className={`relative h-4 ${className}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-800" />
      {reference !== null && reference > lo && reference < hi && (
        <div className="absolute top-0 bottom-0 w-px border-l border-dashed border-slate-600" style={{ left: pos(reference) }} />
      )}
      <div
        className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${TONE_BG[tone]} opacity-70`}
        style={{ left: pos(left), width: `calc(${pos(right)} - ${pos(left)})` }}
      />
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-400 bg-slate-950"
        style={{ left: pos(a) }}
      />
      <div
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${TONE_BG[tone]} ring-2 ring-slate-950`}
        style={{ left: pos(b) }}
      />
    </div>
  );
};
