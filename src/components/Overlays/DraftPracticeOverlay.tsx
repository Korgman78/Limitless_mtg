import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Crown, Sparkles, Target, Check, ArrowRight, RotateCcw, Shuffle,
  Eye, EyeOff, Loader2, Swords, Trophy, TrendingUp, ChevronRight,
} from 'lucide-react';
import { FORMAT_OPTIONS } from '../../constants';
import { getCardImage } from '../../utils/helpers';
import { ManaIcons } from '../Common';
import { haptics } from '../../utils/haptics';
import { useCards } from '../../queries/useCards';
import {
  useDraftPracticeSessions, useDraftPracticeSession, useFormatSynergies,
  type DraftPick, type PairMap,
} from '../../queries/useDraftPractice';

interface DraftPracticeOverlayProps {
  activeSet: string;
  activeFormat: string;
  onClose: () => void;
}

type Phase = 'intro' | 'drafting' | 'recap';
type Mode = 'blind' | 'coached';
type WRMap = Map<string, number | null>;

// ------------------------------------------------------------------ scoring
interface PickDetail {
  pack: number; pick: number;
  your: string; pro: string; agree: boolean;
  yourWr: number | null; proWr: number | null;
}
interface Recap {
  n: number; matches: number; agreement: number;
  earlyMatches: number; earlyTotal: number;
  userQuality: number | null; proQuality: number | null;
  userAvgWr: number | null; proAvgWr: number | null;
  userSynergy: number; proSynergy: number; synergyAvailable: boolean;
  composite: number;
  grade: { letter: string; color: string; ring: string; label: string };
  details: PickDetail[];
  bestPick: PickDetail | null; worstMiss: PickDetail | null;
}

const gradeFor = (c: number) => {
  if (c >= 0.85) return { letter: 'S', color: 'text-amber-300', ring: 'from-amber-400 to-yellow-500', label: 'Mythic-level read' };
  if (c >= 0.72) return { letter: 'A', color: 'text-emerald-300', ring: 'from-emerald-400 to-teal-500', label: 'Excellent drafting' };
  if (c >= 0.58) return { letter: 'B', color: 'text-indigo-300', ring: 'from-indigo-400 to-purple-500', label: 'Solid instincts' };
  if (c >= 0.42) return { letter: 'C', color: 'text-sky-300', ring: 'from-sky-400 to-indigo-500', label: 'Getting there' };
  return { letter: 'D', color: 'text-rose-300', ring: 'from-rose-400 to-orange-500', label: 'Keep practicing' };
};

/** Cohésion d'un pool : somme des lifts des paires significatives présentes, / nb de cartes distinctes. */
function poolSynergy(names: string[], pairMap: PairMap): number {
  const uniq = [...new Set(names)];
  if (uniq.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) {
      const v = pairMap[uniq[i]]?.[uniq[j]];
      if (v != null) sum += v;
    }
  return sum / uniq.length;
}

