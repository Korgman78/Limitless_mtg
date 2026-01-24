import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, BarChart3, Clock, Database } from 'lucide-react';
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
        // Sort by sample_size (most represented first)
        base.sort((a, b) => (b.sample_size || 0) - (a.sample_size || 0));

        if (filter === 'all') return base;
        if (filter === 'mono') return base.filter(s => s.archetype_name.length === 1);
        if (filter === '2 colors') return base.filter(s => s.archetype_name.length === 2);
        if (filter === '3 colors') return base.filter(s => s.archetype_name.length === 3);
        if (filter === '4+ colors') return base.filter(s => s.archetype_name.length >= 4);
        return base;
    }, [skeletons, filter]);

    const stats = useMemo(() => {
        if (!skeleton) return null;

        let totalCmc = 0;
        let spellCount = 0;
        let modeCmc = '1';
        let maxVal = 0;

        Object.entries(skeleton.avg_mana_curve).forEach(([cmc, val]) => {
            const nCmc = parseInt(cmc);
            const nVal = Number(val);
            if (nCmc > 0) {
                totalCmc += nCmc * nVal;
                spellCount += nVal;
                if (nVal > maxVal) {
                    maxVal = nVal;
                    modeCmc = cmc;
                }
            }
        });

        return {
            avgCmc: spellCount > 0 ? (totalCmc / spellCount).toFixed(2) : '0.00',
            modeCmc
        };
    }, [skeleton]);

    const maxCmc = useMemo(() => {
        if (!skeleton) return 5;
        // Find highest CMC in deck_list, but at least 5 for safe aesthetics
        const deckMax = Math.max(...skeleton.deck_list.map(c => c.cmc), 0);
        return Math.max(deckMax, 5);
    }, [skeleton]);

    const cmcRange = useMemo(() => Array.from({ length: maxCmc + 1 }, (_, i) => i), [maxCmc]);

    React.useEffect(() => {
        if (filteredSkeletons.length > 0) {
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
                <span className="text-sm font-bold text-slate-500 tracking-widest uppercase text-center">Crunching Trophy Data...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in duration-500 p-2 md:p-0 pb-32">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8 px-2 md:px-0">
                <div className="space-y-1">
                    <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tighter flex items-center gap-3 uppercase">
                        <Trophy className="text-yellow-500 shrink-0" size={36} />
                        ARCHETYPAL TROPHIES
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">
                        40 cards statistical skeletons
                    </p>
                </div>

                <div className="flex flex-wrap gap-1 p-1 bg-slate-900/40 rounded-xl border border-slate-800/60 backdrop-blur-sm">
                    {(['all', 'mono', '2 colors', '3 colors', '4+ colors'] as ArchFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => { haptics.selection(); setFilter(f); }}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selector Grid */}
            <div className="px-2 md:px-0 flex justify-center">
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2 md:gap-4 w-full max-w-6xl">
                    {filteredSkeletons.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => { haptics.light(); setSelectedArch(s.archetype_name); }}
                            className={`flex flex-col items-center justify-center p-2.5 md:p-5 rounded-xl md:rounded-2xl border transition-all duration-300 group ${selectedArch === s.archetype_name
                                ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_25px_rgba(79,70,229,0.3)] scale-105 z-10'
                                : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-500 hover:bg-slate-800'
                                }`}
                        >
                            <ManaIcons colors={s.archetype_name} size="md" />
                            <span className={`text-[9px] md:text-[11px] font-bold mt-2 tracking-wider uppercase ${selectedArch === s.archetype_name ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
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
                        initial={{ opacity: 0, scale: 0.99 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="space-y-12"
                    >
                        {/* MERGED DASHBOARD */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 px-2 md:px-0">
                            {/* Spell Curve Card */}
                            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <BarChart3 size={14} className="text-indigo-400/80" />
                                        Spell Curve {skeleton.sample_size ? <span className="text-slate-500 lowercase font-medium tracking-normal text-[11px] ml-1">(based on {skeleton.sample_size} trophies)</span> : ''}
                                    </h3>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/40 rounded-full border border-slate-800/30">
                                        <Clock size={12} className="text-indigo-400" />
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                                            AVG: <span className="text-white">{stats?.avgCmc}</span>
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-end justify-between h-24 gap-2 px-4 border-b border-slate-800 pb-1">

                                    {[1, 2, 3, 4, 5, 6, 7].map((num) => {
                                        const cmc = num.toString();
                                        const val = Number(skeleton.avg_mana_curve[cmc] || 0);
                                        const height = Math.max((val / 10) * 100, 2);
                                        const isMode = stats?.modeCmc === cmc;
                                        return (
                                            <div key={cmc} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end relative">
                                                <motion.div
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${height}%` }}
                                                    className={`w-full rounded-t-md relative border-x border-t shadow-lg transition-colors ${isMode ? 'bg-gradient-to-t from-orange-600 to-yellow-400 border-orange-400/30' : 'bg-gradient-to-t from-indigo-600 to-cyan-400 border-indigo-400/10'
                                                        }`}
                                                >
                                                    <div className="absolute -top-6 left-0 right-0 text-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-all uppercase">
                                                        {val}
                                                    </div>
                                                </motion.div>
                                                <span className={`text-[10px] font-black ${isMode ? 'text-orange-400' : 'text-slate-700'} uppercase`}>{cmc}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Combined Stats Card - Triple Balanced Column */}
                            <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-6 rounded-[2.5rem]">
                                <div className="flex items-center mb-8 min-h-[28px]">
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <Users size={14} className="text-emerald-500/80" />
                                        Composition & Mana Base
                                    </h3>
                                </div>
                                <div className="grid grid-cols-3 gap-2 h-[100px]">
                                    {/* Creatures */}
                                    <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                                        <span className="text-3xl lg:text-4xl font-black text-white tracking-tighter">{(skeleton.creature_ratio * 100).toFixed(0)}%</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">CREATURES</span>
                                    </div>
                                    {/* Spells */}
                                    <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                                        <span className="text-3xl lg:text-4xl font-black text-white tracking-tighter">{(100 - (skeleton.creature_ratio * 100)).toFixed(0)}%</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">SPELLS</span>
                                    </div>
                                    {/* Lands */}
                                    <div className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border border-slate-800/30">
                                        <span className="text-3xl lg:text-4xl font-black text-white tracking-tighter">{skeleton.avg_lands}</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">LANDS TOTAL</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ULTRA-COMPACT DECK GRID */}
                        <div className="space-y-12 px-2 md:px-0">
                            {/* 1. CREATURES */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-[9px] font-bold text-emerald-500/60 tracking-wider uppercase">CREATURES</div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {cmcRange.map((num) => (
                                        <CmcStack key={`c-${num}`} cmc={num} cards={skeleton.deck_list.filter(c => c.cmc === num && (c.type.includes('Creature') || c.type.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* 2. NON-CREATURES & LANDS */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-indigo-500/5 border border-indigo-500/20 text-[9px] font-bold text-indigo-500/60 tracking-wider uppercase">NON-CREATURES & LANDS</div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {cmcRange.map((num) => (
                                        <CmcStack key={`nc-${num}`} cmc={num} cards={skeleton.deck_list.filter(c => c.cmc === num && (!c.type.includes('Creature') && !c.type.includes('Planeswalker')))} onCardSelect={onCardSelect} />
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
    const grouped = useMemo(() => {
        return cards.reduce((acc: any[], card) => {
            const existing = acc.find(x => x.name === card.name);
            if (existing) existing.count++;
            else acc.push({ ...card, count: 1 });
            return acc;
        }, []);
    }, [cards]);

    if (cards.length === 0) return (
        <div className="hidden md:flex flex-col flex-1 items-center opacity-5 pointer-events-none select-none">
            <div className="text-[14px] font-bold text-white mb-2">{cmc}</div>
            <div className="aspect-[2/3] w-full border-2 border-dashed border-slate-700 rounded-xl" />
        </div>
    );

    return (
        <div className="flex flex-col w-[46%] md:flex-1 md:min-w-0 group/stack transition-all hover:z-[100] px-1 md:px-2">
            <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[16px] font-bold text-white/80">{cmc}</span>
                <span className="text-[10px] font-bold text-slate-600">({cards.length})</span>
            </div>

            <div className="relative isolate">
                {grouped.map((card, idx) => (
                    <motion.div
                        key={`${card.name}-${idx}`}
                        className="relative"
                        style={{
                            marginTop: idx === 0 ? 0 : '-135%',
                            zIndex: idx
                        }}
                        whileHover={{
                            y: -25,
                            zIndex: 200,
                            scale: 1.15,
                            transition: { type: "spring", stiffness: 400, damping: 22 }
                        }}
                    >
                        <button
                            onClick={() => onCardSelect(card)}
                            className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-[0_15px_45px_rgba(0,0,0,1)] border border-slate-800/80 bg-slate-900 group"
                        >
                            <img
                                src={getCardImage(card.name)}
                                alt={card.name}
                                className="w-full h-full object-cover transition-opacity duration-300 opacity-95 group-hover:opacity-100"
                                loading="lazy"
                            />

                            {card.count > 1 && (
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg border border-indigo-300/40 z-[60]">
                                    {card.count}
                                </div>
                            )}
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
