import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, BarChart3, Clock, TrendingUp, TrendingDown, Eye, Sparkles, ChevronDown, Star, HelpCircle } from 'lucide-react';
import { Tooltip } from '../Common/Tooltip';
import { useSkeletons, ArchetypalSkeleton } from '../../queries/useSkeletons';
import { ManaIcons } from '../Common';
import { haptics } from '../../utils/haptics';
import { extractColors, getCardImage, sortColorsWUBRG } from '../../utils/helpers';
import { CmcStack } from './CmcStack';
import { InsightCardList } from './InsightCardList';
import { DeckTestPanel } from './DeckTestPanel/index';

type SkeletonCard = ArchetypalSkeleton['deck_list'][number];

const getColorCount = (name: string): number => {
    return (name.match(/[WUBRG]/gi) || []).length;
};

interface TrophyDecksProps {
    activeSet: string;
    activeFormat: string;
    onCardSelect: (card: SkeletonCard) => void;
    onFormatChange?: (format: string) => void;
}

type ArchFilter = 'all' | 'mono' | '2 colors' | '3 colors' | '4+ colors';
type DeckViewFilter = 'all' | 'core';

interface ArchSelection {
    archetype: string | null;
    isAlternative: boolean;
}

const ARCHETYPE_TINTS: Record<string, string> = {
    W: '248, 250, 252',
    U: '96, 165, 250',
    B: '192, 132, 252',
    R: '251, 146, 60',
    G: '74, 222, 128',
};

const getArchetypeSurface = (colors: string | null | undefined) => {
    const symbols = sortColorsWUBRG(extractColors(colors ?? '')).split('').filter(Boolean);
    const palette = (symbols.length > 0 ? symbols : ['U']).map((symbol) => ARCHETYPE_TINTS[symbol] || ARCHETYPE_TINTS.U);
    const [primary, secondary = primary] = palette;

    return {
        border: `rgba(${primary}, 0.2)`,
        softBorder: `rgba(${primary}, 0.14)`,
        panel: `linear-gradient(135deg, rgba(${primary}, 0.05), rgba(15, 23, 42, 0) 30%), linear-gradient(115deg, rgba(${secondary}, 0.035), rgba(15, 23, 42, 0) 54%), linear-gradient(180deg, rgba(2, 6, 23, 0.94), rgba(2, 6, 23, 0.98))`,
        glow: `radial-gradient(circle at 0% 50%, rgba(${primary}, 0.045), transparent 52%), radial-gradient(circle at 100% 0%, rgba(${secondary}, 0.035), transparent 28%)`,
        pillBg: `rgba(${primary}, 0.06)`,
        pillBorder: `rgba(${primary}, 0.18)`,
        shadow: `0 18px 34px -34px rgba(${primary}, 0.18)`,
    };
};