function computeRecap(picks: DraftPick[], userPicks: string[], getWR: (n: string) => number | null, pairMap: PairMap): Recap {
  const details: PickDetail[] = [];
  let matches = 0, earlyMatches = 0, earlyTotal = 0;
  let userQSum = 0, userQn = 0, proQSum = 0, proQn = 0;
  let userWrSum = 0, userWrN = 0, proWrSum = 0, proWrN = 0;

  const quality = (chosen: string, options: string[]): number | null => {
    const known = options.map(getWR).filter((w): w is number => w != null);
    const cw = getWR(chosen);
    if (cw == null || known.length < 2) return null;
    return known.filter(w => w <= cw).length / known.length; // 1 = took the highest-WR card
  };

  picks.forEach((p, i) => {
    const your = userPicks[i] ?? p.options[0];
    const agree = your === p.taken;
    if (agree) matches++;
    const isEarly = p.pick <= 3;
    if (isEarly) { earlyTotal++; if (agree) earlyMatches++; }

    const yourWr = getWR(your), proWr = getWR(p.taken);
    if (yourWr != null) { userWrSum += yourWr; userWrN++; }
    if (proWr != null) { proWrSum += proWr; proWrN++; }

    const uq = quality(your, p.options); if (uq != null) { userQSum += uq; userQn++; }
    const pq = quality(p.taken, p.options); if (pq != null) { proQSum += pq; proQn++; }

    details.push({ pack: p.pack, pick: p.pick, your, pro: p.taken, agree, yourWr, proWr });
  });

  const n = picks.length;
  const agreement = n ? matches / n : 0;
  const userQuality = userQn ? userQSum / userQn : null;
  const proQuality = proQn ? proQSum / proQn : null;
  const composite = 0.5 * agreement + 0.5 * (userQuality ?? agreement);

  const userSynergy = poolSynergy(details.map(d => d.your), pairMap);
  const proSynergy = poolSynergy(details.map(d => d.pro), pairMap);
  const synergyAvailable = Object.keys(pairMap).length > 0;

  // Highlights : meilleur pick (accord sur une carte forte) / pire raté (gros écart WR)
  let bestPick: PickDetail | null = null, worstMiss: PickDetail | null = null;
  for (const d of details) {
    if (d.agree && d.proWr != null) {
      if (!bestPick || (d.proWr) > (bestPick.proWr ?? -1)) bestPick = d;
    }
    if (!d.agree && d.proWr != null && d.yourWr != null) {
      const gap = d.proWr - d.yourWr;
      const cur = worstMiss && worstMiss.proWr != null && worstMiss.yourWr != null ? worstMiss.proWr - worstMiss.yourWr : -1;
      if (gap > cur) worstMiss = d;
    }
  }

  return {
    n, matches, agreement, earlyMatches, earlyTotal,
    userQuality, proQuality,
    userAvgWr: userWrN ? userWrSum / userWrN : null,
    proAvgWr: proWrN ? proWrSum / proWrN : null,
    userSynergy, proSynergy, synergyAvailable,
    composite, grade: gradeFor(composite), details, bestPick, worstMiss,
  };
}

// ------------------------------------------------------------------ small UI
const wrTone = (wr: number | null): string => {
  if (wr == null) return 'text-slate-500';
  if (wr >= 58) return 'text-emerald-300';
  if (wr >= 54) return 'text-sky-300';
  if (wr >= 50) return 'text-slate-300';
  return 'text-rose-300';
};

