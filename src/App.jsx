import React, { useState, useMemo, useEffect } from 'react';
import { Search, Layers, Zap, ChevronRight, ArrowUpDown, Gem, AlertTriangle, Star, TrendingUp, PieChart as PieChartIcon, BarChart2, Repeat, Crosshair, HelpCircle, Trophy, MousePointerClick } from 'lucide-react';
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
    
    // COULEURS AJUSTÉES : S=Violet, A=Vert, B=Vert Clair/Lime, C=Jaune...
    if (delta >= 3.0) return { letter: 'S', color: 'text-purple-400 border-purple-500 bg-purple-500/20' };       
    if (delta >= 1.5) return { letter: 'A', color: 'text-emerald-400 border-emerald-500 bg-emerald-500/20' };    
    if (delta >= 0.5) return { letter: 'B', color: 'text-lime-400 border-lime-500 bg-lime-500/20' };    
    if (delta >= -0.5) return { letter: 'C', color: 'text-yellow-400 border-yellow-500 bg-yellow-500/20' };      
    if (delta >= -2.0) return { letter: 'D', color: 'text-orange-400 border-orange-500 bg-orange-500/20' };      
    if (delta >= -4.0) return { letter: 'E', color: 'text-red-400 border-red-500 bg-red-500/20' };               
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
    <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
      <div className="relative w-24 h-24 flex-shrink-0">
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
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
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
                *Share of all 2-Color & 2-Color+Splash decks combined
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:items-center"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full h-[92vh] sm:h-[85vh] sm:max-w-md bg-slate-950 rounded-t-[30px] sm:rounded-[30px] overflow-hidden flex flex-col shadow-2xl border border-white/10 relative"
        onClick={(e) => e.stopPropagation()}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.2 }}
        onDragEnd={(_, info) => { if (info.offset.y > 150) onClose(); }}
      >
        <div className="w-full flex justify-center pt-3 pb-1 absolute top-0 z-20 pointer-events-none">
           <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// 4. OVERLAYS DE DÉTAIL (Multi-Set : ajout activeSet prop)
// ============================================================================

