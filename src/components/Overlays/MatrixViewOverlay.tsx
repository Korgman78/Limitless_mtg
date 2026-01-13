import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Grid3X3, Search, Palette, Diamond } from 'lucide-react';
import type { Card } from '../../types';
import { RARITY_STYLES } from '../../constants';
import { normalizeRarity, getDeltaStyle, extractColors, getCardImage } from '../../utils/helpers';
import { Tooltip } from '../Common/Tooltip';
import { useDebounce } from '../../hooks/useDebounce';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MatrixViewOverlayProps {
  cards: Card[];
  activeFormat: string;
  archetypeFilter: string;
  globalMeanWR: number;
  onClose: () => void;
  onCardSelect?: (card: Card) => void;
}

// Mapping des couleurs MTG vers des couleurs CSS
const getManaColor = (colors: string | string[] | null | undefined): string => {
  const colorStr = Array.isArray(colors) ? colors.join('') : colors;
  const colorArr = extractColors(colorStr);
  if (!colorArr || colorArr.length === 0) return 'bg-slate-400'; // Colorless
  if (colorArr.length > 1) return 'bg-amber-500'; // Multicolor (gold)
  const c = colorArr[0].toUpperCase();
  switch (c) {
    case 'W': return 'bg-yellow-100';
    case 'U': return 'bg-blue-500';
    case 'B': return 'bg-violet-900';
    case 'R': return 'bg-red-500';
    case 'G': return 'bg-green-500';
    default: return 'bg-slate-400';
  }
};

// Mapping des raretés vers des couleurs CSS
const getRarityColor = (rarity: string): string => {
  const r = normalizeRarity(rarity);
  switch (r) {
    case 'M': return 'bg-orange-500'; // Mythic
    case 'R': return 'bg-amber-400'; // Rare
    case 'U': return 'bg-slate-300'; // Uncommon
    case 'C': return 'bg-slate-500'; // Common
    default: return 'bg-slate-400';
  }
};

