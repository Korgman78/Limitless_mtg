import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card } from '../../types';
import { getCardImage } from '../../utils/helpers';

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  cards: Card[];
  onSelectCard?: (card: Card) => void;
  placeholder?: string;
}

export const SearchAutocomplete: React.FC<SearchAutocompleteProps> = ({
  value,
  onChange,
  cards,
  onSelectCard,
  placeholder = 'Search card...',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!value.trim() || value.length < 2) return [];

    const normalizedSearch = value.toLowerCase().trim();
    return cards
      .filter(card => card.name.toLowerCase().includes(normalizedSearch))
      .slice(0, 8); // Limit to 8 suggestions
  }, [value, cards]);

  const showSuggestions = isFocused && suggestions.length > 0;

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && suggestions[highlightIndex]) {
          handleSelectSuggestion(suggestions[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsFocused(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectSuggestion = (card: Card) => {
    onChange(card.name);
    setIsFocused(false);
    if (onSelectCard) {
      onSelectCard(card);
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => setIsFocused(false), 150);
        }}
        onKeyDown={handleKeyDown}
        className="w-full bg-slate-900 border border-slate-700 text-slate-300 py-2 pl-8 pr-8 rounded-lg text-xs font-bold focus:border-indigo-500 focus:outline-none"
      />
      <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500 pointer-events-none" />

      {/* Clear button */}
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1.5 p-1 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={12} />
        </button>
      )}

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            ref={listRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto"
          >
            {suggestions.map((card, index) => (
              <button
                key={card.id}
                onClick={() => handleSelectSuggestion(card)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  index === highlightIndex
                    ? 'bg-indigo-600/30 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <img
                  src={getCardImage(card.name)}
                  alt=""
                  className="w-8 h-11 rounded object-cover bg-slate-800 flex-shrink-0"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{card.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {card.gih_wr?.toFixed(1)}% WR
                  </div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
