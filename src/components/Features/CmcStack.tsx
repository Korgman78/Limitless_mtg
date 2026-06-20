import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getCardImage } from '../../utils/helpers';

export type SkeletonCard = {
    name: string;
    cmc: number;
    type: string;
    cost: string;
    rarity: string;
    is_core?: boolean;
};

interface CmcStackProps {
    cmc: number;
    cards: SkeletonCard[];
    onCardSelect: (card: SkeletonCard) => void;
    stackOverlap?: string;
    /** Libellé d'en-tête optionnel (par défaut = cmc). Ex: "Lands". */
    label?: React.ReactNode;
}

export const CmcStack: React.FC<CmcStackProps> = ({ cmc, cards, onCardSelect, stackOverlap = '-135%', label }) => {
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
        <div className="flex flex-col w-[46%] md:flex-1 md:min-w-0 group/stack transition-all hover:z-[100] px-0.5 md:px-1">
            <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[16px] font-bold text-white/80">{label ?? cmc}</span>
                <span className="text-[10px] font-bold text-slate-600">({cards.length})</span>
            </div>

            <div className="relative isolate">
                {grouped.map((card, idx) => (
                    <motion.div
                        key={`${card.name}-${idx}`}
                        className="relative"
                        style={{
                            marginTop: idx === 0 ? 0 : stackOverlap,
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
                            className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-slate-700/40 bg-slate-900 group"
                        >
                            <img
                                src={getCardImage(card.name)}
                                alt={card.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />

                            {card.count > 1 && (
                                <div className="absolute top-1 right-1 bg-indigo-600 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shadow-lg border border-indigo-300/40 z-[60]">
                                    {card.count}
                                </div>
                            )}

                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
