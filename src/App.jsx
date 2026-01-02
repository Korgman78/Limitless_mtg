import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Layers, Zap, ChevronRight, ArrowUpDown, Gem,
  AlertTriangle, Star, TrendingUp, PieChart as PieChartIcon,
  BarChart2, Repeat, Crosshair, HelpCircle, Trophy,
  MousePointerClick, X, Filter, Newspaper, ExternalLink, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { supabase } from './supabase';

// ============================================================================
// 1. CONFIGURATION & CONSTANTES
// ============================================================================

const FORMAT_OPTIONS = [
  { label: 'Premier Draft', value: 'PremierDraft' },
  { label: 'Trad. Draft', value: 'TradDraft' },
  { label: 'Sealed', value: 'Sealed' },
  { label: 'Arena Direct Sealed', value: 'ArenaDirect_Sealed' },
];

const PAIRS = [
  { code: 'WU', name: 'Azorius (WU)' }, 
  { code: 'UB', name: 'Dimir (UB)' }, 
  { code: 'BR', name: 'Rakdos (BR)' },
  { code: 'RG', name: 'Gruul (RG)' }, 
  { code: 'WG', name: 'Selesnya (GW)' }, // Était 'GW' -> Corrigé en 'WG'
  { code: 'WB', name: 'Orzhov (WB)' },
  { code: 'UR', name: 'Izzet (UR)' }, 
  { code: 'BG', name: 'Golgari (BG)' }, 
  { code: 'WR', name: 'Boros (RW)' },    // Était 'RW' -> Corrigé en 'WR'
  { code: 'UG', name: 'Simic (GU)' }     // Était 'GU' -> Corrigé en 'UG'
];

const TRIOS = [
  { code: 'WUB', name: 'Esper (WUB)' }, { code: 'WUR', name: 'Jeskai (WUR)' }, { code: 'WUG', name: 'Bant (WUG)' },
  { code: 'WBR', name: 'Mardu (WBR)' }, { code: 'WBG', name: 'Abzan (WBG)' }, { code: 'WRG', name: 'Naya (WRG)' },
  { code: 'UBR', name: 'Grixis (UBR)' }, { code: 'UBG', name: 'Sultai (UBG)' }, { code: 'URG', name: 'Temur (URG)' },
  { code: 'BRG', name: 'Jund (BRG)' }
];

// ============================================================================
// 2. HELPERS
// ============================================================================

const areColorsEqual = (c1, c2) => {
  if (!c1 || !c2) return false;
  const s1 = c1.replace(/[^WUBRG]/g, '').split('').sort().join('');
  const s2 = c2.replace(/[^WUBRG]/g, '').split('').sort().join('');
  return s1 === s2;
};

const extractColors = (s) => {
  if (!s) return "";
  return s.replace(' + Splash', '').replace(/[^WUBRG]/g, '');
};

const ManaIcons = ({ colors, size = "md", isSplash = false }) => {
  const sizeClass = size === "lg" ? "w-6 h-6" : "w-5 h-5";
  const cleanColors = (!colors) ? [] : colors.replace(/[^WUBRG]/g, '').split('');

  return (
    <div className="flex -space-x-1.5 items-center relative z-0">
      {cleanColors.map((sym, i) => (
        <div key={i} className={`relative z-${20 - i} rounded-full shadow-sm`}>
          <img src={`https://svgs.scryfall.io/card-symbols/${sym}.svg`} alt={sym} className={`${sizeClass} drop-shadow-md`} loading="lazy" />
        </div>
      ))}
      {isSplash && <div className={`${sizeClass} rounded-full z-0 bg-transparent border-2 border-dashed border-amber-400 opacity-80 box-border ml-1`} title="Splash" />}
    </div>
  );
};

const RARITY_STYLES = {
  M: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
  R: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  U: 'text-blue-300 border-blue-300/30 bg-blue-300/10',
  C: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
};

const normalizeRarity = (r) => {
  if (!r) return 'C';
  const first = r.charAt(0).toUpperCase();
  return ['M', 'R', 'U', 'C'].includes(first) ? first : 'C';
};

const getDeltaStyle = (wr, avgWr) => {
  if (!wr || !avgWr) return 'text-slate-500';
  const delta = wr - avgWr;

  if (delta >= 9.0) return 'text-purple-400 font-black drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]';
  if (delta >= 6.0) return 'text-emerald-500 font-extrabold';
  if (delta >= 3.0) return 'text-emerald-400 font-bold';
  if (delta >= 0.0) return 'text-lime-400 font-bold';
  if (delta >= -3.0) return 'text-yellow-400 font-medium';
  if (delta >= -6.0) return 'text-orange-400 font-medium';
  if (delta >= -9.0) return 'text-red-400 font-medium';
  return 'text-red-800 font-bold opacity-80';
};

const calculateGrade = (cardArchWr, deckMeanWr) => {
  if (!cardArchWr || !deckMeanWr) return { letter: '-', color: 'text-slate-500' };
  const delta = cardArchWr - deckMeanWr;

  if (delta >= 5.5) return { letter: 'S', color: 'text-purple-400 border-purple-500 bg-purple-500/20' };
  if (delta >= 3.0) return { letter: 'A', color: 'text-emerald-400 border-emerald-500 bg-emerald-500/20' };
  if (delta >= 0.5) return { letter: 'B', color: 'text-lime-400 border-lime-500 bg-lime-500/20' };
  if (delta >= -1.5) return { letter: 'C', color: 'text-yellow-400 border-yellow-500 bg-yellow-500/20' };
  if (delta >= -3.5) return { letter: 'D', color: 'text-orange-400 border-orange-500 bg-orange-500/20' };

  return { letter: 'F', color: 'text-red-700 border-red-800 bg-red-900/20' };
};

const getCardImage = (name) => `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=border_crop`;

// ============================================================================
// 3. COMPOSANTS GRAPHIQUES
// ============================================================================

