import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Link2, Trophy, Users, HelpCircle, ArrowRight, Sparkles, ArrowLeftRight,
  ChevronRight, LayoutList, GalleryHorizontalEnd, Blocks, Anchor,
} from 'lucide-react';
import type { Card } from '../../types';
import { RARITY_STYLES } from '../../constants';
import { extractColors, getCardImage, normalizeRarity } from '../../utils/helpers';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useFormatSynergies, MIN_SIGNIFICANT_LIFT } from '../../queries/useDraftPractice';
import CardImage from '../Common/CardImage';
import { SearchAutocomplete } from '../Common/SearchAutocomplete';
import { Tooltip } from '../Common/Tooltip';
import { haptics } from '../../utils/haptics';
import {
  useCardSynergies,
  useTopFormatSynergies,
  type CardSynergy,
} from '../../queries/useCardSynergies';

interface CardSynergiesOverlayProps {
  cards: Card[];
  activeSet: string;
  activeFormat: string;
  onClose: () => void;
  onCardSelect?: (card: Card) => void;
}

type MobileTab = 'lift' | 'played';
/** Densité des listes (desktop only) : lignes compactes ou galerie de cartes. */
type ListLayout = 'rows' | 'gallery';
/** Objet du classement : les paires, ou les cartes agrégées sur leurs paires. */
type TopView = 'pairs' | 'cards';
/** Le filtre couleur porte sur une carte de la paire, ou sur les deux. */
type ColorScope = 'any' | 'both';

const TOP_LIMIT = 20;
const CARD_LIMIT = 10;
/** Lift à partir duquel une partenaire compte dans le score de "colle". */
const GLUE_LIFT = 1.5;
/** Nombre de meilleures partenaires moyennées pour noter une carte. */
const HUB_TOP_N = 5;
const FILTER_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

const formatLift = (lift: number) => `x${lift.toFixed(2)}`;
const formatPct = (value: number) => `${Math.round(value * 100)}%`;

// Halo coloré derrière une carte en mode vitrine — reprend son identité mana.
const COLOR_GLOW: Record<string, string> = {
  W: '#fcd34d',
  U: '#60a5fa',
  B: '#a78bfa',
  R: '#f87171',
  G: '#4ade80',
};

const cardGlow = (card: Card | null): string => {
  if (!card) return '#94a3b8';
  const raw = Array.isArray(card.colors) ? card.colors.join('') : card.colors || '';
  const cols = extractColors(raw);
  if (!cols) return '#94a3b8';
  if (cols.length > 1) return '#fbbf24';
  return COLOR_GLOW[cols[0]] || '#94a3b8';
};

// --- Sous-composants ---

const ColumnHeader: React.FC<{
  icon: React.ReactNode;
  label: string;
  help: string;
  accent: string;
}> = ({ icon, label, help, accent }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className={accent}>{icon}</span>
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
    <Tooltip content={<div className="max-w-[240px] text-[10px] leading-relaxed">{help}</div>}>
      <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
    </Tooltip>
  </div>
);

const ScoreBadge: React.FC<{ value: string; tone: 'lift' | 'played'; large?: boolean }> = ({ value, tone, large = false }) => (
  <span
    className={`flex-shrink-0 rounded-lg font-black tabular-nums border ${
      large ? 'px-3 py-1.5 text-base' : 'px-2 py-1 text-xs'
    } ${
      tone === 'lift'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    }`}
  >
    {value}
  </span>
);

/**
 * Filtre couleur des tops. Le mode "both" est le seul qui neutralise le
 * confondant couleur : deux cartes rouges-noires se croisent surtout parce que
 * les decks RN existent, pas parce qu'elles interagissent.
 */