const ArchetypeDashboard = ({ deck, activeFormat, activeSet, globalMeanWR, totalGames, onClose, onCardClick }) => {
  const [archCards, setArchCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchetypeData() {
      setLoading(true);
      
      const baseColor = extractColors(deck.colors); 

      if (!baseColor || baseColor.length > 3) {
          setArchCards([]);
          setLoading(false);
          return;
      }

      console.log(`🔎 [Dashboard] Recherche pour : "${baseColor}" (Format: ${activeFormat}, Set: ${activeSet})`);

      const chars = baseColor.split('');
      const permutations = [];

      if (chars.length === 2) {
          permutations.push(chars[0] + chars[1]); 
          permutations.push(chars[1] + chars[0]); 
      } else if (chars.length === 3) {
          const [a, b, c] = chars;
          permutations.push(a+b+c, a+c+b, b+a+c, b+c+a, c+a+b, c+b+a);
      } else {
          permutations.push(baseColor);
      }

      const { data: deckData, error: deckError } = await supabase.from('card_stats')
        .select('*')
        .eq('set_code', activeSet) // 👈 Dynamique
        .eq('format', activeFormat.trim())
        .in('filter_context', permutations)
        .range(0, 5000); 

      if (deckError) {
          console.error("❌ Erreur Fetch Deck:", deckError);
          setLoading(false);
          return;
      }

      const { data: globalData } = await supabase.from('card_stats')
        .select('card_name, gih_wr, alsa')
        .eq('set_code', activeSet) // 👈 Dynamique
        .eq('filter_context', 'Global')
        .eq('format', activeFormat.trim());

      if (deckData && deckData.length > 0) {
        const merged = deckData.map(dc => {
           const gc = globalData ? globalData.find(g => g.card_name === dc.card_name) : null;
           return {
             ...dc,
             name: dc.card_name, 
             global_wr: gc ? gc.gih_wr : null,
             global_alsa: gc ? gc.alsa : null
           };
        });
        
        setArchCards(merged.sort((a,b) => (b.gih_wr || 0) - (a.gih_wr || 0)));
      } else {
        setArchCards([]); 
      }
      setLoading(false);
    }
    fetchArchetypeData();
  }, [deck, activeFormat, activeSet]);

  if (!deck) return null;

  // -- LOGIQUE GEMS/TRAPS --
  
  const isSealed = activeFormat.toLowerCase().includes('sealed');

  const gems = archCards
    .filter(c => c.gih_wr && c.global_wr)
    .filter(c => isSealed || (c.alsa && c.alsa > 4.0)) 
    .filter(c => c.gih_wr > c.global_wr + 1.0)
    .map(c => ({ ...c, score: (c.gih_wr - c.global_wr) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);

  const traps = archCards
    .filter(c => c.gih_wr && c.global_wr)
    .filter(c => isSealed || (c.alsa && c.alsa <= 4.0))
    .filter(c => c.gih_wr < c.global_wr - 1.0) 
    .sort((a,b) => a.gih_wr - b.gih_wr) 
    .slice(0, 5);

  const commons = archCards.filter(c => normalizeRarity(c.rarity) === 'C' && c.gih_wr).sort((a,b) => b.gih_wr - a.gih_wr).slice(0, 5);
  const uncommons = archCards.filter(c => normalizeRarity(c.rarity) === 'U' && c.gih_wr).sort((a,b) => b.gih_wr - a.gih_wr).slice(0, 5);
  
  const bestCard = commons[0] || uncommons[0];

  const Section = ({ title, icon: Icon, cards, colorClass }) => (
    <section className="mb-6">
      <div className={`flex items-center gap-2 mb-3 ${colorClass} px-1`}>
        <Icon size={16} strokeWidth={2.5} />
        <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-xs text-slate-500 italic px-2">Loading...</div> : 
         cards.length === 0 ? <div className="text-xs text-slate-500 italic px-2">No data matching criteria.</div> :
         cards.map(c => (
          <motion.button 
            layoutId={`card-${c.id}-${title.replace(/\s+/g, '')}`} 
            key={c.id} onClick={() => onCardClick(c)} 
            className="w-full flex items-center gap-3 p-2 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-600 transition-all group"
          >
            <motion.img layoutId={`img-${c.id}-${title.replace(/\s+/g, '')}`} src={getCardImage(c.card_name)} className="w-9 h-12 rounded object-cover shadow-sm bg-black" loading="lazy" />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-200 truncate">{c.card_name}</span>
                <span className={`text-xs font-black ${getDeltaStyle(c.gih_wr, globalMeanWR)}`}>{c.gih_wr ? c.gih_wr.toFixed(1) : '--'}%</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <div className="flex items-center gap-2">
                   <span className={`text-[9px] px-1.5 rounded border ${RARITY_STYLES[normalizeRarity(c.rarity)]} font-black`}>{normalizeRarity(c.rarity)}</span>
                   <ManaIcons colors={c.colors} size="sm" />
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-[10px] text-slate-500">ALSA {c.alsa ? c.alsa.toFixed(2) : '--'}</span>
                </div>
              </div>
            </div>
          </motion.button>
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
      <div className={`relative bg-gradient-to-br ${getGradient(deck.colors)} shadow-xl border-b border-white/10 pt-8 pb-6 px-4 overflow-hidden`}>
        {bestCard && (
            <img 
               src={getCardImage(bestCard.card_name)} 
               className="absolute right-[-20px] top-[-10px] w-52 opacity-20 rotate-12 pointer-events-none"
               style={{ maskImage: 'linear-gradient(to left, black 20%, transparent 100%)' }}
            />
        )}

        <div className="relative z-10 flex flex-col items-center mt-2">
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-2">Archetype Analysis</span>
           <div className="flex items-center gap-3 mb-6">
              <div className="transform scale-125 filter drop-shadow-lg"><ManaIcons colors={deck.colors.split(' +')[0]} size="lg" /></div>
              <h2 className="text-3xl font-black text-white drop-shadow-md tracking-tight">{deck.name}</h2>
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
        <Section title="Top 5 Commons" icon={Star} cards={commons} colorClass="text-slate-300" />
        <Section title="Top 5 Uncommons" icon={Star} cards={uncommons} colorClass="text-blue-300" />
        <Section title="Top 5 Hidden Gems" icon={Gem} cards={gems} colorClass="text-emerald-400" />
        <Section title="Top 5 Traps" icon={AlertTriangle} cards={traps} colorClass="text-red-400" />
      </div>
    </SwipeableOverlay>
  );
};

// ============================================================================
// COMPOSANT CARD EVALUATION BLOCK (AVEC RANGS + MATRICE CONDITIONNELLE)
// ============================================================================

const CardEvaluationBlock = ({ card, allCards }) => {
    if (!card.gih_wr) return null;

    // --- CALCUL DES RANGS ---
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
    
    // ALSA Rankings uniquement si ALSA existe
    const hasAlsa = !!card.alsa;
    const rankAlsaRarity = hasAlsa ? getRank(peersRarity, 'alsa', card.alsa, true) : null;
    const rankAlsaColor = hasAlsa ? getRank(peersColor, 'alsa', card.alsa, true) : null;

    const rarityLabel = normalizeRarity(card.rarity) === 'C' ? 'Commons' : normalizeRarity(card.rarity) === 'U' ? 'Uncommons' : 'Rares';

    // Helper component
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
                    <div 
                        className={`h-full rounded-full ${isTop ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : isBad ? 'bg-slate-700' : 'bg-indigo-500'}`} 
                        style={{ width: `${percent}%` }} 
                    />
                </div>
            </div>
        );
    };

    // --- PARTIE MATRICE (Seulement si ALSA) ---
    const AVG_WR = 55.0;
    const AVG_ALSA = 4.5;
    let statusText = "Average Card";
    let statusColor = "text-slate-400";
    
    // Logique d'évaluation textuelle
    if (hasAlsa) {
        if (card.gih_wr > AVG_WR + 2.0 && card.alsa > AVG_ALSA + 0.5) { statusText = "💎 Underrated Gem"; statusColor = "text-emerald-400"; } 
        else if (card.gih_wr > AVG_WR + 2.0 && card.alsa <= AVG_ALSA + 0.5) { statusText = "💣 Top Tier / Bomb"; statusColor = "text-purple-400"; } 
        else if (card.gih_wr < AVG_WR - 2.0 && card.alsa <= AVG_ALSA - 0.5) { statusText = "⚠️ Overrated"; statusColor = "text-red-400"; } 
        else if (card.gih_wr < AVG_WR - 2.0 && card.alsa > AVG_ALSA - 0.5) { statusText = "🗑️ Chaff / Filler"; statusColor = "text-slate-500"; }
    } else {
        // En Sealed, on juge juste sur le WR
        if (card.gih_wr > AVG_WR + 3.0) { statusText = "💣 Top Tier"; statusColor = "text-purple-400"; }
        else if (card.gih_wr > AVG_WR + 1.0) { statusText = "✅ Very Good"; statusColor = "text-emerald-400"; }
        else if (card.gih_wr < AVG_WR - 3.0) { statusText = "⛔ Avoid / Bad"; statusColor = "text-red-400"; }
    }

    const minALSA = 1.0; const maxALSA = 8.0;
    const minWR = 45.0; const maxWR = 68.0;
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
                            {hasAlsa 
                                ? <>Comparing <strong>Pick Order (ALSA)</strong> vs <strong>Win Rate</strong>.<br/>High WR + Late Pick = Underrated.</>
                                : <>Based solely on <strong>Games In Hand Win Rate</strong> (No pick order in Sealed).</>
                            }
                        </div>
                    </div>

                    {/* GRAPHIC (Seulement si ALSA) */}
                    {hasAlsa && (
                        <div className="relative w-full sm:w-48 h-32 bg-slate-950 rounded-lg border border-slate-800 shadow-inner overflow-hidden flex-shrink-0">
                            <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-700/50" style={{ left: `${xAvg}%` }}></div>
                            <div className="absolute left-0 right-0 border-t border-dashed border-slate-700/50" style={{ top: `${yAvg}%` }}></div>
                            <div className="absolute top-1 left-1 text-[8px] text-purple-500/50 font-black">BOMB</div>
                            <div className="absolute top-1 right-1 text-[8px] text-emerald-500/50 font-black">GEM</div>
                            <div className="absolute bottom-1 left-1 text-[8px] text-red-500/50 font-black">OVERRATED</div>
                            <div className="absolute bottom-1 right-1 text-[8px] text-slate-600/50 font-black">CHAFF</div>
                            <motion.div 
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', delay: 0.2 }}
                                className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10 border-2 border-indigo-600"
                                style={{ left: `calc(${xPos}% - 6px)`, top: `calc(${yPos}% - 6px)` }}
                            />
                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-[8px] text-slate-600">ALSA (Availability) &rarr;</div>
                            <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -rotate-90 text-[8px] text-slate-600 origin-left ml-2">Win Rate &rarr;</div>
                        </div>
                    )}
                </div>

                {/* RANKINGS GRID */}
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

// ============================================================================
// COMPOSANT CARD DETAIL OVERLAY (Multi-Set : ajout activeSet)
// ============================================================================

const CardDetailOverlay = ({ card, activeFormat, activeSet, decks, cards: allCards, onClose }) => {
    const rCode = normalizeRarity(card.rarity);
    const [crossPerf, setCrossPerf] = useState([]);

    useEffect(() => {
        async function fetchCrossData() {
            const { data: globalStat } = await supabase.from('card_stats')
                .select('gih_wr')
                .eq('set_code', activeSet) // 👈 Dynamique
                .eq('card_name', card.name).eq('filter_context', 'Global').eq('format', activeFormat).single();
            const avgCardWr = globalStat?.gih_wr || 55.0;

            const { data } = await supabase.from('card_stats')
                .select('*').eq('set_code', activeSet) // 👈 Dynamique
                .eq('card_name', card.name).eq('format', activeFormat);

            if (data && decks.length > 0) {
                // ✅ FIX : Seuil dynamique (10 games pour Sealed, 500 pour Draft)
                const minGames = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

                const perfs = data
                    .filter(d => d.filter_context !== 'Global')
                    .map(d => {
                        // 🛑 FILTRE DE FIABILITÉ STATISTIQUE
                        if (!d.gih_wr || d.img_count < minGames) return null;
                        
                        const deck = decks.find(dk => {
                            const dkColors = extractColors(dk.colors);
                            return areColorsEqual(dkColors, d.filter_context);
                        });
                        
                        // ✅ FIX : Fallback si le deck n'est pas trouvé dans la liste des decks
                        const deckName = deck ? deck.name : `${d.filter_context} Deck`;
                        const deckWr = deck ? deck.wr : 55.0; // Valeur par défaut si inconnue

                        return {
                            deckName: deckName,
                            deckColors: d.filter_context, 
                            deckWr: deckWr, 
                            cardWr: d.gih_wr, 
                            avgCardWr: avgCardWr 
                        };
                    })
                    .filter(Boolean)
                    .filter((v,i,a)=>a.findIndex(t=>(t.deckName === v.deckName))===i)
                    .sort((a,b) => (b.cardWr - b.deckWr) - (a.cardWr - a.deckWr)); 
                setCrossPerf(perfs);
            }
        }
        fetchCrossData();
    }, [card, activeFormat, activeSet, decks]);

    // ✅ FIX : Récupération du seuil pour l'affichage textuel
    const minGamesDisplay = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

    return (
        <SwipeableOverlay onClose={onClose}>
            <div className="flex-1 overflow-y-auto pb-10 pt-8">
                <div className="bg-slate-900/50 pb-8 px-6 flex flex-col items-center border-b border-slate-800">
                    <motion.img layoutId={`img-${card.id}`} src={getCardImage(card.name)} className="w-56 rounded-[18px] shadow-2xl shadow-black my-4 ring-1 ring-white/10" />
                    <h1 className="text-2xl font-black text-center text-white leading-tight mb-3">{card.name}</h1>
                    <div className="flex items-center gap-3 mb-6">
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-black ${RARITY_STYLES[rCode]}`}>{rCode}</span>
                        <ManaIcons colors={card.colors} size="lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full">
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
                 
                 <div className="p-5 space-y-6">
                    <div>
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                           <Layers size={14} /> Performance by Archetype
                        </h3>
                        {crossPerf.length === 0 ? (
                            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center">
                                <p className="text-xs text-slate-500">Not enough play data across archetypes (min. {minGamesDisplay} games).</p>
                            </div>
                        ) : (
                            crossPerf.map((perf, idx) => {
                               const grade = calculateGrade(perf.cardWr, perf.deckWr);
                               return (
                                <div key={idx} className="bg-slate-900 p-3 rounded-xl border border-slate-800 mb-3 flex items-center gap-3">
                                  <div className="flex flex-col items-center gap-1 min-w-[3rem]">
                                     <span className={`text-xl font-black ${grade.color.split(' ')[0]}`}>{grade.letter}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                      <div className="flex items-center gap-2">
                                          <ManaIcons colors={perf.deckColors} size="sm" />
                                          <span className="text-sm font-bold text-slate-200">{perf.deckName}</span>
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
                            })
                        )}
                    </div>

                    {/* ✅ NOUVEAU BLOC : Matrix & Rangs Adaptatifs */}
                    <CardEvaluationBlock card={card} allCards={allCards} />

                 </div>
            </div>
        </SwipeableOverlay>
    )
}

// ============================================================================
// 5. MAIN APP (Multi-Set : State & Fetching)
// ============================================================================

export default function MTGLimitedApp() {
  const [activeTab, setActiveTab] = useState('decks');
  const [activeFormat, setActiveFormat] = useState('PremierDraft');
  
  // -- V2 MULTI-SET STATE --
  const [activeSet, setActiveSet] = useState('TLA'); // Default fallback
  const [availableSets, setAvailableSets] = useState([]);

  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalGames, setTotalGames] = useState(1);
  const [globalMeanWR, setGlobalMeanWR] = useState(55.0); 

  const [deckTypeFilter, setDeckTypeFilter] = useState('Two colors');
  const [chartMode, setChartMode] = useState('meta');
  const [searchTerm, setSearchTerm] = useState('');
  const [rarityFilters, setRarityFilters] = useState([]); 
  const [archetypeFilter, setArchetypeFilter] = useState('Global');
  const [sortConfig, setSortConfig] = useState({ key: 'gih_wr', dir: 'desc' });

  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  // 1. Fetch available sets on mount
  useEffect(() => {
    async function fetchSets() {
        const { data } = await supabase
            .from('sets')
            .select('code')
            .eq('active', true)
            .order('start_date', { ascending: false });
        
        if (data && data.length > 0) {
            setAvailableSets(data);
            // Optionally auto-select the latest: setActiveSet(data[0].code);
        }
    }
    fetchSets();
  }, []);

  useEffect(() => {
    async function loadDecks() {
      // ⚠️ IMPORTANT: Si pas de set actif, on attend
      if (!activeSet) return; 

      const { data } = await supabase.from('archetype_stats')
        .select('*')
        .eq('set_code', activeSet) // 👈 Dynamique
        .eq('format', activeFormat)
        .order('win_rate', { ascending: false });

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
            history: [d.win_rate, d.win_rate, d.win_rate]
          };
        });
        setDecks(formattedDecks);
      } else {
        setDecks([]); setTotalGames(1);
      }
    }
    loadDecks();
  }, [activeFormat, activeSet]); // 👈 Dépendance activeSet

  useEffect(() => {
    async function loadCards() {
      if (!activeSet) return;
      setLoading(true);
      
      const { data: globalDeck } = await supabase.from('archetype_stats')
         .select('win_rate')
         .eq('set_code', activeSet) // 👈 Dynamique
         .eq('format', activeFormat)
         .eq('archetype_name', 'All Decks')
         .single();
      if (globalDeck && globalDeck.win_rate) setGlobalMeanWR(globalDeck.win_rate);

      const { data } = await supabase.from('card_stats')
        .select('*')
        .eq('set_code', activeSet) // 👈 Dynamique
        .eq('filter_context', archetypeFilter)
        .eq('format', activeFormat);

      if (data) {
        const formattedCards = data.map(c => ({
          id: c.id,
          name: c.card_name,
          rarity: c.rarity,
          colors: c.colors,
          gih_wr: c.gih_wr,
          alsa: c.alsa,
          img_count: c.img_count
        }));
        setCards(formattedCards);
      } else {
        setCards([]);
      }
      setLoading(false);
    }
    loadCards();
  }, [archetypeFilter, activeFormat, activeSet]); // 👈 Dépendance activeSet

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

        return found || {
            id: `placeholder-${template.code}`,
            name: template.name,
            colors: deckTypeFilter.includes('splash') ? `${template.code} + Splash` : template.code,
            wr: 0,
            games: 0,
            type: deckTypeFilter,
            history: [0,0,0]
        };
    }).sort((a,b) => b.wr - a.wr);

  }, [decks, deckTypeFilter]);

  const filteredCards = useMemo(() => {
    let res = [...cards];
    if (searchTerm) res = res.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (rarityFilters.length > 0) res = res.filter(c => rarityFilters.includes(normalizeRarity(c.rarity)));
    
    res.sort((a, b) => {
        if (sortConfig.key === 'name') return sortConfig.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        
        const valA = a.gih_wr; const valB = b.gih_wr;
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;

        return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
    });
    return res;
  }, [cards, searchTerm, rarityFilters, sortConfig]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans max-w-md mx-auto border-x border-slate-800 relative shadow-2xl overflow-hidden">
      
      <AnimatePresence>
        {selectedDeck && <ArchetypeDashboard key="deck-overlay" deck={selectedDeck} activeFormat={activeFormat} activeSet={activeSet} globalMeanWR={globalMeanWR} totalGames={totalGames} onClose={() => setSelectedDeck(null)} onCardClick={(card) => setSelectedCard(card)} />}
        
        {/* ✅ FIX : On passe activeSet aux détails */}
        {selectedCard && <CardDetailOverlay key="card-overlay" card={selectedCard} activeFormat={activeFormat} activeSet={activeSet} decks={decks} cards={cards} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>

      <header className="px-4 py-3 bg-slate-900 sticky top-0 z-30 border-b border-slate-800 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent italic">LIMITLESS</h1>
        <div className="flex gap-2">
           {/* SELECTEUR DE SET (Dynamique) */}
           <div className="relative">
             <select 
                value={activeSet} 
                onChange={(e) => setActiveSet(e.target.value)} 
                className="appearance-none bg-indigo-600 text-white border border-indigo-500 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold focus:outline-none uppercase"
             >
               {availableSets.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
               {/* Fallback si liste vide */}
               {availableSets.length === 0 && <option value="TLA">TLA</option>}
             </select>
             <ChevronRight size={12} className="absolute right-2 top-2.5 text-white rotate-90 pointer-events-none"/>
           </div>

           <div className="relative">
             <select value={activeFormat} onChange={(e) => setActiveFormat(e.target.value)} className="appearance-none bg-slate-800 text-slate-300 border border-slate-700 py-1.5 pl-3 pr-8 rounded-lg text-xs font-bold focus:outline-none">
               {FORMAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
             </select>
             <ChevronRight size={12} className="absolute right-2 top-2.5 text-slate-500 rotate-90 pointer-events-none"/>
           </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-32 scroll-smooth">
        {loading && activeTab === 'cards' && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>}

        {activeTab === 'decks' && (
          <div className="p-4 space-y-4">
              <div className="flex justify-end">
                <select value={deckTypeFilter} onChange={(e) => setDeckTypeFilter(e.target.value)}
                  className="appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-4 pr-10 rounded-xl text-sm font-bold focus:border-indigo-500 focus:outline-none shadow-sm w-full">
                  <option>Two colors</option>
                  <option>Two colors + splash</option>
                  <option>Three colors</option>
                  <option>More than 3 colors</option>
                </select>
              </div>

              <div className="space-y-2">
                {filteredDecks.map((deck, idx) => (
                  <motion.button 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                    key={deck.id || idx} onClick={() => setSelectedDeck(deck)}
                    className="w-full flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 hover:border-slate-600 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                       <ManaIcons colors={deck.colors.split(' +')[0]} size="lg" isSplash={deck.colors.includes('Splash')} />
                       <div className="text-left"><h3 className="font-bold text-sm text-slate-200">{deck.name}</h3></div>
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

              <div className="mt-6">
                 <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><PieChartIcon size={14} /> Metagame Breakdown</h3>
                    <button onClick={() => setChartMode(prev => prev === 'meta' ? 'pairs' : 'meta')} className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded hover:bg-indigo-400/20">
                        <Repeat size={10} /> Switch View
                    </button>
                 </div>
                 {chartMode === 'meta' ? (
                    <MetagamePieChart decks={decks} totalGames={totalGames} />
                 ) : (
                    <PairBreakdownChart decks={decks} />
                 )}
              </div>
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="flex flex-col min-h-full">
              <div className="bg-slate-950 sticky top-0 z-20 border-b border-slate-800 p-4 space-y-3 shadow-lg">
                 <div className="flex gap-2">
                    <div className="relative flex-1">
                       <select value={archetypeFilter} onChange={(e) => setArchetypeFilter(e.target.value)} className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-300 py-2.5 pl-3 pr-8 rounded-lg text-xs font-bold">
                         <option value="Global">Global Stats</option>
                         <option disabled>--- Two Colors ---</option>
                         {PAIRS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                         <option disabled>--- Three Colors ---</option>
                         {TRIOS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                       </select>
                       <ChevronRight size={12} className="absolute right-3 top-3 text-slate-500 rotate-90 pointer-events-none"/>
                    </div>
                    <button onClick={() => setSortConfig(c => ({ key: 'gih_wr', dir: c.dir === 'desc' ? 'asc' : 'desc' }))} className={`flex items-center justify-center gap-1 px-4 rounded-lg text-xs font-bold border transition-colors ${sortConfig.key === 'gih_wr' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                       GIH WR <ArrowUpDown size={12}/>
                    </button>
                 </div>
                 <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            placeholder="Search card..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-300 py-1.5 pl-8 pr-3 rounded-lg text-xs font-bold focus:border-indigo-500 focus:outline-none"
                        />
                        <Search size={12} className="absolute left-2.5 top-2 text-slate-500 pointer-events-none"/>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    {['M', 'R', 'U', 'C'].map(r => (
                       <button key={r} onClick={() => setRarityFilters(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} className={`flex-1 py-1.5 rounded-md text-[10px] font-black border transition-all ${rarityFilters.includes(r) ? 'bg-slate-200 text-slate-900 border-white' : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-600'}`}>{r}</button>
                    ))}
                 </div>
              </div>

              <div className="p-2 space-y-1 pt-2">
                 {!loading && filteredCards.map((card, idx) => (
                   <motion.button layoutId={`card-${card.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={card.id} onClick={() => setSelectedCard(card)} className="w-full flex items-center gap-3 bg-slate-900/40 p-2 rounded-lg border border-slate-800/50 hover:bg-slate-800">
                     <motion.img layoutId={`img-${card.id}`} src={getCardImage(card.name)} className="w-11 h-16 rounded-[4px] object-cover bg-slate-950 border border-slate-800" loading="lazy" />
                     <div className="flex-1 min-w-0 text-left">
                       <div className="flex justify-between items-center mb-1">
                         <motion.span layoutId={`title-${card.id}`} className="text-sm font-bold truncate text-slate-200 group-hover:text-white">{card.name}</motion.span>
                         <span className={`text-sm font-black ${getDeltaStyle(card.gih_wr, globalMeanWR)}`}>{card.gih_wr ? card.gih_wr.toFixed(1) : '--'}%</span>
                       </div>
                       <div className="flex justify-between items-center mt-1">
                          <div className="flex items-center gap-2"><span className={`text-[9px] px-1.5 rounded border font-black ${RARITY_STYLES[normalizeRarity(card.rarity)]}`}>{normalizeRarity(card.rarity)}</span><ManaIcons colors={card.colors} size="sm" /></div>
                          <span className="text-[10px] text-slate-500 font-mono">ALSA {card.alsa ? card.alsa.toFixed(2) : '--'}</span>
                       </div>
                     </div>
                   </motion.button>
                 ))}
              </div>
          </div>
        )}
      </main>

      <nav className="bg-slate-900 border-t border-slate-800 px-8 py-3 pb-6 flex justify-around items-center absolute bottom-0 w-full z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('decks')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'decks' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Layers size={24} strokeWidth={activeTab === 'decks' ? 2.5 : 2} /><span className="text-[10px] font-bold">Decks</span></button>
        <button onClick={() => setActiveTab('cards')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'cards' ? 'text-indigo-400 scale-105' : 'text-slate-600'}`}><Zap size={24} strokeWidth={activeTab === 'cards' ? 2.5 : 2} /><span className="text-[10px] font-bold">Cards</span></button>
      </nav>
    </div>
  );
}