const MetagamePieChart = ({ decks, totalGames }) => {
  const counts = { 'Mono': 0, '2 Color': 0, '2+Splash': 0, '3 Color': 0, '>3 Color': 0 };

  decks.forEach(d => {
    if (d.games === 0) return;
    if (d.type === 'Mono-color') counts['Mono'] += d.games;
    else if (d.type === 'Two colors') counts['2 Color'] += d.games;
    else if (d.type === 'Two colors + splash') counts['2+Splash'] += d.games;
    else if (d.type === 'Three colors') counts['3 Color'] += d.games;
    else counts['>3 Color'] += d.games;
  });

  const data = [
    { label: 'Mono', value: counts['Mono'], color: '#94a3b8' },
    { label: '2 Color', value: counts['2 Color'], color: '#6366f1' },
    { label: '2+Splash', value: counts['2+Splash'], color: '#a855f7' },
    { label: '3 Color', value: counts['3 Color'], color: '#f59e0b' },
    { label: '>3 Color', value: counts['>3 Color'], color: '#ea580c' },
  ];

  const total = totalGames || 1;
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col bg-slate-900 p-4 rounded-xl border border-slate-800 h-full overflow-hidden">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
        COLORS BREAKDOWN (NUMBER OF GAMES)
      </h3>

      {/* AMÉLIORATION : Réduction du gap de 6 à 3 sur mobile pour laisser plus de place au donut. 
          Maintien du 'flex-row' permanent (pas de flex-col ici).
      */}
      <div className="flex items-start gap-3 md:gap-6 flex-1 pt-1">

        {/* GRAPHIQUE : Augmentation de la taille de 28 à 32 sur mobile. 
            Le 'flex-shrink-0' garantit que le cercle ne s'écrase pas.
        */}
        <div className="relative w-32 h-32 md:w-36 md:h-36 flex-shrink-0">
          <svg viewBox="-1.1 -1.1 2.2 2.2" className="transform -rotate-90">
            {data.map((slice, i) => {
              if (slice.value === 0) return null;
              const startPercent = cumulativePercent;
              const slicePercent = slice.value / total;
              cumulativePercent += slicePercent;
              const endPercent = cumulativePercent;

              const [startX, startY] = getCoordinatesForPercent(startPercent);
              const [endX, endY] = getCoordinatesForPercent(endPercent);

              const largeArcFlag = slicePercent > 0.5 ? 1 : 0;
              const pathData = slicePercent >= 0.999
                ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`
                : `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={i}
                  d={pathData}
                  fill={slice.color}
                  stroke="#0f172a"
                  strokeWidth="0.05"
                />
              );
            })}
            <circle cx="0" cy="0" r="0.65" fill="#0f172a" />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            <span className="text-[9px] text-slate-400 font-bold uppercase">Total</span>
            <span className="text-xs font-black text-white">{(total / 1000).toFixed(0)}k</span>
          </div>
        </div>

        {/* LÉGENDE : Réduction de max-w à 130px sur mobile pour éviter qu'elle ne pousse 
            le donut hors de l'écran.
        */}
        <div className="flex-1 flex justify-end">
          <div className="w-full max-w-[130px] md:max-w-[150px] space-y-1">
            {data.map((d, i) => (
              <div
                key={i}
                className="flex justify-between items-center text-[10px] md:text-[11px] p-1 md:p-1.5 rounded-md border border-transparent transition-all hover:bg-slate-800/50 hover:border-slate-700"
                style={{
                  borderLeftColor: d.value > 0 ? d.color : 'transparent',
                  borderLeftWidth: '3px'
                }}
              >
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-slate-300 font-medium whitespace-nowrap">{d.label}</span>
                </div>
                <span className="font-bold text-slate-400 tabular-nums">
                  {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PairBreakdownChart = ({ decks }) => {
  const totalBicoloreGames = decks.reduce((acc, d) => {
    if (d.type === 'Two colors' || d.type === 'Two colors + splash') {
      return acc + d.games;
    }
    return acc;
  }, 0);

  const pairStats = PAIRS.map(pair => {
    const pairGames = decks
      .filter(d => {
        const deckColors = extractColors(d.colors);
        const isPair = areColorsEqual(deckColors, pair.code);
        const isCorrectType = d.type === 'Two colors' || d.type === 'Two colors + splash';
        return isPair && isCorrectType;
      })
      .reduce((acc, curr) => acc + curr.games, 0);

    return { ...pair, value: pairGames };
  });

  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col h-full">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
        META SHARE
      </h3>

      {/* MODIFICATION : 
          1. Ajout de 'pr-4' pour créer un espace de sécurité pour la scrollbar.
          2. Remplacement de 'no-scrollbar' par une scrollbar fine et stylisée.
      */}
      <div className="space-y-2 flex-1 overflow-y-auto pr-4 custom-scrollbar">
        {pairStats.sort((a, b) => b.value - a.value).map(p => (
          <div key={p.code} className="flex items-center gap-3 text-xs">
            <div className="w-8 font-bold text-slate-400 tabular-nums">
              {p.code}
            </div>

            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                style={{
                  width: totalBicoloreGames > 0
                    ? `${Math.min(((p.value / totalBicoloreGames) * 100) * 2, 100)}%`
                    : '0%'
                }}
              />
            </div>

            {/* MODIFICATION : 
                Largeur fixe 'w-12' pour garantir que le texte ne bouge pas 
                et ne soit pas recouvert par l'ascenseur.
            */}
            <div className="w-12 text-right font-mono text-slate-300 tabular-nums text-[10px] flex-shrink-0">
              {totalBicoloreGames > 0 ? ((p.value / totalBicoloreGames) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-center text-slate-600 italic pt-2 border-t border-slate-800/50 mt-2">
        *Share of all 2-Color & 2-Color + Splash
      </div>
    </div>
  );
};

const Sparkline = ({ data }) => {
  const [isHovered, setIsHovered] = useState(false);
  const safeData = (data && data.length > 0) ? data : [0, 0];

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;
  const points = safeData.map((d, i) => {
    const x = (i / (safeData.length - 1)) * 40;
    const y = 20 - ((d - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');

  const first = safeData[0];
  const last = safeData[safeData.length - 1];
  const delta = last - first;
  const isRising = delta >= 0;
  const days = safeData.length; // Basé sur le nombre de points dans l'historique

  return (
    <div
      className="relative flex flex-col items-end opacity-80 cursor-help"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <svg width="40" height="20" className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={isRising ? "#10b981" : "#ef4444"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 right-0 bg-slate-800 text-[9px] font-bold py-1 px-2 rounded border border-slate-700 whitespace-nowrap z-50 shadow-xl"
          >
            <span className={isRising ? "text-emerald-400" : "text-red-400"}>
              {isRising ? '+' : ''}{delta.toFixed(1)}%
            </span>
            <span className="text-slate-400 ml-1 font-medium italic">since {days} days</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SwipeableOverlay = ({ children, onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end md:justify-center md:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full h-[92vh] md:h-auto md:max-h-[90vh] md:max-w-6xl md:w-full bg-slate-950 rounded-t-[30px] md:rounded-[30px] overflow-hidden flex flex-col shadow-2xl border border-white/10 relative"
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.2 }}
        onDragEnd={(_, info) => { if (window.innerWidth < 768 && info.offset.y > 150) onClose(); }}
      >
        <div className="w-full flex justify-center pt-3 pb-1 absolute top-0 z-20 pointer-events-none md:hidden">
          <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-md border border-white/10"
        >
          <X size={20} />
        </button>

        {children}
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// 4. OVERLAYS DE DÉTAIL
// ============================================================================

const ArchetypeDashboard = ({ deck, activeFormat, activeSet, globalMeanWR, totalGames, onClose, onCardClick }) => {
  const [archCards, setArchCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchetypeData() {
      setLoading(true);
      const baseColor = extractColors(deck.colors);
      if (!baseColor || baseColor.length > 3) { setArchCards([]); setLoading(false); return; }
      const chars = baseColor.split('');
      const permutations = [];
      if (chars.length === 2) { permutations.push(chars[0] + chars[1], chars[1] + chars[0]); }
      else if (chars.length === 3) {
        const [a, b, c] = chars;
        permutations.push(a + b + c, a + c + b, b + a + c, b + c + a, c + a + b, c + b + a);
      } else { permutations.push(baseColor); }

      const { data: deckData } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('format', activeFormat.trim()).in('filter_context', permutations).range(0, 5000);
      const { data: globalData } = await supabase.from('card_stats').select('card_name, gih_wr, alsa').eq('set_code', activeSet).eq('filter_context', 'Global').eq('format', activeFormat.trim());

      if (deckData && deckData.length > 0) {
        const merged = deckData.map(dc => {
          const gc = globalData ? globalData.find(g => g.card_name === dc.card_name) : null;
          return { ...dc, name: dc.card_name, global_wr: gc ? gc.gih_wr : null, global_alsa: gc ? gc.alsa : null };
        });
        setArchCards(merged.sort((a, b) => (b.gih_wr || 0) - (a.gih_wr || 0)));
      } else { setArchCards([]); }
      setLoading(false);
    }
    fetchArchetypeData();
  }, [deck, activeFormat, activeSet]);

  if (!deck) return null;

  const isSealed = activeFormat.toLowerCase().includes('sealed');
  const deckBaseColors = extractColors(deck.colors);

  const allWrValues = archCards
    .map(c => c.gih_wr)
    .filter(wr => wr !== null)
    .sort((a, b) => b - a);

  const thresholdIndex = Math.floor(allWrValues.length * 0.25);
  const top25Threshold = allWrValues.length > 0 ? allWrValues[thresholdIndex] : 100.0;

  const gems = archCards
    .filter(c => c.gih_wr && c.global_wr)
    .filter(c => c.gih_wr >= globalMeanWR)
    .filter(c => isSealed || (c.alsa && c.alsa > 4.0))
    .filter(c => c.gih_wr > c.global_wr + 1.0)
    .map(c => ({ ...c, score: (c.gih_wr - c.global_wr) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const traps = archCards
    .filter(c => c.gih_wr && c.global_wr)
    .filter(c => {
      const cColors = extractColors(c.colors);
      return cColors.split('').every(col => deckBaseColors.includes(col));
    })
    .filter(c => c.gih_wr < top25Threshold)
    .filter(c => isSealed || (c.alsa && c.alsa <= 4.0))
    .filter(c => c.gih_wr < c.global_wr - 1.0)
    .sort((a, b) => a.gih_wr - b.gih_wr)
    .slice(0, 5);
  const commons = archCards.filter(c => normalizeRarity(c.rarity) === 'C' && c.gih_wr).sort((a, b) => b.gih_wr - a.gih_wr).slice(0, 5);
  const uncommons = archCards.filter(c => normalizeRarity(c.rarity) === 'U' && c.gih_wr).sort((a, b) => b.gih_wr - a.gih_wr).slice(0, 5);
  const bestCard = commons[0] || uncommons[0];

  const Section = ({ title, icon: Icon, cards, colorClass }) => (
    <section className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
      <div className={`flex items-center gap-2 mb-3 ${colorClass}`}>
        <Icon size={16} strokeWidth={2.5} />
        <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-xs text-slate-500 italic">Loading...</div> :
          cards.length === 0 ? <div className="text-xs text-slate-500 italic">No data.</div> :
            cards.map(c => (
              <button key={c.id} onClick={() => onCardClick(c)} className="w-full flex items-center gap-3 p-2 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-500 hover:bg-slate-800 transition-all group">
                <img src={getCardImage(c.card_name)} className="w-8 h-11 rounded object-cover bg-black" loading="lazy" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-200 truncate">{c.card_name}</span>
                    <span className={`text-xs font-black ${getDeltaStyle(c.gih_wr, globalMeanWR)}`}>{c.gih_wr ? c.gih_wr.toFixed(1) : '--'}%</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center gap-2"><ManaIcons colors={c.colors} size="sm" /></div>
                    <span className="text-[10px] text-slate-500 font-mono">ALSA {c.alsa ? c.alsa.toFixed(2) : '-'}</span>
                  </div>
                </div>
              </button>
            ))}
      </div>
    </section>
  );

  const getGradient = (cols) => {
    if (!cols) return 'from-slate-700 to-slate-900';
    if (cols.includes('W') && cols.includes('U')) return 'from-[#fffbd5]/20 to-[#0e68ab]/40';
    if (cols.includes('R') && cols.includes('W')) return 'from-[#f9aa8f]/20 to-[#fffbd5]/20';
    if (cols.includes('U') && cols.includes('B')) return 'from-[#0e68ab]/30 to-[#1c1917]/50';
    if (cols.includes('G')) return 'from-emerald-900/40 to-slate-900';
    return 'from-slate-700 to-slate-900';
  };

  return (
    <SwipeableOverlay onClose={onClose}>
      <div className="flex flex-col h-full md:flex-row">
        <div className={`relative flex-shrink-0 md:w-1/3 bg-gradient-to-br ${getGradient(deck.colors)} shadow-xl border-b md:border-b-0 md:border-r border-white/10 pt-8 pb-6 px-4 overflow-hidden flex flex-col justify-center items-center`}>
          {bestCard && (
            <img
              src={getCardImage(bestCard.card_name)}
              className="absolute right-[-20px] top-[-10px] w-52 opacity-20 rotate-12 pointer-events-none md:w-96 md:right-[-50px] md:top-10"
              style={{ maskImage: 'linear-gradient(to left, black 20%, transparent 100%)' }}
            />
          )}
          <div className="relative z-10 flex flex-col items-center mt-2 md:mt-0 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-2">Archetype Analysis</span>
            <div className="flex items-center gap-3 mb-6 flex-col md:flex-row">
              <div className="transform scale-125 filter drop-shadow-lg"><ManaIcons colors={deck.colors.split(' +')[0]} size="lg" /></div>
              <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-md tracking-tight">{deck.name}</h2>
            </div>
            <div className="flex w-full max-w-xs gap-4">
              <div className="flex-1 bg-black/40 rounded-xl p-3 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center shadow-lg">
                <span className="text-[9px] uppercase font-bold text-slate-400 mb-1">Win Rate</span>
                <span className={`text-3xl font-black ${getDeltaStyle(deck.wr, globalMeanWR)}`}>{deck.wr}%</span>
              </div>
              <div className="flex-1 bg-black/40 rounded-xl p-3 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center shadow-lg">
                <span className="text-[9px] uppercase font-bold text-slate-400 mb-1">Metagame</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">{(deck.games / totalGames * 100).toFixed(1)}</span>
                  <span className="text-xs text-white/60">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Top 5 Commons" icon={Star} cards={commons} colorClass="text-slate-300" />
            <Section title="Top 5 Uncommons" icon={Star} cards={uncommons} colorClass="text-blue-300" />
            <Section title="Top 5 Hidden Gems" icon={Gem} cards={gems} colorClass="text-emerald-400" />
            <Section title="Top 5 Traps" icon={AlertTriangle} cards={traps} colorClass="text-red-400" />
          </div>
        </div>
      </div>
    </SwipeableOverlay>
  );
};

const CardEvaluationBlock = ({ card, allCards }) => {
  if (!card.gih_wr) return null;
  const getRank = (list, metric, val, asc = false) => {
    const valid = list.filter(c => c[metric] !== null);
    valid.sort((a, b) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
    const index = valid.findIndex(c => c.name === card.name);
    return { rank: index + 1, total: valid.length };
  };
  const peersRarity = allCards.filter(c => normalizeRarity(c.rarity) === normalizeRarity(card.rarity));
  const peersColor = peersRarity.filter(c => areColorsEqual(extractColors(c.colors), extractColors(card.colors)));
  const rankWrRarity = getRank(peersRarity, 'gih_wr', card.gih_wr, false);
  const rankWrColor = getRank(peersColor, 'gih_wr', card.gih_wr, false);
  const hasAlsa = !!card.alsa;
  const rankAlsaRarity = hasAlsa ? getRank(peersRarity, 'alsa', card.alsa, true) : null;
  const rankAlsaColor = hasAlsa ? getRank(peersColor, 'alsa', card.alsa, true) : null;

  // --- FIX V1.2 : CORRECTION LABEL MYTHICS ---
  const rarityLabel = normalizeRarity(card.rarity) === 'M' ? 'Mythics' : normalizeRarity(card.rarity) === 'R' ? 'Rares' : normalizeRarity(card.rarity) === 'U' ? 'Uncommons' : 'Commons';

  const RankingRow = ({ label, rank, total, type }) => {
    if (!rank || !total) return null;
    const percent = Math.max(5, Math.min(100, ((total - rank) / total) * 100));
    const isTop = rank <= Math.ceil(total * 0.15);
    const isBad = rank >= Math.floor(total * 0.85);
    return (
      <div className="flex flex-col gap-1 mb-2 last:mb-0">
        <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            {type === 'WR' ? <Trophy size={10} className="text-yellow-500" /> : <MousePointerClick size={10} className="text-blue-400" />}
            {label}
          </span>
          <span className={isTop ? "text-emerald-400 font-bold" : isBad ? "text-red-400" : "text-slate-300"}>
            #{rank} <span className="text-slate-600 font-normal">/ {total}</span>
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${isTop ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : isBad ? 'bg-slate-700' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  };
  const AVG_WR = 55.0; const AVG_ALSA = 4.5;
  let statusText = "Average Card"; let statusColor = "text-slate-400";
  if (hasAlsa) {
    if (card.gih_wr > AVG_WR + 2.0 && card.alsa > AVG_ALSA + 0.5) { statusText = "💎 Underrated Gem"; statusColor = "text-emerald-400"; }
    else if (card.gih_wr > AVG_WR + 2.0 && card.alsa <= AVG_ALSA + 0.5) { statusText = "💣 Top Tier / Bomb"; statusColor = "text-purple-400"; }
    else if (card.gih_wr < AVG_WR - 2.0 && card.alsa <= AVG_ALSA - 0.5) { statusText = "⚠️ Overrated"; statusColor = "text-red-400"; }
    else if (card.gih_wr < AVG_WR - 2.0 && card.alsa > AVG_ALSA - 0.5) { statusText = "🗑️ Chaff / Filler"; statusColor = "text-slate-500"; }
  } else {
    if (card.gih_wr > AVG_WR + 3.0) { statusText = "💣 Top Tier"; statusColor = "text-purple-400"; }
    else if (card.gih_wr > AVG_WR + 1.0) { statusText = "✅ Very Good"; statusColor = "text-emerald-400"; }
    else if (card.gih_wr < AVG_WR - 3.0) { statusText = "⛔ Avoid / Bad"; statusColor = "text-red-400"; }
  }
  const minALSA = 1.0; const maxALSA = 8.0; const minWR = 45.0; const maxWR = 68.0;
  const xPos = hasAlsa ? ((Math.max(minALSA, Math.min(maxALSA, card.alsa)) - minALSA) / (maxALSA - minALSA)) * 100 : 50;
  const yPos = 100 - ((Math.max(minWR, Math.min(maxWR, card.gih_wr)) - minWR) / (maxWR - minWR)) * 100;
  const xAvg = ((AVG_ALSA - minALSA) / (maxALSA - minALSA)) * 100;
  const yAvg = 100 - ((AVG_WR - minWR) / (maxWR - minWR)) * 100;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Crosshair size={16} className="text-indigo-400" />
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">Card Evaluation Matrix</h3>
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="text-xs text-slate-500 font-medium">Evaluation:</div>
            <div className={`text-lg font-black ${statusColor}`}>{statusText}</div>
            <div className="text-[10px] text-slate-500 leading-relaxed">
              {hasAlsa ? <>Comparing <strong>Pick Order (ALSA)</strong> vs <strong>Win Rate</strong>.<br />High WR + Late Pick = Underrated.</> : <>Based solely on <strong>Games In Hand Win Rate</strong>.</>}
            </div>
          </div>
          {hasAlsa && (
            <div className="flex flex-row items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto">

              {/* AXE Y (WIN RATE) - Colonne flexible gauche */}
              <div className="h-32 flex items-center justify-center w-4 flex-shrink-0">
                <span className="-rotate-90 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  Win Rate
                </span>
              </div>

              {/* CONTENEUR GRAPHIQUE + AXE X - Colonne flexible droite */}
              <div className="flex flex-col gap-2 flex-1 sm:w-48">

                {/* LE GRAPHIQUE */}
                <div className="relative w-full h-32 bg-slate-950 rounded-lg border border-slate-800 shadow-inner overflow-hidden">
                  <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-700/50" style={{ left: `${xAvg}%` }}></div>
                  <div className="absolute left-0 right-0 border-t border-dashed border-slate-700/50" style={{ top: `${yAvg}%` }}></div>

                  {/* Labels internes (Quadrant) */}
                  <div className="absolute top-1 left-1 text-[8px] text-purple-500/50 font-black">BOMB</div>
                  <div className="absolute top-1 right-1 text-[8px] text-emerald-500/50 font-black">GEM</div>
                  <div className="absolute bottom-1 left-1 text-[8px] text-red-500/50 font-black">OVERRATED</div>
                  <div className="absolute bottom-1 right-1 text-[8px] text-slate-600/50 font-black">CHAFF</div>

                  {/* Le point (Data) */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10 border-2 border-indigo-600"
                    style={{ left: `calc(${xPos}% - 6px)`, top: `calc(${yPos}% - 6px)` }}
                  />
                </div>

                {/* AXE X (PICK ORDER) */}
                <div className="text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Pick Order (ALSA)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among {rarityLabel}</div>
            <RankingRow label="Win Rate Rank" rank={rankWrRarity.rank} total={rankWrRarity.total} type="WR" />
            {hasAlsa && <RankingRow label="Pick Order Rank" rank={rankAlsaRarity.rank} total={rankAlsaRarity.total} type="ALSA" />}
          </div>
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among Color Peers</div>
            <RankingRow label="Win Rate Rank" rank={rankWrColor.rank} total={rankWrColor.total} type="WR" />
            {hasAlsa && <RankingRow label="Pick Order Rank" rank={rankAlsaColor.rank} total={rankAlsaColor.total} type="ALSA" />}
          </div>
        </div>
      </div>
    </div>
  );
};

const CardDetailOverlay = ({ card, activeFormat, activeSet, decks, cards: allCards, onClose }) => {
  const rCode = normalizeRarity(card.rarity);
  const [crossPerf, setCrossPerf] = useState([]);

  const [sortMode, setSortMode] = useState('synergy');

  useEffect(() => {
    async function fetchCrossData() {
      const { data: globalStat } = await supabase.from('card_stats').select('gih_wr').eq('set_code', activeSet).eq('card_name', card.name).eq('filter_context', 'Global').eq('format', activeFormat).single();
      const avgCardWr = globalStat?.gih_wr || 55.0;
      const { data } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('card_name', card.name).eq('format', activeFormat);

      if (data && decks.length > 0) {
        const minGames = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

        const perfs = data
          .filter(d => d.filter_context !== 'Global')
          .map(d => {
            if (!d.gih_wr || d.img_count < minGames) return null;
            const deck = decks.find(dk => areColorsEqual(extractColors(dk.colors), d.filter_context));

            if (deck) {
              if (deck.type !== 'Two colors' && deck.type !== 'Three colors') return null;
            } else {
              if (d.filter_context.length !== 2 && d.filter_context.length !== 3) return null;
            }

            return {
              deckName: deck ? deck.name : `${d.filter_context} Deck`,
              deckColors: d.filter_context,
              deckWr: deck ? deck.wr : 55.0,
              cardWr: d.gih_wr,
              avgCardWr: avgCardWr
            };
          })
          .filter(Boolean)
          .filter((v, i, a) => a.findIndex(t => (t.deckName === v.deckName)) === i);

        setCrossPerf(perfs);
      }
    }
    fetchCrossData();
  }, [card, activeFormat, activeSet, decks]);

  const sortedPerf = useMemo(() => {
    return [...crossPerf].sort((a, b) => {
      if (sortMode === 'winrate') {
        return b.cardWr - a.cardWr;
      }
      return (b.cardWr - b.deckWr) - (a.cardWr - a.deckWr);
    });
  }, [crossPerf, sortMode]);

  const minGamesDisplay = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

  return (
    <SwipeableOverlay onClose={onClose}>
      <div className="flex flex-col h-full md:flex-row">

        <div className="bg-slate-900/50 py-3 px-4 md:pb-8 md:px-6 flex flex-col items-center border-b border-slate-800 md:border-b-0 md:border-r md:w-1/3 md:justify-center md:pt-0 flex-shrink-0">

          <motion.img
            layoutId={`img-${card.id}`}
            src={getCardImage(card.name)}
            className="h-[25vh] w-auto md:h-auto md:w-72 rounded-[12px] md:rounded-[18px] shadow-2xl shadow-black my-2 md:my-4 ring-1 ring-white/10 object-contain"
          />

          <h1 className="text-lg md:text-2xl font-black text-center text-white leading-tight mb-1 md:mb-3 truncate w-full px-2">{card.name}</h1>

          <div className="flex items-center gap-3 mb-3 md:mb-6 scale-90 md:scale-100">
            <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${RARITY_STYLES[rCode]}`}>{rCode}</span>
            <ManaIcons colors={card.colors} size="lg" />
          </div>

          <div className="grid grid-cols-2 gap-2 md:gap-3 w-full max-w-xs">
            <div className="bg-slate-800 p-2 md:p-3 rounded-xl border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold mb-0.5 md:mb-1">GIH WR</span>
              <div className={`text-xl md:text-3xl font-black ${getDeltaStyle(card.gih_wr, 55)}`}>{card.gih_wr ? card.gih_wr.toFixed(1) : '--'}%</div>
            </div>
            <div className="bg-slate-800 p-2 md:p-3 rounded-xl border border-slate-700 flex flex-col items-center">
              <span className="text-[9px] md:text-[10px] text-slate-500 uppercase font-bold mb-0.5 md:mb-1">ALSA</span>
              <div className="text-xl md:text-3xl font-black text-white">{card.alsa ? card.alsa.toFixed(2) : '--'}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-950">
          <CardEvaluationBlock card={card} allCards={allCards} />

          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Layers size={14} /> Performance by Archetype
              </h3>
              <button
                onClick={() => setSortMode(prev => prev === 'synergy' ? 'winrate' : 'synergy')}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded hover:bg-indigo-400/20 transition-colors"
              >
                <ArrowUpDown size={10} />
                {sortMode === 'synergy' ? 'Sort by Win Rate' : 'Sort by Impact'}
              </button>
            </div>

            {sortedPerf.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <p className="text-xs text-slate-500">Not enough play data across archetypes (min. {minGamesDisplay} games).</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {sortedPerf.map((perf, idx) => {
                  const grade = calculateGrade(perf.cardWr, perf.deckWr);
                  return (
                    <div key={idx} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1 min-w-[2.5rem]">
                        <span className={`text-xl font-black ${grade.color.split(' ')[0]}`}>{grade.letter}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <ManaIcons colors={perf.deckColors} size="sm" />
                            <span className="text-sm font-bold text-slate-200 truncate">{perf.deckName}</span>
                          </div>
                          <span className={`text-xs font-bold ${getDeltaStyle(perf.cardWr, perf.deckWr)}`}>{perf.cardWr.toFixed(1)}%</span>
                        </div>
                        <div className="relative h-1.5 bg-slate-800 rounded-full w-full mt-2 overflow-hidden">
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600 z-10"></div>
                          <div className={`absolute top-0 bottom-0 ${perf.cardWr >= perf.deckWr ? 'bg-emerald-500 left-1/2 rounded-r-full' : 'bg-red-500 right-1/2 rounded-l-full'}`}
                            style={{ width: `${Math.min(Math.abs(perf.cardWr - perf.deckWr) * 4, 50)}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </SwipeableOverlay>
  )
}

// ============================================================================
// 5. COMPOSANT FORMAT COMPARISON 
// ============================================================================

const FormatComparison = ({ activeSet }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- ÉTATS ---
  const [formatA, setFormatA] = useState('PremierDraft'); 
  const [formatB, setFormatB] = useState('ArenaDirect_Sealed'); 
  const [compareMode, setCompareMode] = useState('archetypes'); 
  
  // Toggle Metric
  const [metricMode, setMetricMode] = useState('winrate');

  // Toggle pour mobile uniquement (A vs B)
  const [mobileShowFormatB, setMobileShowFormatB] = useState(false);

  // Filtres
  const [rarityFilter, setRarityFilter] = useState([]);
  const [colorFilters, setColorFilters] = useState([]);
  const [archTypeFilter, setArchTypeFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tri & Affichage
  const [sortDir, setSortDir] = useState('desc');
  const [visibleCount, setVisibleCount] = useState(30);
  const [zoomedCard, setZoomedCard] = useState(null);
  
  const observerTarget = React.useRef(null);

  const FORMAT_OPTIONS = [
    { label: 'Premier Draft', value: 'PremierDraft', short: 'PD' },
    { label: 'Trad. Draft', value: 'TradDraft', short: 'TD' },
    { label: 'Sealed', value: 'Sealed', short: 'SEA' },
    { label: 'Arena Direct Sealed', value: 'ArenaDirect_Sealed', short: 'ADS' },
  ];

  const getFormatLabel = (val) => FORMAT_OPTIONS.find(o => o.value === val)?.label || val;
  // Version courte pour les labels mobiles
  const getFormatShort = (val) => FORMAT_OPTIONS.find(o => o.value === val)?.short || val.substring(0, 3).toUpperCase();

  // 1. FETCH DATA
  useEffect(() => {
    async function fetchComparison() {
      setLoading(true);
      try {
        let query;

        if (compareMode === 'archetypes') {
           query = supabase
            .from('archetype_comparison_pivot')
            .select('*')
            .eq('set_code', activeSet);
        } else {
           query = supabase
            .from('comparison_pivot_v1_3')
            .select('*')
            .eq('set_code', activeSet)
            .eq('filter_context', 'Global');
        }

        const { data: pivotData, error } = await query;
        if (!error && pivotData) {
          setData(pivotData);
          setVisibleCount(30);
        } else if (error) {
          console.error("Supabase Error:", error);
        }
      } catch (err) { console.error("Fetch error:", err); }
      setLoading(false);
    }
    fetchComparison();
  }, [activeSet, compareMode]);

  // 2. INFINITE SCROLL
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 40);
        }
      },
      { threshold: 0.1, rootMargin: '600px' }
    );

    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
  }, [data, compareMode, rarityFilter, colorFilters, searchTerm]);

  // 3. LOGIQUE DE CALCUL
  const processedData = useMemo(() => {
    const fMap = { 'PremierDraft': 'premier', 'TradDraft': 'trad', 'Sealed': 'sealed', 'ArenaDirect_Sealed': 'direct' };
    const sA = fMap[formatA] || 'premier';
    const sB = fMap[formatB] || 'direct';

    return data
      .filter(item => {
        if (compareMode === 'cards' && searchTerm) {
          if (!item.card_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        }

        if (compareMode === 'cards') {
          if (rarityFilter.length > 0) {
            const r = typeof normalizeRarity === 'function' ? normalizeRarity(item.rarity) : (item.rarity ? item.rarity[0].toUpperCase() : 'C');
            if (!rarityFilter.includes(r)) return false;
          }
          if (colorFilters.length > 0) {
            const cStr = item.colors || ""; 
            const cColors = typeof extractColors === 'function' ? extractColors(cStr) : cStr.replace(/[^WUBRG]/g, '');
            if (colorFilters.includes('M') && cColors.length > 1) return true;
            if (colorFilters.includes('C') && cColors.length === 0) return true;
            const monoFilters = colorFilters.filter(f => ['W', 'U', 'B', 'R', 'G'].includes(f));
            if (monoFilters.length > 0) {
              for (let f of monoFilters) {
                if (cColors.includes(f)) return true;
              }
              return false;
            }
          }
        }
        if (compareMode === 'archetypes' && archTypeFilter) {
          const rawContext = item.filter_context || "";
          const colorsOnly = rawContext.replace(' + Splash', '').replace(/[^WUBRG]/g, '');
          const isSplash = rawContext.toLowerCase().includes('splash');
          
          if (archTypeFilter === 'All') {
            const is2Color = colorsOnly.length === 2;
            const is3ColorPure = colorsOnly.length === 3 && !isSplash; 
            return is2Color || is3ColorPure;
          }
          if (archTypeFilter === '2color') return colorsOnly.length === 2 && !isSplash;
          if (archTypeFilter === 'splash') return colorsOnly.length === 2 && isSplash;
          if (archTypeFilter === '3color') return colorsOnly.length === 3;
        }
        return true;
      })
      .map(item => {
        let valA, valB, rawA, rawB, diff;

        if (compareMode === 'cards') {
          valA = parseFloat(item[`card_delta_${sA}`]);
          valB = parseFloat(item[`card_delta_${sB}`]);
          rawA = parseFloat(item[`card_wr_${sA}`]);
          rawB = parseFloat(item[`card_wr_${sB}`]);
          diff = (!isNaN(valA) && !isNaN(valB)) ? (valA - valB) : null;
        } else {
          if (metricMode === 'winrate') {
            valA = parseFloat(item[`arch_delta_${sA}`]);
            valB = parseFloat(item[`arch_delta_${sB}`]);
            rawA = parseFloat(item[`arch_wr_${sA}`]);
            rawB = parseFloat(item[`arch_wr_${sB}`]);
            diff = (!isNaN(valA) && !isNaN(valB)) ? (valA - valB) : null;
          } else {
            valA = parseFloat(item[`meta_share_${sA}`]);
            valB = parseFloat(item[`meta_share_${sB}`]);
            rawA = null;
            rawB = null;
            diff = (!isNaN(valA) && !isNaN(valB)) ? (valA - valB) : null;
          }
        }

        if (isNaN(valA) || isNaN(valB) || valA === null || valB === null) return null;

        return {
          ...item,
          valA, 
          valB,
          rawA: isNaN(rawA) ? null : rawA,
          rawB: isNaN(rawB) ? null : rawB,
          diff
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => {
        const diffA = a.diff !== null ? a.diff : -99999;
        const diffB = b.diff !== null ? b.diff : -99999;
        return sortDir === 'desc' ? (diffB - diffA) : (diffA - diffB);
      });
  }, [data, compareMode, formatA, formatB, rarityFilter, colorFilters, archTypeFilter, sortDir, metricMode, searchTerm]);

  const visibleData = processedData.slice(0, visibleCount);

  // Helper pour le bouton de tri
  const SortButtonContent = () => (
    <>
      {sortDir === 'desc' ? 'Overperformers' : 'Underperformers'}
    </>
  );

  return (
    <div className="flex flex-col gap-6 min-h-screen relative">
      
      <AnimatePresence>
        {zoomedCard && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setZoomedCard(null)}
          >
            <motion.img 
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              src={typeof getCardImage === 'function' ? getCardImage(zoomedCard) : ''} 
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()} 
            />
            <button className="absolute top-4 right-4 text-white bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md pb-4 pt-2">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-4 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto order-last md:order-first">
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 w-full md:w-auto">
                <button onClick={() => setCompareMode('archetypes')} className={`flex-1 px-6 py-2 rounded-md text-[10px] font-black transition-all ${compareMode === 'archetypes' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>ARCHETYPES</button>
                <button onClick={() => setCompareMode('cards')} className={`flex-1 px-6 py-2 rounded-md text-[10px] font-black transition-all ${compareMode === 'cards' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>CARDS</button>
              </div>
            </div>
            
            <div className="flex flex-col items-center relative w-full md:w-auto order-first md:order-last">
              <div className="flex items-center gap-2 w-full relative z-10">
                <select value={formatA} onChange={(e) => setFormatA(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 text-white text-[10px] font-bold p-2.5 rounded-lg outline-none uppercase cursor-pointer">{FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                <span className="text-slate-600 font-black text-[10px] pb-3">VS</span>
                <select value={formatB} onChange={(e) => setFormatB(e.target.value)} className="flex-1 bg-indigo-900/40 border border-indigo-500/30 text-white text-[10px] font-bold p-2.5 rounded-lg outline-none uppercase cursor-pointer">{FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </div>
              <Zap size={14} className="text-yellow-400 absolute left-1/2 -translate-x-1/2 bottom-0 mb-1 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)] z-0" fill="currentColor" />
            </div>
          </div>

          {/* SWITCH DANS LE HEADER SUPPRIMÉ ICI */}

          <div className="flex flex-wrap justify-between items-center pt-3 border-t border-slate-800 gap-4">
            <div className="flex-1 flex flex-wrap gap-2 items-center w-full">
              {compareMode === 'cards' ? (
                <div className="flex flex-col md:flex-row gap-2 w-full md:items-center justify-between">
                   <div className="flex gap-2 w-full md:w-auto md:order-2 md:ml-auto">
                      <div className="relative flex-1 md:w-48 md:flex-none">
                        <input 
                          type="text" 
                          placeholder="Search card..." 
                          value={searchTerm} 
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 text-slate-300 py-1.5 pl-8 pr-3 rounded-lg text-[10px] font-bold focus:border-indigo-500 focus:outline-none transition-colors" 
                        />
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>
                      
                      <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="md:hidden text-indigo-400 text-[9px] font-black flex items-center justify-center gap-1 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest flex-shrink-0">
                         <SortButtonContent />
                      </button>
                   </div>

                   <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto no-scrollbar w-full md:w-auto md:order-1 mask-linear-fade">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {['W', 'U', 'B', 'R', 'G'].map(c => (
                          <button key={c} onClick={() => setColorFilters(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}
                            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${colorFilters.includes(c) ? 'scale-110 shadow-md z-10' : 'opacity-60 grayscale'}`}
                            style={{ borderColor: colorFilters.includes(c) ? 'white' : 'transparent' }}>
                            <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="w-full h-full" />
                          </button>
                        ))}
                        <div className="w-[1px] h-4 bg-slate-700 mx-1"/>
                        <button onClick={() => setColorFilters(p => p.includes('M') ? p.filter(x => x !== 'M') : [...p, 'M'])} className={`w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 border flex items-center justify-center text-[8px] font-black text-white ${colorFilters.includes('M') ? 'border-white scale-110' : 'border-transparent opacity-60 grayscale'}`}>M</button>
                        <button onClick={() => setColorFilters(p => p.includes('C') ? p.filter(x => x !== 'C') : [...p, 'C'])} className={`w-6 h-6 rounded-full bg-slate-400 border flex items-center justify-center text-[8px] font-black text-slate-900 ${colorFilters.includes('C') ? 'border-white scale-110' : 'border-transparent opacity-60'}`}>C</button>
                      </div>
                      
                      <div className="w-[1px] h-5 bg-slate-800 mx-1 flex-shrink-0"></div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {['M', 'R', 'U', 'C'].map(r => (
                          <button key={r} onClick={() => setRarityFilter(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])} 
                            // @ts-ignore
                            className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black border transition-all ${rarityFilter.includes(r) ? `${typeof RARITY_STYLES !== 'undefined' ? RARITY_STYLES[r] : ''} border-white/40 shadow-lg scale-105` : 'bg-slate-900 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}>{r}</button>
                        ))}
                        {(rarityFilter.length > 0 || colorFilters.length > 0) && (<button onClick={() => { setRarityFilter([]); setColorFilters([]); }} className="ml-1 p-1 text-slate-500 hover:text-white transition-colors"><X size={14} /></button>)}
                      </div>
                   </div>

                   <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="hidden md:flex text-indigo-400 text-[10px] font-black items-center gap-2 bg-indigo-500/10 px-4 py-2.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest md:order-3">
                      <SortButtonContent />
                   </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <select value={archTypeFilter} onChange={(e) => setArchTypeFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-white text-xs font-bold py-2 px-3 rounded-lg outline-none cursor-pointer w-full md:w-auto capitalize">
                    <option value="All">All Archetypes</option>
                    <option value="2color">2 Colors</option>
                    <option value="splash">2 Colors + Splash</option>
                    <option value="3color">3 Colors</option>
                  </select>

                  <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 ml-auto md:ml-0">
                    <button onClick={() => setMetricMode('winrate')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black transition-all ${metricMode === 'winrate' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                      <Trophy size={10} /> WR
                    </button>
                    <button onClick={() => setMetricMode('meta')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-black transition-all ${metricMode === 'meta' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                      <PieChartIcon size={10} /> META
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {compareMode === 'archetypes' && (
              <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="text-indigo-400 text-[10px] font-black flex items-center gap-2 bg-indigo-500/10 px-4 py-2.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest ml-auto">
                <SortButtonContent />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 pb-32">
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div></div>
        ) : visibleData.length === 0 ? (
          <div className="text-center py-20 text-slate-500 font-bold italic border border-dashed border-slate-800 rounded-xl">Aucune donnée trouvée.</div>
        ) : (
          <>
            {visibleData.map((item, idx) => (
              <div 
                key={`${item.card_name || item.filter_context}-${idx}`} 
                onClick={() => compareMode === 'cards' && setZoomedCard(item.card_name)}
                className={`w-full bg-slate-900/50 border border-slate-800/60 rounded-xl p-3.5 flex items-center justify-between group hover:border-indigo-500/40 hover:bg-slate-800/80 transition-all text-left active:scale-[0.98] ${compareMode === 'cards' ? 'cursor-zoom-in' : ''}`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {compareMode === 'cards' ? (
                    <div className="relative shrink-0">
                      <img src={typeof getCardImage === 'function' ? getCardImage(item.card_name) : ''} className="w-12 h-16 md:w-14 md:h-20 rounded-lg object-cover bg-black border border-slate-700 shadow-2xl" loading="lazy" alt={item.card_name} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-slate-950 rounded-full border border-slate-800 shadow-inner shrink-0 flex items-center justify-center">
                        {typeof ManaIcons !== 'undefined' && <ManaIcons colors={typeof extractColors === 'function' ? extractColors(item.filter_context) : ''} size="lg" />}
                      </div>
                      <span className="font-black text-sm text-slate-100 truncate tracking-tight pt-0.5">{item.filter_context}</span>
                    </div>
                  )}
                  {compareMode === 'cards' && (
                     <div className="flex flex-col truncate ml-1 justify-center h-full">
                       <span className="font-black text-sm text-slate-100 truncate tracking-tight leading-tight">{item.card_name}</span>
                     </div>
                  )}
                </div>
                
                {/* BLOC DROIT : COMPARAISON DES STATS (AVEC SWITCH MOBILE IN-BLOCK) */}
                <div className="flex flex-row items-center gap-2 md:gap-3 flex-shrink-0">
                  
                  {/* BOUTON SWITCH MOBILE UNIQUEMENT */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileShowFormatB(!mobileShowFormatB); }}
                    className="md:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-400 transition-colors active:scale-90"
                    aria-label="Switch format view"
                  >
                    <Repeat size={16} />
                  </button>

                  {/* Container Stats : Desktop = 2 Colonnes / Mobile = 1 Colonne selon Switch */}
                  <div className="flex flex-row gap-8 items-center">
                    
                    {/* FORMAT A */}
                    <div className={`${mobileShowFormatB ? 'hidden' : 'flex'} md:flex flex-col items-end group-hover:opacity-100 transition-opacity min-w-[60px]`}>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 md:hidden">{getFormatShort(formatA)}</span>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 hidden md:block">{getFormatLabel(formatA)}</span>
                      <span className={`text-xs font-mono font-bold ${item.valA !== null && item.valA >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {item.valA !== null ? (metricMode === 'winrate' && item.valA > 0 ? '+' : '') + item.valA.toFixed(1) + '%' : '--'}
                      </span>
                      {item.rawA !== null && <span className="text-[9px] text-slate-500 font-bold opacity-80 mt-0.5">{item.rawA.toFixed(1)}%</span>}
                    </div>

                    {/* FORMAT B */}
                    <div className={`${!mobileShowFormatB ? 'hidden' : 'flex'} md:flex flex-col items-end group-hover:opacity-100 transition-opacity min-w-[60px]`}>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 md:hidden">{getFormatShort(formatB)}</span>
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 hidden md:block">{getFormatLabel(formatB)}</span>
                      <span className={`text-xs font-mono font-bold ${item.valB !== null && item.valB >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {item.valB !== null ? (metricMode === 'winrate' && item.valB > 0 ? '+' : '') + item.valB.toFixed(1) + '%' : '--'}
                      </span>
                      {item.rawB !== null && <span className="text-[9px] text-slate-500 font-bold opacity-80 mt-0.5">{item.rawB.toFixed(1)}%</span>}
                    </div>

                  </div>

                  {/* SHIFT (Fixe à droite) */}
                  <div className={`flex flex-col items-end min-w-[70px] md:min-w-[90px] p-2 md:p-2.5 rounded-lg md:rounded-xl border transition-all ${item.diff >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${item.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Shift</span>
                    <span className={`text-lg md:text-xl font-black tabular-nums ${item.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.diff !== null ? ((item.diff >= 0 ? '+' : '') + item.diff.toFixed(1) + '%') : '--'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {visibleCount < processedData.length && (
              <div ref={observerTarget} className="h-10 w-full flex items-center justify-center opacity-50">
                <span className="text-[10px] animate-pulse">Chargement de la suite...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 6. COMPOSANT MIS À JOUR : PRESS REVIEW (AVEC NETTOYAGE JSON & MARKDOWN)
// ============================================================================

const PressReview = ({ activeSet }) => {
  const [articles, setArticles] = useState([]);
  const [activeSetsOptions, setActiveSetsOptions] = useState([]); // Liste des sets actifs chargée dynamiquement
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState(null);

  // États Filtres
  const [selectedTags, setSelectedTags] = useState([]); // Multi-sélection
  const [currentSetFilter, setCurrentSetFilter] = useState('All'); // Filtre Set
  const [zoomedCard, setZoomedCard] = useState(null);

  const cleanSummary = (text) => {
    if (!text) return "";

    // 1. On coupe avant le début du JSON technique
    let content = text.split('{')[0];

    // 2. Nettoyage en profondeur
    return content
      .replace(/```[\s\S]*?$/g, '')      // Supprime un bloc de code ouvert et non fermé à la fin
      .replace(/`{1,3}/g, '')           // Supprime les backticks restants partout
      .replace(/[-_*]{3,}/g, '')        // Supprime les lignes horizontales (---, ***, ___)
      .replace(/\s+$/g, '')             // Supprime tous les espaces et retours à la ligne à la fin
      .trim();
  };

  const parsePostgresArray = (pgArray) => {
    if (!pgArray) return [];
    if (Array.isArray(pgArray)) return pgArray;
    return pgArray.replace(/{|}/g, '').split(',').map(item => item.trim().replace(/^"|"$/g, ''));
  };

  // 1. RECUPERATION DES SETS ACTIFS (POUR LE DROPDOWN)
  useEffect(() => {
    async function fetchActiveSets() {
      try {
        const { data } = await supabase
          .from('sets')
          .select('code, name')
          .eq('active', true)
          .order('start_date', { ascending: false });
        if (data) setActiveSetsOptions(data);
      } catch (err) { console.error("Error fetching sets:", err); }
    }
    fetchActiveSets();
  }, []);

  // 2. RECUPERATION DES ARTICLES (FILTRE COTE SERVEUR SUR LE SET)
  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      try {
        let query = supabase.from('press_articles').select('*').order('published_at', { ascending: false });

        // Si un set spécifique est sélectionné (ex: TLA), on filtre sur set_tag
        if (currentSetFilter !== 'All') {
          query = query.eq('set_tag', currentSetFilter);
        }

        const { data } = await query.limit(50);
        if (data) setArticles(data);
      } catch (err) { console.error("Error fetching articles:", err); }
      setLoading(false);
    }
    fetchArticles();
  }, [currentSetFilter]);

  // 3. FILTRAGE LOCAL MULTI-TAGS
  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    if (selectedTags.length === 0) return articles;
    // L'article doit contenir TOUS les tags sélectionnés
    return articles.filter(article =>
      selectedTags.every(tag => article.tags?.includes(tag))
    );
  }, [articles, selectedTags]);

  // Génération de la liste de tous les tags disponibles dans les articles chargés
  const allTags = useMemo(() => {
    const tags = new Set();
    if (articles) {
      articles.forEach(article => article.tags?.forEach(tag => tags.add(tag)));
    }
    return Array.from(tags).sort();
  }, [articles]);

  // Gestion du clic sur un tag (Ajout/Suppression)
  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const getYouTubeThumbnail = (article) => {
    if (!article || !article.video_url) return article?.thumbnail_url || "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = article.video_url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : article.thumbnail_url;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <>
      {/* ZOOM CARTE */}
      <AnimatePresence>
        {zoomedCard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setZoomedCard(null)}
            className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              src={`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(zoomedCard)}&format=image&version=border_crop`}
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <Newspaper className="text-indigo-400" /> Press Review
              </h2>
              <p className="text-slate-400 text-sm">Curated summaries & strategic insights.</p>
            </div>

            {/* SÉLECTEUR DE SET DYNAMIQUE (TLA, FDN...) */}
            <div className="relative min-w-[160px]">
              <select
                value={currentSetFilter}
                onChange={(e) => setCurrentSetFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs font-bold py-2.5 pl-4 pr-10 rounded-xl outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-all hover:border-slate-600"
              >
                <option value="All">All Sets</option>
                {activeSetsOptions.map(s => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
            </div>
          </div>

          {/* NUAGE DE TAGS (MULTI-SELECTION) */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-linear-fade">
            <button
              onClick={() => setSelectedTags([])}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap 
                ${selectedTags.length === 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}`}
            >
              All Tags
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap 
                  ${selectedTags.includes(tag) ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* LISTE DES ARTICLES */}
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div></div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center text-slate-500 py-20 bg-slate-900 rounded-xl border border-slate-800">
            No articles found matching filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredArticles.map((article) => (
              <button
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className="w-full text-left bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 hover:bg-slate-800 transition-all group active:scale-[0.99]"
              >
                <div className="md:flex">
                  <div className="md:w-56 md:flex-shrink-0 relative overflow-hidden bg-black h-40 md:h-auto">
                    <img src={getYouTubeThumbnail(article)} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="thumb" />

                    {/* SCORE AVEC TOOLTIP */}
                    {article.strategic_score && (
                      <div className="absolute top-2 left-2 group/score">
                        <div className="bg-indigo-600/90 backdrop-blur-md text-white px-2 py-1 rounded text-[10px] font-black flex items-center gap-1 shadow-lg cursor-help">
                          <Zap size={10} fill="currentColor" /> {article.strategic_score}/10
                        </div>
                        {/* Tooltip au survol */}
                        <div className="absolute left-0 top-full mt-1.5 hidden group-hover/score:block bg-slate-900 text-slate-200 text-[9px] font-bold px-2 py-1 rounded border border-slate-700 shadow-xl whitespace-nowrap z-20">
                          Strategic Score
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1">
                    <div className="flex flex-wrap gap-2 mb-2 items-center">
                      <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {article.set_tag || 'MTG'}
                      </span>
                      <span className="text-[9px] font-bold uppercase text-slate-500">{article.channel_name}</span>
                      {article.tags?.slice(0, 3).map(t => (
                        <span key={t} className={`text-[9px] font-bold border px-2 py-0.5 rounded ${selectedTags.includes(t) ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'text-slate-500 border-slate-800'}`}>{t}</span>
                      ))}
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-slate-100 mb-1 group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {article.title}
                    </h3>
                    <p className="text-slate-400 text-xs line-clamp-2 italic leading-relaxed">
                      {cleanSummary(article.summary)}
                    </p>
                    <div className="mt-2 text-[10px] text-slate-600 font-medium flex items-center gap-2">
                      {formatDate(article.published_at)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* OVERLAY DE DETAIL */}
      <AnimatePresence>
        {selectedArticle && (
          <SwipeableOverlay onClose={() => setSelectedArticle(null)}>
            <div className="flex flex-col h-full md:flex-row bg-slate-950">
              {/* VOLET GAUCHE (Vidéo) - RÉDUIT SUR MOBILE */}
              <div className="md:w-1/3 flex-shrink-0 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 p-4 md:p-6 flex flex-col items-center justify-start md:justify-center relative max-h-[25vh] md:max-h-full overflow-hidden">
                <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-2xl border border-slate-700 group shrink-0">
                  <img src={getYouTubeThumbnail(selectedArticle)} className="w-full h-full object-cover" alt="vid" />
                  <a href={selectedArticle.video_url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-red-600 text-white px-3 py-1.5 rounded-full font-bold flex items-center gap-2 text-[10px] shadow-xl transform scale-95 group-hover:scale-100 transition-transform">
                      <Play size={12} fill="currentColor" /> Watch
                    </div>
                  </a>
                </div>
                <div className="text-center mt-3 hidden md:block w-full">
                  <h2 className="text-xl font-black text-white leading-tight mb-2">{selectedArticle.title}</h2>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatDate(selectedArticle.published_at)}</span>
                </div>
                <a href={selectedArticle.video_url} target="_blank" rel="noopener noreferrer" className="hidden md:flex mt-6 w-full max-w-[200px] bg-white text-black py-2.5 rounded-lg font-bold items-center justify-center gap-2 hover:bg-indigo-500 hover:text-white transition-colors text-xs">
                  <ExternalLink size={14} /> Open on YouTube
                </a>
              </div>

              {/* VOLET DROIT (Contenu) */}
              <div className="flex-1 overflow-y-auto p-5 md:p-12 bg-slate-950">
                <div className="max-w-2xl mx-auto pb-20 md:pb-0">
                  {/* Titre Mobile */}
                  <div className="md:hidden mb-6">
                    <h2 className="text-lg font-black text-white leading-tight">{selectedArticle.title}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{selectedArticle.set_tag}</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">{formatDate(selectedArticle.published_at)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                      <Zap size={14} className="text-indigo-500" /> Key Takeaways
                    </h3>
                    {selectedArticle.strategic_score && (
                      <div className="relative group/score-detail">
                        <span className="text-indigo-400 font-black text-xs cursor-help bg-indigo-500/10 px-2 py-1 rounded">
                          Score: {selectedArticle.strategic_score}/10
                        </span>
                        <div className="absolute right-0 top-full mt-1 hidden group-hover/score-detail:block bg-slate-800 text-slate-200 text-[9px] p-2 rounded border border-slate-700 w-24 text-center shadow-xl z-20">
                          Strategic Score
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="prose prose-invert prose-sm prose-indigo max-w-none">
                    <ReactMarkdown>{cleanSummary(selectedArticle.summary)}</ReactMarkdown>
                  </div>

                  {/* SECTION CARTES : AFFICHAGE BRUT + ZOOM (AVEC GESTION ERREUR) */}
                  {selectedArticle.mentioned_cards && (
                    <div className="mt-10 pt-8 border-t border-slate-800">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 flex items-center gap-2 tracking-widest">
                        <Gem size={14} className="text-indigo-500" /> Mentioned Cards
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        {parsePostgresArray(selectedArticle.mentioned_cards)
                          .map((cardName, idx) => (
                            <button
                              key={idx}
                              onClick={() => setZoomedCard(cardName)} // ZOOM SIMPLE
                              className="group relative w-20 md:w-28 transition-transform hover:scale-105 active:scale-95"
                            >
                              <img
                                src={`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}&format=image&version=border_crop`}
                                alt={cardName}
                                className="rounded-md shadow-lg border border-slate-800 group-hover:border-indigo-500 transition-all w-full h-auto bg-slate-900"
                                loading="lazy"
                                // Masque le bouton si l'image plante (hallucination)
                                onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 bg-indigo-600 rounded-full p-2 shadow-xl">
                                  <Search size={14} className="text-white" />
                                </div>
                              </div>
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SwipeableOverlay>
        )}
      </AnimatePresence>
    </>
  );
};

// ============================================================================
// 7. MAIN APP
// ============================================================================

// ============================================================================
// 7. MAIN APP
// ============================================================================

export default function MTGLimitedApp() {
  const [activeTab, setActiveTab] = useState('decks');
  const [activeFormat, setActiveFormat] = useState('PremierDraft');
  const [activeSet, setActiveSet] = useState('TLA');
  const [availableSets, setAvailableSets] = useState([]);
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalGames, setTotalGames] = useState(1);
  const [globalMeanWR, setGlobalMeanWR] = useState(55.0);
  const [deckTypeFilter, setDeckTypeFilter] = useState('Two colors');
  const [chartMode, setChartMode] = useState('meta');
  const [searchTerm, setSearchTerm] = useState('');

  const [rarityFilter, setRarityFilter] = useState([]);
  const [colorFilters, setColorFilters] = useState([]);

  const [archetypeFilter, setArchetypeFilter] = useState('Global');
  const [sortConfig, setSortConfig] = useState({ key: 'gih_wr', dir: 'desc' });
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  // --- NOUVEAU : Lazy Loading States ---
  const [visibleCardsCount, setVisibleCardsCount] = useState(40);
  const cardsObserverTarget = React.useRef(null);

  useEffect(() => {
    async function fetchSets() {
      const { data } = await supabase.from('sets').select('code').eq('active', true).order('start_date', { ascending: false });
      if (data && data.length > 0) { setAvailableSets(data); }
    }
    fetchSets();
  }, []);

  useEffect(() => {
    async function loadDecks() {
      if (!activeSet) return;
      const { data } = await supabase.from('archetype_stats').select('*').eq('set_code', activeSet).eq('format', activeFormat).order('win_rate', { ascending: false });
      if (data) {
        const validDecks = data.filter(d => !['All Decks', 'Two-color', 'Two-color + Splash', 'Three-color', 'Three-color + Splash', 'Mono-color', 'Mono-color + Splash'].includes(d.archetype_name));
        const total = validDecks.reduce((acc, curr) => acc + (curr.games_count || 0), 0);
        setTotalGames(total || 1);
        const formattedDecks = validDecks.map(d => {
          let type = "Other";
          const code = d.colors || "";
          const isSplash = code.includes("Splash");
          const baseColors = code.replace(' + Splash', '').replace(/[^WUBRG]/g, '');
          const count = baseColors.length;
          if (count === 1) type = "Mono-color";
          else if (count === 2 && !isSplash) type = "Two colors";
          else if (count === 2 && isSplash) type = "Two colors + splash";
          else if (count === 3 && !isSplash) type = "Three colors";
          else if (count >= 3) type = "More than 3 colors";
          return {
            id: d.id,
            name: d.archetype_name,
            colors: d.colors,
            wr: d.win_rate,
            games: d.games_count,
            type: type,
            history: (d.win_rate_history && d.win_rate_history.length > 1) ? d.win_rate_history : [d.win_rate, d.win_rate]
          };
        });
        setDecks(formattedDecks);
      } else { setDecks([]); setTotalGames(1); }
    }
    loadDecks();
  }, [activeFormat, activeSet]);

  useEffect(() => {
    async function loadCards() {
      if (!activeSet) return;
      setLoading(true);
      const { data: globalDeck } = await supabase.from('archetype_stats').select('win_rate').eq('set_code', activeSet).eq('format', activeFormat).eq('archetype_name', 'All Decks').single();
      if (globalDeck && globalDeck.win_rate) setGlobalMeanWR(globalDeck.win_rate);
      const { data } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('filter_context', archetypeFilter).eq('format', activeFormat);
      if (data) {
        const formattedCards = data.map(c => ({ id: c.id, name: c.card_name, rarity: c.rarity, colors: c.colors, gih_wr: c.gih_wr, alsa: c.alsa, img_count: c.img_count }));
        setCards(formattedCards);
      } else { setCards([]); }
      setLoading(false);
    }
    loadCards();
  }, [archetypeFilter, activeFormat, activeSet]);

  const filteredDecks = useMemo(() => {
    if (!decks || decks.length === 0) return [];
    let targetList = [];
    if (deckTypeFilter === 'Two colors' || deckTypeFilter === 'Two colors + splash') targetList = PAIRS;
    else if (deckTypeFilter === 'Three colors') targetList = TRIOS;
    else return decks.filter(d => d.type === deckTypeFilter).sort((a, b) => b.wr - a.wr);
    return targetList.map(template => {
      const found = decks.find(d => {
        const isTypeMatch = d.type === deckTypeFilter;
        const deckColors = extractColors(d.colors);
        return isTypeMatch && areColorsEqual(deckColors, template.code);
      });
      return found || { id: `placeholder-${template.code}`, name: template.name, colors: deckTypeFilter.includes('splash') ? `${template.code} + Splash` : template.code, wr: 0, games: 0, type: deckTypeFilter, history: [0, 0, 0] };
    }).sort((a, b) => b.wr - a.wr);
  }, [decks, deckTypeFilter]);

  const filteredCards = useMemo(() => {
    let res = [...cards];

    if (searchTerm) res = res.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (rarityFilter.length > 0) {
      res = res.filter(c => rarityFilter.includes(normalizeRarity(c.rarity)));
    }

    if (colorFilters.length > 0) {
      res = res.filter(c => {
        const cColors = extractColors(c.colors);
        if (colorFilters.includes('M') && cColors.length > 1) return true;
        if (colorFilters.includes('C') && cColors.length === 0) return true;
        const monoFilters = colorFilters.filter(f => ['W', 'U', 'B', 'R', 'G'].includes(f));
        if (monoFilters.length > 0) {
          for (let f of monoFilters) {
            if (cColors.includes(f)) return true;
          }
        }
        return false;
      });
    }

    res.sort((a, b) => {
      if (sortConfig.key === 'name') return sortConfig.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

      const valA = sortConfig.key === 'alsa' ? a.alsa : a.gih_wr;
      const valB = sortConfig.key === 'alsa' ? b.alsa : b.gih_wr;

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
    });
    return res;
  }, [cards, searchTerm, rarityFilter, colorFilters, sortConfig]);

  // --- NOUVEAU : Logique de Reset du Lazy Load ---
  // Dès qu'on change un filtre, on remet le compteur à 40 pour afficher le début de la nouvelle liste
  useEffect(() => {
    setVisibleCardsCount(40);
  }, [searchTerm, rarityFilter, colorFilters, sortConfig, archetypeFilter, activeSet, activeFormat]);

  // --- NOUVEAU : Observer pour Infinite Scroll ---
  useEffect(() => {
    if (activeTab !== 'cards') return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCardsCount(prev => prev + 40);
        }
      },
      { threshold: 0.1, rootMargin: '600px' }
    );

    if (cardsObserverTarget.current) observer.observe(cardsObserverTarget.current);
    return () => { if (cardsObserverTarget.current) observer.unobserve(cardsObserverTarget.current); };
  }, [filteredCards, activeTab]);


  const Sidebar = () => (
    <nav className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 p-4 flex-shrink-0">
      <div className="mb-8 px-2">
        <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent italic">LIMITLESS</h1>
        <p className="text-xs text-slate-500 font-medium tracking-wide">MTG LIMITED ANALYTICS</p>
      </div>
      <div className="space-y-2">
        <button onClick={() => setActiveTab('decks')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'decks' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Layers size={20} strokeWidth={2.5} /> <span>Archetypes Breakdown</span>
        </button>
        <button onClick={() => setActiveTab('cards')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'cards' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Zap size={20} strokeWidth={2.5} /> <span>Card Ratings</span>
        </button>
        <button onClick={() => setActiveTab('compare')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'compare' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Repeat size={20} strokeWidth={2.5} /> <span>Format Comparison</span>
        </button>
        <button onClick={() => setActiveTab('press')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'press' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Newspaper size={20} strokeWidth={2.5} /> <span>Press Review</span>
        </button>
      </div>
      <div className="mt-auto pt-6 border-t border-slate-800 text-xs text-slate-600">
        <p>Data sourced from 17lands.</p>
        <p>Unofficial Fan Content.</p>
      </div>
    </nav>
  );

  const handleSort = (key) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' };
      }
      return { key, dir: 'desc' };
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 text-slate-100 font-sans w-full overflow-hidden relative selection:bg-indigo-500/30">

      <AnimatePresence>
        {selectedDeck && <ArchetypeDashboard key="deck-overlay" deck={selectedDeck} activeFormat={activeFormat} activeSet={activeSet} globalMeanWR={globalMeanWR} totalGames={totalGames} onClose={() => setSelectedDeck(null)} onCardClick={(card) => setSelectedCard(card)} />}
        {selectedCard && <CardDetailOverlay key="card-overlay" card={selectedCard} activeFormat={activeFormat} activeSet={activeSet} decks={decks} cards={cards} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>

      <Sidebar />

      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950 md:bg-[#0B0F19]">
        <header className="px-4 py-3 bg-slate-900 md:bg-slate-950/80 md:backdrop-blur-md sticky top-0 z-30 border-b border-slate-800 flex justify-between items-center shadow-md">
          <h1 className="md:hidden text-xl font-black tracking-tighter bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent italic">LIMITLESS</h1>

          <div className="flex gap-2 ml-auto md:ml-0 md:w-auto">
            <div className="relative">
              <select value={activeSet} onChange={(e) => setActiveSet(e.target.value)} className="appearance-none bg-indigo-600 hover:bg-indigo-500 transition-colors text-white border border-indigo-500 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold focus:outline-none uppercase cursor-pointer">
                {availableSets.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                {availableSets.length === 0 && <option value="TLA">TLA</option>}
              </select>
              <ChevronRight size={12} className="absolute right-2 top-2.5 text-white rotate-90 pointer-events-none" />
            </div>

            {activeTab !== 'compare' && (
              <div className="relative">
                <select value={activeFormat} onChange={(e) => setActiveFormat(e.target.value)} className="appearance-none bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border border-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold focus:outline-none cursor-pointer">
                  {FORMAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronRight size={12} className="absolute right-2 top-2.5 text-slate-500 rotate-90 pointer-events-none" />
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-32 md:pb-8 md:px-6 md:pt-6 scroll-smooth">
          {loading && activeTab === 'cards' && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          )}

          {/* 1. ONGLET DECKS / ARCHETYPES */}
          {activeTab === 'decks' && (
            <div className="p-4 md:p-0 space-y-4 md:space-y-6">
              <div className="flex justify-end">
                <div className="relative w-full md:w-64">
                  <select value={deckTypeFilter} onChange={(e) => setDeckTypeFilter(e.target.value)}
                    className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-4 pr-10 rounded-xl text-sm font-bold focus:border-indigo-500 focus:outline-none shadow-sm w-full cursor-pointer hover:border-slate-500 transition-colors">
                    <option>Two colors</option>
                    <option>Two colors + splash</option>
                    <option>Three colors</option>
                    <option>More than 3 colors</option>
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-3 text-slate-500 rotate-90 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${chartMode === 'meta' ? 'block' : 'hidden'} lg:block h-64`}>
                  <MetagamePieChart decks={decks} totalGames={totalGames} />
                </div>
                <div className={`${chartMode === 'pairs' ? 'block' : 'hidden'} lg:block h-64`}>
                  <PairBreakdownChart decks={decks} />
                </div>
                <div className="lg:hidden flex justify-end">
                  <button onClick={() => setChartMode(prev => prev === 'meta' ? 'pairs' : 'meta')} className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded hover:bg-indigo-400/20">
                    <Repeat size={10} /> Switch Chart
                  </button>
                </div>
              </div>

              <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredDecks.map((deck, idx) => (
                  <motion.button
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                    key={deck.id || idx} onClick={() => setSelectedDeck(deck)}
                    className="w-full flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all active:scale-[0.99] group shadow-sm md:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <ManaIcons colors={deck.colors.split(' +')[0]} size="lg" isSplash={deck.colors.includes('Splash')} />
                      <div className="text-left"><h3 className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">{deck.name}</h3></div>
                    </div>
                    <div className="flex flex-col items-end min-w-[5.5rem]">
                      <div className="flex items-center gap-2">
                        <Sparkline data={deck.history} />
                        <span className={`text-2xl font-black leading-none tracking-tight tabular-nums w-[4.5rem] text-right ${getDeltaStyle(deck.wr, globalMeanWR)}`}>
                          {deck.wr > 0 ? deck.wr.toFixed(1) + '%' : '-'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium tabular-nums">
                        {(deck.games / totalGames * 100).toFixed(1)}% Meta
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* 2. ONGLET CARD RATINGS (AVEC LAZY LOADING) */}
          {activeTab === 'cards' && (
            <div className="flex flex-col min-h-full">
              <div className="bg-slate-950 md:bg-slate-950/90 md:backdrop-blur sticky top-0 md:top-[-1px] z-20 border-b border-slate-800 p-3 md:p-4 space-y-3 shadow-lg">
                <div className="flex gap-2">
                  <div className="relative flex-1 md:max-w-xs">
                    <select
                      value={archetypeFilter}
                      onChange={(e) => setArchetypeFilter(e.target.value)}
                      className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-3 pr-8 rounded-lg text-xs font-bold cursor-pointer hover:border-slate-500 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Global">Global Stats</option>

                      <option disabled className="bg-slate-950 text-slate-500 font-black">--- Two Colors ---</option>
                      {PAIRS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}

                      <option disabled className="bg-slate-950 text-slate-500 font-black">--- Three Colors ---</option>
                      {TRIOS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                    </select>
                    <ChevronRight size={12} className="absolute right-3 top-3 text-slate-500 rotate-90 pointer-events-none" />
                  </div>
                  <div className="relative flex-1">
                    <input type="text" placeholder="Search card..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-8 pr-3 rounded-lg text-xs font-bold focus:border-indigo-500 focus:outline-none" />
                    <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-full border border-slate-800 mr-auto md:mr-0">
                    {['W', 'U', 'B', 'R', 'G'].map(c => (
                      <button key={c} onClick={() => setColorFilters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all relative ${colorFilters.includes(c) ? 'scale-110 shadow-md z-10' : 'opacity-60 hover:opacity-100 grayscale'}`}
                        style={{ borderColor: colorFilters.includes(c) ? 'white' : 'transparent' }}>
                        <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="w-full h-full" />
                      </button>
                    ))}
                    <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
                    <button onClick={() => setColorFilters(prev => prev.includes('M') ? prev.filter(x => x !== 'M') : [...prev, 'M'])}
                      className={`w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 border flex items-center justify-center text-[8px] font-black text-white shadow-sm transition-all ${colorFilters.includes('M') ? 'border-white scale-110' : 'border-transparent opacity-60 grayscale'}`}>M</button>
                    <button onClick={() => setColorFilters(prev => prev.includes('C') ? prev.filter(x => x !== 'C') : [...prev, 'C'])}
                      className={`w-6 h-6 rounded-full bg-slate-400 border flex items-center justify-center text-[8px] font-black text-slate-900 shadow-sm transition-all ${colorFilters.includes('C') ? 'border-white scale-110' : 'border-transparent opacity-60'}`}>C</button>
                  </div>

                  <div className="hidden md:block w-[1px] h-6 bg-slate-800"></div>

                  <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                    {['M', 'R', 'U', 'C'].map((r) => {
                      const isActive = rarityFilter.includes(r);
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            setRarityFilter(prev =>
                              prev.includes(r) ? prev.filter(item => item !== r) : [...prev, r]
                            );
                          }}
                          className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black transition-all border ${isActive
                            ? `${RARITY_STYLES[r]} border-white/40 scale-105 shadow-lg`
                            : 'bg-slate-800 border-transparent text-slate-500 opacity-40 hover:opacity-60'
                            }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                    {rarityFilter.length > 0 && (
                      <button onClick={() => setRarityFilter([])} className="ml-1 p-1 text-slate-500 hover:text-white transition-colors" title="Clear filter">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 flex-1 md:flex-none">
                    <button onClick={() => handleSort('gih_wr')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'gih_wr' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                      GIH <ArrowUpDown size={10} />
                    </button>
                    <button onClick={() => handleSort('alsa')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'alsa' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                      ALSA <ArrowUpDown size={10} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-2 md:p-0 pt-2 space-y-1 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4 md:mt-4">
                {/* On map seulement sur les cartes visibles (sliced) */}
                {!loading && filteredCards.slice(0, visibleCardsCount).map((card, idx) => (
                  <motion.button
                    layoutId={`card-${card.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={card.id} onClick={() => setSelectedCard(card)}
                    className="w-full flex md:flex-row items-center gap-3 bg-slate-900/40 p-2 md:p-3 rounded-lg border border-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all group md:shadow-md"
                  >
                    <motion.img layoutId={`img-${card.id}`} src={getCardImage(card.name)} className="w-11 h-16 md:w-16 md:h-24 rounded-[4px] md:rounded-md object-cover bg-slate-950 border border-slate-800 shadow-sm" loading="lazy" />
                    <div className="flex-1 min-w-0 text-left flex flex-col justify-center h-full">
                      <div className="flex justify-between items-start mb-1">
                        <motion.span layoutId={`title-${card.id}`} className="text-sm font-bold truncate text-slate-200 group-hover:text-white md:text-base">{card.name}</motion.span>
                      </div>
                      <div className="flex justify-between items-end mt-auto">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-1.5 rounded border font-black ${RARITY_STYLES[normalizeRarity(card.rarity)]}`}>{normalizeRarity(card.rarity)}</span>
                            <ManaIcons colors={card.colors} size="sm" />
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono hidden md:block">ALSA {card.alsa ? card.alsa.toFixed(2) : '-'}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-sm md:text-xl font-black ${getDeltaStyle(card.gih_wr, globalMeanWR)}`}>{card.gih_wr ? card.gih_wr.toFixed(1) : '--'}%</span>
                          <span className="text-[10px] text-slate-500 font-mono md:hidden">ALSA {card.alsa ? card.alsa.toFixed(2) : '-'}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}

                {/* Loader / Sentinel de scroll */}
                {!loading && visibleCardsCount < filteredCards.length && (
                  <div ref={cardsObserverTarget} className="col-span-full h-10 w-full flex items-center justify-center opacity-50">
                    <span className="text-[10px] animate-pulse">Chargement de la suite...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. NOUVEL ONGLET : FORMAT COMPARISON */}
          {activeTab === 'compare' && (
            <FormatComparison activeSet={activeSet} />
          )}

          {/* 4. ONGLET NEWS / PRESS REVIEW */}
          {activeTab === 'press' && (
            <PressReview activeSet={activeSet} />
          )}

        </main>
      </div>

      <nav className="md:hidden bg-slate-900 border-t border-slate-800 px-8 py-3 pb-6 flex justify-around items-center absolute bottom-0 w-full z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('decks')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'decks' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Layers size={24} strokeWidth={activeTab === 'decks' ? 2.5 : 2} /><span className="text-[10px] font-bold">Decks</span></button>
        <button onClick={() => setActiveTab('cards')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'cards' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Zap size={24} strokeWidth={activeTab === 'cards' ? 2.5 : 2} /><span className="text-[10px] font-bold">Cards</span></button>
        <button onClick={() => setActiveTab('compare')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'compare' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}>
          <Repeat size={24} strokeWidth={activeTab === 'compare' ? 2.5 : 2} />
          <span className="text-[10px] font-bold">Compare</span>
        </button>
        <button onClick={() => setActiveTab('press')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'press' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}>
          <Newspaper size={24} strokeWidth={activeTab === 'press' ? 2.5 : 2} />
          <span className="text-[10px] font-bold">News</span>
        </button>
      </nav>
    </div>
  );
}