const CardTile: React.FC<{
  name: string; onPick?: () => void;
  ring?: 'none' | 'you' | 'pro'; badge?: React.ReactNode; dim?: boolean; disabled?: boolean;
}> = ({ name, onPick, ring = 'none', badge, dim, disabled }) => (
  <motion.button
    type="button"
    onClick={onPick}
    disabled={disabled}
    whileHover={disabled ? undefined : { y: -4, scale: 1.03 }}
    whileTap={disabled ? undefined : { scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 400, damping: 26 }}
    className={`group relative rounded-lg overflow-hidden border bg-black aspect-[63/88] ${
      ring === 'you' ? 'border-indigo-400 ring-2 ring-indigo-400/60'
      : ring === 'pro' ? 'border-amber-400 ring-2 ring-amber-400/60'
      : 'border-slate-700/70 hover:border-indigo-400/60'
    } ${dim ? 'opacity-40 saturate-50' : ''} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
  >
    <img src={getCardImage(name)} alt={name} loading="lazy" className="w-full h-full object-cover" />
    {!disabled && (
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-indigo-600/40 to-transparent transition-opacity" />
    )}
    {badge}
  </motion.button>
);

// ============================================================ MAIN COMPONENT
export const DraftPracticeOverlay: React.FC<DraftPracticeOverlayProps> = ({ activeSet, activeFormat, onClose }) => {
  const { data: sessions = [], isLoading: listLoading } = useDraftPracticeSessions(activeSet, activeFormat);
  const { data: cardsData } = useCards(activeSet, activeFormat, 'Global');
  const { data: pairMap = {} } = useFormatSynergies(activeSet, activeFormat);

  const wrMap = useMemo<WRMap>(() => {
    const m: WRMap = new Map();
    for (const c of cardsData?.cards || []) m.set(c.name, c.gih_wr ?? null);
    return m;
  }, [cardsData]);
  const getWR = useCallback((n: string) => wrMap.get(n) ?? null, [wrMap]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: session, isLoading: sessionLoading } = useDraftPracticeSession(selectedId);

  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<Mode>('coached');
  const [idx, setIdx] = useState(0);
  const [userPicks, setUserPicks] = useState<string[]>([]);
  const [reveal, setReveal] = useState<string | null>(null); // coached: carte choisie en attente de "Next"

  const formatLabel = FORMAT_OPTIONS.find(o => o.value === activeFormat)?.label || activeFormat;

  // Choisit (ou re-valide) une session quand la liste dispo change
  useEffect(() => {
    if (!sessions.length) return;
    setSelectedId(prev =>
      prev && sessions.some(s => s.aggregate_id === prev)
        ? prev
        : sessions[Math.floor(Math.random() * sessions.length)].aggregate_id
    );
  }, [sessions]);

  // Reset complet UNIQUEMENT quand le set/format change réellement (pas au montage)
  const ctxRef = useRef(`${activeSet}|${activeFormat}`);
  useEffect(() => {
    const key = `${activeSet}|${activeFormat}`;
    if (key === ctxRef.current) return;
    ctxRef.current = key;
    setSelectedId(null); setPhase('intro'); setIdx(0); setUserPicks([]); setReveal(null);
  }, [activeSet, activeFormat]);

  const shuffleOpponent = () => {
    if (sessions.length < 2) return;
    haptics.light();
    let next = selectedId;
    while (next === selectedId) next = sessions[Math.floor(Math.random() * sessions.length)].aggregate_id;
    setSelectedId(next);
  };

  const start = () => {
    haptics.medium();
    setIdx(0); setUserPicks([]); setReveal(null); setPhase('drafting');
  };
  const restart = () => { setPhase('intro'); setIdx(0); setUserPicks([]); setReveal(null); };

  const picks = session?.picks || [];
  const current = picks[idx];

  const advance = useCallback(() => {
    setReveal(null);
    if (idx + 1 >= picks.length) setPhase('recap');
    else setIdx(i => i + 1);
  }, [idx, picks.length]);

  const onPick = (name: string) => {
    if (!current || reveal) return;
    haptics.selection();
    setUserPicks(prev => { const next = [...prev]; next[idx] = name; return next; });
    if (mode === 'coached') setReveal(name);
    else advance();
  };

  const recap = useMemo<Recap | null>(
    () => (phase === 'recap' && picks.length ? computeRecap(picks, userPicks, getWR, pairMap) : null),
    [phase, picks, userPicks, getWR, pairMap]
  );

  const meta = session || sessions.find(s => s.aggregate_id === selectedId);
  const rankLabel = meta?.rank || (meta?.mythic_rank ? `Mythic #${meta.mythic_rank}` : 'Mythic');
  const colors = meta?.colors || '';

  // -------------------------------------------------------------- shell
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1100] bg-slate-950 flex flex-col"
    >
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      {/* header */}
      <div className="relative flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-800/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Swords className="text-indigo-400 shrink-0" size={22} />
          <div className="min-w-0">
            <h2 className="text-sm md:text-lg font-black text-white tracking-tight">DRAFT PRACTICE</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{activeSet} · {formatLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'drafting' && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {mode === 'coached' ? <Eye size={12} /> : <EyeOff size={12} />}{mode}
            </span>
          )}
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"><X size={18} /></button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ============================================ LOADING / EMPTY */}
          {(listLoading || (selectedId && sessionLoading && phase === 'intro')) ? (
            <motion.div key="loading" className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-indigo-400" size={40} strokeWidth={1.4} />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Loading mythic drafts…</p>
            </motion.div>
          ) : (!listLoading && sessions.length === 0) ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Crown size={44} className="text-slate-800" />
              <p className="text-sm font-bold text-slate-400">No mythic draft replays yet for this format.</p>
              <p className="text-[11px] text-slate-600 max-w-sm">They are seeded daily by the ETL (the 10 best-ranked Mythic trophy drafts per format).</p>
            </motion.div>

          /* ============================================ INTRO */
          ) : phase === 'intro' ? (
            <motion.div key="intro" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="absolute inset-0 overflow-y-auto flex items-center justify-center p-6">
              <div className="w-full max-w-lg">
                <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-slate-900/80 to-slate-950 p-7 md:p-9 shadow-2xl">
                  <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-indigo-600/15 blur-3xl" />
                  <div className="relative text-center">
                    <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                      Draft like a mythic player
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-2">Trophy decks only</p>
                    <p className="text-[12px] text-slate-400 mt-3 leading-relaxed max-w-sm mx-auto">
                      Replay the exact packs this player faced on their trophy run. Pick blind, then see — card by card — where you matched the player and where you diverged.
                    </p>

                    {(colors || meta) && (
                      <div className="flex items-center justify-center gap-3 mt-5 text-slate-400">
                        {colors && <ManaIcons colors={colors} size="md" />}
                        <span className="text-[11px] font-bold">{rankLabel}{meta?.wins != null ? ` · ${meta.wins}-${meta.losses ?? 0}` : ''}</span>
                      </div>
                    )}

                    {/* mode toggle */}
                    <div className="mt-7 grid grid-cols-2 gap-2">
                      {([
                        { id: 'coached' as Mode, Icon: Eye, t: 'Coached', d: "Reveal the player's pick after each choice" },
                        { id: 'blind' as Mode, Icon: EyeOff, t: 'Blind', d: 'Full recap only at the end' },
                      ]).map(({ id, Icon, t, d }) => (
                        <button key={id} onClick={() => { haptics.selection(); setMode(id); }}
                          className={`text-left p-3 rounded-xl border transition-all ${mode === id ? 'bg-indigo-600/20 border-indigo-400/50' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
                          <div className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide ${mode === id ? 'text-indigo-200' : 'text-slate-300'}`}>
                            <Icon size={13} /> {t}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-snug">{d}</p>
                        </button>
                      ))}
                    </div>

                    <button onClick={start}
                      className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-900/40 transition-all">
                      <Swords size={16} /> Start drafting
                    </button>
                    <button onClick={shuffleOpponent} disabled={sessions.length < 2}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
                      <Shuffle size={12} /> Another opponent ({sessions.length} available)
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

          /* ============================================ DRAFTING */
          ) : phase === 'drafting' && current ? (
            <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col">
              {/* progress */}
              <div className="px-4 md:px-6 pt-3 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Pack {current.pack + 1} · Pick {current.pick + 1}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">{idx + 1} / {picks.length}</span>
                </div>
                <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    animate={{ width: `${((idx + (reveal ? 1 : 0)) / picks.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                </div>
              </div>

              {/* pool strip */}
              <div className="px-4 md:px-6 flex-shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 shrink-0">Pool {userPicks.filter(Boolean).length}</span>
                  {userPicks.filter(Boolean).slice(-18).map((n, i) => (
                    <img key={`${n}-${i}`} src={getCardImage(n)} alt={n} loading="lazy"
                      className="h-9 w-[26px] rounded object-cover border border-slate-800 shrink-0" />
                  ))}
                </div>
              </div>

              {/* pack */}
              <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
                <AnimatePresence mode="wait">
                  <motion.div key={idx}
                    initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 md:gap-3 max-w-6xl mx-auto">
                    {current.options.map((name) => {
                      const isYou = reveal === name;
                      const isPro = !!reveal && name === current.taken;
                      const wr = getWR(name);
                      return (
                        <CardTile key={name} name={name} disabled={!!reveal}
                          onPick={() => onPick(name)}
                          ring={isYou ? 'you' : isPro ? 'pro' : 'none'}
                          dim={!!reveal && !isYou && !isPro}
                          badge={reveal ? (
                            <>
                              {(isYou || isPro) && (
                                <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${isPro ? 'bg-amber-500 text-slate-950' : 'bg-indigo-500 text-white'}`}>
                                  {isPro ? 'Player' : 'You'}
                                </span>
                              )}
                              {wr != null && (
                                <span className={`absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 text-[8px] font-black ${wrTone(wr)}`}>{wr.toFixed(1)}</span>
                              )}
                            </>
                          ) : undefined}
                        />
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* coached reveal bar */}
              <AnimatePresence>
                {reveal && (
                  <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="flex-shrink-0 px-4 md:px-6 py-3 border-t border-slate-800 bg-slate-900/90 backdrop-blur">
                    <div className="max-w-3xl mx-auto flex items-center gap-3">
                      {reveal === current.taken ? (
                        <span className="flex items-center gap-1.5 text-emerald-300 text-[12px] font-black uppercase tracking-wide"><Check size={16} /> Match!</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-300 text-[12px] font-black uppercase tracking-wide"><Target size={16} /> The player took <span className="text-white normal-case font-bold">{current.taken}</span></span>
                      )}
                      <button onClick={advance}
                        className="ml-auto flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-black uppercase tracking-widest transition-all">
                        {idx + 1 >= picks.length ? 'See results' : 'Next pick'} <ArrowRight size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

          /* ============================================ RECAP */
          ) : phase === 'recap' && recap ? (
            <RecapView recap={recap} rankLabel={rankLabel} onRetry={restart}
              onNew={() => { shuffleOpponent(); restart(); }} onClose={onClose} />
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ============================================================ RECAP VIEW
const StatBar: React.FC<{ label: string; you: number; pro: number; suffix?: string; youColor: string; decimals?: number }> = ({ label, you, pro, suffix = '', youColor, decimals }) => {
  const max = Math.max(you, pro, 1);
  const d = decimals ?? (suffix === '%' ? 1 : 0);
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
        <span className="text-slate-400">{label}</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[9px] font-black text-indigo-300 uppercase">You</span>
          <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(you / max) * 100}%` }} transition={{ delay: 0.2, type: 'spring', stiffness: 90, damping: 18 }} className={`h-full rounded-full ${youColor}`} />
          </div>
          <span className="w-12 text-right text-[11px] font-black text-white tabular-nums">{you.toFixed(d)}{suffix}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-[9px] font-black text-amber-300 uppercase">Player</span>
          <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(pro / max) * 100}%` }} transition={{ delay: 0.3, type: 'spring', stiffness: 90, damping: 18 }} className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" />
          </div>
          <span className="w-12 text-right text-[11px] font-black text-slate-300 tabular-nums">{pro.toFixed(d)}{suffix}</span>
        </div>
      </div>
    </div>
  );
};