export const TrophyDecks: React.FC<TrophyDecksProps> = ({ activeSet, activeFormat, onCardSelect, onFormatChange }) => {
    const { data: skeletons = [], isLoading } = useSkeletons(activeSet, activeFormat);
    const [selection, setSelection] = useState<ArchSelection>({ archetype: null, isAlternative: false });
    const [filter, setFilter] = useState<ArchFilter>('2 colors');
    const [showImportance, setShowImportance] = useState(true);
    const [showMethodology, setShowMethodology] = useState(false);
    const [importanceSort, setImportanceSort] = useState<'importance' | 'freq' | 'synergy' | 'wr'>('importance');
    const [deckViewFilter, setDeckViewFilter] = useState<DeckViewFilter>('all');

    // Aliases pour compatibilité avec le code existant
    const selectedArch = selection.archetype;
    const isAlt = selection.isAlternative;
    const setSelectedArch = (arch: string | null) => setSelection(s => ({ ...s, archetype: arch }));
    const setIsAlt = (alt: boolean) => setSelection(s => ({ ...s, isAlternative: alt }));

    const filteredSkeletons = useMemo(() => {
        let base = [...skeletons];
        // Only show main skeletons with at least 20 trophies
        base = base.filter(s => !s.is_alternative && (s.sample_size || 0) >= 20);

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

    const filteredDeckCards = useMemo(() => {
        if (!skeleton) return [];
        if (deckViewFilter === 'core') {
            return skeleton.deck_list.filter(card => card.is_core === true);
        }
        return skeleton.deck_list;
    }, [skeleton, deckViewFilter]);

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
        if (filteredDeckCards.length === 0) return 5;
        // Find highest CMC in deck_list, but at least 5 for safe aesthetics
        const deckMax = Math.max(...filteredDeckCards.map(c => c.cmc), 0);
        return Math.max(deckMax, 5);
    }, [filteredDeckCards]);

    const cmcRange = useMemo(() => Array.from({ length: maxCmc + 1 }, (_, i) => i), [maxCmc]);

    const colorDistribution = useMemo(() => {
        if (!skeleton) return { W: 0, U: 0, B: 0, R: 0, G: 0, total: 0 };

        const counts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
        let totalNonLand = 0;

        for (const card of skeleton.deck_list) {
            if (card.type?.includes('Land')) continue;
            totalNonLand++;

            const cost = card.cost || '';
            for (const color of ['W', 'U', 'B', 'R', 'G'] as const) {
                // Check normal mana {W} and hybrid mana {W/U}, {2/W}, {W/P}, etc.
                const hasColor = cost.includes(`{${color}}`) ||
                    cost.includes(`{${color}/`) ||
                    cost.includes(`/${color}}`);
                if (hasColor) {
                    counts[color]++;
                }
            }
        }

        return { ...counts, total: totalNonLand };
    }, [skeleton]);

    const selectedAccent = useMemo(
        () => getArchetypeSurface(selectedArch ?? skeleton?.archetype_name ?? 'WU'),
        [selectedArch, skeleton?.archetype_name]
    );

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
                    <DeckTestPanel
                        activeSet={activeSet}
                        activeFormat={activeFormat}
                        onFormatChange={onFormatChange}
                        onMatchedArchetype={(archetypeName, _format, isAlternative) => {
                            setFilter('all');
                            setIsAlt(isAlternative);
                            setSelectedArch(archetypeName);
                        }}
                        className="inline-flex items-center gap-2 px-3 rounded-xl bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 text-indigo-200 text-[10px] font-bold uppercase tracking-widest transition-all"
                    />
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
                                        <li>• <strong className="text-slate-200">Core Cards:</strong> 15 highest-frequency pillars define the archetype core.</li>
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
                                className={`group relative isolate flex flex-col items-center justify-center overflow-hidden rounded-xl md:rounded-2xl border p-2.5 md:p-5 transition-all duration-300 ${selectedArch === s.archetype_name
                                    ? 'scale-105 z-10'
                                    : 'hover:bg-slate-800'
                                    }`}
                                style={(() => {
                                    const accent = getArchetypeSurface(s.archetype_name);
                                    return selectedArch === s.archetype_name
                                        ? {
                                            borderColor: accent.border,
                                            backgroundImage: accent.panel,
                                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), ${accent.shadow}`,
                                        }
                                        : {
                                            borderColor: accent.softBorder,
                                            backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.52), rgba(2,6,23,0.9))`,
                                        };
                                })()}
                            >
                                {(() => {
                                    const accent = getArchetypeSurface(s.archetype_name);
                                    return (
                                        <>
                                            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-60" style={{ backgroundImage: accent.glow }} />
                                            {selectedArch === s.archetype_name && (
                                                <div className="absolute inset-0 opacity-45" style={{ backgroundImage: accent.glow }} />
                                            )}
                                            <div className="absolute inset-x-4 top-0 h-px opacity-70" style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0))' }} />
                                        </>
                                    );
                                })()}
                                <div className="relative z-10 flex flex-col items-center justify-center">
                                <ManaIcons colors={s.archetype_name} size="md" />
                                <span className={`text-[9px] md:text-[11px] font-bold mt-2 tracking-wider uppercase ${selectedArch === s.archetype_name ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                    {s.archetype_name}
                                </span>
                                </div>
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
                            <div
                                className="relative overflow-hidden rounded-[2.5rem] border p-6 backdrop-blur-xl"
                                style={{
                                    borderColor: selectedAccent.softBorder,
                                    backgroundImage: selectedAccent.panel,
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${selectedAccent.shadow}`,
                                }}
                            >
                                <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: selectedAccent.glow }} />
                                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-white/15 to-transparent" />
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="relative text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                        <BarChart3 size={14} className="text-indigo-400/80" />
                                        Spell Curve {skeleton.sample_size ? <span className="text-slate-500 lowercase font-medium tracking-normal text-[11px] ml-1">(based on {skeleton.sample_size} trophies)</span> : ''}
                                    </h3>
                                    <div
                                        className="relative flex items-center gap-2 px-3 py-1 bg-slate-950/40 rounded-full border"
                                        style={{ borderColor: selectedAccent.pillBorder, backgroundColor: selectedAccent.pillBg }}
                                    >
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
                            <div
                                className="relative overflow-hidden rounded-[2.5rem] border p-6 backdrop-blur-xl"
                                style={{
                                    borderColor: selectedAccent.softBorder,
                                    backgroundImage: selectedAccent.panel,
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${selectedAccent.shadow}`,
                                }}
                            >
                                <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: selectedAccent.glow }} />
                                <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-white/15 to-transparent" />
                                <div className="flex items-center mb-8 min-h-[28px]">
                                    <h3 className="relative text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                        <Users size={14} className="text-emerald-500/80" />
                                        Composition & Mana Base
                                    </h3>
                                </div>
                                <div className="relative grid grid-cols-3 gap-2 h-[100px]">
                                    {/* Creatures / Spells Ratio */}
                                    <div
                                        className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border"
                                        style={{ borderColor: selectedAccent.pillBorder }}
                                    >
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl lg:text-4xl font-black text-emerald-400 tracking-tighter">{(skeleton.creature_ratio * 100).toFixed(0)}</span>
                                            <span className="text-xl text-slate-600 font-bold">/</span>
                                            <span className="text-3xl lg:text-4xl font-black text-indigo-400 tracking-tighter">{(100 - skeleton.creature_ratio * 100).toFixed(0)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[8px] font-bold text-emerald-400/80 uppercase">Crea</span>
                                            <span className="text-[8px] font-bold text-indigo-300/80 uppercase">Spells</span>
                                        </div>
                                    </div>
                                    {/* Lands */}
                                    <div
                                        className="flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-[1.5rem] border"
                                        style={{ borderColor: selectedAccent.pillBorder }}
                                    >
                                        <span className="text-3xl lg:text-4xl font-black text-white tracking-tighter">{skeleton.avg_lands}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 text-center whitespace-nowrap">LANDS</span>
                                    </div>
                                    {/* Color Distribution - Only show active colors */}
                                    <div
                                        className="flex flex-col items-center justify-center p-2 bg-slate-950/40 rounded-[1.5rem] border"
                                        style={{ borderColor: selectedAccent.pillBorder }}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {(['W', 'U', 'B', 'R', 'G'] as const)
                                                .filter(color => colorDistribution[color] > 0)
                                                .map(color => (
                                                    <div key={color} className="flex flex-col items-center">
                                                        <div className="relative">
                                                            <img
                                                                src={`https://svgs.scryfall.io/card-symbols/${color}.svg`}
                                                                alt={color}
                                                                className="w-7 h-7 lg:w-8 lg:h-8 drop-shadow-lg"
                                                            />
                                                            <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-[9px] font-black px-1 rounded-full border border-slate-700 min-w-[16px] text-center">
                                                                {colorDistribution[color]}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase mt-2">Cards by Color</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ULTRA-COMPACT DECK GRID */}
                        <div className="space-y-12 px-2 md:px-0">
                            {/* SUB-ARCHETYPE SELECTOR */}
                            <div className="flex flex-wrap justify-center items-center gap-3 -mb-8">
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
                                <div className="flex p-1 bg-slate-900/60 rounded-xl border border-slate-800/40 backdrop-blur-sm">
                                    <button
                                        onClick={() => { haptics.selection(); setDeckViewFilter('all'); }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${deckViewFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Full Deck
                                    </button>
                                    <button
                                        onClick={() => { haptics.selection(); setDeckViewFilter('core'); }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${deckViewFilter === 'core' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Core Cards Only
                                    </button>
                                </div>
                            </div>
                            {deckViewFilter === 'core' && filteredDeckCards.length === 0 && (
                                <p className="text-center text-[11px] text-amber-300/80 -mt-6">
                                    No core cards available for this skeleton yet.
                                </p>
                            )}

                            {/* 1. CREATURES */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[9px] font-bold text-emerald-300 tracking-wider uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_24px_-22px_rgba(16,185,129,0.45)]">
                                        CREATURES
                                    </div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {cmcRange.map((num) => (
                                        <CmcStack key={`c-${num}`} cmc={num} cards={filteredDeckCards.filter(c => c.cmc === num && (c.type?.includes('Creature') || c.type?.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>

                            {/* 2. NON-CREATURES & LANDS */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-[9px] font-bold text-indigo-200 tracking-wider uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_24px_-22px_rgba(99,102,241,0.4)]">
                                        NON-CREATURES & LANDS
                                    </div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>
                                <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-3">
                                    {cmcRange.map((num) => (
                                        <CmcStack key={`nc-${num}`} cmc={num} cards={filteredDeckCards.filter(c => c.cmc === num && (!c.type?.includes('Creature') && !c.type?.includes('Planeswalker')))} onCardSelect={onCardSelect} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ARCHETYPE INSIGHTS SECTION */}
                        <div className="space-y-8 px-2 md:px-0 pt-8 border-t border-slate-800/50">
                                <div className="flex items-center gap-6">
                                    <div
                                        className="px-4 py-1.5 rounded-full text-[9px] font-bold tracking-wider uppercase"
                                        style={{ backgroundColor: selectedAccent.pillBg, border: `1px solid ${selectedAccent.pillBorder}`, color: 'rgb(196 181 253)' }}
                                    >
                                        Archetype Insights
                                    </div>
                                    <div className="h-px bg-slate-900/60 flex-1" />
                                </div>

                            {/* Openness Score + Sleepers + Trending + Declining Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">
                                {/* Openness Score */}
                                <div
                                    className="relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl"
                                    style={{
                                        borderColor: selectedAccent.softBorder,
                                        backgroundImage: selectedAccent.panel,
                                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${selectedAccent.shadow}`,
                                    }}
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: selectedAccent.glow }} />
                                    <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-white/15 to-transparent" />
                                    <div className="relative flex items-center gap-2 mb-4">
                                        <Sparkles size={14} className="text-purple-400" />
                                        <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Archetype Flexibility</h4>
                                        <Tooltip content={<div className="text-center max-w-[220px]"><div className="font-semibold">{skeleton.openness_cards ?? '?'} different cards cover 80% of slots</div><div className="text-slate-400 mt-1">More cards = more flexibility. Fewer = must draft specific cards.</div></div>}>
                                            <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                        </Tooltip>
                                    </div>
                                    <div className="relative flex items-center gap-4">
                                        <div className="text-4xl font-black text-white">{skeleton.openness_cards ?? '--'}</div>
                                        <div className="flex-1">
                                            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${skeleton.openness_score ?? 0}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[8px] text-slate-500">Narrow</span>
                                                <span className="text-[8px] text-slate-500">Flexible</span>
                                            </div>
                                            <p className="text-[9px] text-slate-400 mt-1">
                                                {(skeleton.openness_cards ?? 0) >= 55 ? 'Many viable cards, easy to pivot' :
                                                    (skeleton.openness_cards ?? 0) >= 40 ? 'Moderate flexibility' :
                                                        'Requires specific cards'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Sleeper Cards */}
                                <InsightCardList
                                    title="Sleeper Cards"
                                    icon={Eye}
                                    iconColor="text-emerald-400"
                                    hoverRingColor="group-hover:ring-emerald-500/30"
                                    tooltipContent={<div className="text-center"><div>Drafted late but win often.</div><div className="text-slate-400 mt-1">Undervalued gems to look for.</div></div>}
                                    cards={skeleton.sleeper_cards}
                                    emptyMessage="No sleeper cards detected"
                                    onCardSelect={onCardSelect}
                                    renderSubtext={(card) => (
                                        <p className="text-[9px] text-slate-500">ALSA {card.alsa} · {card.frequency}% freq</p>
                                    )}
                                    surface={{
                                        borderColor: selectedAccent.softBorder,
                                        backgroundImage: selectedAccent.panel,
                                        glow: selectedAccent.glow,
                                        shadow: selectedAccent.shadow,
                                    }}
                                />

                                {/* Trending Cards */}
                                <InsightCardList
                                    title="Trending Cards"
                                    icon={TrendingUp}
                                    iconColor="text-orange-400"
                                    hoverRingColor="group-hover:ring-orange-500/30"
                                    tooltipContent={<div className="text-center"><div>Rising in trophy decks this week.</div><div className="text-slate-400 mt-1">Meta is shifting toward these.</div></div>}
                                    cards={skeleton.trending_cards}
                                    emptyMessage="Not enough data for trends yet"
                                    onCardSelect={onCardSelect}
                                    renderSubtext={(card) => (
                                        <p className="text-[9px] text-emerald-400 font-bold">+{card.delta}% <span className="text-slate-500 font-normal">vs last week</span></p>
                                    )}
                                    surface={{
                                        borderColor: selectedAccent.softBorder,
                                        backgroundImage: selectedAccent.panel,
                                        glow: selectedAccent.glow,
                                        shadow: selectedAccent.shadow,
                                    }}
                                />

                                {/* Declining Cards */}
                                <InsightCardList
                                    title="Declining Cards"
                                    icon={TrendingDown}
                                    iconColor="text-red-400"
                                    hoverRingColor="group-hover:ring-red-500/30"
                                    tooltipContent={<div className="text-center"><div>Falling out of trophy decks.</div><div className="text-slate-400 mt-1">Meta moving away, or ALSA rising (picked earlier).</div></div>}
                                    cards={skeleton.declining_cards}
                                    emptyMessage="Not enough data for trends yet"
                                    onCardSelect={onCardSelect}
                                    renderSubtext={(card) => (
                                        <p className="text-[9px] text-red-400 font-bold">{card.delta}% <span className="text-slate-500 font-normal">vs last week</span></p>
                                    )}
                                    surface={{
                                        borderColor: selectedAccent.softBorder,
                                        backgroundImage: selectedAccent.panel,
                                        glow: selectedAccent.glow,
                                        shadow: selectedAccent.shadow,
                                    }}
                                />
                            </div>

                            {/* Card Importance - Collapsible */}
                            {skeleton.importance_cards && skeleton.importance_cards.length > 0 && (
                                <div
                                    className="relative overflow-hidden rounded-2xl border backdrop-blur-xl"
                                    style={{
                                        borderColor: selectedAccent.softBorder,
                                        backgroundImage: selectedAccent.panel,
                                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${selectedAccent.shadow}`,
                                    }}
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-28" style={{ backgroundImage: selectedAccent.glow }} />
                                    <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-white/15 to-transparent" />
                                    <button
                                        onClick={() => { haptics.light(); setShowImportance(!showImportance); }}
                                        className="relative z-10 w-full flex items-center justify-between p-5 hover:bg-slate-800/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Star size={14} className="text-yellow-400" />
                                            <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Card Importance Ranking</h4>
                                            <Tooltip content={<div className="text-center"><div>Score = Frequency + Synergy + WR</div><div className="text-slate-400 mt-1">Synergy: avg with skeleton cards. WR: normalized (0-100) based on ±10% from format avg.</div></div>}>
                                                <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                                            </Tooltip>
                                            <span className="text-[9px] text-slate-500 ml-2">Top 25 cards</span>
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
                                                <div className="relative z-10 px-5 pb-3 overflow-x-auto scrollbar-hide">
                                                    <div className="flex items-center gap-1.5 whitespace-nowrap min-w-max">
                                                        <span className="hidden sm:inline text-[9px] text-slate-600 uppercase tracking-wider">Sort by:</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); haptics.selection(); setImportanceSort('importance'); }}
                                                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${importanceSort === 'importance'
                                                            ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30'
                                                            : 'text-slate-500 hover:text-slate-300'
                                                            }`}
                                                    >
                                                        Overall
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); haptics.selection(); setImportanceSort('freq'); }}
                                                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${importanceSort === 'freq'
                                                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                                                            : 'text-slate-500 hover:text-slate-300'
                                                            }`}
                                                    >
                                                        Frequency
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); haptics.selection(); setImportanceSort('synergy'); }}
                                                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${importanceSort === 'synergy'
                                                            ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/30'
                                                            : 'text-slate-500 hover:text-slate-300'
                                                            }`}
                                                    >
                                                        Synergy
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); haptics.selection(); setImportanceSort('wr'); }}
                                                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${importanceSort === 'wr'
                                                            ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                                                            : 'text-slate-500 hover:text-slate-300'
                                                            }`}
                                                    >
                                                        Win Rate
                                                    </button>
                                                    </div>
                                                </div>
                                                <div className="relative z-10 px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {(() => {
                                                        const sorted = [...skeleton.importance_cards].sort((a, b) => {
                                                            switch (importanceSort) {
                                                                case 'freq': return (b.frequency ?? 0) - (a.frequency ?? 0);
                                                                case 'synergy': return (b.synergy_score ?? 0) - (a.synergy_score ?? 0);
                                                                case 'wr': return (b.wr_score ?? 0) - (a.wr_score ?? 0);
                                                                default: return b.importance - a.importance;
                                                            }
                                                        });

                                                        const maxImportance = sorted[0]?.importance ?? 1;
                                                        return sorted.map((card, idx) => (
                                                            <button
                                                                key={card.name}
                                                                onClick={() => onCardSelect({ name: card.name, cmc: 0, type: '', cost: '', rarity: '' })}
                                                                className="group flex items-center gap-3 p-3 rounded-xl border transition-colors text-left"
                                                                style={{
                                                                    borderColor: selectedAccent.pillBorder,
                                                                    backgroundImage: 'linear-gradient(180deg, rgba(2,6,23,0.72), rgba(2,6,23,0.92))',
                                                                }}
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
                                                                    <div className="flex items-center gap-2 mb-1.5">
                                                                        <p className="text-xs font-bold text-slate-200 truncate group-hover:text-white transition-colors">{card.name}</p>
                                                                        {card.is_core && (
                                                                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/25 text-[7px] font-bold tracking-wide text-amber-200/85 uppercase">
                                                                                Core
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                                                style={{ width: `${(card.importance / maxImportance) * 100}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className="text-[10px] font-black text-indigo-300 w-10">{Math.round(card.importance)}</span>
                                                                    </div>
                                                                    <div className="flex gap-3 mt-1">
                                                                        <span className="text-[10px] text-slate-500">
                                                                            <span className="text-blue-400 font-semibold">{card.freq_score ?? 0}</span> freq
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-500">
                                                                            <span className="text-purple-400 font-semibold">{card.synergy_score ?? 0}</span> syn
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-500">
                                                                            <span className="text-emerald-400 font-semibold">{card.wr_score ?? 0}</span> wr
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ));
                                                    })()}
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
