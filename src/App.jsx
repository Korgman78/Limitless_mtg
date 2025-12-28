import React, { useState, useMemo, useEffect } from 'react';
import { Search, Layers, Zap, ChevronRight, ArrowUpDown, Gem, AlertTriangle, Star, TrendingUp, PieChart as PieChartIcon, BarChart2, Repeat, Crosshair, HelpCircle, Trophy, MousePointerClick, X, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  { code: 'WU', name: 'Azorius (WU)' }, { code: 'UB', name: 'Dimir (UB)' }, { code: 'BR', name: 'Rakdos (BR)' },
  { code: 'RG', name: 'Gruul (RG)' }, { code: 'GW', name: 'Selesnya (GW)' }, { code: 'WB', name: 'Orzhov (WB)' },
  { code: 'UR', name: 'Izzet (UR)' }, { code: 'BG', name: 'Golgari (BG)' }, { code: 'RW', name: 'Boros (RW)' },
  { code: 'GU', name: 'Simic (GU)' }
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
        <div key={i} className={`relative z-${20-i} rounded-full shadow-sm`}>
          <img src={`https://svgs.scryfall.io/card-symbols/${sym}.svg`} alt={sym} className={`${sizeClass} drop-shadow-md`} loading="lazy"/>
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
    
    // ECHELLE RECALIBRÉE (V1.6) : Plus stricte pour éviter l'effet "Tout est S"
    if (delta >= 5.5) return { letter: 'S', color: 'text-purple-400 border-purple-500 bg-purple-500/20' };       
    if (delta >= 3.0) return { letter: 'A', color: 'text-emerald-400 border-emerald-500 bg-emerald-500/20' };    
    if (delta >= 0.5) return { letter: 'B', color: 'text-lime-400 border-lime-500 bg-lime-500/20' };    
    if (delta >= -1.5) return { letter: 'C', color: 'text-yellow-400 border-yellow-500 bg-yellow-500/20' };      
    if (delta >= -3.5) return { letter: 'D', color: 'text-orange-400 border-orange-500 bg-orange-500/20' };      
    
    // E et F fusionnés ou seuil très bas pour F
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
      { label: '2+Splash', value: counts['2+Splash'], color: '#818cf8' },
      { label: '3 Color', value: counts['3 Color'], color: '#f59e0b' },
      { label: '>3 Color', value: counts['>3 Color'], color: '#d97706' },
  ];

  const total = totalGames || 1;
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 h-full">
      <div className="relative w-24 h-24 lg:w-32 lg:h-32 flex-shrink-0">
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
            return <path key={i} d={pathData} fill={slice.color} stroke="#0f172a" strokeWidth="0.05" />;
          })}
          <circle cx="0" cy="0" r="0.6" fill="#0f172a" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
           <span className="text-[9px] text-slate-400 font-bold uppercase">Total</span>
           <span className="text-xs font-black text-white">{(total/1000).toFixed(0)}k</span>
        </div>
      </div>
      <div className="flex-1 space-y-1 min-w-0">
          {data.map((d, i) => (
             <div key={i} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2 truncate">
                   <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                   <span className="text-slate-300 truncate">{d.label}</span>
                </div>
                <span className="font-bold text-slate-500 ml-2">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
             </div>
          ))}
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
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 h-full overflow-y-auto">
            {pairStats.sort((a,b) => b.value - a.value).map(p => (
                <div key={p.code} className="flex items-center gap-2 text-xs">
                    <div className="w-8 font-bold text-slate-400">{p.code}</div>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: totalBicoloreGames > 0 ? `${Math.min(((p.value / totalBicoloreGames) * 100) * 2, 100)}%` : '0%' }} />
                    </div>
                    <div className="w-8 text-right font-mono text-slate-300">
                        {totalBicoloreGames > 0 ? ((p.value / totalBicoloreGames) * 100).toFixed(1) : 0}%
                    </div>
                </div>
            ))}
            <div className="text-[10px] text-center text-slate-500 italic pt-2">
                *Share of all 2-Color & Splash
            </div>
        </div>
    );
};

