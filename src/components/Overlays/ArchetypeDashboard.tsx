import React, { useState, useEffect } from 'react';
import { Star, Gem, AlertTriangle } from 'lucide-react';
import type { ArchetypeDashboardProps, Card } from '../../types';
import { supabase } from '../../supabase';
import { extractColors, getDeltaStyle, getCardImage, normalizeRarity } from '../../utils/helpers';
import { ManaIcons } from '../Common/ManaIcons';
import { SwipeableOverlay } from './SwipeableOverlay';

export const ArchetypeDashboard: React.FC<ArchetypeDashboardProps> = ({ deck, activeFormat, activeSet, globalMeanWR, totalGames, onClose, onCardClick }) => {
  const [archCards, setArchCards] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArchetypeData() {
      setLoading(true);
      setFetchError(null);
      const baseColor = extractColors(deck.colors);
      if (!baseColor || baseColor.length > 3) { setArchCards([]); setLoading(false); return; }
      const chars = baseColor.split('');
      const permutations: string[] = [];
      if (chars.length === 2) { permutations.push(chars[0] + chars[1], chars[1] + chars[0]); }
      else if (chars.length === 3) {
        const [a, b, c] = chars;
        permutations.push(a + b + c, a + c + b, b + a + c, b + c + a, c + a + b, c + b + a);
      } else { permutations.push(baseColor); }

      try {
        const { data: deckData, error: deckError } = await supabase.from('card_stats').select('*').eq('set_code', activeSet).eq('format', activeFormat.trim()).in('filter_context', permutations).range(0, 5000);
        const { data: globalData, error: globalError } = await supabase.from('card_stats').select('card_name, gih_wr, alsa').eq('set_code', activeSet).eq('filter_context', 'Global').eq('format', activeFormat.trim());

        if (deckError || globalError) {
          console.error('Error fetching archetype data:', deckError || globalError);
          setFetchError('Failed to load archetype data');
          setLoading(false);
          return;
        }

        if (deckData && deckData.length > 0) {
          const merged = deckData.map((dc: any) => {
            const gc = globalData ? globalData.find((g: any) => g.card_name === dc.card_name) : null;
            return { ...dc, name: dc.card_name, global_wr: gc ? gc.gih_wr : null, global_alsa: gc ? gc.alsa : null };
          });
          setArchCards(merged.sort((a: any, b: any) => (b.gih_wr || 0) - (a.gih_wr || 0)));
        } else { setArchCards([]); }
      } catch (err) {
        console.error('Error fetching archetype data:', err);
        setFetchError('Failed to load archetype data');
      }
      setLoading(false);
    }
    fetchArchetypeData();
  }, [deck, activeFormat, activeSet]);

  if (!deck) return null;

  const isSealed = activeFormat.toLowerCase().includes('sealed');
  const deckBaseColors = extractColors(deck.colors);

  const allWrValues = archCards
    .map((c: any) => c.gih_wr)
    .filter((wr: any) => wr !== null)
    .sort((a: number, b: number) => b - a);

  const thresholdIndex = Math.floor(allWrValues.length * 0.25);
  const top25Threshold = allWrValues.length > 0 ? allWrValues[thresholdIndex] : 100.0;

  const gems = archCards
    .filter((c: any) => c.gih_wr && c.global_wr)
    .filter((c: any) => c.gih_wr >= globalMeanWR)
    .filter((c: any) => isSealed || (c.alsa && c.alsa > 4.0))
    .filter((c: any) => c.gih_wr > c.global_wr + 1.0)
    .map((c: any) => ({ ...c, score: (c.gih_wr - c.global_wr) }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  const traps = archCards
    .filter((c: any) => c.gih_wr && c.global_wr)
    .filter((c: any) => {
      const cColors = extractColors(c.colors);
      return cColors.split('').every((col: string) => deckBaseColors.includes(col));
    })
    .filter((c: any) => c.gih_wr < top25Threshold)
    .filter((c: any) => isSealed || (c.alsa && c.alsa <= 4.0))
    .filter((c: any) => c.gih_wr < c.global_wr - 1.0)
    .sort((a: any, b: any) => a.gih_wr - b.gih_wr)
    .slice(0, 5);

  const commons = archCards.filter((c: any) => normalizeRarity(c.rarity) === 'C' && c.gih_wr).sort((a: any, b: any) => b.gih_wr - a.gih_wr).slice(0, 5);
  const uncommons = archCards.filter((c: any) => normalizeRarity(c.rarity) === 'U' && c.gih_wr).sort((a: any, b: any) => b.gih_wr - a.gih_wr).slice(0, 5);
  const bestCard = commons[0] || uncommons[0];

  const Section: React.FC<{ title: string; icon: any; cards: any[]; colorClass: string }> = ({ title, icon: Icon, cards, colorClass }) => (
    <section className="mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
      <div className={`flex items-center gap-2 mb-3 ${colorClass}`}>
        <Icon size={16} strokeWidth={2.5} />
        <h3 className="text-xs font-black uppercase tracking-widest">{title}</h3>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-xs text-slate-500 italic">Loading...</div> :
          cards.length === 0 ? <div className="text-xs text-slate-500 italic">No data.</div> :
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