export const MatrixViewOverlay: React.FC<MatrixViewOverlayProps> = ({
  cards,
  activeFormat,
  archetypeFilter,
  globalMeanWR,
  onClose,
  onCardSelect,
}) => {
  // Filters state
  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [colorFilters, setColorFilters] = useState<string[]>([]);

  // Color mode: 'mana' or 'rarity'
  const [colorMode, setColorMode] = useState<'mana' | 'rarity'>('mana');

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);

  // Hovered card for desktop panel
  const [hoveredCard, setHoveredCard] = useState<{ card: Card; x: number; y: number } | null>(null);

  // Mobile detection
  const isMobile = useIsMobile(768);

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ initialDistance: number; initialScale: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const isDragging = useRef(false);

  // Detect if format has ALSA (Draft vs Sealed)
  const isDraft = !activeFormat.toLowerCase().includes('sealed');

  // Filter cards based on rarity and color
  const filteredCards = useMemo(() => {
    let result = [...cards].filter(c => c.gih_wr !== null && c.gih_wr !== undefined);

    if (rarityFilter.length > 0) {
      result = result.filter(c => rarityFilter.includes(normalizeRarity(c.rarity)));
    }

    if (colorFilters.length > 0) {
      result = result.filter(c => {
        const cColors = extractColors(c.colors);
        if (colorFilters.includes('M') && cColors.length > 1) return true;
        if (colorFilters.includes('C') && cColors.length === 0) return true;
        const monoFilters = colorFilters.filter(f => ['W', 'U', 'B', 'R', 'G'].includes(f));
        if (monoFilters.length > 0) {
          for (const f of monoFilters) {
            if (cColors.includes(f)) return true;
          }
        }
        return false;
      });
    }

    return result;
  }, [cards, rarityFilter, colorFilters]);

  // Compute format stats from ALL cards (not filtered) - these are fixed reference points
  const formatStats = useMemo(() => {
    const allValidCards = cards.filter(c => c.gih_wr !== null && c.gih_wr !== undefined);
    const validWRs = allValidCards.map(c => c.gih_wr!).sort((a, b) => a - b);
    const validALSAs = allValidCards.filter(c => c.alsa != null).map(c => c.alsa!).sort((a, b) => a - b);

    const minWR = validWRs[0] ?? 45;
    const maxWR = validWRs[validWRs.length - 1] ?? 70;

    // Use globalMeanWR prop (format average) instead of recalculating
    const avgWR = globalMeanWR;

    // ALSA average from ALL cards
    const avgALSA = validALSAs.length > 0
      ? validALSAs.reduce((sum, a) => sum + a, 0) / validALSAs.length
      : 4.5;

    return { avgWR, minWR, maxWR, avgALSA };
  }, [cards, globalMeanWR]);

  // Matrix bounds
  const minALSA = 1.25;
  const maxALSA = 8.75;
  const displayMinWR = isDraft ? formatStats.minWR - 1 : formatStats.avgWR - 8;
  const displayMaxWR = isDraft ? formatStats.maxWR + 1 : formatStats.avgWR + 12;

  // Compute dot positions
  const cardDots = useMemo(() => {
    const getYPosition = (wr: number) => {
      const clampedWR = Math.max(displayMinWR, Math.min(displayMaxWR, wr));
      const y = 100 - ((clampedWR - displayMinWR) / (displayMaxWR - displayMinWR)) * 100;
      return Math.max(2, Math.min(98, y));
    };

    const searchLower = debouncedSearch.toLowerCase().trim();

    return filteredCards.map(c => ({
      card: c,
      name: c.name,
      wr: c.gih_wr!,
      alsa: c.alsa ?? null,
      x: isDraft && c.alsa
        ? ((Math.max(minALSA, Math.min(maxALSA, c.alsa)) - minALSA) / (maxALSA - minALSA)) * 100
        : 10 + Math.random() * 80, // Spread horizontally for Sealed
      y: getYPosition(c.gih_wr!),
      colorClass: colorMode === 'mana' ? getManaColor(c.colors) : getRarityColor(c.rarity),
      rarity: normalizeRarity(c.rarity),
      isMatch: searchLower ? c.name.toLowerCase().includes(searchLower) : false,
    }));
  }, [filteredCards, isDraft, displayMinWR, displayMaxWR, minALSA, maxALSA, colorMode, debouncedSearch]);

  // Count search matches
  const matchCount = useMemo(() => {
    if (!debouncedSearch.trim()) return 0;
    return cardDots.filter(d => d.isMatch).length;
  }, [cardDots, debouncedSearch]);

  // Zoom/pan handlers
  const limitPan = useCallback((x: number, y: number, currentScale: number) => {
    const maxPan = (currentScale - 1) * 50;
    return {
      x: Math.min(maxPan, Math.max(-maxPan, x)),
      y: Math.min(maxPan, Math.max(-maxPan, y)),
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => {
      const newScale = Math.min(4, Math.max(1, prev + delta));
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return newScale;
    });
  }, []);

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDragging.current = true;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newPos = limitPan(dragRef.current.initialX + dx / 2, dragRef.current.initialY + dy / 2, scale);
    setPosition(newPos);
  }, [scale, limitPan]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    dragRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        initialDistance: getTouchDistance(e.touches),
        initialScale: scale,
      };
      isDragging.current = false;
    } else if (e.touches.length === 1 && scale > 1) {
      isDragging.current = true;
      dragRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        initialX: position.x,
        initialY: position.y,
      };
    }
  }, [scale, position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const currentDistance = getTouchDistance(e.touches);
      const scaleChange = currentDistance / pinchRef.current.initialDistance;
      const newScale = Math.min(4, Math.max(1, pinchRef.current.initialScale * scaleChange));
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging.current && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      const newPos = limitPan(dragRef.current.initialX + dx / 2, dragRef.current.initialY + dy / 2, scale);
      setPosition(newPos);
    }
  }, [scale, limitPan]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    isDragging.current = false;
    dragRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const yAvg = 100 - ((formatStats.avgWR - displayMinWR) / (displayMaxWR - displayMinWR)) * 100;
  const xAvg = ((formatStats.avgALSA - minALSA) / (maxALSA - minALSA)) * 100;

  // For Sealed: calculate Y positions for tier thresholds
  const sealedTiers = useMemo(() => {
    if (isDraft) return null;

    const wrRange = displayMaxWR - displayMinWR;
    const pctPerPoint = 100 / wrRange;

    // Calculate Y position for a given delta from average
    const getY = (delta: number) => Math.max(0, Math.min(100, yAvg - (delta * pctPerPoint)));

    return {
      y9: getY(9),   // BOMB threshold (+9)
      y7: getY(7),   // TOP TIER threshold (+7)
      y5: getY(5),   // VERY GOOD threshold (+5)
      y3: getY(3),   // GOOD threshold (+3)
      y1: getY(1),   // SOLID PLAYABLE top (+1)
      yM1: getY(-1), // PLAYABLE bottom (-1)
      yM3: getY(-3), // FILLER threshold (-3)
      yM5: getY(-5), // CHAFF threshold (-5)
    };
  }, [isDraft, displayMaxWR, displayMinWR, yAvg]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Grid3X3 className="text-indigo-400" size={24} />
          <div>
            <h2 className="text-lg font-black text-white">Matrix View</h2>
            <p className="text-xs text-slate-500">
              {activeFormat} • {archetypeFilter === 'Global' ? 'Global' : archetypeFilter} • {filteredCards.length} cards
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 p-3 border-b border-slate-800 bg-slate-900/50">
        {/* Line 1: Colors + Search (mobile) / All inline (desktop) */}
        <div className="flex items-center gap-2">
          {/* Colors */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-full border border-slate-800">
            {['W', 'U', 'B', 'R', 'G'].map(c => (
              <button
                key={c}
                onClick={() => setColorFilters(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${colorFilters.includes(c) ? 'scale-110 shadow-md z-10' : 'opacity-60 hover:opacity-100 grayscale'}`}
                style={{ borderColor: colorFilters.includes(c) ? 'white' : 'transparent' }}
              >
                <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="w-full h-full" />
              </button>
            ))}
            <div className="w-[1px] h-4 bg-slate-700 mx-1" />
            <button
              onClick={() => setColorFilters(prev => prev.includes('M') ? prev.filter(x => x !== 'M') : [...prev, 'M'])}
              className={`w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 border flex items-center justify-center text-[8px] font-black text-white shadow-sm transition-all ${colorFilters.includes('M') ? 'border-white scale-110' : 'border-transparent opacity-60 grayscale'}`}
            >M</button>
            <button
              onClick={() => setColorFilters(prev => prev.includes('C') ? prev.filter(x => x !== 'C') : [...prev, 'C'])}
              className={`w-6 h-6 rounded-full bg-slate-400 border flex items-center justify-center text-[8px] font-black text-slate-900 shadow-sm transition-all ${colorFilters.includes('C') ? 'border-white scale-110' : 'border-transparent opacity-60'}`}
            >C</button>
          </div>

          {/* Search - on same line on mobile, after separator on desktop */}
          <div className="md:hidden relative flex items-center flex-1">
            <Search size={12} className="absolute left-2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Find..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs py-1.5 pl-7 pr-7 rounded-lg focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 text-slate-500 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {matchCount > 0 && <span className="md:hidden text-[10px] text-indigo-400 font-bold">{matchCount}</span>}

          <div className="hidden md:block w-[1px] h-6 bg-slate-700" />

          {/* Rarities - desktop inline */}
          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
            {['M', 'R', 'U', 'C'].map(r => {
              const isActive = rarityFilter.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => setRarityFilter(prev => prev.includes(r) ? prev.filter(item => item !== r) : [...prev, r])}
                  className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black transition-all border ${isActive ? `${RARITY_STYLES[r]} border-white/40 scale-105 shadow-lg` : 'bg-slate-800 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}
                >
                  {r}
                </button>
              );
            })}
            {rarityFilter.length > 0 && (
              <button onClick={() => setRarityFilter([])} className="p-1 text-slate-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="hidden md:block w-[1px] h-6 bg-slate-700" />

          {/* Color mode toggle - desktop inline */}
          <Tooltip content={<span className="text-[10px] text-slate-200">{colorMode === 'mana' ? 'Colored by mana' : 'Colored by rarity'}</span>}>
            <div className="hidden md:flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5">
              <button
                onClick={() => setColorMode('mana')}
                className={`p-1.5 rounded transition-all ${colorMode === 'mana' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Palette size={14} />
              </button>
              <button
                onClick={() => setColorMode('rarity')}
                className={`p-1.5 rounded transition-all ${colorMode === 'rarity' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Diamond size={14} />
              </button>
            </div>
          </Tooltip>

          <div className="hidden md:block w-[1px] h-6 bg-slate-700" />

          {/* Search - desktop */}
          <div className="hidden md:flex relative items-center">
            <Search size={12} className="absolute left-2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Find card..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-36 bg-slate-900 border border-slate-700 text-slate-300 text-xs py-1.5 pl-7 pr-7 rounded-lg focus:border-indigo-500 focus:outline-none placeholder:text-slate-600"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 text-slate-500 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {matchCount > 0 && <span className="hidden md:inline text-[10px] text-indigo-400 font-bold">{matchCount} found</span>}

          {/* Reset zoom - desktop */}
          {scale > 1 && (
            <button
              onClick={handleDoubleClick}
              className="hidden md:block ml-auto px-3 py-1.5 text-xs font-bold bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Reset zoom ({scale.toFixed(1)}x)
            </button>
          )}
        </div>

        {/* Line 2: Rarities + Color mode + Reset zoom (mobile only) */}
        <div className="flex md:hidden items-center gap-2">
          {/* Rarities */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
            {['M', 'R', 'U', 'C'].map(r => {
              const isActive = rarityFilter.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => setRarityFilter(prev => prev.includes(r) ? prev.filter(item => item !== r) : [...prev, r])}
                  className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black transition-all border ${isActive ? `${RARITY_STYLES[r]} border-white/40 scale-105 shadow-lg` : 'bg-slate-800 border-transparent text-slate-500 opacity-40 hover:opacity-60'}`}
                >
                  {r}
                </button>
              );
            })}
            {rarityFilter.length > 0 && (
              <button onClick={() => setRarityFilter([])} className="p-1 text-slate-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Color mode toggle */}
          <Tooltip content={<span className="text-[10px] text-slate-200">{colorMode === 'mana' ? 'Colored by mana' : 'Colored by rarity'}</span>}>
            <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5">
              <button
                onClick={() => setColorMode('mana')}
                className={`p-1.5 rounded transition-all ${colorMode === 'mana' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Palette size={14} />
              </button>
              <button
                onClick={() => setColorMode('rarity')}
                className={`p-1.5 rounded transition-all ${colorMode === 'rarity' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Diamond size={14} />
              </button>
            </div>
          </Tooltip>

          {/* Reset zoom */}
          {scale > 1 && (
            <button
              onClick={handleDoubleClick}
              className="ml-auto px-2 py-1 text-[10px] font-bold bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              Reset ({scale.toFixed(1)}x)
            </button>
          )}
        </div>
      </div>

      {/* Matrix - Portrait by default on mobile, full screen on desktop or landscape */}
      <div className="flex-1 p-4 overflow-hidden flex items-center justify-center">
        <div
          className={`relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} md:w-full md:h-full portrait:max-md:aspect-[3/4] portrait:max-md:h-full portrait:max-md:w-auto landscape:w-full landscape:h-full`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          {/* Zoomable content */}
          <div
            className="absolute inset-0 origin-center transition-transform duration-100"
            style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${scale})` }}
          >
            {/* Average lines */}
            <div className="absolute left-0 right-0 border-t border-dashed border-slate-600/50" style={{ top: `${yAvg}%` }} />
            {isDraft && (
              <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-600/50" style={{ left: `${xAvg}%` }} />
            )}

            {/* Quadrant labels for Draft */}
            {isDraft && (
              <>
                <div className="absolute top-2 left-2 text-[10px] md:text-xs text-purple-500/60 font-black">TOP TIER</div>
                <div className="absolute top-2 right-2 text-[10px] md:text-xs text-emerald-500/60 font-black">GEM</div>
                <div className="absolute bottom-2 left-2 text-[10px] md:text-xs text-red-500/60 font-black">OVERRATED</div>
                <div className="absolute bottom-2 right-2 text-[10px] md:text-xs text-slate-600/60 font-black">CHAFF</div>
              </>
            )}

            {/* Sealed tier zones with colored bands */}
            {!isDraft && sealedTiers && (
              <>
                {/* BOMB zone (+9 and above) */}
                <div className="absolute left-0 right-0 bg-purple-500/20" style={{ top: 0, height: `${sealedTiers.y9}%` }} />
                {/* TOP TIER zone (+7 to +9) */}
                <div className="absolute left-0 right-0 bg-purple-500/10" style={{ top: `${sealedTiers.y9}%`, height: `${sealedTiers.y7 - sealedTiers.y9}%` }} />
                {/* VERY GOOD zone (+5 to +7) */}
                <div className="absolute left-0 right-0 bg-emerald-500/10" style={{ top: `${sealedTiers.y7}%`, height: `${sealedTiers.y5 - sealedTiers.y7}%` }} />
                {/* GOOD zone (+3 to +5) */}
                <div className="absolute left-0 right-0 bg-emerald-500/5" style={{ top: `${sealedTiers.y5}%`, height: `${sealedTiers.y3 - sealedTiers.y5}%` }} />
                {/* SOLID PLAYABLE zone (+1 to +3) */}
                <div className="absolute left-0 right-0 bg-slate-500/5" style={{ top: `${sealedTiers.y3}%`, height: `${sealedTiers.y1 - sealedTiers.y3}%` }} />
                {/* PLAYABLE zone (-1 to +1) - centered on average */}
                <div className="absolute left-0 right-0 bg-slate-400/10 border-y border-slate-500/20" style={{ top: `${sealedTiers.y1}%`, height: `${sealedTiers.yM1 - sealedTiers.y1}%` }} />
                {/* FILLER zone (-1 to -3) */}
                <div className="absolute left-0 right-0 bg-slate-600/5" style={{ top: `${sealedTiers.yM1}%`, height: `${sealedTiers.yM3 - sealedTiers.yM1}%` }} />
                {/* BAD zone (-3 to -5) */}
                <div className="absolute left-0 right-0 bg-amber-500/10" style={{ top: `${sealedTiers.yM3}%`, height: `${sealedTiers.yM5 - sealedTiers.yM3}%` }} />
                {/* CHAFF zone (-5 and below) */}
                <div className="absolute left-0 right-0 bg-red-500/15" style={{ top: `${sealedTiers.yM5}%`, bottom: 0 }} />

                {/* Tier labels */}
                <div className="absolute right-3 text-[9px] md:text-[10px] text-purple-400/90 font-black" style={{ top: `${sealedTiers.y9 / 2}%`, transform: 'translateY(-50%)' }}>BOMB</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-purple-400/70 font-black" style={{ top: `${(sealedTiers.y9 + sealedTiers.y7) / 2}%`, transform: 'translateY(-50%)' }}>TOP TIER</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-emerald-400/70 font-black" style={{ top: `${(sealedTiers.y7 + sealedTiers.y5) / 2}%`, transform: 'translateY(-50%)' }}>VERY GOOD</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-emerald-400/50 font-black" style={{ top: `${(sealedTiers.y5 + sealedTiers.y3) / 2}%`, transform: 'translateY(-50%)' }}>GOOD</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-slate-400/80 font-black" style={{ top: `${yAvg}%`, transform: 'translateY(-50%)' }}>PLAYABLE</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-slate-500/70 font-black" style={{ top: `${(sealedTiers.yM1 + sealedTiers.yM3) / 2}%`, transform: 'translateY(-50%)' }}>FILLER</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-amber-400/70 font-black" style={{ top: `${(sealedTiers.yM3 + sealedTiers.yM5) / 2}%`, transform: 'translateY(-50%)' }}>BAD</div>
                <div className="absolute right-3 text-[9px] md:text-[10px] text-red-400/90 font-black" style={{ top: `${(sealedTiers.yM5 + 100) / 2}%`, transform: 'translateY(-50%)' }}>CHAFF</div>
              </>
            )}

            {/* Card dots */}
            {cardDots.map((dot, idx) => {
              const hasSearch = debouncedSearch.trim().length > 0;
              const isDimmed = hasSearch && !dot.isMatch;
              const isHighlighted = hasSearch && dot.isMatch;

              const dotElement = (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: isHighlighted ? 1.8 : 1,
                    opacity: isDimmed ? 0.15 : 1,
                  }}
                  transition={isHighlighted
                    ? { type: 'spring', stiffness: 300, damping: 15 }
                    : { type: 'spring', stiffness: 400, damping: 20, delay: Math.min(idx * 0.005, 0.5) }
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    // Reset zoom before navigating on mobile
                    if (isMobile && scale > 1) {
                      setScale(1);
                      setPosition({ x: 0, y: 0 });
                    }
                    onCardSelect?.(dot.card);
                  }}
                  onMouseEnter={() => !isMobile && setHoveredCard({ card: dot.card, x: dot.x, y: dot.y })}
                  onMouseLeave={() => !isMobile && setHoveredCard(null)}
                  className={`absolute ${isMobile ? 'w-2 h-2' : 'w-2.5 h-2.5'} ${dot.colorClass} rounded-full -translate-x-1/2 -translate-y-1/2 transition-all ${onCardSelect ? 'cursor-pointer' : ''} border ${isHighlighted ? 'border-white ring-2 ring-white/50 z-30' : 'border-white/20 hover:brightness-125 hover:scale-150 hover:z-20'}`}
                  style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
                />
              );

              // Mobile: wrap with Tooltip for proximity display
              if (isMobile) {
                return (
                  <Tooltip
                    key={`${dot.name}-${idx}`}
                    content={
                      <div className="text-center whitespace-nowrap">
                        <div className="text-[10px] font-bold text-white mb-1">{dot.name}</div>
                        <div className="flex gap-3 text-[9px]">
                          <span className="text-slate-400">WR: <span className={getDeltaStyle(dot.wr, formatStats.avgWR)}>{dot.wr.toFixed(1)}%</span></span>
                          {dot.alsa !== null && <span className="text-slate-400">ALSA: <span className="text-white">{dot.alsa.toFixed(2)}</span></span>}
                        </div>
                      </div>
                    }
                  >
                    {dotElement}
                  </Tooltip>
                );
              }

              // Desktop: no wrapper, uses fixed panel
              return <React.Fragment key={`${dot.name}-${idx}`}>{dotElement}</React.Fragment>;
            })}
          </div>

          {/* Axis labels */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            {isDraft ? 'Pick Order (ALSA)' : 'Performance Distribution'}
          </div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">
            Win Rate
          </div>

          {/* Average WR tooltip zone */}
          <Tooltip content={<div className="text-center"><div className="text-[10px] text-slate-400">Format Average WR</div><div className="text-sm font-black text-white">{formatStats.avgWR.toFixed(1)}%</div></div>}>
            <div className="absolute left-0 right-0 h-4 cursor-help" style={{ top: `${yAvg}%`, transform: 'translateY(-50%)' }} />
          </Tooltip>

          {/* Zoom indicator */}
          {scale > 1 && (
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded z-20">
              {scale.toFixed(1)}x
            </div>
          )}
        </div>
      </div>

      {/* Desktop: Fixed card preview panel */}
      <AnimatePresence>
        {!isMobile && hoveredCard && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed top-24 right-4 z-50 w-48 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Card image */}
            <img
              src={getCardImage(hoveredCard.card.name)}
              alt={hoveredCard.card.name}
              className="w-full aspect-[488/680] object-cover bg-slate-950"
              loading="eager"
            />

            {/* Card info */}
            <div className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="text-sm font-bold text-white leading-tight line-clamp-2 flex-1">
                  {hoveredCard.card.name}
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black flex-shrink-0 ${RARITY_STYLES[normalizeRarity(hoveredCard.card.rarity)]}`}>
                  {normalizeRarity(hoveredCard.card.rarity)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider">Win Rate</div>
                  <div className={`text-lg font-black ${getDeltaStyle(hoveredCard.card.gih_wr!, formatStats.avgWR)}`}>
                    {hoveredCard.card.gih_wr?.toFixed(1)}%
                  </div>
                </div>
                {isDraft && hoveredCard.card.alsa && (
                  <div className="text-right">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">ALSA</div>
                    <div className="text-lg font-black text-white">
                      {hoveredCard.card.alsa.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Delta indicator */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">vs. format avg</span>
                  <span className={`font-bold ${getDeltaStyle(hoveredCard.card.gih_wr!, formatStats.avgWR)}`}>
                    {(hoveredCard.card.gih_wr! - formatStats.avgWR) >= 0 ? '+' : ''}
                    {(hoveredCard.card.gih_wr! - formatStats.avgWR).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
