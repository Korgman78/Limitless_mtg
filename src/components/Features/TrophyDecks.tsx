import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, BarChart3, Mountain, Info } from 'lucide-react';
import { useSkeletons } from '../../queries/useSkeletons';
import { ManaIcons } from '../Common';
import { haptics } from '../../utils/haptics';
import { getCardImage } from '../../utils/helpers';

interface TrophyDecksProps {
    activeSet: string;
    activeFormat: string;
    onCardSelect: (card: any) => void;
}

type ArchFilter = 'all' | 'mono' | '2 colors' | '3 colors' | '4+ colors';

export const TrophyDecks: React.FC<TrophyDecksProps> = ({ activeSet, activeFormat, onCardSelect }) => {
    const { data: skeletons = [], isLoading } = useSkeletons(activeSet, activeFormat);
    const [selectedArch, setSelectedArch] = useState<string | null>(null);
    const [filter, setFilter] = useState<ArchFilter>('2 colors');

    const skeleton = useMemo(() =>
        skeletons.find(s => s.archetype_name === selectedArch),
        [skeletons, selectedArch]
    );

    const filteredSkeletons = useMemo(() => {
        let base = [...skeletons];
        const PAIRS_ORDER = ['WU', 'UB', 'BR', 'RG', 'WG', 'WB', 'UR', 'BG', 'WR', 'UG'];
        base.sort((a, b) => {
            const idxA = PAIRS_ORDER.indexOf(a.archetype_name);
            const idxB = PAIRS_ORDER.indexOf(b.archetype_name);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.archetype_name.length - b.archetype_name.length;
        });

        if (filter === 'all') return base;
        if (filter === 'mono') return base.filter(s => s.archetype_name.length === 1);
        if (filter === '2 colors') return base.filter(s => s.archetype_name.length === 2);
        if (filter === '3 colors') return base.filter(s => s.archetype_name.length === 3);
        if (filter === '4+ colors') return base.filter(s => s.archetype_name.length >= 4);
        return base;
    }, [skeletons, filter]);

    React.useEffect(() => {
        if (filteredSkeletons.length > 0) {
            // If current selection is not in filter, select first of filter
            if (!filteredSkeletons.some(s => s.archetype_name === selectedArch)) {
                setSelectedArch(filteredSkeletons[0].archetype_name);
            }
        }
    }, [filteredSkeletons, selectedArch]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                    <Trophy size={40} className="text-slate-700" />
                </motion.div>
                <span className="text-sm font-bold text-slate-500 tracking-widest uppercase text-center">Mastering Archetypes...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in duration-500 p-2 md:p-0 pb-32">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8 px-2 md:px-0">
                <div className="space-y-1">
                    <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter flex items-center gap-3">
                        <Trophy className="text-yellow-500 shrink-0" size={36} />
                        ARCHETYPAL TROPHIES
                    </h2>
                    <p className="text-sm text-slate-500 max-w-xl font-bold tracking-tight uppercase">
                        Data-driven Skeletons from 7-win trophies.
                    </p>
                </div>

                <div className="flex flex-wrap gap-1 p-1 bg-slate-900/40 rounded-xl border border-slate-800/60 self-start md:self-auto backdrop-blur-sm">
                    {(['all', 'mono', '2 colors', '3 colors', '4+ colors'] as ArchFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => { haptics.selection(); setFilter(f); }}
                            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selector Grid: 10 col desktop, 5 col mobile, centered */}
            <div className="px-2 md:px-0 flex justify-center">
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2 md:gap-4 w-full max-w-6xl">
                    {filteredSkeletons.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => { haptics.light(); setSelectedArch(s.archetype_name); }}
                            className={`flex flex-col items-center justify-center p-2.5 md:p-5 rounded-xl md:rounded-2xl border transition-all duration-300 group relative overflow-hidden ${selectedArch === s.archetype_name
                                    ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_25px_rgba(79,70,229,0.35)] scale-105 z-10'
                                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-500 hover:bg-slate-800/100 shadow-sm'
                                }`}
                        >
                            <ManaIcons colors={s.archetype_name} size="md" />
                            <span className={`text-[9px] md:text-[11px] font-black mt-2 tracking-widest uppercase ${selectedArch === s.archetype_name ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {s.archetype_name}
                            </span>
                            {selectedArch === s.archetype_name && (
                                <motion.div layoutId="selector-glow" className="absolute inset-0 bg-white/5 pointer-events-none" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                {skeleton ? (
                    <motion.div
                        key={skeleton.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="space-y-8 md:space-y-12"
                    >
                        {/* STATS SUMMARY (Ultra modern cards) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 px-2 md:px-0">
                            {/* Curve Card */}
                            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem] shadow-xl">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-10">
                                    <BarChart3 size={14} className="text-indigo-400" />
                                    Spell Curve
                                </h3>
                                <div className="flex items-end justify-between h-20 gap-2 px-2">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => {
                                        const val = Number(skeleton.avg_mana_curve[cmc.toString()] || 0);
                                        const height = Math.max((val / 10) * 100, 2);
                                        return (
                                            <div key={cmc} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                                                <motion.div
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${height}%` }}
                                                    className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 via-indigo-500 to-cyan-400 relative border-x border-t border-indigo-400/20 shadow-lg"
                                                >
                                                    <div className="absolute -top-6 left-0 right-0 text-center text-[10px] font-black text-white opacity-0 group-hover:opacity-100 transition-all">
                                                        {val}
                                                    </div>
                                                </motion.div>
                                                <span className="text-[10px] font-black text-slate-700 group-hover:text-indigo-400">{cmc}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Composition Card */}
                            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-10">
                                    <Users size={14} className="text-emerald-500" />
                                    Composition
                                </h3>
                                <div className="flex items-center justify-between p-6 bg-slate-950/40 rounded-[2rem] border border-slate-800/20">
                                    <div className="flex flex-col">
                                        <span className="text-4xl font-black text-white italic tracking-tighter">{(skeleton.creature_ratio * 100).toFixed(0)}%</span>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Creatures</span>
                                    </div>
                                    <div className="h-12 w-[1px] bg-slate-800/40" />
                                    <div className="flex flex-col items-end">
                                        <span className="text-4xl font-black text-white italic tracking-tighter">{(100 - (skeleton.creature_ratio * 100)).toFixed(0)}%</span>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Spells</span>
                                    </div>
                                </div>
                            </div>

                            {/* Mana Card */}
                            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2 mb-10">
                                    <Mountain size={14} className="text-amber-500" />
                                    Draft Core
                                </h3>
                                <div className="flex items-center justify-center p-6 bg-slate-950/40 rounded-[2rem] border border-slate-800/20 h-[89px]">
                                    <span className="text-5xl font-black text-white italic tracking-tighter">{skeleton.avg_lands}</span>
                                    <span className="ml-4 text-[11px] font-black text-slate-400 uppercase tracking-[.3em] leading-tight">Lands<br />Total</span>
                                </div>
                            </div>
                        </div>

                        {/* ULTRA-TIGHT DECK BUILDER VIEW */}
                        <div className="space-y-16 px-2 md:px-0">
                            {/* 1. CREATURES (Staircase) */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black text-emerald-400 tracking-[0.4em]">CREATURES</div>
                                    <div className="h-px bg-slate-800/40 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => (
                                        <CmcStack key={`c-${cmc}`} cmc={cmc} cards={skeleton.deck_list.filter(c => c.cmc === cmc && (c.type.includes('Creature') || c.type.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* 2. NON-CREATURES (Staircase) */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-black text-indigo-400 tracking-[0.4em]">NON-CREATURES</div>
                                    <div className="h-px bg-slate-800/40 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => (
                                        <CmcStack key={`nc-${cmc}`} cmc={cmc} cards={skeleton.deck_list.filter(c => c.cmc === cmc && !c.type.includes('Creature') && !c.type.includes('Planeswalker') && !c.type.includes('Land'))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* 3. LANDS & CMC 0 (Merged staircase-style or badges) */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-500 tracking-[0.4em]">MANA BASE</div>
                                    <div className="h-px bg-slate-800/40 flex-1" />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-2">
                                    {skeleton.deck_list.filter(c => c.type.includes('Land')).sort((a, b) => a.name.localeCompare(b.name)).map((card, i) => (
                                        <button
                                            key={`${card.name}-${i}`} onClick={() => onCardSelect(card)}
                                            className="group flex items-center gap-3 bg-slate-900/30 p-2 rounded-xl border border-slate-800/60 hover:border-amber-500/50 hover:bg-slate-800 transition-all overflow-hidden"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0">
                                                <img src={getCardImage(card.name)} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
                                            </div>
                                            <span className="text-[11px] font-black text-slate-500 truncate group-hover:text-amber-500 uppercase tracking-tighter">{card.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};

const CmcStack: React.FC<{ cmc: number, cards: any[], onCardSelect: (c: any) => void }> = ({ cmc, cards, onCardSelect }) => {
    // Group duplicates to handle counting
    const grouped = useMemo(() => {
        return cards.reduce((acc: any[], card) => {
            const existing = acc.find(x => x.name === card.name);
            if (existing) existing.count++;
            else acc.push({ ...card, count: 1 });
            return acc;
        }, []);
    }, [cards]);

    if (cards.length === 0) return (
        <div className="hidden md:flex flex-col w-full md:w-[12.5%] md:min-w-[100px] items-center opacity-5 select-none">
            <div className="text-[12px] font-black text-white mb-2">{cmc}</div>
            <div className="aspect-[2/3] w-full border-2 border-dashed border-slate-500 rounded-xl" />
        </div>
    );

    return (
        <div className="flex flex-col w-full md:w-[12.5%] md:min-w-[110px]">
            {/* Header: CMC and Total cards in column */}
            <div className="flex items-center justify-between px-2 mb-3">
                <span className="text-[14px] font-black text-slate-100">{cmc}</span>
                <span className="text-[10px] font-black text-slate-500">{cards.length}</span>
            </div>

            <div className="relative">
                {grouped.map((card, idx) => (
                    <motion.div
                        key={`${card.name}-${idx}`}
                        className="relative"
                        style={{
                            marginTop: idx === 0 ? 0 : '-115%', // Even tighter staircase
                            zIndex: idx
                        }}
                        whileHover={{
                            y: -25,
                            zIndex: 100,
                            scale: 1.05,
                            transition: { duration: 0.2, ease: "easeOut" }
                        }}
                    >
                        <button
                            onClick={() => onCardSelect(card)}
                            className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)] border border-slate-700 bg-slate-900 group"
                        >
                            <img
                                src={getCardImage(card.name)}
                                alt={card.name}
                                className="w-full h-full object-cover transition-opacity duration-300 opacity-95 group-hover:opacity-100"
                                loading="lazy"
                            />
                            {/* Quantity badge */}
                            {card.count > 1 && (
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border border-indigo-300/30 z-[60]">
                                    x{card.count}
                                </div>
                            )}
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
