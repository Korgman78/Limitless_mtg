import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, BarChart3, Clock, TrendingUp, Eye, Sparkles, ChevronDown, Star, HelpCircle, Copy, Check } from 'lucide-react';
import { Tooltip } from '../Common/Tooltip';
import { useSkeletons, ArchetypalSkeleton } from '../../queries/useSkeletons';
import { ManaIcons } from '../Common';
import { haptics } from '../../utils/haptics';
import { getCardImage } from '../../utils/helpers';

type SkeletonCard = ArchetypalSkeleton['deck_list'][number];

const getColorCount = (name: string): number => {
    return (name.match(/[WUBRG]/gi) || []).length;
};

const formatDeckForMTGA = (skeleton: ArchetypalSkeleton): string => {
    const cardCounts: Record<string, number> = {};
    for (const card of skeleton.deck_list) {
        cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
    const lines = Object.entries(cardCounts).map(([name, count]) => `${count} ${name}`);
    return `Deck\n${lines.join('\n')}`;
};

interface TrophyDecksProps {
    activeSet: string;
    activeFormat: string;
    onCardSelect: (card: SkeletonCard) => void;
}

type ArchFilter = 'all' | 'mono' | '2 colors' | '3 colors' | '4+ colors';

export const TrophyDecks: React.FC<TrophyDecksProps> = ({ activeSet, activeFormat, onCardSelect }) => {
    const { data: skeletons = [], isLoading } = useSkeletons(activeSet, activeFormat);
    const [selectedArch, setSelectedArch] = useState<string | null>(null);
    const [filter, setFilter] = useState<ArchFilter>('2 colors');
    const [showImportance, setShowImportance] = useState(false);
    const [isAlt, setIsAlt] = useState(false);
    const [showMethodology, setShowMethodology] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopyDeck = async () => {
        if (!skeleton) return;
        try {
            await navigator.clipboard.writeText(formatDeckForMTGA(skeleton));
            setCopied(true);
            haptics.success();
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Silent fail - clipboard API might not be available
        }
    };

    const filteredSkeletons = useMemo(() => {
        let base = [...skeletons];
        // Only show main skeletons in the selector grid
        base = base.filter(s => !s.is_alternative);

        // Sort by sample_size (most represented first)
        base.sort((a, b) => (b.sample_size || 0) - (a.sample_size || 0));

        if (filter === 'all') return base;
        if (filter === 'mono') return base.filter(s => getColorCount(s.archetype_name) === 1);
        if (filter === '2 colors') return base.filter(s => getColorCount(s.archetype_name) === 2);
        if (filter === '3 colors') return base.filter(s => getColorCount(s.archetype_name) === 3);
        if (filter === '4+ colors') return base.filter(s => getColorCount(s.archetype_name) >= 4);
        return base;
    }, [skeletons, filter]);

    const skeleton = useMemo(() =>
        skeletons.find(s => s.archetype_name === selectedArch && (s.is_alternative || false) === isAlt),
        [skeletons, selectedArch, isAlt]
    );

    const hasAlternative = useMemo(() =>
        skeletons.some(s => s.archetype_name === selectedArch && s.is_alternative),
        [skeletons, selectedArch]
    );

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
                setIsAlt(false);
            }
        }
    }, [filteredSkeletons, selectedArch]);

    if (isLoading) {
        return (
            <div className="space-y-6 md:space-y-10 animate-pulse p-2 md:p-0">
                {/* Header skeleton */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8">
                    <div className="space-y-2">
                        <div className="h-10 w-72 bg-slate-800 rounded-lg" />
                        <div className="h-4 w-48 bg-slate-900 rounded" />
                    </div>
                    <div className="h-10 w-80 bg-slate-900 rounded-xl" />
                </div>
                {/* Grid skeleton */}
                <div className="flex justify-center">
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2 md:gap-4 w-full max-w-6xl">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="aspect-square bg-slate-900 rounded-xl border border-slate-800" />
                        ))}
                    </div>
                </div>
                {/* Stats skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="h-48 bg-slate-900/30 rounded-[2.5rem] border border-slate-800/40" />
                    <div className="h-48 bg-slate-900/30 rounded-[2.5rem] border border-slate-800/40" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in duration-500 p-2 md:p-0 pb-32">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800 pb-8 px-2 md:px-0">
                <div className="space-y-1">
                    <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tighter flex items-center gap-3 uppercase">
                        <Trophy className="text-yellow-500 shrink-0" size={36} />
                        ARCHETYPAL TROPHIES
                    </h2>
                    <div className="flex items-center gap-2">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">
                            40 cards statistical skeletons
                        </p>
                        <button
                            onClick={(e) => { e.stopPropagation(); haptics.light(); setShowMethodology(!showMethodology); }}
                            className={`p-1 rounded-full transition-colors ${showMethodology ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}
                        >
                            <HelpCircle size={14} />
                        </button>
                    </div>
                </div>

                <div className="flex w-full md:w-auto flex-wrap gap-1 p-1 bg-slate-900/40 rounded-xl border border-slate-800/60 backdrop-blur-sm">
                    {(['all', 'mono', '2 colors', '3 colors', '4+ colors'] as ArchFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => { haptics.selection(); setFilter(f); }}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Methodology Explanation */}
            <AnimatePresence>
                {showMethodology && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-2 md:px-0"
                    >
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 md:p-6 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Data & Scoring</h4>
                                    <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed list-none">
                                        <li>• <strong className="text-slate-200">Source:</strong> Aggregation based exclusively on 7-X trophy decks.</li>
                                        <li>• <strong className="text-slate-200">Meta-Shift:</strong> Recent decks {'<'} 7 days are weighted 2x vs older trophies.</li>
                                        <li>• <strong className="text-slate-200">Clustering:</strong> Identifies distinct variants (overlap {'<'} 70% pillars).</li>
                                        <li>• <strong className="text-slate-200">Relations:</strong> Maps card synergies based on their shared presence in decks.</li>
                                    </ul>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Skeleton Building</h4>
                                    <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed list-none">
                                        <li>• <strong className="text-slate-200">Curve Match:</strong> Card distribution strictly follows the mean mana curve.</li>
                                        <li>• <strong className="text-slate-200">Core Cards:</strong> Highest frequency "pillars" are prioritized for first 80% slots.</li>
                                        <li>• <strong className="text-slate-200">Synergy Fill:</strong> Flex slots are filled using synergy scores with the core.</li>
                                        <li>• <strong className="text-slate-200">Smart Mana:</strong> Land counts and colors are calibrated to match spells pips.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Selector Grid */}
            <div className="px-2 md:px-0 flex justify-center">
                {filteredSkeletons.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Trophy size={48} className="text-slate-800" />
                        <p className="text-sm text-slate-500 text-center">
                            No archetypes found for <span className="font-bold text-slate-400">{filter}</span> filter.
                        </p>
                        <button
                            onClick={() => setFilter('all')}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
                        >
                            Show all archetypes
                        </button>
                    </div>
                ) : (
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
                )}
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
                            {/* SUB-ARCHETYPE SELECTOR + EXPORT */}
                            <div className="flex justify-center items-center gap-4 -mb-8">
                                {hasAlternative && (
                                    <div className="flex p-1 bg-slate-900/60 rounded-xl border border-slate-800/40 backdrop-blur-sm">
                                        <button
                                            onClick={() => { haptics.selection(); setIsAlt(false); }}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${!isAlt ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Main Deck
                                        </button>
                                        <button
                                            onClick={() => { haptics.selection(); setIsAlt(true); }}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isAlt ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Alternative
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={handleCopyDeck}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${copied
                                        ? 'bg-emerald-600 border-emerald-400 text-white'
                                        : 'bg-slate-900/60 border-slate-800/40 text-slate-400 hover:text-white hover:border-slate-600'
                                        }`}
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                    {copied ? 'Copied!' : 'Export MTGA'}
                                </button>
                            </div>

                            {/* 1. CREATURES */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-[9px] font-bold text-emerald-500/60 tracking-wider uppercase">CREATURES</div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {cmcRange.map((num) => (
                                        <CmcStack key={`c-${num}`} cmc={num} cards={skeleton.deck_list.filter(c => c.cmc === num && (c.type?.includes('Creature') || c.type?.includes('Planeswalker')))} onCardSelect={onCardSelect} />
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
                                        <CmcStack key={`nc-${num}`} cmc={num} cards={skeleton.deck_list.filter(c => c.cmc === num && (!c.type?.includes('Creature') && !c.type?.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ARCHETYPE INSIGHTS SECTION */}
                        <div className="space-y-8 px-2 md:px-0 pt-8 border-t border-slate-800/50">
                            <div className="flex items-center gap-6">
                                <div className="px-4 py-1.5 rounded-full bg-purple-500/5 border border-purple-500/20 text-[9px] font-bold text-purple-500/60 tracking-wider uppercase">Archetype Insights</div>
                                <div className="h-px bg-slate-900/60 flex-1" />
                            </div>

                            {/* Openness Score + Sleepers + Trending Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                                {/* Openness Score */}
                                <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-5 rounded-2xl">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Sparkles size={14} className="text-purple-400" />
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Archetype Flexibility</h4>
                                        <Tooltip content={<div className="text-center max-w-[200px]"><div className="font-semibold">How many different cards work in this archetype?</div><div className="text-slate-400 mt-1">Low = must draft specific cards. High = many viable options, easier to pivot.</div></div>}>
                                            <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-4xl font-black text-white">{skeleton.openness_score ?? '--'}</div>
                                        <div className="flex-1">
                                            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${skeleton.openness_score ?? 0}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[8px] text-slate-600">Narrow</span>
                                                <span className="text-[8px] text-slate-600">Flexible</span>
                                            </div>
                                            <p className="text-[9px] text-slate-500 mt-1">
                                                {(skeleton.openness_score ?? 0) >= 70 ? 'Many paths to victory, easy to pivot into' :
                                                    (skeleton.openness_score ?? 0) >= 40 ? 'Some flex slots, moderate adaptability' :
                                                        'Requires specific cards, harder to draft'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Sleeper Cards */}
                                <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-5 rounded-2xl">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Eye size={14} className="text-emerald-400" />
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sleeper Cards</h4>
                                        <Tooltip content={<div className="text-center"><div>Drafted late but win often.</div><div className="text-slate-400 mt-1">Undervalued gems to look for.</div></div>}>
                                            <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                        </Tooltip>
                                    </div>
                                    {skeleton.sleeper_cards && skeleton.sleeper_cards.length > 0 ? (
                                        <div className="space-y-2">
                                            {skeleton.sleeper_cards.slice(0, 3).map((card, idx) => (
                                                <button
                                                    key={card.name}
                                                    onClick={() => onCardSelect({ name: card.name, cmc: 0, type: '', cost: '', rarity: '' })}
                                                    className="w-full flex items-center gap-3 group hover:bg-slate-800/30 rounded-lg p-1 -m-1 transition-colors"
                                                >
                                                    <span className="text-[10px] font-bold text-slate-600 w-4">{idx + 1}</span>
                                                    <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 ring-1 ring-white/10 group-hover:ring-emerald-500/30 transition-all">
                                                        <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{card.name}</p>
                                                        <p className="text-[9px] text-slate-500">ALSA {card.alsa} · {card.frequency}% freq</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-600 italic">No sleeper cards detected</p>
                                    )}
                                </div>

                                {/* Trending Cards */}
                                <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-5 rounded-2xl">
                                    <div className="flex items-center gap-2 mb-4">
                                        <TrendingUp size={14} className="text-orange-400" />
                                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trending Cards</h4>
                                        <Tooltip content={<div className="text-center"><div>Rising in trophy decks this week.</div><div className="text-slate-400 mt-1">Meta is shifting toward these.</div></div>}>
                                            <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                        </Tooltip>
                                    </div>
                                    {skeleton.trending_cards && skeleton.trending_cards.length > 0 ? (
                                        <div className="space-y-2">
                                            {skeleton.trending_cards.slice(0, 3).map((card, idx) => (
                                                <button
                                                    key={card.name}
                                                    onClick={() => onCardSelect({ name: card.name, cmc: 0, type: '', cost: '', rarity: '' })}
                                                    className="w-full flex items-center gap-3 group hover:bg-slate-800/30 rounded-lg p-1 -m-1 transition-colors"
                                                >
                                                    <span className="text-[10px] font-bold text-slate-600 w-4">{idx + 1}</span>
                                                    <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 ring-1 ring-white/10 group-hover:ring-orange-500/30 transition-all">
                                                        <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{card.name}</p>
                                                        <p className="text-[9px] text-emerald-400 font-bold">+{card.delta}% <span className="text-slate-500 font-normal">vs last week</span></p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-600 italic">Not enough data for trends yet</p>
                                    )}
                                </div>
                            </div>

                            {/* Card Importance - Collapsible */}
                            {skeleton.importance_cards && skeleton.importance_cards.length > 0 && (
                                <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 rounded-2xl overflow-hidden">
                                    <button
                                        onClick={() => { haptics.light(); setShowImportance(!showImportance); }}
                                        className="w-full flex items-center justify-between p-5 hover:bg-slate-800/20 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Star size={14} className="text-yellow-400" />
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Card Importance Ranking</h4>
                                            <Tooltip content={<div className="text-center"><div>40% frequency + 30% synergy + 30% WR.</div><div className="text-slate-400 mt-1">WR: normalized (0 to 100) based on deviation (±10%) from format avg.</div></div>}>
                                                <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                            </Tooltip>
                                            <span className="text-[9px] text-slate-600 ml-2">Top 15 cards</span>
                                        </div>
                                        <ChevronDown size={16} className={`text-slate-500 transition-transform duration-300 ${showImportance ? 'rotate-180' : ''}`} />
                                    </button>

                                    <AnimatePresence>
                                        {showImportance && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {skeleton.importance_cards.map((card, idx) => (
                                                        <button
                                                            key={card.name}
                                                            onClick={() => onCardSelect({ name: card.name, cmc: 0, type: '', cost: '', rarity: '' })}
                                                            className="flex items-center gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800/30 hover:border-indigo-500/30 transition-colors group text-left"
                                                        >
                                                            <div className="relative flex-shrink-0">
                                                                <div className="w-10 h-14 rounded-lg overflow-hidden ring-1 ring-white/10 group-hover:ring-indigo-500/30 transition-all shadow-lg">
                                                                    <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                                                </div>
                                                                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                                                                    <span className="text-[9px] font-black text-slate-400">{idx + 1}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-slate-200 truncate group-hover:text-white transition-colors mb-1.5">{card.name}</p>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                                            style={{ width: `${card.importance * 100}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-indigo-400 w-8">{(card.importance * 100).toFixed(0)}%</span>
                                                                </div>
                                                                <div className="flex gap-2 mt-1">
                                                                    <span className="text-[8px] text-slate-600">
                                                                        <span className="text-blue-400">{card.freq_score ?? 0}</span> freq
                                                                    </span>
                                                                    <span className="text-[8px] text-slate-600">
                                                                        <span className="text-purple-400">{card.synergy_score ?? 0}</span> syn
                                                                    </span>
                                                                    <span className="text-[8px] text-slate-600">
                                                                        <span className="text-emerald-400">{card.wr_score ?? 0}</span> wr
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};

const CmcStack: React.FC<{ cmc: number, cards: SkeletonCard[], onCardSelect: (c: SkeletonCard) => void }> = ({ cmc, cards, onCardSelect }) => {
    const grouped = useMemo(() => {
        return cards.reduce((acc: (SkeletonCard & { count: number })[], card) => {
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