const Sparkline = ({ data }) => {
  const safeData = data || [50, 50, 50, 50, 50];
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;
  const points = safeData.map((d, i) => {
    const x = (i / (safeData.length - 1)) * 40;
    const y = 20 - ((d - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');
  const isRising = safeData[safeData.length-1] >= safeData[0];

  return (
    <div className="flex flex-col items-end opacity-80">
        <svg width="40" height="20" className="overflow-visible">
           <polyline points={points} fill="none" stroke={isRising ? "#10b981" : "#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
          permutations.push(a+b+c, a+c+b, b+a+c, b+c+a, c+a+b, c+b+a);
      } else { permutations.push(baseColor); }

      const { data: deckData } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('format', activeFormat.trim()).in('filter_context', permutations).range(0, 5000); 
      const { data: globalData } = await supabase.from('card_stats').select('card_name, gih_wr, alsa').eq('set_code', activeSet).eq('filter_context', 'Global').eq('format', activeFormat.trim());

      if (deckData && deckData.length > 0) {
        const merged = deckData.map(dc => {
           const gc = globalData ? globalData.find(g => g.card_name === dc.card_name) : null;
           return { ...dc, name: dc.card_name, global_wr: gc ? gc.gih_wr : null, global_alsa: gc ? gc.alsa : null };
        });
        setArchCards(merged.sort((a,b) => (b.gih_wr || 0) - (a.gih_wr || 0)));
      } else { setArchCards([]); }
      setLoading(false);
    }
    fetchArchetypeData();
  }, [deck, activeFormat, activeSet]);

  if (!deck) return null;

  // -- LOGIQUE GEMS/TRAPS (MISE À JOUR V1.4) --
  
  // -- LOGIQUE GEMS/TRAPS (MISE À JOUR V1.5) --
  
  const isSealed = activeFormat.toLowerCase().includes('sealed');
  // Récupération des couleurs strictes de l'archétype (ex: "WU") pour filtrer les hors-sujets
  const deckBaseColors = extractColors(deck.colors);

  // 1. Calcul du seuil pour le Top 25% des Win Rates (pour filtre Traps)
  const allWrValues = archCards
    .map(c => c.gih_wr)
    .filter(wr => wr !== null)
    .sort((a, b) => b - a);
  
  const thresholdIndex = Math.floor(allWrValues.length * 0.25);
  const top25Threshold = allWrValues.length > 0 ? allWrValues[thresholdIndex] : 100.0;

  const gems = archCards
    .filter(c => c.gih_wr && c.global_wr)
    // Condition 1 : La carte doit être au moins "moyenne" dans le format
    .filter(c => c.gih_wr >= globalMeanWR)
    // Condition 2 : Draft (ALSA > 4) ou Sealed (Pas de filtre ALSA)
    .filter(c => isSealed || (c.alsa && c.alsa > 4.0)) 
    // Condition 3 : Sur-performance locale > 1%
    .filter(c => c.gih_wr > c.global_wr + 1.0)
    .map(c => ({ ...c, score: (c.gih_wr - c.global_wr) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);

  const traps = archCards
    .filter(c => c.gih_wr && c.global_wr)
    // NOUVELLE CONDITION : On exclut les cartes hors-couleur (Off-color)
    .filter(c => {
        const cColors = extractColors(c.colors);
        // Si incolore, on garde. Sinon, toutes les couleurs de la carte doivent être dans l'archétype.
        return cColors.split('').every(col => deckBaseColors.includes(col));
    })
    // Condition : On exclut les cartes qui restent dans le Top 25% WR
    .filter(c => c.gih_wr < top25Threshold)
    // Condition : Draft (ALSA <= 4) ou Sealed (Pas de filtre ALSA)
    .filter(c => isSealed || (c.alsa && c.alsa <= 4.0))
    // Condition : Sous-performance locale > 1%
    .filter(c => c.gih_wr < c.global_wr - 1.0) 
    .sort((a,b) => a.gih_wr - b.gih_wr) 
    .slice(0, 5);
  const commons = archCards.filter(c => normalizeRarity(c.rarity) === 'C' && c.gih_wr).sort((a,b) => b.gih_wr - a.gih_wr).slice(0, 5);
  const uncommons = archCards.filter(c => normalizeRarity(c.rarity) === 'U' && c.gih_wr).sort((a,b) => b.gih_wr - a.gih_wr).slice(0, 5);
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
    if(!cols) return 'from-slate-700 to-slate-900';
    if(cols.includes('W') && cols.includes('U')) return 'from-[#fffbd5]/20 to-[#0e68ab]/40'; 
    if(cols.includes('R') && cols.includes('W')) return 'from-[#f9aa8f]/20 to-[#fffbd5]/20'; 
    if(cols.includes('U') && cols.includes('B')) return 'from-[#0e68ab]/30 to-[#1c1917]/50';
    if(cols.includes('G')) return 'from-emerald-900/40 to-slate-900';
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
                         <span className="text-2xl font-bold text-white">{(deck.games/totalGames*100).toFixed(1)}</span>
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
        valid.sort((a,b) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
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
    const rarityLabel = normalizeRarity(card.rarity) === 'C' ? 'Commons' : normalizeRarity(card.rarity) === 'U' ? 'Uncommons' : 'Rares';
    const RankingRow = ({ label, rank, total, type }) => {
        if (!rank || !total) return null;
        const percent = Math.max(5, Math.min(100, ((total - rank) / total) * 100)); 
        const isTop = rank <= Math.ceil(total * 0.15);
        const isBad = rank >= Math.floor(total * 0.85);
        return (
            <div className="flex flex-col gap-1 mb-2 last:mb-0">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1.5">
                        {type === 'WR' ? <Trophy size={10} className="text-yellow-500"/> : <MousePointerClick size={10} className="text-blue-400"/>}
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
                            {hasAlsa ? <>Comparing <strong>Pick Order (ALSA)</strong> vs <strong>Win Rate</strong>.<br/>High WR + Late Pick = Underrated.</> : <>Based solely on <strong>Games In Hand Win Rate</strong>.</>}
                        </div>
                    </div>
                    {hasAlsa && (
                        <div className="relative w-full sm:w-48 h-32 bg-slate-950 rounded-lg border border-slate-800 shadow-inner overflow-hidden flex-shrink-0">
                            <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-700/50" style={{ left: `${xAvg}%` }}></div>
                            <div className="absolute left-0 right-0 border-t border-dashed border-slate-700/50" style={{ top: `${yAvg}%` }}></div>
                            <div className="absolute top-1 left-1 text-[8px] text-purple-500/50 font-black">BOMB</div>
                            <div className="absolute top-1 right-1 text-[8px] text-emerald-500/50 font-black">GEM</div>
                            <div className="absolute bottom-1 left-1 text-[8px] text-red-500/50 font-black">OVERRATED</div>
                            <div className="absolute bottom-1 right-1 text-[8px] text-slate-600/50 font-black">CHAFF</div>
                            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', delay: 0.2 }} className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10 border-2 border-indigo-600" style={{ left: `calc(${xPos}% - 6px)`, top: `calc(${yPos}% - 6px)` }} />
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
    
    // 1. NOUVEAU : État pour le mode de tri ('synergy' ou 'winrate')
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
                        
                        // Filtre Bicolores/Tricolores stricts
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
                    .filter((v,i,a)=>a.findIndex(t=>(t.deckName === v.deckName))===i);
                
                // On stocke les données brutes
                setCrossPerf(perfs);
            }
        }
        fetchCrossData();
    }, [card, activeFormat, activeSet, decks]);
    
    // 2. NOUVEAU : Tri dynamique (Memoized)
    const sortedPerf = useMemo(() => {
        return [...crossPerf].sort((a, b) => {
            if (sortMode === 'winrate') {
                // Tri par Win Rate pur (descendant)
                return b.cardWr - a.cardWr;
            }
            // Tri par Synergie/Impact (Delta) par défaut
            return (b.cardWr - b.deckWr) - (a.cardWr - a.deckWr);
        });
    }, [crossPerf, sortMode]);

    const minGamesDisplay = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

    return (
        <SwipeableOverlay onClose={onClose}>
            <div className="flex flex-col h-full md:flex-row">
                <div className="bg-slate-900/50 pb-8 px-6 flex flex-col items-center border-b border-slate-800 md:border-b-0 md:border-r md:w-1/3 md:justify-center md:pt-0 pt-8 flex-shrink-0">
                    <motion.img layoutId={`img-${card.id}`} src={getCardImage(card.name)} className="w-56 md:w-72 rounded-[18px] shadow-2xl shadow-black my-4 ring-1 ring-white/10" />
                    <h1 className="text-2xl font-black text-center text-white leading-tight mb-3">{card.name}</h1>
                    <div className="flex items-center gap-3 mb-6">
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${RARITY_STYLES[rCode]}`}>{rCode}</span>
                        <ManaIcons colors={card.colors} size="lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col items-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">GIH Win Rate</span>
                            <div className={`text-3xl font-black ${getDeltaStyle(card.gih_wr, 55)}`}>{card.gih_wr ? card.gih_wr.toFixed(1) : '--'}%</div>
                        </div>
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col items-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">ALSA</span>
                            <div className="text-3xl font-black text-white">{card.alsa ? card.alsa.toFixed(2) : '--'}</div>
                        </div>
                    </div>
                </div>
                 
                <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-950">
                    <CardEvaluationBlock card={card} allCards={allCards} />

                    <div>
                        {/* 3. NOUVEAU : Header avec bouton de tri */}
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
// 5. MAIN APP
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
  
  // MODIF: Changement Rarity (string vs array) et suppression old alsaFilter
  const [rarityFilter, setRarityFilter] = useState('All'); 
  const [colorFilters, setColorFilters] = useState([]); 

  const [archetypeFilter, setArchetypeFilter] = useState('Global');
  const [sortConfig, setSortConfig] = useState({ key: 'gih_wr', dir: 'desc' });
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

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
          return { id: d.id, name: d.archetype_name, colors: d.colors, wr: d.win_rate, games: d.games_count, type: type, history: [d.win_rate, d.win_rate, d.win_rate] };
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
    else return decks.filter(d => d.type === deckTypeFilter).sort((a,b) => b.wr - a.wr);
    return targetList.map(template => {
        const found = decks.find(d => {
            const isTypeMatch = d.type === deckTypeFilter;
            const deckColors = extractColors(d.colors);
            return isTypeMatch && areColorsEqual(deckColors, template.code);
        });
        return found || { id: `placeholder-${template.code}`, name: template.name, colors: deckTypeFilter.includes('splash') ? `${template.code} + Splash` : template.code, wr: 0, games: 0, type: deckTypeFilter, history: [0,0,0] };
    }).sort((a,b) => b.wr - a.wr);
  }, [decks, deckTypeFilter]);

  // MODIF: Logique de filtrage avec Rarity Dropdown & ALSA Sort
  const filteredCards = useMemo(() => {
    let res = [...cards];
    
    // Search
    if (searchTerm) res = res.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Rarity Dropdown Logic
    if (rarityFilter !== 'All') {
        res = res.filter(c => normalizeRarity(c.rarity) === rarityFilter);
    }

    // Color Filter (W, U, B, R, G, M, C)
    if (colorFilters.length > 0) {
        res = res.filter(c => {
            const cColors = extractColors(c.colors);
            if (colorFilters.includes('M') && cColors.length > 1) return true;
            if (colorFilters.includes('C') && cColors.length === 0) return true;
            const monoFilters = colorFilters.filter(f => ['W','U','B','R','G'].includes(f));
            if (monoFilters.length > 0) {
                for (let f of monoFilters) {
                    if (cColors.includes(f)) return true;
                }
            }
            return false;
        });
    }

    // Sort Logic (Now handles 'alsa')
    res.sort((a, b) => {
        if (sortConfig.key === 'name') return sortConfig.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        
        // Choose value based on config (GIH or ALSA)
        const valA = sortConfig.key === 'alsa' ? a.alsa : a.gih_wr;
        const valB = sortConfig.key === 'alsa' ? b.alsa : b.gih_wr;
        
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;
        
        return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
    });
    return res;
  }, [cards, searchTerm, rarityFilter, colorFilters, sortConfig]);

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
                 <ChevronRight size={12} className="absolute right-2 top-2.5 text-white rotate-90 pointer-events-none"/>
               </div>
               <div className="relative">
                 <select value={activeFormat} onChange={(e) => setActiveFormat(e.target.value)} className="appearance-none bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border border-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold focus:outline-none cursor-pointer">
                   {FORMAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                 </select>
                 <ChevronRight size={12} className="absolute right-2 top-2.5 text-slate-500 rotate-90 pointer-events-none"/>
               </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto pb-32 md:pb-8 md:px-6 md:pt-6 scroll-smooth">
            {loading && activeTab === 'cards' && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>}

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
                        <ChevronRight size={14} className="absolute right-3 top-3 text-slate-500 rotate-90 pointer-events-none"/>
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
                        <div className="flex flex-col items-end min-w-[5rem]">
                           <div className="flex items-center gap-2">
                             <Sparkline data={deck.history} />
                             <span className={`text-2xl font-black leading-none tracking-tight ${getDeltaStyle(deck.wr, globalMeanWR)}`}>{deck.wr > 0 ? deck.wr + '%' : '-'}</span>
                           </div>
                           <span className="text-[10px] text-slate-500 font-medium">{(deck.games / totalGames * 100).toFixed(1)}% Meta</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
              </div>
            )}

{activeTab === 'cards' && (
              <div className="flex flex-col min-h-full">
                  <div className="bg-slate-950 md:bg-slate-950/90 md:backdrop-blur sticky top-0 md:top-[-1px] z-20 border-b border-slate-800 p-3 md:p-4 space-y-3 shadow-lg">
                     
                     {/* Ligne 1: Search & Context */}
                     <div className="flex gap-2">
                         <div className="relative flex-1 md:max-w-xs">
                           <select value={archetypeFilter} onChange={(e) => setArchetypeFilter(e.target.value)} className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-3 pr-8 rounded-lg text-xs font-bold cursor-pointer hover:border-slate-500 focus:outline-none focus:border-indigo-500">
                             <option value="Global">Global Stats</option>
                             <option disabled>--- Two Colors ---</option>
                             {PAIRS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                           </select>
                           <ChevronRight size={12} className="absolute right-3 top-3 text-slate-500 rotate-90 pointer-events-none"/>
                        </div>
                        <div className="relative flex-1">
                            <input type="text" placeholder="Search card..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-8 pr-3 rounded-lg text-xs font-bold focus:border-indigo-500 focus:outline-none" />
                            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500 pointer-events-none"/>
                        </div>
                     </div>

                     {/* Ligne 2: Filtres Avancés - CORRECTION MOBILE (Wrap + Spacing) */}
                     <div className="flex flex-wrap items-center gap-2 pb-1">
                        
                        {/* 1. Color Filters */}
                        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-full border border-slate-800 mr-auto md:mr-0">
                             {['W','U','B','R','G'].map(c => (
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

                        {/* Divider (Hidden on mobile to save space) */}
                        <div className="hidden md:block w-[1px] h-6 bg-slate-800"></div>

                        {/* 2. Rarity Dropdown */}
                        <div className="relative min-w-[100px] flex-1 md:flex-none">
                            <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-1.5 pl-3 pr-8 rounded-lg text-[10px] font-bold cursor-pointer hover:border-slate-500 focus:outline-none uppercase">
                                <option value="All">All Rarities</option>
                                <option value="M">Mythic (M)</option>
                                <option value="R">Rare (R)</option>
                                <option value="U">Uncommon (U)</option>
                                <option value="C">Common (C)</option>
                            </select>
                            <ChevronRight size={10} className="absolute right-2 top-2.5 text-slate-500 rotate-90 pointer-events-none"/>
                        </div>

                        {/* 3. Sort Buttons (GIH & ALSA) - Flex-1 on mobile for bigger targets */}
                        <div className="flex gap-2 flex-1 md:flex-none">
                            <button onClick={() => handleSort('gih_wr')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'gih_wr' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                               GIH <ArrowUpDown size={10}/>
                            </button>
                            <button onClick={() => handleSort('alsa')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'alsa' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                               ALSA <ArrowUpDown size={10}/>
                            </button>
                        </div>

                     </div>
                  </div>

                  {/* CARDS GRID (xl:grid-cols-4 for max 4 cols) */}
                  <div className="p-2 md:p-0 pt-2 space-y-1 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4 md:mt-4">
                     {!loading && filteredCards.map((card, idx) => (
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
                  </div>
              </div>
            )}
          </main>
      </div>

      <nav className="md:hidden bg-slate-900 border-t border-slate-800 px-8 py-3 pb-6 flex justify-around items-center absolute bottom-0 w-full z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('decks')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'decks' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Layers size={24} strokeWidth={activeTab === 'decks' ? 2.5 : 2} /><span className="text-[10px] font-bold">Decks</span></button>
        <button onClick={() => setActiveTab('cards')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'cards' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Zap size={24} strokeWidth={activeTab === 'cards' ? 2.5 : 2} /><span className="text-[10px] font-bold">Cards</span></button>
      </nav>
    </div>
  );
}