import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Layers, Zap, ChevronRight, ArrowUpDown,
  X, Repeat, Newspaper, ArrowUp, RefreshCw, TrendingUp, TrendingDown, Grid3X3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Deck, Card, SortConfig } from './types';

// Constants
import { FORMAT_OPTIONS, PAIRS, TRIOS, RARITY_STYLES } from './constants';

// React Query hooks
import { useSets } from './queries/useSets';
import { useDecks } from './queries/useDecks';
import { useCards } from './queries/useCards';

// Hooks
import { useDebounce } from './hooks/useDebounce';
import { useLocalStorage } from './hooks/useLocalStorage';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useCoachMarks } from './hooks/useCoachMarks';

// Utils
import { haptics } from './utils/haptics';

// Helpers
import { areColorsEqual, extractColors, normalizeRarity, getDeltaStyle, getCardImage, normalizeArchetypeName } from './utils/helpers';

// Components
import { ManaIcons, ErrorBanner, CardSkeleton, DeckSkeleton, CoachMarkWrapper } from './components/Common';
import { TrendIndicator } from './components/Charts/TrendIndicator';
import { MetagamePieChart, PairBreakdownChart, Sparkline } from './components/Charts';
import { ArchetypeDashboard, CardDetailOverlay, MatrixViewOverlay } from './components/Overlays';
import { FormatComparison, PressReview, FormatBlueprint } from './components/Features';