const ColorFilter: React.FC<{
  selected: string[];
  onToggle: (c: string) => void;
  scope: ColorScope;
  onScope: (s: ColorScope) => void;
  showScope: boolean;
}> = ({ selected, onToggle, scope, onScope, showScope }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-full border border-slate-800">
      {FILTER_COLORS.map(c => {
        const active = selected.includes(c);
        return (
          <button
            key={c}
            onClick={() => { haptics.light(); onToggle(c); }}
            title={c === 'C' ? 'Colorless' : c}
            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
              active ? 'scale-110 shadow-md border-white' : 'border-transparent opacity-50 grayscale hover:opacity-90'
            }`}
          >
            {c === 'C' ? (
              <span className="w-full h-full rounded-full bg-slate-400 flex items-center justify-center text-[8px] font-black text-slate-900">C</span>
            ) : (
              <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} alt={c} className="w-full h-full" />
            )}
          </button>
        );
      })}
    </div>
    {showScope && selected.length > 0 && (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/60 border border-slate-800">
          {([
            { id: 'any' as ColorScope, label: 'Either card' },
            { id: 'both' as ColorScope, label: 'Both cards' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { haptics.light(); onScope(id); }}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                scope === id ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Tooltip content={
          <div className="max-w-[260px] text-[10px] leading-relaxed space-y-1.5">
            <p><strong className="text-slate-200">Either card</strong> — keeps a pair as soon as one of the two cards is in that colour. You see everything the colour touches, including its pairings with other colours.</p>
            <p><strong className="text-slate-200">Both cards</strong> — keeps only pairs where both cards are in that colour. Stricter, and far more meaningful: colour is the main reason two cards share decks, so this strips out pairs that are only together because their colour pair exists.</p>
          </div>
        }>
          <HelpCircle size={13} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
        </Tooltip>
      </div>
    )}
  </div>
);

/** Bascule paires / cartes. */
const TopViewToggle: React.FC<{ value: TopView; onChange: (v: TopView) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/60 border border-slate-800 w-fit">
    {([
      { id: 'pairs' as TopView, label: 'Pairs', Icon: Link2 },
      { id: 'cards' as TopView, label: 'Cards', Icon: Blocks },
    ]).map(({ id, label, Icon }) => (
      <button
        key={id}
        onClick={() => { haptics.light(); onChange(id); }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
          value === id ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Icon size={12} /> {label}
      </button>
    ))}
  </div>
);

/** Bascule de densité des listes — desktop uniquement. */
const LayoutToggle: React.FC<{ value: ListLayout; onChange: (v: ListLayout) => void }> = ({ value, onChange }) => (
  <div className="hidden md:flex items-center gap-1 p-1 rounded-lg bg-slate-900/60 border border-slate-800 w-fit">
    {([
      { id: 'gallery' as ListLayout, label: 'Cards', Icon: GalleryHorizontalEnd },
      { id: 'rows' as ListLayout, label: 'List', Icon: LayoutList },
    ]).map(({ id, label, Icon }) => (
      <button
        key={id}
        onClick={() => { haptics.light(); onChange(id); }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
          value === id ? 'bg-slate-700/80 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <Icon size={12} /> {label}
      </button>
    ))}
  </div>
);

const Thumb: React.FC<{ name: string; className?: string }> = ({ name, className = 'w-8 h-11' }) => (
  <CardImage
    src={getCardImage(name)}
    alt={name}
    className={`${className} rounded object-cover bg-slate-950 border border-slate-800 flex-shrink-0`}
  />
);

// En galerie les visuels priment : vignettes ~3x plus larges et typo agrandie.
const GALLERY_THUMB = 'w-[4.5rem] lg:w-24 aspect-[488/680]';
const rowShell = (gallery: boolean) =>
  `w-full flex items-center rounded-xl bg-slate-900/50 border border-slate-800/70 hover:bg-slate-800/60 hover:border-slate-600 transition-all text-left ${
    gallery ? 'gap-3 p-3' : 'gap-2 p-2'
  }`;

/** Ligne d'une paire complète (vue globale) : les deux cartes sont affichées. */
const PairRow: React.FC<{
  rank: number;
  cardA: string;
  cardB: string;
  score: string;
  tone: 'lift' | 'played';
  directed?: boolean;
  gallery?: boolean;
  onClick: () => void;
}> = ({ rank, cardA, cardB, score, tone, directed = false, gallery = false, onClick }) => (
  <button onClick={onClick} className={rowShell(gallery)}>
    <span className={`flex-shrink-0 font-black text-slate-600 tabular-nums ${gallery ? 'w-5 text-xs' : 'w-4 text-[10px]'}`}>
      {rank}
    </span>
    <Thumb name={cardA} className={gallery ? GALLERY_THUMB : undefined} />
    <Thumb name={cardB} className={gallery ? GALLERY_THUMB : undefined} />
    <div className="flex-1 min-w-0">
      <div className={`font-bold text-slate-200 truncate ${gallery ? 'text-sm' : 'text-[11px] md:text-xs'}`}>{cardA}</div>
      <div className={`flex items-center gap-1 text-slate-400 truncate ${gallery ? 'text-sm' : 'text-[11px] md:text-xs'}`}>
        {directed ? (
          <ArrowRight size={gallery ? 12 : 10} className="text-slate-600 flex-shrink-0" />
        ) : (
          <span className="text-slate-600">+</span>
        )}
        <span className="truncate">{cardB}</span>
      </div>
    </div>
    <ScoreBadge value={score} tone={tone} large={gallery} />
  </button>
);

/** Ligne d'un partenaire (vue carte) : la carte de référence est implicite. */
const PartnerRow: React.FC<{
  rank: number;
  partner: string;
  score: string;
  subtitle: string;
  tone: 'lift' | 'played';
  gallery?: boolean;
  onClick: () => void;
}> = ({ rank, partner, score, subtitle, tone, gallery = false, onClick }) => (
  <button onClick={onClick} className={rowShell(gallery)}>
    <span className={`flex-shrink-0 font-black text-slate-600 tabular-nums ${gallery ? 'w-5 text-xs' : 'w-4 text-[10px]'}`}>
      {rank}
    </span>
    <Thumb name={partner} className={gallery ? GALLERY_THUMB : undefined} />
    <div className="flex-1 min-w-0">
      <div className={`font-bold text-slate-200 truncate ${gallery ? 'text-sm' : 'text-[11px] md:text-xs'}`}>{partner}</div>
      <div className={`text-slate-500 truncate ${gallery ? 'text-[11px]' : 'text-[10px]'}`}>{subtitle}</div>
    </div>
    <ScoreBadge value={score} tone={tone} large={gallery} />
  </button>
);

const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-[3.25rem] rounded-xl bg-slate-900/60 border border-slate-800/50 animate-pulse" />
    ))}
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
    {message}
  </div>
);

/** Confidence orientée "quand j'ai `from`, `to` est là X% du temps". */
const ConfidenceTile: React.FC<{ from: string; to: string; value: number }> = ({ from, to, value }) => (
  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-400">
        <span className="font-bold text-slate-200 truncate">{from}</span>
        <ArrowRight size={11} className="text-slate-600 flex-shrink-0" />
        <span className="truncate">{to}</span>
      </div>
      <span className="text-sm font-black text-blue-400 tabular-nums flex-shrink-0">{formatPct(value)}</span>
    </div>
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value * 100)}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
    <p className="text-[10px] text-slate-500 mt-1.5">
      When <span className="text-slate-400">{from}</span> is in a trophy deck,{' '}
      <span className="text-slate-400">{to}</span> is there {formatPct(value)} of the time.
    </p>
  </div>
);

/** Carte plein format du mode vitrine, avec halo aux couleurs de la carte. */
const CardHero: React.FC<{ card: Card; onOpen?: () => void }> = ({ card, onOpen }) => {
  const glow = cardGlow(card);
  const rarity = normalizeRarity(card.rarity);

  return (
    <button onClick={onOpen} className="group relative flex-shrink-0 flex flex-col items-center">
      <div
        className="absolute -inset-4 rounded-[2rem] blur-3xl opacity-25 group-hover:opacity-45 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
      />
      <CardImage
        src={getCardImage(card.name)}
        alt={card.name}
        className="relative w-44 lg:w-52 aspect-[488/680] rounded-2xl object-cover bg-slate-950 border border-white/10 shadow-2xl transition-transform duration-300 group-hover:-translate-y-1.5"
      />
      <div className="relative mt-3 flex flex-col items-center gap-1 max-w-[13rem]">
        <span className="text-sm font-black text-white text-center leading-tight group-hover:text-indigo-200 transition-colors">
          {card.name}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] px-1.5 rounded border font-black ${RARITY_STYLES[rarity]}`}>{rarity}</span>
          {card.gih_wr != null && (
            <span className="text-[10px] font-bold text-slate-400 tabular-nums">{card.gih_wr.toFixed(1)}% GIH</span>
          )}
        </div>
      </div>
    </button>
  );
};

/** Médaillon central : le lift de la paire, ou un état muet si aucune donnée. */
const LiftMedallion: React.FC<{ lift: number | null }> = ({ lift }) => (
  <motion.div
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    className="relative flex-shrink-0"
  >
    {lift !== null && (
      <div className="absolute inset-0 rounded-full bg-emerald-500/25 blur-2xl" />
    )}
    <div
      className={`relative w-28 h-28 lg:w-32 lg:h-32 rounded-full flex flex-col items-center justify-center border-2 backdrop-blur ${
        lift !== null
          ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/10 border-emerald-400/50'
          : 'bg-slate-900/80 border-slate-700'
      }`}
    >
      {lift !== null ? (
        <>
          <Sparkles size={14} className="text-emerald-400 mb-0.5" />
          <span className="text-2xl lg:text-3xl font-black text-emerald-300 tabular-nums leading-none">
            {formatLift(lift)}
          </span>
          <span className="mt-1 text-[9px] font-black text-emerald-500/70 uppercase tracking-widest">Lift</span>
        </>
      ) : (
        <>
          <Sparkles size={14} className="text-slate-600 mb-1" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">No data</span>
        </>
      )}
    </div>
  </motion.div>
);

// --- Overlay ---

export const CardSynergiesOverlay: React.FC<CardSynergiesOverlayProps> = ({
  cards,
  activeSet,
  activeFormat,
  onClose,
  onCardSelect,
}) => {
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('lift');
  const [showHelp, setShowHelp] = useState(false);
  const [listLayout, setListLayout] = useState<ListLayout>('gallery');
  const [topView, setTopView] = useState<TopView>('pairs');
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [colorScope, setColorScope] = useState<ColorScope>('any');
  const isMobile = useIsMobile(768);

  // Un nom saisi ne compte que s'il correspond exactement à une carte du set.
  const resolveCard = useMemo(() => {
    const byName = new Map(cards.map(c => [c.name.toLowerCase(), c] as const));
    return (value: string): Card | null => byName.get(value.trim().toLowerCase()) || null;
  }, [cards]);

  // Couleurs par nom de carte, pour filtrer des paires dont on n'a que les noms.
  // Une carte incolore est marquée 'C' pour rester filtrable.
  const colorsByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) {
      const raw = Array.isArray(c.colors) ? c.colors.join('') : c.colors || '';
      m.set(c.name, extractColors(raw) || 'C');
    }
    return m;
  }, [cards]);

  const matchesColor = useCallback((name: string) => {
    if (!colorFilters.length) return true;
    const cols = colorsByName.get(name);
    // Carte inconnue du set courant : on ne la masque pas silencieusement.
    if (cols == null) return true;
    return colorFilters.some(f => cols.includes(f));
  }, [colorFilters, colorsByName]);

  const pairMatchesColor = useCallback((a: string, b: string) => {
    if (!colorFilters.length) return true;
    return colorScope === 'both'
      ? matchesColor(a) && matchesColor(b)
      : matchesColor(a) || matchesColor(b);
  }, [colorFilters, colorScope, matchesColor]);

  const cardA = resolveCard(inputA);
  const cardB = resolveCard(inputB);

  // Si seul le 2e champ est rempli, il devient la carte de référence.
  const anchor = cardA || cardB;
  const partner = cardA && cardB && cardA.name !== cardB.name ? cardB : null;
  const mode: 'global' | 'card' | 'pair' = partner ? 'pair' : anchor ? 'card' : 'global';

  const { data: topData, isLoading: topLoading, isError: topError } = useTopFormatSynergies(
    activeSet,
    activeFormat,
    undefined,
    mode === 'global' && topView === 'pairs'
  );
  const { data: cardData, isLoading: cardLoading } = useCardSynergies(
    anchor?.name || '',
    activeFormat,
    activeSet
  );

  // Le classement par carte a besoin de TOUTES les paires : chargé seulement
  // quand l'onglet Cards est ouvert (même cache que Draft Practice).
  const { data: pairMap, isLoading: pairMapLoading } = useFormatSynergies(
    activeSet,
    activeFormat,
    mode === 'global' && topView === 'cards'
  );

  /**
   * Deux lectures d'une même matrice.
   *
   * À gauche, la moyenne des `HUB_TOP_N` meilleurs lifts d'une carte plutôt que
   * son seul meilleur : classer sur le maximum ferait remonter n'importe quelle
   * carte ayant une paire chanceuse. Les partenaires manquantes comptent pour
   * x1.00 (= le hasard), ce qui évite d'avantager une carte à deux paires sur
   * une carte qui en a cinq.
   *
   * À droite, le nombre de partenaires solides : la carte qui fait tourner tout
   * un package plutôt qu'une combinaison précise.
   */
  const cardRanking = useMemo(() => {
    if (!pairMap) return null;
    const rows = Object.entries(pairMap)
      .filter(([name]) => matchesColor(name))
      .map(([name, partners]) => {
        let best = 0;
        let bestPartner = '';
        let strong = 0;
        for (const [partner, lift] of Object.entries(partners)) {
          if (lift > best) { best = lift; bestPartner = partner; }
          if (lift >= GLUE_LIFT) strong++;
        }
        const top = Object.values(partners).sort((a, b) => b - a).slice(0, HUB_TOP_N);
        const avgTop = (top.reduce((s, l) => s + l, 0) + (HUB_TOP_N - top.length)) / HUB_TOP_N;
        return { name, best, bestPartner, strong, avgTop };
      })
      .filter(r => r.best >= MIN_SIGNIFICANT_LIFT);

    return {
      hubs: [...rows].sort((a, b) => b.avgTop - a.avgTop).slice(0, TOP_LIMIT),
      glue: [...rows]
        .filter(r => r.strong > 0)
        .sort((a, b) => b.strong - a.strong || b.avgTop - a.avgTop)
        .slice(0, TOP_LIMIT),
    };
  }, [pairMap, matchesColor]);

  const filteredLift = useMemo(
    () => (topData?.topLift || []).filter(p => pairMatchesColor(p.cardA, p.cardB)).slice(0, TOP_LIMIT),
    [topData, pairMatchesColor]
  );
  const filteredPlayed = useMemo(
    () => (topData?.topPlayedWith || []).filter(p => pairMatchesColor(p.from, p.to)).slice(0, TOP_LIMIT),
    [topData, pairMatchesColor]
  );

  const pairEntry: CardSynergy | null = useMemo(() => {
    if (!partner || !cardData) return null;
    return cardData.topSynergy.find(s => s.partner === partner.name) || null;
  }, [partner, cardData]);

  const selectPair = (a: string, b: string) => {
    haptics.light();
    setInputA(a);
    setInputB(b);
  };

  const clearSearch = () => {
    haptics.light();
    setInputA('');
    setInputB('');
  };

  const swapCards = () => {
    haptics.light();
    setInputA(inputB);
    setInputB(inputA);
  };

  // La croix remonte d'un niveau : depuis une paire ou une carte on revient aux
  // tops du format, et seulement depuis ces tops on quitte vers l'onglet Cards.
  const goUpOneLevel = () => {
    if (mode === 'global') onClose();
    else clearSearch();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Dans un champ de recherche, Échap ferme juste l'autocomplétion.
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      goUpOneLevel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const liftVisible = mobileTab === 'lift';
  // La vitrine demande de la place : desktop uniquement, compact sur mobile.
  const showcase = mode === 'pair' && !isMobile;
  const gallery = listLayout === 'gallery' && !isMobile;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-slate-950/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <Link2 className="text-indigo-400 shrink-0" size={24} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {mode === 'global' ? (
                <h2 className="text-lg font-black text-white">Card Synergies</h2>
              ) : (
                <>
                  <button
                    onClick={clearSearch}
                    className="text-base md:text-lg font-black text-slate-500 hover:text-white transition-colors flex-shrink-0"
                  >
                    Card Synergies
                  </button>
                  <ChevronRight size={14} className="text-slate-700 flex-shrink-0" />
                  <span className="text-base md:text-lg font-black text-white truncate">
                    {mode === 'pair' ? 'Pair' : anchor?.name}
                  </span>
                </>
              )}
              <button
                onClick={() => setShowHelp(s => !s)}
                title="How are these scores computed?"
                className={`p-1 rounded-md transition-colors flex-shrink-0 ${showHelp ? 'text-indigo-300 bg-indigo-500/20' : 'text-slate-500 hover:text-indigo-300'}`}
              >
                <HelpCircle size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 truncate">
              {activeSet} • {activeFormat} • from trophy decks
            </p>
          </div>
        </div>
        <button
          onClick={goUpOneLevel}
          title={mode === 'global' ? 'Close (Esc)' : 'Back to the format tops (Esc)'}
          className="p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      {/* Help panel */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-800 bg-slate-900/50"
          >
            <div className="p-4 grid gap-3 md:grid-cols-2 text-[11px] text-slate-400 leading-relaxed">
              <div>
                <span className="font-black text-emerald-400 uppercase tracking-wider">Synergy (lift)</span>
                <p className="mt-1">
                  How much more often two cards appear together than pure chance would predict.
                  <strong className="text-slate-300"> x2.00</strong> means twice as often as expected — a real build-around,
                  not just two good cards. A card played in half the decks is capped near x2 by construction, so this
                  ranking favours specific, lower-played packages.
                </p>
              </div>
              <div>
                <span className="font-black text-blue-400 uppercase tracking-wider">Often played with</span>
                <p className="mt-1">
                  Raw co-occurrence: when the first card is in a trophy deck, the second one is there
                  <strong className="text-slate-300"> X%</strong> of the time. Great cards and staples score high here even
                  without a dedicated synergy.
                </p>
                <p className="mt-2 text-slate-500">
                  Colour is the biggest driver of co-occurrence in Limited — two cards share decks partly because
                  their colour pair exists. Filter on a colour and switch to <strong className="text-slate-400">Both cards</strong> to
                  strip that effect out.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search zone */}
      <div className="p-3 md:p-4 border-b border-slate-800 bg-slate-900/30 space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <SearchAutocomplete
            value={inputA}
            onChange={setInputA}
            cards={cards}
            placeholder="Search a card..."
          />
          <div className="hidden sm:flex items-center justify-center w-6 flex-shrink-0">
            <span className="text-xs font-black text-slate-600">+</span>
          </div>
          <SearchAutocomplete
            value={inputB}
            onChange={setInputB}
            cards={cards}
            placeholder="Second card (optional)..."
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {inputA && inputB && (
              <button
                onClick={swapCards}
                title="Swap cards"
                className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                <ArrowLeftRight size={12} />
              </button>
            )}
            {(inputA || inputB) && (
              <button
                onClick={clearSearch}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-600">
          {mode === 'global' && 'Best combos of the format — type a card for its own top 10, two cards to score the pair.'}
          {mode === 'card' && `Top ${CARD_LIMIT} partners for ${anchor?.name}. Add a second card to score that exact pair.`}
          {mode === 'pair' && 'Head-to-head score for this exact pair.'}
        </p>
      </div>

      {/* Mobile tab switch (listes seulement) */}
      {mode !== 'pair' && (
        <div className="md:hidden flex items-center gap-1 p-2 border-b border-slate-800 bg-slate-900/40">
          <button
            onClick={() => { haptics.light(); setMobileTab('lift'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
              liftVisible
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            {mode === 'global' && topView === 'cards'
              ? <><Blocks size={12} /> Synergy cards</>
              : <><Trophy size={12} /> Synergy (lift)</>}
          </button>
          <button
            onClick={() => { haptics.light(); setMobileTab('played'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
              !liftVisible
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            {mode === 'global' && topView === 'cards'
              ? <><Anchor size={12} /> Glue</>
              : <><Users size={12} /> Often played</>}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {/* --- PAIR MODE --- */}
        {mode === 'pair' && partner && anchor && (
          <div className={`mx-auto space-y-4 ${showcase ? 'max-w-5xl' : 'max-w-2xl'}`}>
            {showcase ? (
              /* --- VITRINE : les deux cartes en grand, le lift au centre --- */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/70 via-slate-950 to-slate-950 px-6 py-8"
              >
                {/* Halos d'ambiance aux couleurs des deux cartes */}
                <div
                  className="absolute -left-24 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[120px] opacity-20 pointer-events-none"
                  style={{ background: cardGlow(anchor) }}
                />
                <div
                  className="absolute -right-24 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[120px] opacity-20 pointer-events-none"
                  style={{ background: cardGlow(partner) }}
                />

                <div className="relative flex items-start justify-center">
                  <CardHero card={anchor} onOpen={() => onCardSelect?.(anchor)} />

                  {/* Liaison + médaillon, centrés sur la hauteur des cartes */}
                  <div className="flex items-center flex-1 min-w-[60px] max-w-[260px] h-[15.4rem] lg:h-[18.2rem]">
                    <div className={`h-[2px] flex-1 bg-gradient-to-r from-transparent ${pairEntry ? 'to-emerald-500/60' : 'to-slate-700'}`} />
                    <LiftMedallion lift={pairEntry ? pairEntry.lift_score : null} />
                    <div className={`h-[2px] flex-1 bg-gradient-to-l from-transparent ${pairEntry ? 'to-emerald-500/60' : 'to-slate-700'}`} />
                  </div>

                  <CardHero card={partner} onOpen={() => onCardSelect?.(partner)} />
                </div>

                {/* Bandeau de stats sous la vitrine */}
                {cardLoading ? (
                  <div className="relative mt-8 h-24 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                ) : pairEntry ? (
                  <div className="relative mt-8 grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-center">
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Trophy decks together</div>
                      <div className="text-2xl font-black text-white tabular-nums">{pairEntry.co_occurrence}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">decks with both cards</div>
                    </div>
                    <ConfidenceTile from={anchor.name} to={partner.name} value={pairEntry.confidence} />
                    <ConfidenceTile from={partner.name} to={anchor.name} value={pairEntry.confidence_reverse} />
                  </div>
                ) : (
                  <div className="relative mt-8">
                    <EmptyState message="No significant synergy recorded for this pair — they don't show up together often enough in trophy decks (lift below the x1.2 threshold)." />
                  </div>
                )}
              </motion.div>
            ) : (
              /* --- COMPACT : mobile uniquement --- */
              <>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => onCardSelect?.(anchor)}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <Thumb name={anchor.name} className="w-24 h-[8.4rem] group-hover:scale-105 transition-transform" />
                    <span className="text-[11px] font-bold text-slate-300 max-w-[6.5rem] text-center leading-tight">{anchor.name}</span>
                  </button>

                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                      pairEntry ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-slate-800 border-slate-700'
                    }`}>
                      <Sparkles size={16} className={pairEntry ? 'text-emerald-400' : 'text-slate-600'} />
                    </div>
                    {pairEntry && (
                      <span className="text-lg font-black text-emerald-400 tabular-nums">
                        {formatLift(pairEntry.lift_score)}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onCardSelect?.(partner)}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <Thumb name={partner.name} className="w-24 h-[8.4rem] group-hover:scale-105 transition-transform" />
                    <span className="text-[11px] font-bold text-slate-300 max-w-[6.5rem] text-center leading-tight">{partner.name}</span>
                  </button>
                </div>

                {cardLoading ? (
                  <ListSkeleton rows={3} />
                ) : pairEntry ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Synergy (lift)</div>
                        <div className="text-xl font-black text-emerald-400 tabular-nums">{formatLift(pairEntry.lift_score)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">vs. random pairing</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Trophy decks together</div>
                        <div className="text-xl font-black text-white tabular-nums">{pairEntry.co_occurrence}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">decks with both cards</div>
                      </div>
                    </div>

                    <ConfidenceTile from={anchor.name} to={partner.name} value={pairEntry.confidence} />
                    <ConfidenceTile from={partner.name} to={anchor.name} value={pairEntry.confidence_reverse} />
                  </div>
                ) : (
                  <EmptyState message="No significant synergy recorded for this pair — they don't show up together often enough in trophy decks (lift below the x1.2 threshold)." />
                )}
              </>
            )}
          </div>
        )}

        {/* --- CARD MODE --- */}
        {mode === 'card' && anchor && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
              <Thumb name={anchor.name} className="w-12 h-[4.2rem]" />
              <div className="min-w-0">
                <div className="text-sm font-black text-white truncate">{anchor.name}</div>
                <div className="text-[10px] text-slate-500">Best partners in {activeSet} trophy decks</div>
              </div>
              <div className="ml-auto">
                <LayoutToggle value={listLayout} onChange={setListLayout} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <div className={liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Trophy size={12} />}
                  label="Strongest synergies"
                  help="Cards that appear alongside this one far more often than chance would predict. Higher lift = stronger build-around."
                  accent="text-emerald-400"
                />
                {cardLoading ? (
                  <ListSkeleton rows={5} />
                ) : cardData?.topSynergy.length ? (
                  <div className="space-y-2">
                    {cardData.topSynergy.slice(0, CARD_LIMIT).map((s, i) => (
                      <PartnerRow
                        key={`lift-${s.partner}`}
                        rank={i + 1}
                        partner={s.partner}
                        score={formatLift(s.lift_score)}
                        subtitle={`${s.co_occurrence} decks together`}
                        tone="lift"
                        gallery={gallery}
                        onClick={() => selectPair(anchor.name, s.partner)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No synergy recorded for this card in this format." />
                )}
              </div>

              <div className={!liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Users size={12} />}
                  label="Often played with"
                  help="When this card is in a trophy deck, these cards are the most likely to be there too."
                  accent="text-blue-400"
                />
                {cardLoading ? (
                  <ListSkeleton rows={5} />
                ) : cardData?.topConfidence.length ? (
                  <div className="space-y-2">
                    {cardData.topConfidence.slice(0, CARD_LIMIT).map((s, i) => (
                      <PartnerRow
                        key={`conf-${s.partner}`}
                        rank={i + 1}
                        partner={s.partner}
                        score={formatPct(s.confidence)}
                        subtitle={`of ${anchor.name} decks`}
                        tone="played"
                        gallery={gallery}
                        onClick={() => selectPair(anchor.name, s.partner)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No co-occurrence recorded for this card in this format." />
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- GLOBAL MODE --- */}
        {mode === 'global' && (
          <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <TopViewToggle value={topView} onChange={setTopView} />
              <ColorFilter
                selected={colorFilters}
                /* Exclusif : une couleur à la fois, re-cliquer désélectionne. */
                onToggle={(c) => setColorFilters(prev => prev.includes(c) ? [] : [c])}
                scope={colorScope}
                onScope={setColorScope}
                showScope={topView === 'pairs'}
              />
            </div>
            <LayoutToggle value={listLayout} onChange={setListLayout} />
          </div>

          {topView === 'pairs' ? (
            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <div className={liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Trophy size={12} />}
                  label={`Top ${TOP_LIMIT} synergies (lift)`}
                  help="Pairs that appear together far more often than chance would predict. The format's real build-arounds. Very popular cards can't rank high here — their lift is capped by how often they're played."
                  accent="text-emerald-400"
                />
                {topLoading ? (
                  <ListSkeleton />
                ) : topError ? (
                  <EmptyState message="Could not load synergies. Try again later." />
                ) : filteredLift.length ? (
                  <div className="space-y-2">
                    {filteredLift.map((p, i) => (
                      <PairRow
                        key={`lift-${p.cardA}-${p.cardB}`}
                        rank={i + 1}
                        cardA={p.cardA}
                        cardB={p.cardB}
                        score={formatLift(p.lift)}
                        tone="lift"
                        gallery={gallery}
                        onClick={() => selectPair(p.cardA, p.cardB)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={colorFilters.length ? 'No synergy pair matches this colour filter.' : 'No synergy data for this set and format yet.'} />
                )}
              </div>

              <div className={!liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Users size={12} />}
                  label={`Top ${TOP_LIMIT} often played with`}
                  help="Read as: when the first card is in a trophy deck, the second one is there X% of the time. Staples rank high here even without a dedicated synergy."
                  accent="text-blue-400"
                />
                {topLoading ? (
                  <ListSkeleton />
                ) : topError ? (
                  <EmptyState message="Could not load synergies. Try again later." />
                ) : filteredPlayed.length ? (
                  <div className="space-y-2">
                    {filteredPlayed.map((p, i) => (
                      <PairRow
                        key={`played-${p.from}-${p.to}`}
                        rank={i + 1}
                        cardA={p.from}
                        cardB={p.to}
                        score={formatPct(p.confidence)}
                        tone="played"
                        directed
                        gallery={gallery}
                        onClick={() => selectPair(p.from, p.to)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={colorFilters.length ? 'No pair matches this colour filter.' : 'No co-occurrence data for this set and format yet.'} />
                )}
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <div className={liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Blocks size={12} />}
                  label={`Top ${TOP_LIMIT} synergy cards`}
                  help={`Average of a card's ${HUB_TOP_N} best lifts — missing partners count as x1.00, i.e. pure chance. Ranking on the single best pair would let one lucky pairing carry a card; this rewards those that anchor a whole package.`}
                  accent="text-emerald-400"
                />
                {pairMapLoading ? (
                  <ListSkeleton />
                ) : cardRanking?.hubs.length ? (
                  <div className="space-y-2">
                    {cardRanking.hubs.map((c, i) => (
                      <PartnerRow
                        key={`hub-${c.name}`}
                        rank={i + 1}
                        partner={c.name}
                        score={formatLift(c.avgTop)}
                        subtitle={`best ${formatLift(c.best)} with ${c.bestPartner}`}
                        tone="lift"
                        gallery={gallery}
                        onClick={() => selectPair(c.name, c.bestPartner)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={colorFilters.length ? 'No card matches this colour filter.' : 'No synergy data for this set and format yet.'} />
                )}
              </div>

              <div className={!liftVisible ? '' : 'hidden md:block'}>
                <ColumnHeader
                  icon={<Anchor size={12} />}
                  label={`Top ${TOP_LIMIT} archetype glue`}
                  help={`Cards ranked by how many partners they have above x${GLUE_LIFT}. High here means the card holds a whole package together rather than comboing with one specific card.`}
                  accent="text-blue-400"
                />
                {pairMapLoading ? (
                  <ListSkeleton />
                ) : cardRanking?.glue.length ? (
                  <div className="space-y-2">
                    {cardRanking.glue.map((c, i) => (
                      <PartnerRow
                        key={`glue-${c.name}`}
                        rank={i + 1}
                        partner={c.name}
                        score={`${c.strong}`}
                        subtitle={`partners above x${GLUE_LIFT} · top ${HUB_TOP_N} avg ${formatLift(c.avgTop)}`}
                        tone="played"
                        gallery={gallery}
                        onClick={() => { haptics.light(); setInputA(c.name); setInputB(''); }}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message={colorFilters.length ? 'No card matches this colour filter.' : 'No synergy data for this set and format yet.'} />
                )}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </motion.div>
  );
};
