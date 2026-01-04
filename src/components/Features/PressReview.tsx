import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, ChevronRight, Gem, AlertTriangle, Newspaper, ExternalLink, Play, Clock, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { PressReviewProps, Article } from '../../types';
import { supabase } from '../../supabase';
import { SwipeableOverlay } from '../Overlays/SwipeableOverlay';

// --- COMPOSANT TOOLTIP ---
const CardTooltip: React.FC<{ name: string }> = ({ name }) => {
  const [show, setShow] = useState(false);
  const imageUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}&format=image&version=border_crop`;

  return (
    <span 
      className="relative inline-block text-indigo-400 font-bold border-b border-indigo-500/30 cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => e.preventDefault()}
    >
      {name}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="z-[9999] pointer-events-none fixed
                       /* FIX MOBILE : Centrage via marges auto (plus robuste que translate) */
                       top-20 left-0 right-0 mx-auto w-[70vw] max-w-[220px]
                       
                       /* DESKTOP (>= 1280px) : Comportement sidebar à droite */
                       xl:top-24 
                       xl:left-[calc(50%+512px)] 
                       xl:right-0 
                       xl:mx-0                   /* Annulation du centrage mobile */
                       xl:w-auto xl:max-w-none
                       xl:flex xl:justify-center xl:items-start
                       xl:px-4"
          >
            <img 
              src={imageUrl} 
              alt={name} 
              className="rounded-2xl shadow-2xl border-2 border-slate-700 bg-slate-900 
                         w-full h-auto 
                         xl:w-80"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};
export const PressReview: React.FC<PressReviewProps> = ({ activeSet }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeSetsOptions, setActiveSetsOptions] = useState<any[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentSetFilter, setCurrentSetFilter] = useState<string>('All');
  const [zoomedCard, setZoomedCard] = useState<string | null>(null);
  
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Mapping des noms officiels
  const [officialCardNames, setOfficialCardNames] = useState<Record<string, string>>({});
  
  // State pour gérer le loader lors de l'analyse des cartes
  const [isResolvingCardNames, setIsResolvingCardNames] = useState<boolean>(false);

  // --- Helpers ---
  const cleanSummary = (text: string | null | undefined): string => {
    if (!text) return "";
    let content = text.split('{')[0];
    content = content.replace(/```[\s\S]*?$/g, '').replace(/`{1,3}/g, '').replace(/[-_*]{3,}/g, '').replace(/\s+$/g, '').trim();
    
    // Remplacement intelligent avec format d'ancre sûr
    const mappings = Object.entries(officialCardNames);
    if (mappings.length > 0) {
      mappings.sort((a, b) => b[0].length - a[0].length);
      const pattern = mappings.map(([approx]) => approx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');

      content = content.replace(regex, (match) => {
        const entry = mappings.find(([approx]) => approx.toLowerCase() === match.toLowerCase());
        const officialName = entry ? entry[1] : match;
        // Utilisation de #card- au lieu de card:// pour éviter le nettoyage par Markdown
        return `[${officialName}](#card-${encodeURIComponent(officialName)})`;
      });
    }
    return content;
  };

  const parsePostgresArray = (pgArray: string | string[] | null | undefined): string[] => {
    if (!pgArray) return [];
    if (Array.isArray(pgArray)) return pgArray;
    return pgArray.replace(/{|}/g, '').split(',').map((item: string) => item.trim().replace(/^"|"$/g, ''));
  };

  const getYouTubeThumbnail = (article: Article | null): string => {
    if (!article || !article.video_url) return article?.thumbnail_url || "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = article.video_url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : article.thumbnail_url || '';
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // --- Data Fetching ---

  useEffect(() => {
    if (!selectedArticle) return;

    // Si pas de cartes mentionnées, on coupe le loader immédiatement
    if (!selectedArticle.mentioned_cards) {
        setIsResolvingCardNames(false);
        return;
    }

    async function fetchOfficialNames() {
      const names = parsePostgresArray(selectedArticle?.mentioned_cards);
      const newMappings: Record<string, string> = {};

      await Promise.all(names.map(async (approxName) => {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(approxName)}`);
          if (res.ok) {
            const data = await res.json();
            newMappings[approxName] = data.name;
          }
        } catch (err) {
          console.error("Scryfall fetch error:", err);
        }
      }));

      setOfficialCardNames(prev => ({ ...prev, ...newMappings }));
      setIsResolvingCardNames(false); // FIN du chargement
    }

    fetchOfficialNames();
  }, [selectedArticle]);

  useEffect(() => {
    async function fetchActiveSets() {
      try {
        const { data } = await supabase.from('sets').select('code, name').eq('active', true).order('start_date', { ascending: false });
        if (data) setActiveSetsOptions(data);
      } catch (err) { console.error("Error fetching sets:", err); }
    }
    fetchActiveSets();
  }, []);

  useEffect(() => {
    async function fetchInitialArticles() {
      setLoading(true);
      setFetchError(null);
      setHasMore(true);

      try {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - 15);
        const dateLimitISO = dateLimit.toISOString();

        let query = supabase
          .from('press_articles')
          .select('*')
          .order('published_at', { ascending: false });

        if (currentSetFilter !== 'All') {
            query = query.eq('set_tag', currentSetFilter);
        }

        query = query.gte('published_at', dateLimitISO);

        const { data, error } = await query;

        if (error) throw error;
        
        if (data) {
          setArticles(data);
        }
      } catch (err) {
        console.error("Error fetching articles:", err);
        setFetchError('Failed to load articles');
      }
      setLoading(false);
    }
    fetchInitialArticles();
  }, [currentSetFilter]);

  const loadMoreArticles = async () => {
    if (loadingMore || !hasMore || articles.length === 0) return;

    setLoadingMore(true);
    try {
      const lastArticleDate = articles[articles.length - 1].published_at;

      let query = supabase
        .from('press_articles')
        .select('*')
        .order('published_at', { ascending: false })
        .lt('published_at', lastArticleDate)
        .limit(20);

      if (currentSetFilter !== 'All') {
        query = query.eq('set_tag', currentSetFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        if (data.length < 20) {
          setHasMore(false);
        }
        setArticles(prev => [...prev, ...data]);
      }
    } catch (err) {
      console.error("Error loading more:", err);
    }
    setLoadingMore(false);
  };

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    if (selectedTags.length === 0) return articles;
    return articles.filter((article: Article) => selectedTags.every((tag: string) => article.tags?.includes(tag)));
  }, [articles, selectedTags]);

  const allTags = useMemo((): string[] => {
    const tags = new Set<string>();
    if (articles) articles.forEach((article: Article) => article.tags?.forEach((tag: string) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [articles]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev: string[]) => prev.includes(tag) ? prev.filter((t: string) => t !== tag) : [...prev, tag]);
  };

  return (
    <>
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
        {zoomedCard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setZoomedCard(null)} className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out">
            <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              src={`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(zoomedCard)}&format=image&version=border_crop`}
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        {/* Header & Filters */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <Newspaper className="text-indigo-400" /> Press Review
              </h2>
              <p className="text-slate-400 text-sm">Curated summaries & strategic insights.</p>
            </div>
            <div className="relative min-w-[160px]">
              <select value={currentSetFilter} onChange={(e) => setCurrentSetFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs font-bold py-2.5 pl-4 pr-10 rounded-xl outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-all hover:border-slate-600">
                <option value="All">All Sets</option>
                {activeSetsOptions.map((s: any) => (<option key={s.code} value={s.code}>{s.name} ({s.code})</option>))}
              </select>
              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 rotate-90 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-linear-fade">
            <button onClick={() => setSelectedTags([])}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap ${selectedTags.length === 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
              All Tags
            </button>
            {allTags.map((tag: string) => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap ${selectedTags.includes(tag) ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Loading & Articles List */}
        {loading ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div></div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center text-slate-500 py-20 bg-slate-900 rounded-xl border border-slate-800">
             No articles found in the last 15 days matching your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredArticles.map((article: Article) => (
              <button key={article.id} onClick={() => {
                setSelectedArticle(article);
                if (article.mentioned_cards) setIsResolvingCardNames(true);
              }}
                className="w-full text-left bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 hover:bg-slate-800 transition-all group active:scale-[0.99]">
                <div className="md:flex">
                  <div className="md:w-56 md:flex-shrink-0 relative overflow-hidden bg-black h-40 md:h-auto">
                    <img src={getYouTubeThumbnail(article)} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="thumb" />
                    {article.strategic_score && (
                      <div className="absolute top-2 left-2 group/score">
                        <div className="bg-indigo-600/90 backdrop-blur-md text-white px-2 py-1 rounded text-[10px] font-black flex items-center gap-1 shadow-lg cursor-help">
                          <Zap size={10} fill="currentColor" /> {article.strategic_score}/10
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1">
                    <div className="flex flex-wrap gap-2 mb-2 items-center">
                      <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{article.set_tag || 'MTG'}</span>
                      <span className="text-[9px] font-bold uppercase text-slate-500">{(article as any).channel_name}</span>
                      
                      {article.tags
                        ?.sort((a, b) => {
                            const aSelected = selectedTags.includes(a);
                            const bSelected = selectedTags.includes(b);
                            if (aSelected && !bSelected) return -1;
                            if (!aSelected && bSelected) return 1;
                            return 0;
                        })
                        .slice(0, 4)
                        .map((t: string) => (
                        <span key={t} className={`text-[9px] font-bold border px-2 py-0.5 rounded ${selectedTags.includes(t) ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'text-slate-500 border-slate-800'}`}>
                          {t}
                        </span>
                      ))}
                      {(article.tags?.length || 0) > 5 && <span className="text-[9px] text-slate-600">+{article.tags!.length - 5}</span>}
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-slate-100 mb-1 group-hover:text-indigo-300 transition-colors line-clamp-1">{article.title}</h3>
                    <p className="text-slate-400 text-xs line-clamp-2 italic leading-relaxed">{cleanSummary(article.summary)}</p>
                    <div className="mt-2 text-[10px] text-slate-600 font-medium flex items-center gap-2">{formatDate(article.published_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {!loading && hasMore && articles.length > 0 && (
            <div className="flex justify-center pt-4 pb-8">
                <button 
                    onClick={loadMoreArticles}
                    disabled={loadingMore}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2.5 rounded-full font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
                >
                    {loadingMore ? (
                        <>
                            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                            Loading Archives...
                        </>
                    ) : (
                        <>
                            <Clock size={14} />
                            Load Older Articles
                            <ChevronDown size={14} />
                        </>
                    )}
                </button>
            </div>
        )}
      </div>

      <AnimatePresence>
        {selectedArticle && (
          <SwipeableOverlay onClose={() => setSelectedArticle(null)}>
             <div className="flex flex-col h-full md:flex-row bg-slate-950">
              {/* Left Column (Video & Actions) */}
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

              {/* Right Column (Content) */}
              <div className="flex-1 overflow-y-auto p-5 md:p-12 bg-slate-950">
                <div className="max-w-2xl mx-auto pb-20 md:pb-0">
                  <div className="md:hidden mb-6">
                    <h2 className="text-lg font-black text-white leading-tight">{selectedArticle.title}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{selectedArticle.set_tag}</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">{formatDate(selectedArticle.published_at)}</span>
                    </div>
                  </div>

                  {isResolvingCardNames ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                       <span className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Analyzing Card Data...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                          <Zap size={14} className="text-indigo-500" /> Key Takeaways
                        </h3>
                        {selectedArticle.strategic_score && (
                          <div className="relative group/score-detail">
                            <span className="text-indigo-400 font-black text-xs cursor-help bg-indigo-500/10 px-2 py-1 rounded">Score: {selectedArticle.strategic_score}/10</span>
                          </div>
                        )}
                      </div>

                      {/* CUSTOM MARKDOWN WITH HOVER TOOLTIP */}
                      <div className="prose prose-invert prose-sm prose-indigo max-w-none">
                        <ReactMarkdown 
                          components={{
                            // Surcharge du composant "a" (lien) pour intercepter le format #card-
                            a: ({ href, children, ...props }) => {
                              // Si le lien commence par #card-, c'est notre marqueur spécial
                              if (href?.startsWith('#card-')) {
                                // On décode le nom pour l'affichage
                                const cardName = decodeURIComponent(href.replace('#card-', ''));
                                // On retourne notre composant Tooltip qui est un SPAN (non cliquable)
                                return <CardTooltip name={cardName} />;
                              }
                              // Sinon, c'est un lien normal qui doit fonctionner
                              return (
                                <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                                  {children}
                                </a>
                              );
                            }
                          }}
                        >
                          {cleanSummary(selectedArticle.summary)}
                        </ReactMarkdown>
                      </div>

                      {selectedArticle.mentioned_cards && (
                        <div className="mt-10 pt-8 border-t border-slate-800">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 flex items-center gap-2 tracking-widest">
                            <Gem size={14} className="text-indigo-500" /> Mentioned Cards
                          </h4>
                          <div className="flex flex-wrap gap-3">
                            {parsePostgresArray(selectedArticle.mentioned_cards).map((approxName: string, idx: number) => {
                              const officialName = officialCardNames[approxName] || approxName;
                              return (
                                <button key={idx} onClick={() => setZoomedCard(officialName)} className="group relative w-20 md:w-28 transition-transform hover:scale-105 active:scale-95">
                                  <img src={`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(officialName)}&format=image&version=border_crop`}
                                    alt={officialName} className="rounded-md shadow-lg border border-slate-800 group-hover:border-indigo-500 transition-all w-full h-auto bg-slate-900" loading="lazy"
                                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => { if (e.currentTarget.parentElement) e.currentTarget.parentElement.style.display = 'none'; }} />
                                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 bg-indigo-600 rounded-full p-2 shadow-xl"><Search size={14} className="text-white" /></div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
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