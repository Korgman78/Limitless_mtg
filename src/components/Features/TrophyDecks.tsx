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

type ArchFilter = 'all' | '2 colors' | '3 colors' | 'more than 3 colors';

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
        if (filter === '2 colors') return base.filter(s => s.archetype_name.length <= 2);
        if (filter === '3 colors') return base.filter(s => s.archetype_name.length === 3);
        if (filter === 'more than 3 colors') return base.filter(s => s.archetype_name.length > 3);
        return base;
    }, [skeletons, filter]);

    React.useEffect(() => {
        if (!selectedArch && filteredSkeletons.length > 0) {
            setSelectedArch(filteredSkeletons[0].archetype_name);
        }
    }, [filteredSkeletons, selectedArch]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                    <Trophy size={40} className="text-slate-700" />
                </motion.div>
                <span className="text-sm font-bold text-slate-500 tracking-widest uppercase">Analyzing Trophies...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 p-2 md:p-0 pb-32">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8 px-2 md:px-0">
                <div className="space-y-1">
                    <h2 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter flex items-center gap-3">
                        <Trophy className="text-yellow-500 shrink-0" size={32} />
                        ARCHETYPAL TROPHIES
                    </h2>
                    <p className="text-sm text-slate-500 max-w-xl font-medium">
                        Propelled by 7-win data. Statistical core of the format.
                    </p>
                </div>

                <div className="flex p-1 bg-slate-900/60 rounded-xl border border-slate-800 self-start md:self-auto">
                    {(['all', '2 colors', '3 colors', 'more than 3 colors'] as ArchFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => { haptics.selection(); setFilter(f); }}
                            className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Optimized Multi-column Selector */}
            <div className="px-2 md:px-0">
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2 md:gap-3 justify-center">
                    {filteredSkeletons.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => { haptics.light(); setSelectedArch(s.archetype_name); }}
                            className={`flex flex-col items-center justify-center p-2.5 md:p-4 rounded-xl md:rounded-2xl border transition-all duration-300 group ${selectedArch === s.archetype_name
                                    ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.3)] scale-105 z-10'
                                    : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-600 hover:bg-slate-800/80 shadow-sm'
                                }`}
                        >
                            <ManaIcons colors={s.archetype_name} size="md" />
                            <span className={`text-[9px] md:text-[10px] font-black mt-2 tracking-tighter uppercase ${selectedArch === s.archetype_name ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {s.archetype_name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                {skeleton ? (
                    <motion.div
                        key={skeleton.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-6 md:space-y-10"
                    >
                        {/* STATS TILES */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 px-2 md:px-0">
                            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-6 rounded-[2rem] shadow-inner">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-8">
                                    <BarChart3 size={14} className="text-indigo-500" />
                                    Mana Curve
                                </h3>
                                <div className="flex items-end justify-between h-24 gap-1.5 px-2">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => {
                                        const val = skeleton.avg_mana_curve[cmc.toString()] || 0;
                                        const height = Math.max((val / 10) * 100, 4); // Minimal height for visibility
                                        return (
                                            <div key={cmc} className="flex-1 flex flex-col items-center gap-2 group">
                                                <div className="relative w-full h-full flex flex-col justify-end">
                                                    <motion.div
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${height}%` }}
                                                        className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 via-indigo-400 to-cyan-400 relative border-x border-t border-indigo-300/10 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                                                    >
                                                        <div className="absolute -top-6 left-0 right-0 text-center text-[10px] font-black text-slate-200 opacity-0 group-hover:opacity-100 transition-all transform group-hover:-translate-y-1">
                                                            {val}
                                                        </div>
                                                    </motion.div>
                                                </div>
                                                <span className="text-[10px] font-black text-slate-600 group-hover:text-indigo-400 transition-colors">{cmc}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-6 rounded-[2rem]">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-8">
                                    <Users size={14} className="text-emerald-500" />
                                    Spell Ratio
                                </h3>
                                <div className="flex items-center justify-between p-4 bg-slate-950/40 rounded-3xl border border-slate-800/40">
                                    <div className="flex flex-col">
                                        <span className="text-3xl font-black text-white italic tracking-tighter">{(skeleton.creature_ratio * 100).toFixed(0)}%</span>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Creatures</span>
                                    </div>
                                    <div className="h-10 w-[1px] bg-slate-800/50" />
                                    <div className="flex flex-col items-end">
                                        <span className="text-3xl font-black text-white italic tracking-tighter">{(100 - (skeleton.creature_ratio * 100)).toFixed(0)}%</span>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Non-Creatures</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 p-6 rounded-[2rem]">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-8">
                                    <Mountain size={14} className="text-amber-500" />
                                    Mana Base
                                </h3>
                                <div className="flex items-center justify-center p-4 bg-slate-950/40 rounded-3xl border border-slate-800/40 h-[74px]">
                                    <span className="text-4xl font-black text-white italic tracking-tighter">{skeleton.avg_lands}</span>
                                    <span className="ml-3 text-[10px] font-black text-slate-400 uppercase tracking-[.25em] leading-tight">Avg<br />Lands</span>
                                </div>
                            </div>
                        </div>

                        {/* STACKED DECK VIEW */}
                        <div className="space-y-12 select-none overflow-x-hidden md:overflow-x-visible px-2 md:px-0">
                            {/* CREATURES ROW */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-[.3em] flex items-center gap-3 shrink-0">
                                        CREATURES
                                    </h4>
                                    <div className="h-px bg-gradient-to-r from-emerald-500/30 to-transparent flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-2">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => (
                                        <CmcStack key={`c-${cmc}`} cmc={cmc} cards={skeleton.deck_list.filter(c => c.cmc === cmc && (c.type.includes('Creature') || c.type.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* NON-CREATURES ROW */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-[.3em] flex items-center gap-3 shrink-0">
                                        NON-CREATURES
                                    </h4>
                                    <div className="h-px bg-gradient-to-r from-indigo-500/30 to-transparent flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-2">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((cmc) => (
                                        <CmcStack key={`nc-${cmc}`} cmc={cmc} cards={skeleton.deck_list.filter(c => c.cmc === cmc && !c.type.includes('Creature') && !c.type.includes('Planeswalker') && !c.type.includes('Land'))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* LANDS SECTION */}
                            <div className="pt-6 border-t border-slate-800/50">
                                <div className="flex items-center gap-4 mb-6">
                                    <h4 className="text-xs font-black text-amber-500 uppercase tracking-[.3em] flex items-center gap-3 shrink-0">
                                        LANDS
                                    </h4>
                                    <div className="h-px bg-gradient-to-r from-amber-500/30 to-transparent flex-1" />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                    {skeleton.deck_list.filter(c => c.type.includes('Land')).map((card, i) => (
                                        <button
                                            key={`${card.name}-${i}`} onClick={() => onCardSelect(card)}
                                            className="group flex items-center gap-3 bg-slate-900/60 p-2 rounded-xl border border-slate-800 hover:border-amber-500/50 transition-all"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 overflow-hidden shrink-0 group-hover:scale-110 transition-transform">
                                                <img src={getCardImage(card.name)} className="w-full h-full object-cover opacity-60 group-hover:opacity-100" />
                                            </div>
                                            <span className="text-[10px] font-black text-slate-300 truncate group-hover:text-white uppercase tracking-tighter">{card.name}</span>
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
    if (cards.length === 0) return (
        <div className="hidden md:flex flex-col w-[12.5%] min-w-[100px] items-center opacity-10">
            <div className="aspect-[2/3] w-full border-2 border-dashed border-slate-800 rounded-xl" />
        </div>
    );

    // Group duplicates to handle counting
    const grouped = cards.reduce((acc: any[], card) => {
        const existing = acc.find(x => x.name === card.name);
        if (existing) existing.count++;
        else acc.push({ ...card, count: 1 });
        return acc;
    }, []);

    return (
        <div className="flex flex-col w-full md:w-[12.5%] md:min-w-[100px] space-y-3">
            <div className="flex items-center justify-between md:justify-center px-1">
                <span className="text-[10px] font-black text-slate-600 md:hidden">CMC {cmc}</span>
                <span className="text-[10px] font-black text-slate-700 bg-slate-900/50 px-2 py-0.5 rounded-full">{cards.length}</span>
            </div>

            <div className="relative isolate">
                {grouped.map((card, idx) => (
                    <motion.div
                        key={`${card.name}-${idx}`}
                        className="relative"
                        style={{ marginTop: idx === 0 ? 0 : '-80%' }}
                        whileHover={{ y: -10, zIndex: 50, transition: { duration: 0.2 } }}
                    >
                        <button
                            onClick={() => onCardSelect(card)}
                            className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-slate-800/80 bg-slate-900 group transition-all duration-300 hover:border-indigo-500 hover:scale-[1.02]"
                        >
                            <img
                                src={getCardImage(card.name)}
                                alt={card.name}
                                className="w-full h-full object-cover transition-opacity duration-500 opacity-90 group-hover:opacity-100"
                                loading="lazy"
                            />
                            {card.count > 1 && (
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border border-indigo-400/50 z-20">
                                    x{card.count}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                                <p className="text-[8px] font-black text-white truncate uppercase tracking-tighter">{card.name}</p>
                            </div>
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