const RecapView: React.FC<{ recap: Recap; rankLabel: string; onRetry: () => void; onNew: () => void; onClose: () => void }> = ({ recap, rankLabel, onRetry, onNew, onClose }) => {
  const { grade } = recap;
  return (
    <motion.div key="recap" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
        {/* grade hero */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-7 text-center">
          <div className={`pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl bg-gradient-to-r ${grade.ring} opacity-20`} />
          <p className="relative text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">vs {rankLabel}</p>
          <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className={`relative mx-auto w-28 h-28 rounded-full grid place-items-center bg-gradient-to-br ${grade.ring} shadow-2xl`}>
            <span className="text-6xl font-black text-slate-950">{grade.letter}</span>
          </motion.div>
          <p className={`relative mt-4 text-lg font-black ${grade.color}`}>{grade.label}</p>
          <div className="relative mt-4 flex items-center justify-center gap-6">
            <div>
              <p className="text-3xl font-black text-white tabular-nums">{Math.round(recap.agreement * 100)}%</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Agreement</p>
            </div>
            <div className="w-px h-10 bg-slate-800" />
            <div>
              <p className="text-3xl font-black text-white tabular-nums">{recap.matches}<span className="text-slate-600 text-lg">/{recap.n}</span></p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Same picks</p>
            </div>
            {recap.earlyTotal > 0 && (
              <>
                <div className="w-px h-10 bg-slate-800" />
                <div>
                  <p className="text-3xl font-black text-white tabular-nums">{Math.round((recap.earlyMatches / recap.earlyTotal) * 100)}%</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Early picks</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* comparison */}
        {((recap.userAvgWr != null && recap.proAvgWr != null) || recap.synergyAvailable) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><TrendingUp size={13} className="text-indigo-400" /> You vs the player</h4>
            {recap.userAvgWr != null && recap.proAvgWr != null && (
              <StatBar label="Avg win rate of your picks" you={recap.userAvgWr} pro={recap.proAvgWr} suffix="%" youColor="bg-gradient-to-r from-indigo-500 to-purple-500" />
            )}
            {recap.userQuality != null && recap.proQuality != null && (
              <StatBar label="How often you took the best-WR card available" you={recap.userQuality * 100} pro={recap.proQuality * 100} suffix="%" youColor="bg-gradient-to-r from-indigo-500 to-purple-500" />
            )}
            {recap.synergyAvailable && (
              <StatBar label="Synergy between your picks (lift / card)" you={recap.userSynergy} pro={recap.proSynergy} decimals={1} youColor="bg-gradient-to-r from-fuchsia-500 to-pink-500" />
            )}
            <p className="text-[10px] text-slate-600 leading-snug">
              <span className="text-slate-400 font-bold">Win rate</span> = raw card power. <span className="text-slate-400 font-bold">Synergy</span> = how often your cards appear together in trophy decks — your pool's cohesion.
            </p>
          </div>
        )}

        {/* highlights */}
        {(recap.bestPick || recap.worstMiss) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recap.bestPick && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 flex items-center gap-3">
                <img src={getCardImage(recap.bestPick.pro)} alt="" className="w-11 h-[60px] rounded object-cover border border-emerald-500/30" />
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1"><Trophy size={11} /> Nailed it</p>
                  <p className="text-[12px] font-bold text-slate-200 truncate">{recap.bestPick.pro}</p>
                  <p className="text-[10px] text-slate-500">P{recap.bestPick.pack + 1}P{recap.bestPick.pick + 1} · matched the player on a {recap.bestPick.proWr?.toFixed(1)}% card</p>
                </div>
              </div>
            )}
            {recap.worstMiss && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-4 flex items-center gap-3">
                <img src={getCardImage(recap.worstMiss.pro)} alt="" className="w-11 h-[60px] rounded object-cover border border-rose-500/30" />
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-1"><Target size={11} /> Biggest miss</p>
                  <p className="text-[12px] font-bold text-slate-200 truncate">Player took {recap.worstMiss.pro}</p>
                  <p className="text-[10px] text-slate-500">You took {recap.worstMiss.your} · {((recap.worstMiss.proWr ?? 0) - (recap.worstMiss.yourWr ?? 0)).toFixed(1)}% WR gap</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* pick-by-pick */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-1.5">
            <Sparkles size={13} className="text-indigo-400" />
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pick by pick</h4>
          </div>
          <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
            {recap.details.map((d, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2 ${d.agree ? '' : 'bg-amber-500/[0.03]'}`}>
                <span className="w-9 text-[9px] font-black text-slate-600 tabular-nums shrink-0">P{d.pack + 1}P{d.pick + 1}</span>
                {d.agree ? (
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Check size={14} className="text-emerald-400 shrink-0" />
                    <img src={getCardImage(d.your)} alt="" className="w-6 h-[33px] rounded object-cover border border-slate-800 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-300 truncate">{d.your}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                      <img src={getCardImage(d.your)} alt="" className="w-6 h-[33px] rounded object-cover border border-indigo-500/40 shrink-0" />
                      <span className="text-[11px] text-slate-400 truncate">{d.your}</span>
                      {d.yourWr != null && <span className={`text-[9px] font-black ${wrTone(d.yourWr)} shrink-0`}>{d.yourWr.toFixed(1)}</span>}
                    </span>
                    <ChevronRight size={12} className="text-slate-700 shrink-0" />
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                      <img src={getCardImage(d.pro)} alt="" className="w-6 h-[33px] rounded object-cover border border-amber-500/40 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-200 truncate">{d.pro}</span>
                      {d.proWr != null && <span className={`text-[9px] font-black ${wrTone(d.proWr)} shrink-0`}>{d.proWr.toFixed(1)}</span>}
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* actions */}
        <div className="flex flex-col sm:flex-row gap-3 pb-4">
          <button onClick={onRetry} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest transition-colors">
            <RotateCcw size={14} /> Redraft this pod
          </button>
          <button onClick={onNew} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-black uppercase tracking-widest transition-all">
            <Shuffle size={14} /> New opponent
          </button>
          <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
};
