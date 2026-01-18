import React from 'react';
import { Star, Gem, AlertTriangle } from 'lucide-react';
import type { ArchetypeDashboardProps } from '../../types';
import { extractColors, getDeltaStyle, getCardImage, normalizeRarity, normalizeArchetypeName } from '../../utils/helpers';
import { ManaIcons } from '../Common/ManaIcons';
import { SwipeableOverlay } from './SwipeableOverlay';
import { Sparkline } from '../Charts/Sparkline';
import { useArchetypeCards } from '../../queries/useArchetypeCards';

const ArchetypeDashboardComponent: React.FC<ArchetypeDashboardProps> = ({ deck, activeFormat, activeSet, globalMeanWR, totalGames, onClose, onCardClick }) => {
  const { data: archCards = [], isLoading: loading, error } = useArchetypeCards(deck?.colors || '', activeFormat, activeSet);
  const fetchError = error ? 'Failed to load archetype data' : null;

  if (!deck) return null;

  const isSealed = activeFormat.toLowerCase().includes('sealed');
  const deckBaseColors = extractColors(deck.colors);

  const allWrValues = archCards
    .map((c: any) => c.gih_wr)
    .filter((wr: any) => wr !== null)
    .sort((a: number, b: number) => b - a);

  const thresholdIndex = Math.floor(allWrValues.length * 0.25);
  const top25Threshold = allWrValues.length > 0 ? allWrValues[thresholdIndex] : 100.0;

  // 1. D'abord on calcule les Tops Communs et Uncos (pour pouvoir filtrer les gems ensuite)
  const commons = archCards.filter((c: any) => normalizeRarity(c.rarity) === 'C' && c.gih_wr).sort((a: any, b: any) => b.gih_wr - a.gih_wr).slice(0, 5);
  const uncommons = archCards.filter((c: any) => normalizeRarity(c.rarity) === 'U' && c.gih_wr).sort((a: any, b: any) => b.gih_wr - a.gih_wr).slice(0, 5);
  const bestCard = commons[0] || uncommons[0];

  // 2. Ensuite les Gems (avec exclusion des cartes déjà affichées)
  const gems = archCards
    .filter((c: any) => c.gih_wr && c.global_wr)
    .filter((c: any) => c.gih_wr >= globalMeanWR)
    .filter((c: any) => isSealed || (c.alsa && c.alsa > 4.0))
    .filter((c: any) => c.gih_wr > c.global_wr + 1.0)
    // Condition Puissance vs Deck (Strict en Sealed, Tolérance -1.0 en Draft)
    .filter((c: any) => isSealed ? c.gih_wr > deck.wr : c.gih_wr > (deck.wr - 1.0))
    // On retire si présent dans commons OU uncommons
    .filter((c: any) => !commons.some(com => com.card_name === c.card_name) && !uncommons.some(unc => unc.card_name === c.card_name))
    .map((c: any) => ({ ...c, score: (c.gih_wr - c.global_wr) }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  // 3. Enfin les Traps
  const traps = archCards
    .filter((c: any) => c.gih_wr && c.global_wr)
    .filter((c: any) => {
      const cColors = extractColors(c.colors);
      return cColors.split('').every((col: string) => deckBaseColors.includes(col));
    })
    .filter((c: any) => c.gih_wr < top25Threshold)
    // NOUVELLE CONDITION : On exclut les cartes qui restent très fortes malgré tout
    .filter((c: any) => c.gih_wr <= globalMeanWR + 4.0)
    .filter((c: any) => isSealed || (c.alsa && c.alsa <= 4.0))
    .filter((c: any) => c.gih_wr < c.global_wr - 1.0)
    // Condition Faiblesse vs Deck (Strict en Sealed, Tolérance +1.0 en Draft)
    .filter((c: any) => isSealed ? c.gih_wr < deck.wr : c.gih_wr < (deck.wr + 0.5))
    .sort((a: any, b: any) => a.gih_wr - b.gih_wr)
    .slice(0, 5);

  const Section: React.FC<{ title: string; icon: any; cards: any[]; colorClass: string }> = ({ title, icon: Icon, cards, colorClass }) => (
    <section className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
      <div className={`flex items-center gap-2 mb-3 ${colorClass}`}>
        <Icon size={16} strokeWidth={2.5} />
        <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-xs text-slate-500 italic">Loading...</div> :
          cards.length === 0 ? <div className="text-xs text-slate-500 italic">No matching cards found.</div> :
            cards.map((c: any) => (
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

  const getGradient = (cols: string | null | undefined): string => {
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
        {fetchError && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {fetchError}
          </div>
        )}
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
              <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-md tracking-tight">{normalizeArchetypeName(deck.name)}</h2>
            </div>
            <div className="flex flex-col w-full max-w-xs gap-3">
              <div className="flex gap-2 md:gap-4">
                <div className="flex-1 bg-black/40 rounded-xl p-2 md:p-3 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center shadow-lg">
                  <span className="text-[8px] md:text-[9px] uppercase font-bold text-slate-400 mb-0.5 md:mb-1">Win Rate</span>
                  <span className={`text-xl md:text-3xl font-black ${getDeltaStyle(deck.wr, globalMeanWR)}`}>{deck.wr}%</span>
                </div>
                <div className="flex-1 bg-black/40 rounded-xl p-2 md:p-3 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center shadow-lg">
                  <span className="text-[8px] md:text-[9px] uppercase font-bold text-slate-400 mb-0.5 md:mb-1">Metagame</span>
                  <div className="flex items-baseline gap-0.5 md:gap-1">
                    <span className="text-xl md:text-2xl font-bold text-white">{(deck.games / totalGames * 100).toFixed(1)}</span>
                    <span className="text-[10px] md:text-xs text-white/60">%</span>
                  </div>
                </div>
                {/* TREND Block - Mobile: inline / Desktop: full width below */}
                <div className="flex-1 md:hidden bg-black/40 rounded-xl p-2 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center shadow-lg relative group">
                  <span className="text-[8px] uppercase font-bold text-slate-400 mb-0.5 z-10">Trend</span>
                  <div className="h-6 flex items-center justify-center relative z-10">
                    {(() => {
                      let history = deck.history || [];
                      if (history.length === 0 && deck.wr) history = [deck.wr, deck.wr];
                      else if (history.length === 1) history = [history[0], history[0]];
                      return history.length > 1 ? (
                        <Sparkline data={history} width={50} height={24} />
                      ) : (
                        <span className="text-[9px] text-slate-600 italic">--</span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* TREND Block - Desktop only: full width */}
              <div className="hidden md:flex bg-black/40 rounded-xl p-3 border border-white/10 backdrop-blur-md flex-col items-center justify-center shadow-lg relative group">
                <span className="text-[9px] uppercase font-bold text-slate-400 mb-1 z-10">Trend (14 days)</span>
                <div className="w-full h-10 flex items-center justify-center relative z-10">
                  {(() => {
                    let history = deck.history || [];
                    if (history.length === 0 && deck.wr) history = [deck.wr, deck.wr];
                    else if (history.length === 1) history = [history[0], history[0]];
                    return history.length > 1 ? (
                      <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                        <Sparkline data={history} width={80} height={32} />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600 italic">Not enough data</span>
                    );
                  })()}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/5 to-transparent pointer-events-none"></div>
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

// Memoized export pour éviter les re-renders inutiles
export const ArchetypeDashboard = React.memo(ArchetypeDashboardComponent);
ArchetypeDashboard.displayName = 'ArchetypeDashboard';