export default function MTGLimitedApp(): React.ReactElement {
  // --- Coach Marks for Onboarding ---
  const { isUnseen, markAsSeen, getMessage } = useCoachMarks();

  // --- Persisted State (Smart Defaults) ---
  const [activeTab, setActiveTab] = useLocalStorage<string>('limitless-tab', 'decks');
  const [activeFormat, setActiveFormat] = useLocalStorage<string>('limitless-format', 'PremierDraft');
  const [activeSet, setActiveSet] = useLocalStorage<string>('limitless-set', 'TLA');
  const [deckTypeFilter, setDeckTypeFilter] = useLocalStorage<string>('limitless-deckType', 'Two colors');
  const [archetypeFilter, setArchetypeFilter] = useLocalStorage<string>('limitless-archetype', 'Global');
  const [sortConfig, setSortConfig] = useLocalStorage<SortConfig>('limitless-sort', { key: 'gih_wr', dir: 'desc' });

  // --- React Query Data ---
  const { data: availableSets = [], error: setsError } = useSets();
  const { data: decksData, isLoading: decksLoading, error: decksError, refetch: refetchDecks } = useDecks(activeSet, activeFormat);
  const { data: cardsData, isLoading: cardsLoading, error: cardsError, refetch: refetchCards } = useCards(activeSet, activeFormat, archetypeFilter);

  const decks = decksData?.decks || [];
  const totalGames = decksData?.totalGames || 1;
  const cards = cardsData?.cards || [];
  const globalMeanWR = cardsData?.globalMeanWR || 55.0;
  const loading = cardsLoading;

  // Combine errors from all queries
  const queryError = setsError || decksError || cardsError;

  // --- Non-persisted State ---
  const [chartMode, setChartMode] = useState<string>('meta');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const debouncedSearchTerm = useDebounce<string>(searchTerm, 300);

  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showMatrixView, setShowMatrixView] = useState<boolean>(false);

  // --- Error State ---
  const [error, setError] = useState<string | null>(null);

  // --- Lazy Loading States ---
  const [visibleCardsCount, setVisibleCardsCount] = useState<number>(40);
  const cardsObserverTarget = React.useRef<HTMLDivElement | null>(null);

  // --- Scroll to Top FAB ---
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const mainRef = React.useRef<HTMLElement | null>(null);


  // Sync query errors to local error state for auto-dismiss
  useEffect(() => {
    if (queryError) {
      setError('Failed to load data');
    }
  }, [queryError]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const filteredDecks = useMemo((): Deck[] => {
    if (!decks || decks.length === 0) return [];
    let targetList = [] as typeof PAIRS;
    if (deckTypeFilter === 'Two colors' || deckTypeFilter === 'Two colors + splash') targetList = PAIRS;
    else if (deckTypeFilter === 'Three colors') targetList = TRIOS;
    else return decks.filter((d: Deck) => d.type === deckTypeFilter).sort((a: Deck, b: Deck) => b.wr - a.wr);
    return targetList.map((template) => {
      const found = decks.find((d: Deck) => {
        const isTypeMatch = d.type === deckTypeFilter;
        const deckColors = extractColors(d.colors);
        return isTypeMatch && areColorsEqual(deckColors, template.code);
      });
      return found || { id: `placeholder-${template.code}`, name: template.name, colors: deckTypeFilter.includes('splash') ? `${template.code} + Splash` : template.code, wr: 0, games: 0, type: deckTypeFilter, history: [0, 0, 0] };
    }).sort((a: Deck, b: Deck) => b.wr - a.wr);
  }, [decks, deckTypeFilter]);

  const filteredCards = useMemo((): Card[] => {
    let res: Card[] = [...cards];

    if (debouncedSearchTerm) res = res.filter((c: Card) => c.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));

    if (rarityFilter.length > 0) {
      res = res.filter((c: Card) => rarityFilter.includes(normalizeRarity(c.rarity)));
    }

    if (colorFilters.length > 0) {
      res = res.filter((c: Card) => {
        const cColors = extractColors(c.colors);
        if (colorFilters.includes('M') && cColors.length > 1) return true;
        if (colorFilters.includes('C') && cColors.length === 0) return true;
        const monoFilters = colorFilters.filter((f: string) => ['W', 'U', 'B', 'R', 'G'].includes(f));
        if (monoFilters.length > 0) {
          for (let f of monoFilters) {
            if (cColors.includes(f)) return true;
          }
        }
        return false;
      });
    }

    res.sort((a: Card, b: Card) => {
      // TRI PAR NOM
      if (sortConfig.key === 'name') return sortConfig.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

      // TRI PAR TENDANCE (TREND)
      if (sortConfig.key === 'trend') {
        const getTrend = (c: any) => {
          if (!c.win_rate_history || c.win_rate_history.length < 2) return 0;
          return c.win_rate_history[c.win_rate_history.length - 1] - c.win_rate_history[0];
        };
        const trendA = getTrend(a);
        const trendB = getTrend(b);
        return sortConfig.dir === 'asc' ? trendA - trendB : trendB - trendA;
      }

      // TRI PAR DEFAUT (GIH ou ALSA)
      const valA = sortConfig.key === 'alsa' ? a.alsa : a.gih_wr;
      const valB = sortConfig.key === 'alsa' ? b.alsa : b.gih_wr;

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
    });
    return res;
  }, [cards, debouncedSearchTerm, rarityFilter, colorFilters, sortConfig]);

  // Reset lazy load when filters change
  useEffect(() => {
    setVisibleCardsCount(40);
  }, [debouncedSearchTerm, rarityFilter, colorFilters, sortConfig, archetypeFilter, activeSet, activeFormat]);

  // Infinite scroll observer
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

  // Scroll to top FAB visibility
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      setShowScrollTop(mainEl.scrollTop > window.innerHeight * 2);
    };

    mainEl.addEventListener('scroll', handleScroll);
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Refresh data function for pull-to-refresh
  const refreshData = async () => {
    if (activeTab === 'cards') {
      await refetchCards();
    } else if (activeTab === 'decks') {
      await refetchDecks();
    }
  };

  // Pull-to-refresh hook
  const { pullDistance, isRefreshing, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: refreshData,
    threshold: 80
  });

  // Tab change with haptic feedback
  const handleTabChange = (tab: string) => {
    haptics.light();
    setActiveTab(tab);
  };

  const Sidebar = () => (
    <nav className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 p-4 flex-shrink-0">
      <div className="mb-8 px-2">
        <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent italic">LIMITLESS</h1>
        <p className="text-xs text-slate-500 font-medium tracking-wide">MTG LIMITED ANALYTICS</p>
      </div>
      <div className="space-y-2">
        <button onClick={() => handleTabChange('decks')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'decks' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Layers size={20} strokeWidth={2.5} /> <span>Metagame Breakdown</span>
        </button>
        <button onClick={() => handleTabChange('cards')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'cards' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Zap size={20} strokeWidth={2.5} /> <span>Cards Ratings</span>
        </button>
        <button onClick={() => handleTabChange('compare')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'compare' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Repeat size={20} strokeWidth={2.5} /> <span>Format Comparison</span>
        </button>
        <button onClick={() => handleTabChange('press')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${activeTab === 'press' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>
          <Newspaper size={20} strokeWidth={2.5} /> <span>Press Review</span>
        </button>
      </div>
      <div className="mt-auto pt-6 border-t border-slate-800 space-y-4">
        <div className="text-[10px] text-slate-500 leading-relaxed px-2">
          <p className="mb-2">
            <span className="font-bold text-slate-400 uppercase">Credits:</span> Data sourced from <a href="https://www.17lands.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">17lands.com</a>.
          </p>
          <p className="italic">
            Limitless is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
          </p>
        </div>
        <div className="flex gap-4 px-2 opacity-50 hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-slate-600">v1.4.0</span>
          <span className="text-[9px] text-slate-600 font-mono uppercase tracking-tighter">Updated Daily</span>
        </div>
      </div>
    </nav>
  );

  const handleSort = (key: string) => {
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
        {error && <ErrorBanner key="error-banner" message={error} onDismiss={() => setError(null)} />}
        {selectedDeck && <ArchetypeDashboard key="deck-overlay" deck={selectedDeck} activeFormat={activeFormat} activeSet={activeSet} globalMeanWR={globalMeanWR} totalGames={totalGames} onClose={() => setSelectedDeck(null)} onCardClick={(card) => setSelectedCard(card)} />}
        {showMatrixView && <MatrixViewOverlay key="matrix-overlay" cards={cards} activeFormat={activeFormat} archetypeFilter={archetypeFilter} globalMeanWR={globalMeanWR} onClose={() => setShowMatrixView(false)} onCardSelect={(card) => setSelectedCard(card)} />}
        {selectedCard && <CardDetailOverlay key="card-overlay" card={selectedCard} activeFormat={activeFormat} activeSet={activeSet} decks={decks} cards={cards} onClose={() => setSelectedCard(null)} onCardSelect={(card) => setSelectedCard(card)} />}
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

        <main
          ref={mainRef}
          {...pullHandlers}
          className="flex-1 overflow-y-auto pb-32 md:pb-8 md:px-6 md:pt-6 scroll-smooth relative"
        >
          {/* Pull-to-refresh indicator */}
          <AnimatePresence>
            {(pullDistance > 0 || isRefreshing) && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-0 left-0 right-0 flex justify-center py-3 z-10 pointer-events-none"
              >
                <motion.div
                  animate={{ rotate: isRefreshing ? 360 : 0 }}
                  transition={{ repeat: isRefreshing ? Infinity : 0, duration: 1, ease: "linear" }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${pullDistance >= 80 || isRefreshing ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'} shadow-lg`}
                >
                  <RefreshCw size={16} strokeWidth={2.5} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {loading && activeTab === 'cards' && (
            <div className="p-2 md:p-0 pt-2">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 py-3 mb-2"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"
                />
                <span className="text-xs text-slate-400">Loading {activeFormat} cards...</span>
              </motion.div>
              <div className="space-y-1 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <CardSkeleton />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Tab content with transitions */}
          <AnimatePresence mode="wait">
            {/* 1. DECKS / ARCHETYPES TAB */}
            {activeTab === 'decks' && (
              <motion.div
                key="decks-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="p-4 md:p-0 space-y-4 md:space-y-6">
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
                    <MetagamePieChart decks={decks} totalGames={totalGames} globalMeanWR={globalMeanWR} />
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

                {/* Section Header: Archetype Breakdown */}
                <div className="relative pt-2">
                  {/* Decorative line */}
                  <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
                      <h2 className="text-lg md:text-xl font-black text-white tracking-tight">Archetype Breakdown</h2>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-slate-700/50 to-transparent" />
                    <span className="text-xs font-bold text-slate-500 tabular-nums">{filteredDecks.length} archetypes</span>
                  </div>
                </div>

                <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredDecks.map((deck, idx) => (
                    <motion.button
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                      whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                      key={deck.id || idx} onClick={() => setSelectedDeck(deck)}
                      className="w-full flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all group shadow-sm md:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <ManaIcons colors={deck.colors.split(' +')[0]} size="lg" isSplash={deck.colors.includes('Splash')} />
                        <div className="text-left"><h3 className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">{normalizeArchetypeName(deck.name)}</h3></div>
                      </div>
                      <div className="flex flex-col items-end min-w-[5.5rem]">
                        <div className="flex items-center gap-2">
                          {idx === 0 ? (
                            <CoachMarkWrapper
                              id="sparkline-longpress"
                              message={getMessage('sparkline-longpress')}
                              isUnseen={isUnseen('sparkline-longpress')}
                              onMarkSeen={() => markAsSeen('sparkline-longpress')}
                              position="left"
                              delay={1500}
                            >
                              <Sparkline data={deck.history} />
                            </CoachMarkWrapper>
                          ) : (
                            <Sparkline data={deck.history} />
                          )}
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

                {/* Format Blueprint */}
                <FormatBlueprint cards={cards} globalMeanWR={globalMeanWR} onCardSelect={(card) => setSelectedCard(card)} />
              </motion.div>
            )}

            {/* 2. CARD RATINGS TAB */}
            {activeTab === 'cards' && (
              <motion.div
                key="cards-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col min-h-full">
                <div className="bg-slate-950 md:bg-slate-950/90 md:backdrop-blur sticky top-0 md:top-[-1px] z-20 border-b border-slate-800 p-3 md:p-4 space-y-3 shadow-lg">
                  {/* LIGNE 1: Archetype + Search */}
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

                  {/* LIGNE 2 & 3 (Desktop merged / Mobile stacked) */}
                  <div className="flex flex-col md:flex-row md:items-center gap-2 pb-1">

                    {/* Colors & Rarities (Merged row on Mobile) */}
                    <div className="flex items-center gap-1 md:gap-2 w-full md:w-auto">
                      {/* Colors */}
                      <div className="flex items-center gap-0.5 md:gap-1 p-0.5 md:p-1 bg-slate-900 rounded-full border border-slate-800">
                        {['W', 'U', 'B', 'R', 'G'].map(c => (
                          <button key={c} onClick={() => setColorFilters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                            className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center border transition-all relative ${colorFilters.includes(c) ? 'scale-110 shadow-md z-10' : 'opacity-60 hover:opacity-100 grayscale'}`}
                            style={{ borderColor: colorFilters.includes(c) ? 'white' : 'transparent' }}>
                            <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="w-full h-full" />
                          </button>
                        ))}
                        <div className="w-[1px] h-3 md:h-4 bg-slate-700 mx-0.5 md:mx-1"></div>
                        <button onClick={() => setColorFilters(prev => prev.includes('M') ? prev.filter(x => x !== 'M') : [...prev, 'M'])}
                          className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 border flex items-center justify-center text-[7px] md:text-[8px] font-black text-white shadow-sm transition-all ${colorFilters.includes('M') ? 'border-white scale-110' : 'border-transparent opacity-60 grayscale'}`}>M</button>
                        <button onClick={() => setColorFilters(prev => prev.includes('C') ? prev.filter(x => x !== 'C') : [...prev, 'C'])}
                          className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-slate-400 border flex items-center justify-center text-[7px] md:text-[8px] font-black text-slate-900 shadow-sm transition-all ${colorFilters.includes('C') ? 'border-white scale-110' : 'border-transparent opacity-60'}`}>C</button>
                      </div>

                      {/* Séparateur */}
                      <div className="w-[1px] h-5 md:h-6 bg-slate-800"></div>

                      {/* Rarities */}
                      <div className="flex items-center gap-0.5 md:gap-1 p-0.5 md:p-1 bg-slate-900 rounded-lg border border-slate-800">
                        {['M', 'R', 'U', 'C'].map((r) => {
                          const isActive = rarityFilter.includes(r);
                          return (
                            <button key={r} onClick={() => setRarityFilter(prev => prev.includes(r) ? prev.filter(item => item !== r) : [...prev, r])}
                              className={`w-5 h-5 md:w-7 md:h-7 rounded flex items-center justify-center text-[9px] md:text-[10px] font-black transition-all border ${isActive ? `${RARITY_STYLES[r]} border-white/40 scale-105 shadow-lg` : 'bg-slate-800 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}>
                              {r}
                            </button>
                          );
                        })}
                        {rarityFilter.length > 0 && <button onClick={() => setRarityFilter([])} className="p-0.5 md:p-1 text-slate-500 hover:text-white transition-colors"><X size={12} /></button>}
                      </div>

                      {/* Matrix button - Mobile only (pushed to right) */}
                      <button
                        onClick={() => setShowMatrixView(true)}
                        className="md:hidden ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white border border-indigo-400/30 shadow-lg shadow-indigo-500/20"
                      >
                        <Grid3X3 size={10} />
                        MATRIX
                      </button>
                    </div>

                    <div className="hidden md:block w-[1px] h-6 bg-slate-800 mx-2"></div>

                    {/* STATS FILTERS (Row 3 on Mobile) */}
                    <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={() => handleSort('gih_wr')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'gih_wr' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                        GIH
                        {sortConfig.key === 'gih_wr' ? (
                          <ArrowUp size={10} className={`transition-transform duration-200 ${sortConfig.dir === 'desc' ? 'rotate-180' : ''}`} />
                        ) : (
                          <ArrowUpDown size={10} />
                        )}
                      </button>

                      <button onClick={() => handleSort('alsa')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'alsa' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                        ALSA
                        {sortConfig.key === 'alsa' ? (
                          <ArrowUp size={10} className={`transition-transform duration-200 ${sortConfig.dir === 'desc' ? 'rotate-180' : ''}`} />
                        ) : (
                          <ArrowUpDown size={10} />
                        )}
                      </button>

                      <button onClick={() => handleSort('trend')} className={`flex-1 md:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${sortConfig.key === 'trend' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                        TREND
                        {sortConfig.key === 'trend' ? (
                          sortConfig.dir === 'asc' ? <TrendingDown size={10} /> : <TrendingUp size={10} />
                        ) : (
                          <TrendingUp size={10} />
                        )}
                      </button>

                      {/* Séparateur + Matrix View button - Desktop only */}
                      <div className="hidden md:block w-[1px] h-6 bg-slate-700 mx-1"></div>
                      <button
                        onClick={() => setShowMatrixView(true)}
                        className="hidden md:flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white border border-white/10 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-105 transition-all"
                      >
                        <Grid3X3 size={12} />
                        MATRIX VIEW
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-2 md:p-0 pt-2 space-y-1 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-4 md:mt-4">
                  {!loading && filteredCards.slice(0, visibleCardsCount).map((card, idx) => (
                  <motion.button
                    layoutId={`card-${card.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    key={card.id} onClick={() => setSelectedCard(card)}
                    className="w-full flex md:flex-row items-center gap-3 bg-slate-900/40 p-2 md:p-3 rounded-lg border border-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all group md:shadow-md relative"
                  >
                    {/* TrendIndicator - top right corner */}
                    <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2">
                      <TrendIndicator history={(card as any).win_rate_history} />
                    </div>

                    <motion.img layoutId={`img-${card.id}`} src={getCardImage(card.name)} className="w-11 h-16 md:w-16 md:h-24 rounded-[4px] md:rounded-md object-cover bg-slate-950 border border-slate-800 shadow-sm" loading="lazy" />
                    <div className="flex-1 min-w-0 text-left flex flex-col justify-center h-full">
                      <div className="flex justify-between items-start mb-1">
                        <motion.span layoutId={`title-${card.id}`} className="text-sm font-bold truncate text-slate-200 group-hover:text-white md:text-base pr-8">{card.name}</motion.span>
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
                  {/* Scroll sentinel */}
                  {!loading && visibleCardsCount < filteredCards.length && (
                    <div ref={cardsObserverTarget} className="col-span-full h-10 w-full flex items-center justify-center opacity-50">
                      <span className="text-[10px] animate-pulse">Chargement de la suite...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 3. FORMAT COMPARISON TAB */}
            {activeTab === 'compare' && (
              <motion.div key="compare-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <FormatComparison activeSet={activeSet} />
              </motion.div>
            )}

            {/* 4. PRESS REVIEW TAB */}
            {activeTab === 'press' && (
              <motion.div key="press-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <PressReview activeSet={activeSet} />
              </motion.div>
            )}
          </AnimatePresence>

        </main>
      </div>

      {/* FAB Scroll to Top - Mobile only */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="md:hidden fixed right-4 bottom-20 z-40 w-12 h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center border border-indigo-400/30"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      <nav className="md:hidden bg-slate-900 border-t border-slate-800 px-4 py-2 flex justify-around items-center fixed bottom-0 w-full z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => handleTabChange('decks')} className={`flex flex-col items-center gap-0.5 p-1 transition-all ${activeTab === 'decks' ? 'text-indigo-400' : 'text-slate-600'}`}><Layers size={20} strokeWidth={activeTab === 'decks' ? 2.5 : 2} /><span className="text-[9px] font-bold">Meta</span></button>
        <button onClick={() => handleTabChange('cards')} className={`flex flex-col items-center gap-0.5 p-1 transition-all ${activeTab === 'cards' ? 'text-indigo-400' : 'text-slate-600'}`}><Zap size={20} strokeWidth={activeTab === 'cards' ? 2.5 : 2} /><span className="text-[9px] font-bold">Cards</span></button>
        <button onClick={() => handleTabChange('compare')} className={`flex flex-col items-center gap-0.5 p-1 transition-all ${activeTab === 'compare' ? 'text-indigo-400' : 'text-slate-600'}`}>
          <Repeat size={20} strokeWidth={activeTab === 'compare' ? 2.5 : 2} />
          <span className="text-[9px] font-bold">Compare</span>
        </button>
        <button onClick={() => handleTabChange('press')} className={`flex flex-col items-center gap-0.5 p-1 transition-all ${activeTab === 'press' ? 'text-indigo-400' : 'text-slate-600'}`}>
          <Newspaper size={20} strokeWidth={activeTab === 'press' ? 2.5 : 2} />
          <span className="text-[9px] font-bold">News</span>
        </button>
      </nav>
    </div>
  );
}