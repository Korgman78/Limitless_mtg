import React from 'react';
import { LucideIcon, HelpCircle } from 'lucide-react';
import { Tooltip } from '../Common/Tooltip';
import { getCardImage } from '../../utils/helpers';

interface InsightCard {
    name: string;
    // For sleepers
    alsa?: number;
    frequency?: number;
    // For trending/declining
    delta?: number;
}

interface InsightCardListProps {
    title: string;
    icon: LucideIcon;
    iconColor: string;
    hoverRingColor: string;
    tooltipContent: React.ReactNode;
    cards: InsightCard[] | undefined;
    emptyMessage: string;
    onCardSelect: (card: { name: string; cmc: number; type: string; cost: string; rarity: string }) => void;
    renderSubtext: (card: InsightCard) => React.ReactNode;
}

export const InsightCardList: React.FC<InsightCardListProps> = ({
    title,
    icon: Icon,
    iconColor,
    hoverRingColor,
    tooltipContent,
    cards,
    emptyMessage,
    onCardSelect,
    renderSubtext,
}) => {
    return (
        <div className="bg-slate-900/30 backdrop-blur-xl border border-slate-800/40 p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
                <Icon size={14} className={iconColor} />
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</h4>
                <Tooltip content={tooltipContent}>
                    <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                </Tooltip>
            </div>
            {cards && cards.length > 0 ? (
                <div className="space-y-2">
                    {cards.slice(0, 3).map((card, idx) => (
                        <button
                            key={card.name}
                            onClick={() => onCardSelect({ name: card.name, cmc: 0, type: '', cost: '', rarity: '' })}
                            className="w-full flex items-center gap-3 group hover:bg-slate-800/30 rounded-lg p-1 -m-1 transition-colors"
                        >
                            <span className="text-[10px] font-bold text-slate-600 w-4">{idx + 1}</span>
                            <div className={`w-8 h-11 rounded overflow-hidden flex-shrink-0 ring-1 ring-white/10 ${hoverRingColor} transition-all`}>
                                <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{card.name}</p>
                                {renderSubtext(card)}
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="text-[10px] text-slate-600 italic">{emptyMessage}</p>
            )}
        </div>
    );
};
