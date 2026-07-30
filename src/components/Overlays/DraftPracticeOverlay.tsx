import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Crown, Sparkles, Target, Check, ArrowRight, RotateCcw, Shuffle,
  Eye, EyeOff, Loader2, Swords, Trophy, TrendingUp, ChevronRight,
  Layers, Plus, Minus, Wand2, ChevronLeft, Users, Share2,
} from 'lucide-react';
import { FORMAT_OPTIONS } from '../../constants';
import { getCardImage } from '../../utils/helpers';
import CardImage from '../Common/CardImage';
import { ManaIcons } from '../Common';
import { haptics } from '../../utils/haptics';
import { useCards } from '../../queries/useCards';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSkeletons } from '../../queries/useSkeletons';
import { CmcStack, type SkeletonCard } from '../Features/CmcStack';
import { isLandCard } from '../../utils/deckAnalysisCore';
import type { AnalysisSkeleton, DeckAnalysisResult } from '../../utils/deckAnalysisCore';
import {
  analyzeDeckText, cardlistToDeckText, scoreDeckAnalysis, type DeckScore,
} from '../../utils/analyzeDeckPipeline';
import {
  useDraftPracticeSessions, useDraftPracticeSession, useFormatSynergies, useDraftCardMeta,
  type DraftPick, type PairMap, type DraftCardMeta,
} from '../../queries/useDraftPractice';
import { suggestBasicLands, BASIC_LAND_OF, MANA_COLORS, type ManaCardMeta } from '../../utils/manabase';
import { buildChallengeUrl, type ChallengeEntrant, type DraftChallenge } from '../../utils/draftChallenge';
import { useLocalStorage } from '../../hooks/useLocalStorage';

interface DraftPracticeOverlayProps {
  activeSet: string;
  onClose: () => void;
  /** Défi reçu par lien : pod imposé + picks/deck de l'ami pour la comparaison. */
  challenge?: DraftChallenge | null;
}

type Phase = 'intro' | 'drafting' | 'recap' | 'build' | 'compare';
type Mode = 'blind' | 'coached';
type WRMap = Map<string, number | null>;
/** Decks analysés en phase compare : toi, le joueur mythic, l'ami (si défi). */
interface DeckAnalyses {
  you: DeckAnalysisResult | null;
  pro: DeckAnalysisResult | null;
  friend: DeckAnalysisResult | null;
}

// Draft Practice ne rejoue que des drafts Premier Draft : le Trad Draft ne se
// joue pas en classé, donc l'ETL n'ingère aucune séquence de picks pour ce
// format. On sert donc toujours les picks/stats Premier Draft, quel que soit le
// format actif de l'app (le point d'entrée reste dispo en PD comme en TD).
const PRACTICE_FORMAT = 'PremierDraft';

// Terres de base par couleur (pour le builder de deck)
const BASIC_OF = BASIC_LAND_OF;
const COLORS5 = MANA_COLORS;

/** Méta du builder → forme attendue par le solveur de manabase. */
const toManaMeta = (m: Record<string, DraftCardMeta>): Record<string, ManaCardMeta> => {
  const out: Record<string, ManaCardMeta> = {};
  for (const [name, c] of Object.entries(m)) {
    out[name] = {
      cost: c.cost, cmc: c.cmc, type: c.type, colors: c.colors,
      producedColours: c.producedColours, isManaProducer: c.isManaProducer,
    };
  }
  return out;
};

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
  ring?: 'none' | 'you' | 'pro' | 'friend'; badge?: React.ReactNode; dim?: boolean; disabled?: boolean;
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
      : ring === 'friend' ? 'border-fuchsia-400 ring-2 ring-fuchsia-400/60'
      : 'border-slate-700/70 hover:border-indigo-400/60'
    } ${dim ? 'opacity-40 saturate-50' : ''} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
  >
    <CardImage src={getCardImage(name)} alt={name} className="w-full h-full object-cover" />
    {!disabled && (
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-indigo-600/40 to-transparent transition-opacity" />
    )}
    {badge}
  </motion.button>
);

