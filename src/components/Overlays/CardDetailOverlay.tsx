import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layers, ArrowUpDown, AlertTriangle, Trophy, MousePointerClick, Crosshair } from 'lucide-react';
import type { CardDetailOverlayProps, Card, Deck, CrossPerformance } from '../../types';
import { supabase } from '../../supabase';
import { RARITY_STYLES } from '../../constants';
import { normalizeRarity, getDeltaStyle, getCardImage, calculateGrade, areColorsEqual, extractColors } from '../../utils/helpers';
import { ManaIcons } from '../Common/ManaIcons';
import { SwipeableOverlay } from './SwipeableOverlay';
import { Sparkline } from '../Charts/Sparkline';

// --- BLOC D'ÉVALUATION ---
const CardEvaluationBlock: React.FC<{ card: Card; allCards: Card[] }> = ({ card, allCards }) => {
  if (!card.gih_wr) return null;

  const getRank = (list: any[], metric: string, val: any, asc: boolean = false): { rank: number; total: number } => {
    const valid = list.filter((c: any) => c[metric] !== null);
    valid.sort((a: any, b: any) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
    const index = valid.findIndex((c: any) => c.name === card.name);
    return { rank: index + 1, total: valid.length };
  };

  const peersRarity = allCards.filter((c: Card) => normalizeRarity(c.rarity) === normalizeRarity(card.rarity));
  const peersColor = peersRarity.filter((c: Card) => areColorsEqual(extractColors(c.colors), extractColors(card.colors)));
  
  const rankWrRarity = getRank(peersRarity, 'gih_wr', card.gih_wr, false);
  const rankWrColor = getRank(peersColor, 'gih_wr', card.gih_wr, false);
  
  const hasAlsa = !!card.alsa;
  const rankAlsaRarity = hasAlsa ? getRank(peersRarity, 'alsa', card.alsa, true) : null;
  const rankAlsaColor = hasAlsa ? getRank(peersColor, 'alsa', card.alsa, true) : null;

  const rarityLabel = normalizeRarity(card.rarity) === 'M' ? 'Mythics' : normalizeRarity(card.rarity) === 'R' ? 'Rares' : normalizeRarity(card.rarity) === 'U' ? 'Uncommons' : 'Commons';

  const RankingRow = ({ label, rank, total, type }: { label: string; rank: number; total: number; type: string }) => {
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
  const alsa = card.alsa ?? 0;
  let statusText = "Average Card"; let statusColor = "text-slate-400";
  if (hasAlsa) {
    if (card.gih_wr > AVG_WR + 2.0 && alsa > AVG_ALSA + 0.5) { statusText = "Underrated Gem"; statusColor = "text-emerald-400"; }
    else if (card.gih_wr > AVG_WR + 2.0 && alsa <= AVG_ALSA + 0.5) { statusText = "Top Tier / Bomb"; statusColor = "text-purple-400"; }
    else if (card.gih_wr < AVG_WR - 2.0 && alsa <= AVG_ALSA - 0.5) { statusText = "Overrated"; statusColor = "text-red-400"; }
    else if (card.gih_wr < AVG_WR - 2.0 && alsa > AVG_ALSA - 0.5) { statusText = "Chaff / Filler"; statusColor = "text-slate-500"; }
  } else {
    if (card.gih_wr > AVG_WR + 3.0) { statusText = "Top Tier"; statusColor = "text-purple-400"; }
    else if (card.gih_wr > AVG_WR + 1.0) { statusText = "Very Good"; statusColor = "text-emerald-400"; }
    else if (card.gih_wr < AVG_WR - 3.0) { statusText = "Avoid / Bad"; statusColor = "text-red-400"; }
  }

  const minALSA = 1.0; const maxALSA = 8.0; const minWR = 45.0; const maxWR = 68.0;
  const xPos = hasAlsa ? ((Math.max(minALSA, Math.min(maxALSA, alsa)) - minALSA) / (maxALSA - minALSA)) * 100 : 50;
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
              <div className="h-32 flex items-center justify-center w-4 flex-shrink-0">
                <span className="-rotate-90 text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Win Rate</span>
              </div>
              <div className="flex flex-col gap-2 flex-1 sm:w-48">
                <div className="relative w-full h-32 bg-slate-950 rounded-lg border border-slate-800 shadow-inner overflow-hidden">
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
                </div>
                <div className="text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pick Order (ALSA)</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among {rarityLabel}</div>
            <RankingRow label="Win Rate Rank" rank={rankWrRarity.rank} total={rankWrRarity.total} type="WR" />
            {hasAlsa && rankAlsaRarity && <RankingRow label="Pick Order Rank" rank={rankAlsaRarity.rank} total={rankAlsaRarity.total} type="ALSA" />}
          </div>
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among Color Peers</div>
            <RankingRow label="Win Rate Rank" rank={rankWrColor.rank} total={rankWrColor.total} type="WR" />
            {hasAlsa && rankAlsaColor && <RankingRow label="Pick Order Rank" rank={rankAlsaColor.rank} total={rankAlsaColor.total} type="ALSA" />}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---
export const CardDetailOverlay: React.FC<CardDetailOverlayProps> = ({ card, activeFormat, activeSet, decks, cards: allCards, onClose }) => {
  const rCode = normalizeRarity(card.rarity);
  const [crossPerf, setCrossPerf] = useState<CrossPerformance[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<string>('synergy');

  useEffect(() => {
    async function fetchCrossData() {
      setFetchError(null);
      try {
        const { data: globalStat, error: globalError } = await supabase.from('card_stats').select('gih_wr').eq('set_code', activeSet).eq('card_name', card.name).eq('filter_context', 'Global').eq('format', activeFormat).single();
        if (globalError && globalError.code !== 'PGRST116') {
          console.error('Error fetching global stat:', globalError);
        }
        const avgCardWr = globalStat?.gih_wr || 55.0;

        const { data, error: dataError } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('card_name', card.name).eq('format', activeFormat);
        if (dataError) {
          console.error('Error fetching cross data:', dataError);
          setFetchError('Failed to load card data');
          return;
        }

        if (data && decks.length > 0) {
          const minGames = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

          const perfs = data
            .filter((d: any) => d.filter_context !== 'Global')
            .map((d: any) => {
              if (!d.gih_wr || d.img_count < minGames) return null;
              const deck = decks.find((dk: Deck) => areColorsEqual(extractColors(dk.colors), d.filter_context));

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
            .filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.deckName === v.deckName)) === i);

          setCrossPerf(perfs as CrossPerformance[]);
        }
      } catch (err) {
        console.error('Error fetching cross data:', err);
        setFetchError('Failed to load card data');
      }
    }
    fetchCrossData();
  }, [card, activeFormat, activeSet, decks]);

  const sortedPerf = useMemo(() => {
    return [...crossPerf].sort((a: CrossPerformance, b: CrossPerformance) => {
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
        {fetchError && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {fetchError}
          </div>
        )}

        {/* Dashboard Compact Header */}
        <div className="bg-slate-900/50 p-4 md:pb-8 md:px-6 flex flex-col border-b border-slate-800 md:border-b-0 md:border-r md:w-1/3 md:justify-center md:pt-0 flex-shrink-0">
          <div className="flex flex-row md:flex-col items-center gap-4 md:gap-0">
            
            {/* Image Thumbnail (Mobile) / Card Image (Desktop) */}
            <div className="w-[40%] md:w-full flex-shrink-0"> 
              <motion.img
                layoutId={`img-${card.id}`}
                src={getCardImage(card.name)}
                className="w-full h-auto rounded-[10px] md:rounded-[18px] shadow-2xl shadow-black md:my-4 ring-1 ring-white/10 object-contain"
              />
            </div>

            {/* Information & Stats Panel */}
            <div className="flex-1 md:w-full flex flex-col justify-center pl-3 md:pl-0">
              <div className="mb-3">
                <h1 className="text-base md:text-2xl font-black text-left md:text-center text-white leading-tight mb-1 line-clamp-2">
                  {card.name}
                </h1>
                <div className="flex items-center justify-start md:justify-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border border-white/10 font-black tracking-wide ${RARITY_STYLES[rCode]}`}>
                    {rCode}
                  </span>
                  <ManaIcons colors={card.colors} size="sm" />
                </div>
              </div>

              {/* Responsive Stats Grid - 3 BLOCS */}
              <div className="grid grid-cols-2 gap-2 w-full">
                {/* 1. GIH BLOCK */}
                <div className="bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-start justify-center pl-3">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">GIH WR</span>
                  <div className={`text-lg md:text-3xl font-black ${getDeltaStyle(card.gih_wr, 55)} leading-none`}>
                    {card.gih_wr ? card.gih_wr.toFixed(1) : '--'}%
                  </div>
                </div>
                
                {/* 2. ALSA BLOCK */}
                <div className="bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-start justify-center pl-3">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">ALSA</span>
                  <div className="text-lg md:text-3xl font-black text-white leading-none">
                    {card.alsa ? card.alsa.toFixed(2) : '--'}
                  </div>
                </div>

                {/* 3. TREND BLOCK (Full Width for Better Readability) */}
{/* 3. TREND BLOCK (Full Width & Centered) */}
                <div className="col-span-2 bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1 z-10">TREND (14 days)</span>
                  
                  {/* Container centré sans scale */}
                  <div className="w-full h-10 flex items-center justify-center px-4 relative z-10">
                    {(() => {
                        let history = (card as any).win_rate_history || [];
                        
                        // LOGIQUE "FLAT LINE"
                        if (history.length === 0 && card.gih_wr) {
                            history = [card.gih_wr, card.gih_wr];
                        } else if (history.length === 1) {
                            history = [history[0], history[0]];
                        }
                        
                        return history.length > 1 ? (
                            // On passe width=60 et height=30 pour l'agrandir proprement (1.5x)
                            // sans déformer le tooltip
                            <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                                <Sparkline data={history} width={60} height={30} />
                            </div>
                        ) : (
                            <span className="text-xs text-slate-600 italic">Not enough data yet</span>
                        );
                    })()}
                  </div>
                  
                  {/* Subtle Background Decoration */}
                  <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/5 to-transparent pointer-events-none"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto p-5 pb-32 space-y-6 bg-slate-950">
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
                {sortedPerf.map((perf: CrossPerformance, idx: number) => {
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
  );
};