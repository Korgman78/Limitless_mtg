import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, ArrowUpDown, AlertTriangle, PieChart as PieChartIcon, Repeat, HelpCircle, Trophy, X } from 'lucide-react';
import type { FormatComparisonProps, FormatOption } from '../../types';
import { supabase } from '../../supabase';
import { FORMAT_OPTIONS, RARITY_STYLES } from '../../constants';
import { useDebounce } from '../../hooks/useDebounce';
import { extractColors, normalizeRarity, getCardImage } from '../../utils/helpers';
import { ManaIcons } from '../Common/ManaIcons';

export const FormatComparison: React.FC<FormatComparisonProps> = ({ activeSet }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [formatA, setFormatA] = useState<string>('PremierDraft');
  const [formatB, setFormatB] = useState<string>('ArenaDirect_Sealed');
  const [compareMode, setCompareMode] = useState<string>('archetypes');
  const [metricMode, setMetricMode] = useState<string>('winrate');
  const [mobileShowFormatB, setMobileShowFormatB] = useState<boolean>(false);
  const [mobileTooltip, setMobileTooltip] = useState<string | null>(null);

  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [archTypeFilter, setArchTypeFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearchTerm = useDebounce<string>(searchTerm, 300);

  const [sortDir, setSortDir] = useState<string>('desc');
  const [visibleCount, setVisibleCount] = useState<number>(30);
  const [zoomedCard, setZoomedCard] = useState<string | null>(null);

  const observerTarget = React.useRef<HTMLDivElement | null>(null);

  const getFormatLabel = (val: string): string => FORMAT_OPTIONS.find((o: FormatOption) => o.value === val)?.label || val;
  const getFormatShort = (val: string): string => FORMAT_OPTIONS.find((o: FormatOption) => o.value === val)?.short || val.substring(0, 3).toUpperCase();

  useEffect(() => {
    if (mobileTooltip) {
      const timer = setTimeout(() => setMobileTooltip(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [mobileTooltip]);

  useEffect(() => {
    async function fetchComparison() {
      setLoading(true);
      setFetchError(null);
      try {
        let query;
        if (compareMode === 'archetypes') {
          query = supabase.from('archetype_comparison_pivot').select('*').eq('set_code', activeSet);
        } else {
          query = supabase.from('comparison_pivot_v1_3').select('*').eq('set_code', activeSet).eq('filter_context', 'Global');
        }
        const { data: pivotData, error } = await query;
        if (error) {
          console.error("Supabase Error:", error);
          setFetchError('Failed to load comparison data');
        } else if (pivotData) {
          setData(pivotData);
          setVisibleCount(30);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setFetchError('Failed to load comparison data');
      }
      setLoading(false);
    }
    fetchComparison();
  }, [activeSet, compareMode]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(prev => prev + 40); },
      { threshold: 0.1, rootMargin: '600px' }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
  }, [data, compareMode, rarityFilter, colorFilters, searchTerm]);

  const processedData = useMemo(() => {
    const fMap: Record<string, string> = { 'PremierDraft': 'premier', 'TradDraft': 'trad', 'Sealed': 'sealed', 'ArenaDirect_Sealed': 'direct' };
    const sA = fMap[formatA] || 'premier';
    const sB = fMap[formatB] || 'direct';

    return data
      .filter((item: any) => {
        if (compareMode === 'cards' && debouncedSearchTerm) {
          if (!item.card_name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) return false;
        }
        if (compareMode === 'cards') {
          if (rarityFilter.length > 0) {
            const r = normalizeRarity(item.rarity);
            if (!rarityFilter.includes(r)) return false;
          }
          if (colorFilters.length > 0) {
            const cColors = extractColors(item.colors || "");
            if (colorFilters.includes('M') && cColors.length > 1) return true;
            if (colorFilters.includes('C') && cColors.length === 0) return true;
            const monoFilters = colorFilters.filter(f => ['W', 'U', 'B', 'R', 'G'].includes(f));
            if (monoFilters.length > 0) {
              for (let f of monoFilters) { if (cColors.includes(f)) return true; }
              return false;
            }
          }
        }
        if (compareMode === 'archetypes' && archTypeFilter) {
          const rawContext = item.filter_context || "";
          const colorsOnly = rawContext.replace(' + Splash', '').replace(/[^WUBRG]/g, '');
          const isSplash = rawContext.toLowerCase().includes('splash');
          if (archTypeFilter === 'All') return colorsOnly.length === 2 || (colorsOnly.length === 3 && !isSplash);
          if (archTypeFilter === '2color') return colorsOnly.length === 2 && !isSplash;
          if (archTypeFilter === 'splash') return colorsOnly.length === 2 && isSplash;
          if (archTypeFilter === '3color') return colorsOnly.length === 3;
        }
        return true;
      })
      .map((item: any) => {
        let valA: number, valB: number, rawA: number | null, rawB: number | null, diff: number | null;
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
            rawA = null; rawB = null;
            diff = (!isNaN(valA) && !isNaN(valB)) ? (valA - valB) : null;
          }
        }
        if (isNaN(valA) || isNaN(valB)) return null;
        return { ...item, valA, valB, rawA: isNaN(rawA as any) ? null : rawA, rawB: isNaN(rawB as any) ? null : rawB, diff };
      })
      .filter((item: any) => item !== null)
      .sort((a: any, b: any) => {
        const diffA = a.diff !== null ? a.diff : -99999;
        const diffB = b.diff !== null ? b.diff : -99999;
        return sortDir === 'desc' ? (diffB - diffA) : (diffA - diffB);
      });
  }, [data, compareMode, formatA, formatB, rarityFilter, colorFilters, archTypeFilter, sortDir, metricMode, debouncedSearchTerm]);

  const visibleData = processedData.slice(0, visibleCount);
  const SortButtonContent = () => <>{sortDir === 'desc' ? 'Overperformers' : 'Underperformers'}</>;

  return (
    <div className="flex flex-col gap-6 min-h-screen relative">
      <AnimatePresence>
        {fetchError && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400" />
            <span className="text-sm">{fetchError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileTooltip && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 left-4 right-4 z-[60] bg-indigo-900/95 text-white p-3 rounded-xl border border-indigo-500/50 shadow-2xl backdrop-blur-md"
            onClick={() => setMobileTooltip(null)}>
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium leading-relaxed">{mobileTooltip}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoomedCard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setZoomedCard(null)}>
            <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              src={getCardImage(zoomedCard)} className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()} />
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
                <select value={formatA} onChange={(e) => setFormatA(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 text-white text-[10px] font-bold p-2.5 rounded-lg outline-none uppercase cursor-pointer">
                  {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-slate-600 font-black text-[10px] pb-3">VS</span>
                <select value={formatB} onChange={(e) => setFormatB(e.target.value)} className="flex-1 bg-indigo-900/40 border border-indigo-500/30 text-white text-[10px] font-bold p-2.5 rounded-lg outline-none uppercase cursor-pointer">
                  {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <Zap size={14} className="text-yellow-400 absolute left-1/2 -translate-x-1/2 bottom-0 mb-1 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)] z-0" fill="currentColor" />
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center pt-3 border-t border-slate-800 gap-4">
            <div className="flex-1 flex flex-wrap gap-2 items-center w-full">
              {compareMode === 'cards' ? (
                <div className="flex flex-col md:flex-row gap-2 w-full md:items-center justify-between">
                  <div className="flex gap-2 w-full md:w-auto md:order-2 md:ml-auto">
                    <div className="relative flex-1 md:w-48 md:flex-none">
                      <input type="text" placeholder="Search card..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-300 py-1.5 pl-8 pr-3 rounded-lg text-[10px] font-bold focus:border-indigo-500 focus:outline-none transition-colors" />
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                    <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="md:hidden text-indigo-400 text-[9px] font-black flex items-center justify-center gap-1 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest flex-shrink-0">
                      <SortButtonContent />
                    </button>
                  </div>
                  <div className="flex items-center gap-0.5 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto no-scrollbar w-full md:w-auto md:order-1 mask-linear-fade">
                    <div className="flex items-center gap-0.5 flex-shrink-0">
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
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {['M', 'R', 'U', 'C'].map(r => (
                        <button key={r} onClick={() => setRarityFilter(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])}
                          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black border transition-all ${rarityFilter.includes(r) ? `${RARITY_STYLES[r]} border-white/40 shadow-lg scale-105` : 'bg-slate-900 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}>{r}</button>
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
                  <select value={archTypeFilter} onChange={(e) => setArchTypeFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg outline-none cursor-pointer flex-1 md:w-auto capitalize truncate">
                    <option value="All">All Archetypes</option>
                    <option value="2color">2 Colors</option>
                    <option value="splash">2 Col. + Splash</option>
                    <option value="3color">3 Colors</option>
                  </select>
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex-shrink-0">
                    <button onClick={() => setMetricMode('winrate')} className={`flex items-center gap-1 px-2 py-1.5 rounded text-[9px] font-black transition-all ${metricMode === 'winrate' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                      <Trophy size={9} /> WR
                    </button>
                    <button onClick={() => setMetricMode('meta')} className={`flex items-center gap-1 px-2 py-1.5 rounded text-[9px] font-black transition-all ${metricMode === 'meta' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                      <PieChartIcon size={9} /> META
                    </button>
                  </div>
                  <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="md:hidden text-indigo-400 text-[9px] font-black flex items-center justify-center gap-1 bg-indigo-500/10 px-2 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest flex-shrink-0" title={sortDir === 'desc' ? 'Overperformers' : 'Underperformers'}>
                    <ArrowUpDown size={14} />
                  </button>
                </div>
              )}
            </div>
            {compareMode === 'archetypes' && (
              <button onClick={() => setSortDir(p => p === 'desc' ? 'asc' : 'desc')} className="hidden md:flex text-indigo-400 text-[10px] font-black flex items-center gap-2 bg-indigo-500/10 px-4 py-2.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all uppercase tracking-widest ml-auto">
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
            {visibleData.map((item: any, idx: number) => {
              const getStatsTooltip = (formatName: string, val: number): string => {
                if (compareMode === 'cards') return `In ${formatName}, this card win rate is ${Math.abs(val).toFixed(1)}% ${val >= 0 ? 'above' : 'below'} global average win rate`;
                if (metricMode === 'winrate') return `In ${formatName}, this archetype win rate is ${Math.abs(val).toFixed(1)}% ${val >= 0 ? 'above' : 'below'} global average win rate`;
                return `In ${formatName}, this archetype represents ${val.toFixed(1)}% of the Meta`;
              };
              const getShiftTooltip = (val: number): string => {
                const absVal = Math.abs(val).toFixed(1);
                const fA = getFormatLabel(formatA); const fB = getFormatLabel(formatB);
                if (compareMode === 'cards') return `This card ${val >= 0 ? 'overperforms' : 'underperforms'} in ${fA} vs ${fB} of ${absVal}%`;
                if (metricMode === 'winrate') return `This archetype ${val >= 0 ? 'overperforms' : 'underperforms'} in ${fA} vs ${fB} of ${absVal}%`;
                return `This archetype is ${val >= 0 ? 'more played' : 'less played'} in ${fA} vs ${fB} of ${absVal} points`;
              };
              const handleStatClick = (e: React.MouseEvent, text: string): void => {
                e.stopPropagation();
                if (window.innerWidth < 768) setMobileTooltip(text);
              };

              return (
                <div key={`${item.card_name || item.filter_context}-${idx}`} onClick={() => compareMode === 'cards' && setZoomedCard(item.card_name)}
                  className={`w-full bg-slate-900/50 border border-slate-800/60 rounded-xl p-3.5 flex items-center justify-between group hover:border-indigo-500/40 hover:bg-slate-800/80 transition-all text-left active:scale-[0.98] ${compareMode === 'cards' ? 'cursor-zoom-in' : ''}`}>
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {compareMode === 'cards' ? (
                      <div className="relative shrink-0">
                        <img src={getCardImage(item.card_name)} className="w-12 h-16 md:w-14 md:h-20 rounded-lg object-cover bg-black border border-slate-700 shadow-2xl" loading="lazy" alt={item.card_name} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-slate-950 rounded-full border border-slate-800 shadow-inner shrink-0 flex items-center justify-center">
                          <ManaIcons colors={extractColors(item.filter_context)} size="lg" />
                        </div>
                        <span className="font-black text-xs md:text-sm text-slate-100 truncate tracking-tight pt-0.5">{item.filter_context}</span>
                      </div>
                    )}
                    {compareMode === 'cards' && (
                      <div className="flex flex-col justify-center h-full flex-1 min-w-0">
                        <span className="font-black text-xs md:text-sm text-slate-100 text-left leading-tight line-clamp-2 md:truncate w-full block">{item.card_name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-row items-center gap-2 md:gap-3 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setMobileShowFormatB(!mobileShowFormatB); }}
                      className="md:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-400 transition-colors active:scale-90" aria-label="Switch format view">
                      <Repeat size={16} />
                    </button>
                    <div className="flex flex-row gap-8 items-center">
                      <div className={`${mobileShowFormatB ? 'hidden' : 'flex'} md:flex flex-col items-end group-hover:opacity-100 transition-opacity min-w-[60px]`}
                        title={getStatsTooltip(getFormatLabel(formatA), item.valA)} onClick={(e) => handleStatClick(e, getStatsTooltip(getFormatLabel(formatA), item.valA))}>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 md:hidden">{getFormatShort(formatA)}</span>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 hidden md:block">{getFormatLabel(formatA)}</span>
                        <span className={`text-xs font-mono font-bold ${item.valA !== null && item.valA >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {item.valA !== null ? (metricMode === 'winrate' && item.valA > 0 ? '+' : '') + item.valA.toFixed(1) + '%' : '--'}
                        </span>
                        {item.rawA !== null && <span className="text-[9px] text-slate-500 font-bold opacity-80 mt-0.5">{item.rawA.toFixed(1)}%</span>}
                      </div>
                      <div className={`${!mobileShowFormatB ? 'hidden' : 'flex'} md:flex flex-col items-end group-hover:opacity-100 transition-opacity min-w-[60px]`}
                        title={getStatsTooltip(getFormatLabel(formatB), item.valB)} onClick={(e) => handleStatClick(e, getStatsTooltip(getFormatLabel(formatB), item.valB))}>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 md:hidden">{getFormatShort(formatB)}</span>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-tight opacity-70 hidden md:block">{getFormatLabel(formatB)}</span>
                        <span className={`text-xs font-mono font-bold ${item.valB !== null && item.valB >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {item.valB !== null ? (metricMode === 'winrate' && item.valB > 0 ? '+' : '') + item.valB.toFixed(1) + '%' : '--'}
                        </span>
                        {item.rawB !== null && <span className="text-[9px] text-slate-500 font-bold opacity-80 mt-0.5">{item.rawB.toFixed(1)}%</span>}
                      </div>
                    </div>
                    <div className={`flex flex-col items-end min-w-[70px] md:min-w-[90px] p-2 md:p-2.5 rounded-lg md:rounded-xl border transition-all ${item.diff >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}
                      title={getShiftTooltip(item.diff)} onClick={(e) => handleStatClick(e, getShiftTooltip(item.diff))}>
                      <span className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${item.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Shift</span>
                      <span className={`text-lg md:text-xl font-black tabular-nums ${item.diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.diff !== null ? ((item.diff >= 0 ? '+' : '') + item.diff.toFixed(1) + '%') : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