// ============================================================ MAIN COMPONENT
export const DraftPracticeOverlay: React.FC<DraftPracticeOverlayProps> = ({ activeSet, onClose, challenge = null }) => {
  const { data: sessions = [], isLoading: listLoading } = useDraftPracticeSessions(activeSet, PRACTICE_FORMAT);
  const { data: cardsData } = useCards(activeSet, PRACTICE_FORMAT, 'Global');
  const { data: pairMap = {} } = useFormatSynergies(activeSet, PRACTICE_FORMAT);
  const { data: skeletons = [] } = useSkeletons(activeSet, PRACTICE_FORMAT);

  const wrMap = useMemo<WRMap>(() => {
    const m: WRMap = new Map();
    for (const c of cardsData?.cards || []) m.set(c.name, c.gih_wr ?? null);
    return m;
  }, [cardsData]);
  const getWR = useCallback((n: string) => wrMap.get(n) ?? null, [wrMap]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: session, isLoading: sessionLoading, isError: sessionError } = useDraftPracticeSession(selectedId);
  // Lien de défi dont le pod n'est plus (ou pas encore) en base : le replay est
  // introuvable, on le dit au lieu d'afficher un écran vide.
  const challengePodMissing = !!challenge && !sessionLoading && (sessionError || !session);

  const [phase, setPhase] = useState<Phase>('intro');
  // Un défi impose son mode : sinon le % d'accord avec le joueur mythic ne serait
  // pas comparable entre les deux amis.
  const [mode, setMode] = useState<Mode>(challenge?.mode ?? 'coached');
  const [idx, setIdx] = useState(0);
  const [userPicks, setUserPicks] = useState<string[]>([]);
  const [reveal, setReveal] = useState<string | null>(null); // coached: carte choisie en attente de "Next"

  // Phase "build deck" : quantité par carte envoyée au deck + terres de base
  const [deck, setDeck] = useState<Record<string, number>>({});
  const [basics, setBasics] = useState<Record<string, number>>({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  // Méta cartes du builder (tri + manabase). Chargée dès la phase build, puis
  // servie par le cache React Query (BuildView la relit sans requête en plus).
  const { data: cardMeta = {} } = useDraftCardMeta(activeSet, phase === 'build');
  const manaMeta = useMemo<Record<string, ManaCardMeta>>(() => toManaMeta(cardMeta), [cardMeta]);
  // Phase "compare" : analyses des deux decks via le moteur "Test my deck"
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DeckAnalyses | null>(null);

  const formatLabel = FORMAT_OPTIONS.find(o => o.value === PRACTICE_FORMAT)?.label || PRACTICE_FORMAT;

  // Défi reçu : le pod est imposé, pas de tirage aléatoire ni de shuffle.
  useEffect(() => {
    if (challenge?.aggregateId) setSelectedId(challenge.aggregateId);
  }, [challenge]);

  // Choisit (ou re-valide) une session quand la liste dispo change
  useEffect(() => {
    if (challenge || !sessions.length) return;
    setSelectedId(prev =>
      prev && sessions.some(s => s.aggregate_id === prev)
        ? prev
        : sessions[Math.floor(Math.random() * sessions.length)].aggregate_id
    );
  }, [sessions, challenge]);

  // Reset complet UNIQUEMENT quand le set change réellement (pas au montage). Le
  // format est épinglé sur PRACTICE_FORMAT, donc basculer PD↔TD dans l'app ne
  // doit pas réinitialiser la session en cours.
  const ctxRef = useRef(activeSet);
  useEffect(() => {
    if (activeSet === ctxRef.current) return;
    ctxRef.current = activeSet;
    setSelectedId(null); setPhase('intro'); setIdx(0); setUserPicks([]); setReveal(null);
    setDeck({}); setBasics({ W: 0, U: 0, B: 0, R: 0, G: 0 }); setAnalysis(null);
  }, [activeSet]);

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
  const restart = () => {
    setPhase('intro'); setIdx(0); setUserPicks([]); setReveal(null);
    setDeck({}); setBasics({ W: 0, U: 0, B: 0, R: 0, G: 0 }); setAnalysis(null);
  };

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

  // Calculé aussi en phase compare : la comparaison des drafts (accord avec le
  // joueur mythic, qualité des picks) y est affichée face à celle de l'ami.
  const recap = useMemo<Recap | null>(
    () => ((phase === 'recap' || phase === 'compare') && picks.length
      ? computeRecap(picks, userPicks, getWR, pairMap)
      : null),
    [phase, picks, userPicks, getWR, pairMap]
  );

  const meta = session || sessions.find(s => s.aggregate_id === selectedId);

  // -------------------------------------------------------------- build deck
  // Pool de l'utilisateur = les cartes qu'il a réellement prises (multiset).
  const pool = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of userPicks) if (n) m.set(n, (m.get(n) || 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count }));
  }, [userPicks]);

  const includedSpellCount = useMemo(
    () => Object.values(deck).reduce((s, q) => s + q, 0),
    [deck]
  );
  const landCount = useMemo(
    () => COLORS5.reduce((s, c) => s + (basics[c] || 0), 0),
    [basics]
  );
  const deckTotal = includedSpellCount + landCount;

  const goBuild = () => {
    haptics.medium();
    setDeck({});
    setBasics({ W: 0, U: 0, B: 0, R: 0, G: 0 });
    setAnalysis(null);
    setPhase('build');
  };

  // Ajoute une copie (cappé au nombre de copies réellement draftées).
  const addCard = useCallback((name: string) => {
    haptics.selection();
    setDeck((prev) => {
      const max = pool.find((p) => p.name === name)?.count ?? 0;
      const cur = prev[name] || 0;
      if (cur >= max) return prev;
      return { ...prev, [name]: cur + 1 };
    });
  }, [pool]);
  const removeCard = useCallback((name: string) => {
    haptics.light();
    setDeck((prev) => {
      const cur = prev[name] || 0;
      if (cur <= 0) return prev;
      const next = { ...prev };
      if (cur - 1 <= 0) delete next[name]; else next[name] = cur - 1;
      return next;
    });
  }, []);
  const bumpBasic = (c: string, d: number) => {
    haptics.light();
    setBasics((prev) => ({ ...prev, [c]: Math.max(0, (prev[c] || 0) + d) }));
  };
  // Auto lands : manabase déduite des cartes réellement mises dans le deck
  // (pips exigés, CMC, terres non-base et producteurs de mana déjà présents) —
  // et non plus des couleurs de l'archétype du joueur mythic.
  const autoLands = useCallback(() => {
    haptics.medium();
    setBasics(suggestBasicLands(deck, manaMeta).basics);
  }, [deck, manaMeta]);

  const buildUserDeckText = useCallback(() => {
    const lines: string[] = [];
    for (const [name, qty] of Object.entries(deck)) if (qty > 0) lines.push(`${qty} ${name}`);
    for (const c of COLORS5) if (basics[c] > 0) lines.push(`${basics[c]} ${BASIC_OF[c]}`);
    return `Deck\n${lines.join('\n')}`;
  }, [deck, basics]);

  // ----------------------------------------------------------------- défi 1v1
  // Un défi n'est exploitable que si sa séquence de picks colle à celle du pod
  // (même replay, même longueur) — sinon le lien vient d'une version différente.
  const friend = challenge?.entrants[0] ?? null;
  const friendReady = !!friend && picks.length > 0 && friend.pickIdx.length === picks.length;

  const friendPicks = useMemo(
    () => (friendReady && friend
      ? picks.map((p, i) => p.options[friend.pickIdx[i]] ?? p.options[0])
      : []),
    [friendReady, friend, picks]
  );
  const friendRecap = useMemo<Recap | null>(
    () => (friendReady && friendPicks.length ? computeRecap(picks, friendPicks, getWR, pairMap) : null),
    [friendReady, friendPicks, picks, getWR, pairMap]
  );
  // Étiquette courte de l'ami + son pick sur le pack affiché (mode coached).
  const friendLabel = friend?.name?.trim() || 'Your friend';
  const currentFriendPick = friendReady ? friendPicks[idx] ?? null : null;

  const friendDeckText = useCallback(() => {
    if (!friendReady || !friend) return null;
    const qty = new Map<string, number>();
    friendPicks.forEach((name, i) => {
      if (friend.inDeck[i] && name) qty.set(name, (qty.get(name) || 0) + 1);
    });
    const lines = [...qty.entries()].map(([name, q]) => `${q} ${name}`);
    for (const c of COLORS5) if ((friend.basics[c] || 0) > 0) lines.push(`${friend.basics[c]} ${BASIC_OF[c]}`);
    return lines.length ? `Deck\n${lines.join('\n')}` : null;
  }, [friendReady, friend, friendPicks]);

  /** Sérialise le draft + deck du joueur courant pour le lien de partage. */
  const buildMyEntrant = useCallback((name: string): ChallengeEntrant => {
    const remaining = { ...deck };
    const pickIdx: number[] = [];
    const inDeck: boolean[] = [];
    picks.forEach((p, i) => {
      const chosen = userPicks[i] ?? p.options[0];
      pickIdx.push(Math.max(0, p.options.indexOf(chosen)));
      const left = remaining[chosen] || 0;
      if (left > 0) { remaining[chosen] = left - 1; inDeck.push(true); } else inDeck.push(false);
    });
    return { name, pickIdx, inDeck, basics };
  }, [deck, basics, picks, userPicks]);

  const shareUrl = useCallback((name: string) => {
    if (!selectedId) return '';
    return buildChallengeUrl({
      set: activeSet,
      aggregateId: selectedId,
      mode,
      entrants: [buildMyEntrant(name)],
    });
  }, [activeSet, selectedId, mode, buildMyEntrant]);

  const runCompare = async () => {
    haptics.medium();
    setAnalyzing(true);
    setAnalysis(null);
    setPhase('compare');
    const skels = skeletons as AnalysisSkeleton[];
    const friendText = friendDeckText();
    try {
      const [you, pro, friendDeck] = await Promise.all([
        analyzeDeckText(activeSet, PRACTICE_FORMAT, buildUserDeckText(), skels),
        session?.cardlist
          ? analyzeDeckText(activeSet, PRACTICE_FORMAT, cardlistToDeckText(session.cardlist), skels)
          : Promise.resolve(null),
        friendText
          ? analyzeDeckText(activeSet, PRACTICE_FORMAT, friendText, skels)
          : Promise.resolve(null),
      ]);
      setAnalysis({ you, pro, friend: friendDeck });
    } catch {
      setAnalysis({ you: null, pro: null, friend: null });
    } finally {
      setAnalyzing(false);
    }
  };
  const rankLabel = meta?.rank || (meta?.mythic_rank ? `Mythic #${meta.mythic_rank}` : 'Mythic');

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
          ) : challengePodMissing ? (
            <motion.div key="challenge-missing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              <Users size={44} className="text-slate-800" />
              <p className="text-sm font-bold text-slate-400">This challenge replay isn't available.</p>
              <p className="text-[11px] text-slate-600 max-w-sm">
                The pod behind that link isn't in the database for {activeSet} — it may have been shared from another set, or the replay is no longer seeded. Start a fresh draft instead.
              </p>
              <button onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
                Close
              </button>
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
                    {friend && (
                      <div className={`mb-5 rounded-2xl border px-4 py-3 ${friendReady ? 'border-fuchsia-500/40 bg-fuchsia-500/[0.08]' : 'border-amber-500/40 bg-amber-500/[0.08]'}`}>
                        <p className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fuchsia-200">
                          <Users size={12} /> Challenge
                        </p>
                        {friendReady ? (
                          <p className="text-[12px] text-slate-300 mt-1.5 leading-relaxed">
                            <strong className="font-black text-white">{friend.name || 'A friend'}</strong> drafted this exact pod and challenged you.
                            Same packs, same {picks.length} picks, {mode} mode — you'll see their picks and their deck once you're done.
                          </p>
                        ) : (
                          <p className="text-[12px] text-amber-200/90 mt-1.5 leading-relaxed">
                            This challenge link doesn't match the replay we have for this pod — you can still draft it, but the comparison with your friend is unavailable.
                          </p>
                        )}
                      </div>
                    )}
                    <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                      Draft like a mythic player
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-2">Trophy decks only</p>
                    <p className="text-[12px] text-slate-400 mt-3 leading-relaxed max-w-sm mx-auto">
                      Replay the exact packs this player faced on their trophy run. Pick blind, then see — card by card — where you matched the player and where you diverged.
                    </p>

                    {meta && (
                      <div className="flex items-center justify-center gap-3 mt-5 text-slate-400">
                        {/* Pas d'icônes de couleur ici : ne pas révéler ce que le joueur a drafté (mode blind). */}
                        <span className="text-[11px] font-bold">{rankLabel}{meta?.wins != null ? ` · ${meta.wins}-${meta.losses ?? 0}` : ''}</span>
                      </div>
                    )}

                    {/* mode toggle — verrouillé sur le mode du défi pour que la
                        comparaison entre les deux amis reste à armes égales. */}
                    <div className="mt-7 grid grid-cols-2 gap-2">
                      {([
                        { id: 'coached' as Mode, Icon: Eye, t: 'Coached', d: "Reveal the player's pick after each choice" },
                        { id: 'blind' as Mode, Icon: EyeOff, t: 'Blind', d: 'Full recap only at the end' },
                      ]).map(({ id, Icon, t, d }) => (
                        <button key={id} disabled={!!friend} onClick={() => { haptics.selection(); setMode(id); }}
                          className={`text-left p-3 rounded-xl border transition-all ${mode === id ? 'bg-indigo-600/20 border-indigo-400/50' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'} ${friend && mode !== id ? 'opacity-30' : ''} ${friend ? 'cursor-default' : ''}`}>
                          <div className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide ${mode === id ? 'text-indigo-200' : 'text-slate-300'}`}>
                            <Icon size={13} /> {t}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-snug">{d}</p>
                        </button>
                      ))}
                    </div>
                    {friend && (
                      <p className="text-[9px] text-slate-600 mt-2 uppercase tracking-widest font-bold">Mode set by the challenge</p>
                    )}

                    <button onClick={start}
                      className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-900/40 transition-all">
                      <Swords size={16} /> {friend ? 'Accept the challenge' : 'Start drafting'}
                    </button>
                    {!friend && (
                      <button onClick={shuffleOpponent} disabled={sessions.length < 2}
                        className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
                        <Shuffle size={12} /> Another opponent ({sessions.length} available)
                      </button>
                    )}
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
                    <CardImage key={`${n}-${i}`} src={getCardImage(n)} alt={n}
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
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3 max-w-6xl mx-auto">
                    {current.options.map((name) => {
                      const isYou = reveal === name;
                      const isPro = !!reveal && name === current.taken;
                      const isFriend = !!reveal && !!currentFriendPick && name === currentFriendPick;
                      const wr = getWR(name);
                      // Une carte peut être prise par plusieurs joueurs : on empile les
                      // étiquettes plutôt que d'en privilégier une seule.
                      const tags = [
                        isYou && { t: 'You', cls: 'bg-indigo-500 text-white' },
                        isFriend && { t: friendLabel, cls: 'bg-fuchsia-500 text-white' },
                        isPro && { t: 'Player', cls: 'bg-amber-500 text-slate-950' },
                      ].filter(Boolean) as { t: string; cls: string }[];
                      return (
                        <CardTile key={name} name={name} disabled={!!reveal}
                          onPick={() => onPick(name)}
                          ring={isYou ? 'you' : isPro ? 'pro' : isFriend ? 'friend' : 'none'}
                          dim={!!reveal && !isYou && !isPro && !isFriend}
                          badge={reveal ? (
                            <>
                              {tags.length > 0 && (
                                <span className="absolute top-1 left-1 flex flex-col items-start gap-0.5">
                                  {tags.map(({ t, cls }) => (
                                    <span key={t} className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide max-w-[72px] truncate ${cls}`}>{t}</span>
                                  ))}
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
                    <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {reveal === current.taken ? (
                        <span className="flex items-center gap-1.5 text-emerald-300 text-[12px] font-black uppercase tracking-wide"><Check size={16} /> Match!</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-amber-300 text-[12px] font-black uppercase tracking-wide"><Target size={16} /> The player took <span className="text-white normal-case font-bold">{current.taken}</span></span>
                      )}
                      {currentFriendPick && (
                        <span className="flex items-center gap-1.5 text-fuchsia-300 text-[11px] font-black uppercase tracking-wide">
                          <Users size={14} />
                          {currentFriendPick === reveal
                            ? <>{friendLabel} agreed with you</>
                            : <>{friendLabel} took <span className="text-white normal-case font-bold">{currentFriendPick}</span></>}
                        </span>
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
            <RecapView recap={recap} rankLabel={rankLabel}
              friendName={friendReady ? friendLabel : null}
              friendDetails={friendRecap?.details ?? null}
              onRetry={restart} onNew={friend ? null : () => { shuffleOpponent(); restart(); }}
              onBuild={goBuild} onClose={onClose} />

          /* ============================================ BUILD DECK */
          ) : phase === 'build' ? (
            <BuildView
              cardMeta={cardMeta} pool={pool} deck={deck} basics={basics}
              includedSpellCount={includedSpellCount} landCount={landCount} deckTotal={deckTotal}
              getWR={getWR} onAdd={addCard} onRemove={removeCard} onBump={bumpBasic} onAuto={autoLands}
              onBack={() => setPhase('recap')} onCompare={runCompare}
            />

          /* ============================================ COMPARE DECKS */
          ) : phase === 'compare' ? (
            <CompareView
              analyzing={analyzing} analysis={analysis} rankLabel={rankLabel}
              proDeckAvailable={!!session?.cardlist}
              friendName={friendReady ? (friend?.name || 'Your friend') : null}
              friendRecap={friendRecap} yourRecap={recap}
              canShare={!!selectedId && picks.length > 0}
              buildShareUrl={shareUrl}
              onBack={() => setPhase('build')} onRetry={restart}
              onNew={friend ? null : () => { shuffleOpponent(); restart(); }} onClose={onClose}
            />
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

/** Une cellule "carte + nom + WR" d'une colonne de la liste pick-par-pick. */
const PickCell: React.FC<{ name: string; wr: number | null; border: string; strong?: boolean }> = ({ name, wr, border, strong }) => (
  <span className="flex items-center gap-1.5 min-w-0 flex-1">
    <CardImage src={getCardImage(name)} alt="" className={`w-6 h-[33px] rounded object-cover border shrink-0 ${border}`} />
    <span className={`text-[11px] truncate ${strong ? 'font-bold text-slate-200' : 'text-slate-400'}`}>{name}</span>
    {wr != null && <span className={`text-[9px] font-black ${wrTone(wr)} shrink-0`}>{wr.toFixed(1)}</span>}
  </span>
);

/**
 * Liste pick par pick. Sans défi : ton pick vs celui du joueur mythic. Avec un
 * défi : trois colonnes (toi / l'ami / le joueur mythic) pour voir d'un coup
 * d'œil qui a divergé et sur quoi.
 */
const PickByPickList: React.FC<{
  details: PickDetail[];
  friendName: string | null;
  friendDetails: PickDetail[] | null;
}> = ({ details, friendName, friendDetails }) => {
  const threeWay = !!friendName && !!friendDetails;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-1.5">
        <Sparkles size={13} className="text-indigo-400" />
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pick by pick</h4>
      </div>
      {threeWay && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-800/60 bg-slate-950/40 text-[9px] font-black uppercase tracking-widest">
          <span className="w-9 shrink-0" />
          <span className="flex-1 text-indigo-300">You</span>
          <span className="flex-1 text-fuchsia-300 truncate">{friendName}</span>
          <span className="flex-1 text-amber-300">Player</span>
        </div>
      )}
      <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
        {details.map((d, i) => {
          const friendPick = friendDetails?.[i];
          return (
            <div key={i} className={`flex items-center gap-2 px-4 py-2 ${d.agree ? '' : 'bg-amber-500/[0.03]'}`}>
              <span className="w-9 text-[9px] font-black text-slate-600 tabular-nums shrink-0">P{d.pack + 1}P{d.pick + 1}</span>
              {threeWay && friendPick ? (
                <>
                  <PickCell name={d.your} wr={d.yourWr} border="border-indigo-500/40" />
                  <PickCell name={friendPick.your} wr={friendPick.yourWr} border="border-fuchsia-500/40"
                    strong={friendPick.your === d.pro} />
                  <PickCell name={d.pro} wr={d.proWr} border="border-amber-500/40" strong />
                </>
              ) : d.agree ? (
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Check size={14} className="text-emerald-400 shrink-0" />
                  <CardImage src={getCardImage(d.your)} alt="" className="w-6 h-[33px] rounded object-cover border border-slate-800 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-300 truncate">{d.your}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 flex-1 min-w-0">
                  <PickCell name={d.your} wr={d.yourWr} border="border-indigo-500/40" />
                  <ChevronRight size={12} className="text-slate-700 shrink-0" />
                  <PickCell name={d.pro} wr={d.proWr} border="border-amber-500/40" strong />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecapView: React.FC<{
  recap: Recap; rankLabel: string;
  friendName: string | null; friendDetails: PickDetail[] | null;
  onRetry: () => void; onNew: (() => void) | null; onBuild: () => void; onClose: () => void;
}> = ({ recap, rankLabel, friendName, friendDetails, onRetry, onNew, onBuild, onClose }) => {
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
                <CardImage src={getCardImage(recap.bestPick.pro)} alt="" className="w-11 h-[60px] rounded object-cover border border-emerald-500/30" />
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1"><Trophy size={11} /> Nailed it</p>
                  <p className="text-[12px] font-bold text-slate-200 truncate">{recap.bestPick.pro}</p>
                  <p className="text-[10px] text-slate-500">P{recap.bestPick.pack + 1}P{recap.bestPick.pick + 1} · matched the player on a {recap.bestPick.proWr?.toFixed(1)}% card</p>
                </div>
              </div>
            )}
            {recap.worstMiss && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-4 flex items-center gap-3">
                <CardImage src={getCardImage(recap.worstMiss.pro)} alt="" className="w-11 h-[60px] rounded object-cover border border-rose-500/30" />
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
        <PickByPickList details={recap.details} friendName={friendName} friendDetails={friendDetails} />

        {/* next step : build deck */}
        <button onClick={onBuild}
          className="group w-full flex items-center justify-between gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-900/40 transition-all">
          <span className="flex items-center gap-2.5 text-left">
            <Layers size={18} />
            <span>
              <span className="block text-sm font-black uppercase tracking-widest">Now build your deck</span>
              <span className="block text-[10px] text-indigo-200 font-bold normal-case tracking-normal">Different picks, but is your deck just as good?</span>
            </span>
          </span>
          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </button>

        {/* secondary actions */}
        <div className="flex flex-col sm:flex-row gap-3 pb-4">
          <button onClick={onRetry} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest transition-colors">
            <RotateCcw size={14} /> Redraft this pod
          </button>
          {onNew && (
            <button onClick={onNew} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest transition-colors">
              <Shuffle size={14} /> New opponent
            </button>
          )}
          <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================ BUILD VIEW
type SortKey = 'color' | 'cmc' | 'type';
const BuildView: React.FC<{
  cardMeta: Record<string, DraftCardMeta>;
  pool: { name: string; count: number }[];
  deck: Record<string, number>;
  basics: Record<string, number>;
  includedSpellCount: number; landCount: number; deckTotal: number;
  getWR: (n: string) => number | null;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onBump: (c: string, d: number) => void;
  onAuto: () => void;
  onBack: () => void;
  onCompare: () => void;
}> = ({ cardMeta, pool, deck, basics, includedSpellCount, landCount, deckTotal, getWR, onAdd, onRemove, onBump, onAuto, onBack, onCompare }) => {
  const isMobile = useIsMobile();
  const [dragOver, setDragOver] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('color');
  const onTarget = deckTotal === 40;

  // Rang couleur : mono WUBRG (0-4), or/multicolore (5), incolore/terrain (6)
  const rankColor = (n: string) => {
    const cs = (cardMeta[n]?.colors || '').replace(/[^WUBRG]/g, '');
    if (!cs) return 6;
    if (cs.length > 1) return 5;
    return 'WUBRG'.indexOf(cs[0]);
  };
  const cmcOf = (n: string) => cardMeta[n]?.cmc ?? 99;
  const isCre = (n: string) => cardMeta[n]?.isCreature ?? false;
  const cmp = (na: string, nb: string) => {
    if (sortKey === 'cmc') return cmcOf(na) - cmcOf(nb) || rankColor(na) - rankColor(nb) || na.localeCompare(nb);
    if (sortKey === 'type') return (isCre(na) ? 0 : 1) - (isCre(nb) ? 0 : 1) || cmcOf(na) - cmcOf(nb) || na.localeCompare(nb);
    return rankColor(na) - rankColor(nb) || cmcOf(na) - cmcOf(nb) || na.localeCompare(nb);
  };

  const sortedPool = [...pool].sort((a, b) => cmp(a.name, b.name));
  const deckEntries = pool
    .filter((p) => (deck[p.name] || 0) > 0)
    .map((p) => ({ name: p.name, qty: deck[p.name] }))
    .sort((a, b) => cmp(a.name, b.name));

  return (
    <motion.div key="build" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col">
      {/* counter strip */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={16} className="text-indigo-400 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-300 truncate">Build your deck</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold shrink-0">
            <span className="text-slate-400">{includedSpellCount} <span className="text-slate-600">spells</span></span>
            <span className="text-slate-400">{landCount} <span className="text-slate-600">lands</span></span>
            <span className={`tabular-nums font-black ${onTarget ? 'text-emerald-300' : 'text-amber-300'}`}>{deckTotal}/40</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Sort</span>
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 overflow-hidden text-[9px] font-black uppercase tracking-widest">
            {([['color', 'Color'], ['cmc', 'CMC'], ['type', 'Type']] as [SortKey, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setSortKey(k)}
                className={`px-2.5 py-1.5 transition-colors ${sortKey === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[10px] text-slate-600 hidden sm:block">
            {isMobile ? 'Tap to add' : 'Double-click or drag to add · click deck card to remove'}
          </span>
        </div>
      </div>

      {/* pool (2/3) + deck (1/3), stacked on mobile */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 px-4 md:px-6 overflow-y-auto md:overflow-hidden pb-3">
        {/* POOL */}
        <div className="md:w-2/3 md:min-h-0 md:overflow-y-auto">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1.5 md:sticky md:top-0 md:bg-slate-950 md:py-1 z-10">Your pool</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {sortedPool.map((p) => {
              const inDeck = deck[p.name] || 0;
              const remaining = p.count - inDeck;
              const used = remaining <= 0;
              const wr = getWR(p.name);
              return (
                <div
                  key={p.name}
                  draggable={!used}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', p.name)}
                  onClick={isMobile ? () => onAdd(p.name) : undefined}
                  onDoubleClick={!isMobile ? () => onAdd(p.name) : undefined}
                  className={`group relative rounded-lg overflow-hidden border bg-black aspect-[63/88] select-none transition-transform ${
                    used ? 'border-slate-800 opacity-35 saturate-50 cursor-default' : 'border-slate-700/70 hover:border-indigo-400/60 hover:-translate-y-0.5 cursor-pointer'
                  }`}
                >
                  <CardImage src={getCardImage(p.name)} alt={p.name} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                  {/* copies remaining vs drafted */}
                  {p.count > 1 && (
                    <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-slate-950/85 text-[8px] font-black text-slate-200">{remaining}/{p.count}</span>
                  )}
                  {inDeck > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center rounded-full bg-indigo-500 text-white text-[8px] font-black">{inDeck}</span>
                  )}
                  {wr != null && (
                    <span className={`absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 text-[8px] font-black ${wrTone(wr)}`}>{wr.toFixed(1)}</span>
                  )}
                  {!used && !isMobile && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-indigo-600/40 to-transparent transition-opacity grid place-items-center">
                      <Plus size={18} className="text-white drop-shadow" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DECK */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const n = e.dataTransfer.getData('text/plain'); if (n) onAdd(n); }}
          className={`md:w-1/3 md:min-h-0 md:overflow-y-auto rounded-xl border ${dragOver ? 'border-indigo-400 bg-indigo-500/[0.07]' : 'border-slate-800 bg-slate-900/40'} transition-colors`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 md:sticky md:top-0 bg-slate-900/80 backdrop-blur z-10">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Your deck</span>
            <span className={`text-[11px] font-black tabular-nums ${onTarget ? 'text-emerald-300' : 'text-amber-300'}`}>{deckTotal}/40</span>
          </div>

          {deckEntries.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[11px] text-slate-600">{isMobile ? 'Tap pool cards to add them here.' : 'Double-click or drop pool cards here.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {deckEntries.map((d) => {
                const wr = getWR(d.name);
                return (
                  <button key={d.name} onClick={() => onRemove(d.name)}
                    className="group/row flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-rose-500/[0.06] transition-colors text-left">
                    <span className="w-5 text-center text-[11px] font-black text-indigo-300 tabular-nums shrink-0">{d.qty}</span>
                    <CardImage src={getCardImage(d.name)} alt="" className="w-6 h-[33px] rounded object-cover border border-slate-800 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-300 truncate flex-1">{d.name}</span>
                    {wr != null && <span className={`text-[9px] font-black shrink-0 ${wrTone(wr)}`}>{wr.toFixed(1)}</span>}
                    <Minus size={13} className="text-slate-600 group-hover/row:text-rose-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* basics */}
          <div className="px-2.5 py-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Lands</span>
              <button onClick={onAuto} className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[9px] font-black uppercase tracking-widest text-slate-300">
                <Wand2 size={11} /> Auto
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLORS5.map((c) => (
                <div key={c} className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                  <ManaIcons colors={c} size="sm" />
                  <button onClick={() => onBump(c, -1)} className="p-0.5 text-slate-400 hover:text-white"><Minus size={11} /></button>
                  <span className="w-3.5 text-center text-[11px] font-black text-white tabular-nums">{basics[c]}</span>
                  <button onClick={() => onBump(c, 1)} className="p-0.5 text-slate-400 hover:text-white"><Plus size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/90 backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
            <ChevronLeft size={14} /> Back
          </button>
          <button onClick={onCompare} disabled={includedSpellCount === 0}
            className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-widest transition-all">
            <Swords size={14} /> Compare to player's deck
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================ COMPARE VIEW
const scoreTone = (s: number) => (s >= 72 ? 'text-emerald-300' : s >= 55 ? 'text-sky-300' : 'text-amber-300');
const scoreRing = (s: number) => (s >= 72 ? 'from-emerald-400 to-teal-500' : s >= 55 ? 'from-sky-400 to-indigo-500' : 'from-amber-400 to-orange-500');

const MetricRow: React.FC<{ label: string; value: string; pct: number; tone?: string }> = ({ label, value, pct, tone }) => (
  <div>
    <div className="flex items-center justify-between text-[10px] mb-1">
      <span className="text-slate-500 font-bold">{label}</span>
      <span className={`font-black tabular-nums ${tone || 'text-slate-300'}`}>{value}</span>
    </div>
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  </div>
);

const DeckScoreCard: React.FC<{ title: string; accent: string; analysis: DeckAnalysisResult | null; score: DeckScore | null }> = ({ title, accent, analysis, score }) => {
  if (!analysis || !score) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col items-center justify-center text-center min-h-[260px]">
        <p className={`text-[10px] font-black uppercase tracking-widest ${accent} mb-2`}>{title}</p>
        <p className="text-[11px] text-slate-600">Deck unavailable for this replay.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>{title}</p>
        <p className="text-[9px] font-bold text-slate-500 truncate max-w-[55%] text-right">{analysis.matchedArchetype}</p>
      </div>
      <div className="flex items-center justify-center">
        <div className={`relative w-24 h-24 rounded-full grid place-items-center bg-gradient-to-br ${scoreRing(score.score)} shadow-xl`}>
          <span className="text-4xl font-black text-slate-950 tabular-nums">{score.score}</span>
        </div>
      </div>
      <div className="space-y-2.5">
        <MetricRow label="Avg win rate" value={score.avgWr != null ? `${score.avgWr.toFixed(1)}%` : '—'} pct={score.avgWr != null ? (score.avgWr - 50) * 10 : 0} tone={scoreTone(score.score)} />
        <MetricRow label="Curve fit" value={`${Math.round(score.curveFit * 100)}%`} pct={score.curveFit * 100} />
        <MetricRow label="Creature balance" value={`${Math.round(score.creatureFit * 100)}%`} pct={score.creatureFit * 100} />
        <MetricRow label="Core coverage" value={score.coreTotal > 0 ? `${score.corePresent}/${score.coreTotal}` : '—'} pct={(score.coreCoverage ?? 0) * 100} />
      </div>
    </div>
  );
};

// Rendu visuel d'un deck en colonnes de courbe de mana (réutilise CmcStack).
const DeckBoard: React.FC<{ title: string; accent: string; analysis: DeckAnalysisResult }> = ({ title, accent, analysis }) => {
  const metaByName = analysis.metaByName || {};
  const { stacks, lands } = useMemo(() => {
    const stacks: Record<number, SkeletonCard[]> = {};
    for (let c = 0; c <= 7; c += 1) stacks[c] = [];
    const lands: SkeletonCard[] = [];
    for (const card of analysis.mainCards || []) {
      const meta = metaByName[card.name];
      const mk = (cmc: number): SkeletonCard => ({ name: card.name, cmc, type: meta?.type || '', cost: meta?.cost || '', rarity: meta?.rarity || '' });
      const isLand = isLandCard(card.name, metaByName);
      for (let i = 0; i < card.qty; i += 1) {
        if (isLand) lands.push(mk(0));
        else { const cmc = Math.max(0, Math.min(7, Math.round(Number(meta?.cmc ?? 0)))); stacks[cmc].push(mk(cmc)); }
      }
    }
    return { stacks, lands };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  const maxCmc = Math.max(5, ...Object.keys(stacks).map(Number).filter((c) => stacks[c].length > 0));
  const cmcRange = Array.from({ length: maxCmc + 1 }, (_, i) => i);
  const total = (analysis.mainCards || []).reduce((s, c) => s + c.qty, 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>{title}</p>
        <p className="text-[9px] font-bold text-slate-500 truncate ml-2">{analysis.matchedArchetype} · {total} cards</p>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex flex-nowrap items-start gap-0 md:gap-1 min-w-[620px] [&>div]:flex-1 [&>div]:min-w-0 [&>div]:w-auto">
          {cmcRange.map((cmc) => (
            <CmcStack key={cmc} cmc={cmc} cards={stacks[cmc]} onCardSelect={() => {}} />
          ))}
          {lands.length > 0 && (
            <CmcStack cmc={0} label={<span className="text-[11px] uppercase tracking-wide">Lands</span>} cards={lands} onCardSelect={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Une métrique du duel sur trois colonnes : toi / l'ami / le joueur mythic.
 * Le meilleur des deux amis est surligné ; le pro sert de référence (il n'est
 * pas « battu », c'est l'étalon du format).
 */
const DuelRow: React.FC<{
  label: string; you: number; friend: number; pro?: number | null;
  suffix?: string; decimals?: number;
}> = ({ label, you, friend, pro, suffix = '', decimals }) => {
  const d = decimals ?? (suffix === '%' ? 1 : 0);
  const youWins = you > friend + 1e-9;
  const friendWins = friend > you + 1e-9;
  const fmt = (v: number) => `${v.toFixed(d)}${suffix}`;
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[11px] text-slate-400 leading-snug">{label}</span>
      <span className={`w-16 text-right text-[12px] font-black tabular-nums ${youWins ? 'text-emerald-300' : 'text-slate-300'}`}>{fmt(you)}</span>
      <span className={`w-16 text-right text-[12px] font-black tabular-nums ${friendWins ? 'text-emerald-300' : 'text-slate-300'}`}>{fmt(friend)}</span>
      <span className="w-16 text-right text-[12px] font-black tabular-nums text-amber-300/80">
        {pro != null ? fmt(pro) : '—'}
      </span>
    </div>
  );
};

/** Génère et copie le lien de défi (Web Share sur mobile si dispo). */
const ShareChallengeCard: React.FC<{ buildShareUrl: (name: string) => string }> = ({ buildShareUrl }) => {
  const [name, setName] = useLocalStorage<string>('limitless-draft-name', '');
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [link, setLink] = useState('');

  const share = async () => {
    haptics.medium();
    const url = buildShareUrl(name.trim() || 'A friend');
    if (!url) { setState('error'); return; }
    setLink(url);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Draft Practice challenge', text: 'Same packs, same picks — beat my deck.', url });
        setState('copied');
        return;
      }
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // Partage annulé ou clipboard refusé : on affiche le lien à copier à la main.
      setState('error');
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.06] p-5">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 flex items-center gap-1.5">
        <Share2 size={13} /> Challenge a friend
      </h4>
      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
        Send a link that replays this exact pod. Your friend drafts it blind, then compares their picks and their deck to yours. Everything travels in the link — nothing is stored.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value.slice(0, 24)); setState('idle'); }}
          placeholder="Your name"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[12px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60"
        />
        <button onClick={share}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-black uppercase tracking-widest transition-all">
          {state === 'copied' ? <><Check size={14} /> Link copied</> : <><Share2 size={14} /> Share with a friend</>}
        </button>
      </div>
      {state === 'error' && link && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1">Copy this link manually</p>
          <textarea readOnly value={link} rows={2}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-mono break-all" />
        </div>
      )}
    </div>
  );
};

const CompareView: React.FC<{
  analyzing: boolean;
  analysis: DeckAnalyses | null;
  rankLabel: string;
  proDeckAvailable: boolean;
  /** Nom de l'ami quand un défi est en cours et exploitable, sinon null. */
  friendName: string | null;
  friendRecap: Recap | null;
  yourRecap: Recap | null;
  canShare: boolean;
  buildShareUrl: (name: string) => string;
  onBack: () => void; onRetry: () => void; onNew: (() => void) | null; onClose: () => void;
}> = ({ analyzing, analysis, rankLabel, proDeckAvailable, friendName, friendRecap, yourRecap, canShare, buildShareUrl, onBack, onRetry, onNew, onClose }) => {
  const [showDecks, setShowDecks] = useState(false);
  const youScore = analysis?.you ? scoreDeckAnalysis(analysis.you) : null;
  const proScore = analysis?.pro ? scoreDeckAnalysis(analysis.pro) : null;
  const friendScore = analysis?.friend ? scoreDeckAnalysis(analysis.friend) : null;

  const verdict = (() => {
    if (!youScore) return null;
    // En défi, le duel qui intéresse le joueur est celui contre son ami.
    if (friendName && friendScore) {
      const diff = youScore.score - friendScore.score;
      if (diff >= 3) return { t: `You beat ${friendName}`, d: `Same packs, different reads — and your deck scores ${diff} points higher. Send them the bad news.`, tone: 'text-emerald-300' };
      if (diff >= -3) return { t: 'Too close to call', d: `You and ${friendName} came out of the same pod with decks of equal strength.`, tone: 'text-sky-300' };
      return { t: `${friendName} edged it`, d: `Their deck scores ${-diff} points higher from the same packs — check their picks below to see where they gained.`, tone: 'text-amber-300' };
    }
    if (!proScore) return { t: 'Your deck is locked in', d: "We couldn't score the player's deck for this replay — but yours holds up on its own.", tone: 'text-sky-300' };
    const diff = youScore.score - proScore.score;
    if (diff >= 3) return { t: 'Different path, better deck', d: 'You drafted differently from the player — and your deck scores higher. Trusting your read paid off.', tone: 'text-emerald-300' };
    if (diff >= -3) return { t: 'Neck and neck', d: 'A different draft, yet a deck just as strong. Several roads lead to a trophy.', tone: 'text-sky-300' };
    return { t: 'The player edged it', d: 'Their deck scores higher this time — study where their picks built more synergy.', tone: 'text-amber-300' };
  })();

  return (
    <motion.div key="compare" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto">
      <div className="px-4 md:px-6 py-8 space-y-6">
        {/* Bloc étroit : titre + verdict + scores */}
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Deck comparison</p>
            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mt-1">
              {friendName ? `Your deck vs ${friendName}` : `Your deck vs ${rankLabel}`}
            </h3>
            <p className="text-[10px] text-slate-600 mt-1">Same engine as “Test my deck” — scored against trophy-deck skeletons.</p>
          </div>

          {analyzing ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <Loader2 className="animate-spin text-indigo-400" size={36} />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Scoring both decks…</p>
            </div>
          ) : (
            <>
              {verdict && (
                <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-5 text-center">
                  <p className={`text-lg font-black ${verdict.tone}`}>{verdict.t}</p>
                  <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed max-w-md mx-auto">{verdict.d}</p>
                </div>
              )}

              <div className={`grid grid-cols-1 gap-3 ${friendName ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <DeckScoreCard title="You" accent="text-indigo-300" analysis={analysis?.you ?? null} score={youScore} />
                {friendName && (
                  <DeckScoreCard title={friendName} accent="text-fuchsia-300" analysis={analysis?.friend ?? null} score={friendScore} />
                )}
                <DeckScoreCard title="Player" accent="text-amber-300" analysis={analysis?.pro ?? null} score={proScore} />
              </div>

              {/* Duel des drafts : mêmes packs, trois lectures différentes. */}
              {friendName && yourRecap && friendRecap && (
                <div className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/[0.05] p-5 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-fuchsia-200 flex items-center gap-1.5">
                    <Users size={13} /> Draft duel · you vs {friendName}
                  </h4>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest pb-1 border-b border-slate-800/60">
                    <span className="flex-1" />
                    <span className="w-16 text-right text-indigo-300">You</span>
                    <span className="w-16 text-right text-fuchsia-300 truncate">{friendName}</span>
                    <span className="w-16 text-right text-amber-300/80">Player</span>
                  </div>
                  {/* Colonne "Player" vide ici : l'accord du joueur mythic avec
                      lui-même vaut 100% par construction, l'afficher n'apprend rien. */}
                  <DuelRow label="Agreement with the mythic player" you={yourRecap.agreement * 100} friend={friendRecap.agreement * 100} suffix="%" />
                  {yourRecap.userQuality != null && friendRecap.userQuality != null && (
                    <DuelRow label="Took the best-WR card available" you={yourRecap.userQuality * 100} friend={friendRecap.userQuality * 100}
                      pro={yourRecap.proQuality != null ? yourRecap.proQuality * 100 : null} suffix="%" />
                  )}
                  {yourRecap.userAvgWr != null && friendRecap.userAvgWr != null && (
                    <DuelRow label="Avg win rate of picks" you={yourRecap.userAvgWr} friend={friendRecap.userAvgWr} pro={yourRecap.proAvgWr} suffix="%" />
                  )}
                  {yourRecap.synergyAvailable && (
                    <DuelRow label="Synergy between picks" you={yourRecap.userSynergy} friend={friendRecap.userSynergy} pro={yourRecap.proSynergy} decimals={1} />
                  )}
                  <p className="text-[10px] text-slate-500">
                    Same {yourRecap.n} picks, same packs — {friendName} picked differently on {yourRecap.details.filter((d, i) => d.your !== friendRecap.details[i]?.your).length} of them.
                  </p>
                </div>
              )}

              {/* Rappel des choix : toi / l'ami / le joueur mythic, pick par pick. */}
              {yourRecap && (
                <PickByPickList details={yourRecap.details}
                  friendName={friendName} friendDetails={friendRecap?.details ?? null} />
              )}

              {(analysis?.you || analysis?.pro) && (
                <button onClick={() => setShowDecks((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
                  <Layers size={14} /> {showDecks ? 'Hide decklists' : 'View both decklists'}
                  <ChevronRight size={14} className={`transition-transform ${showDecks ? 'rotate-90' : ''}`} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Bloc large : decklists visuelles (beaucoup plus grandes sur desktop) */}
        {!analyzing && (
          <AnimatePresence initial={false}>
            {showDecks && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }} className="overflow-hidden">
                <div className="max-w-6xl mx-auto space-y-4">
                  {analysis?.you && <DeckBoard title="Your deck" accent="text-indigo-300" analysis={analysis.you} />}
                  {friendName && analysis?.friend && (
                    <DeckBoard title={`${friendName}'s deck`} accent="text-fuchsia-300" analysis={analysis.friend} />
                  )}
                  {analysis?.pro && <DeckBoard title={`Player's deck`} accent="text-amber-300" analysis={analysis.pro} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Bloc étroit : partage + note + actions */}
        {!analyzing && (
          <div className="max-w-3xl mx-auto space-y-6">
            {canShare && <ShareChallengeCard buildShareUrl={buildShareUrl} />}

            {!proDeckAvailable && (
              <p className="text-[10px] text-slate-600 text-center">The player's final deck wasn't captured for this older replay. Newer replays include it.</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pb-4">
              <button onClick={onBack} className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
                <ChevronLeft size={14} /> Tweak deck
              </button>
              {onNew && (
                <button onClick={onNew} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-black uppercase tracking-widest transition-all">
                  <Shuffle size={14} /> New opponent
                </button>
              )}
              <button onClick={onRetry} className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
                <RotateCcw size={14} /> Redraft
              </button>
              <button onClick={onClose} className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
