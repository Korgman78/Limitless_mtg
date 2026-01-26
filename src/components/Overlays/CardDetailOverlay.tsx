import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, ArrowUpDown, AlertTriangle, Trophy, MousePointerClick, Crosshair, Users, HelpCircle } from 'lucide-react';
import type { CardDetailOverlayProps, Card, CrossPerformance } from '../../types';
import { RARITY_STYLES } from '../../constants';
import { normalizeRarity, getDeltaStyle, getCardImage, calculateGrade, areColorsEqual, extractColors, normalizeArchetypeName, getArchetypeAcronym } from '../../utils/helpers';
import { useCoachMarks } from '../../hooks/useCoachMarks';
import { ManaIcons } from '../Common/ManaIcons';
import { Tooltip } from '../Common/Tooltip';
import { Skeleton } from '../Common/Skeleton';
import { SwipeableOverlay } from './SwipeableOverlay';
import { Sparkline } from '../Charts/Sparkline';
import { useCardCrossPerf } from '../../queries/useCardCrossPerf';
import { useCardSynergies, type CardSynergy } from '../../queries/useCardSynergies';

// --- BLOC D'ÉVALUATION ---
interface CardEvaluationBlockProps {
  card: Card;
  allCards: Card[];
  globalMeanWR: number;  // WR moyen global du format (depuis archetype_stats "All Decks")
  onCardSelect?: (card: Card) => void;
  showPeers: boolean;
  setShowPeers: (show: boolean) => void;
  showAllRarityPeers: boolean;
  setShowAllRarityPeers: (show: boolean) => void;
  displayWR?: number | null;  // WR à afficher (prioritaire sur card.gih_wr)
  displayALSA?: number | null;  // ALSA à afficher (prioritaire sur card.alsa)
}

// Memoized CardEvaluationBlock pour éviter les re-renders inutiles

// Mapping des couleurs MTG vers des couleurs CSS
const getManaColor = (colors: string | string[] | null | undefined): string => {
  // Normalize to string for extractColors
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

const CardEvaluationBlock = React.memo<CardEvaluationBlockProps>(({ card, allCards, globalMeanWR, onCardSelect, showPeers, setShowPeers, showAllRarityPeers, setShowAllRarityPeers, displayWR, displayALSA }) => {
  // Utiliser les valeurs display si fournies, sinon fallback sur card
  const effectiveWR = displayWR ?? card.gih_wr;
  const effectiveALSA = displayALSA ?? card.alsa;

  // Zoom & pan state for matrix
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ initialDistance: number; initialScale: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const isDragging = useRef(false);

  // Limit pan based on scale (more zoom = more pan allowed)
  const limitPan = useCallback((x: number, y: number, currentScale: number) => {
    const maxPan = (currentScale - 1) * 50; // 50% per zoom level
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
      // Reset position if zooming back to 1
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

  // Mouse drag handlers
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

  // Touch handlers (1 finger = pan, 2 fingers = zoom)
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

  if (!effectiveWR) return null;

  const getRank = (list: any[], metric: string, val: any, asc: boolean = false): { rank: number; total: number } => {
    const valid = list.filter((c: any) => c[metric] !== null);
    valid.sort((a: any, b: any) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
    const index = valid.findIndex((c: any) => c.name === card.name);
    return { rank: index + 1, total: valid.length };
  };

  const peersRarity = allCards.filter((c: Card) => normalizeRarity(c.rarity) === normalizeRarity(card.rarity));
  const peersColor = peersRarity.filter((c: Card) => areColorsEqual(extractColors(c.colors), extractColors(card.colors)));

  const rankWrRarity = getRank(peersRarity, 'gih_wr', card.gih_wr, false);
  const rankWrColor = getRank(peersColor, 'gih_wr', card.gih_wr, false);

  const hasAlsa = !!card.alsa;
  const rankAlsaRarity = hasAlsa ? getRank(peersRarity, 'alsa', card.alsa, true) : null;
  const rankAlsaColor = hasAlsa ? getRank(peersColor, 'alsa', card.alsa, true) : null;

  const rarityLabel = normalizeRarity(card.rarity) === 'M' ? 'Mythics' : normalizeRarity(card.rarity) === 'R' ? 'Rares' : normalizeRarity(card.rarity) === 'U' ? 'Uncommons' : 'Commons';

  const RankingRow = ({ label, rank, total, type }: { label: string; rank: number; total: number; type: string }) => {
    if (!rank || !total) return null;
    const percent = Math.max(5, Math.min(100, ((total - rank) / total) * 100));
    const isTop = rank <= Math.ceil(total * 0.15);
    const isBad = rank >= Math.floor(total * 0.85);
    return (
      <div className="flex flex-col gap-1 mb-2 last:mb-0">
        <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            {type === 'WR' ? <Trophy size={10} className="text-yellow-500" /> : <MousePointerClick size={10} className="text-blue-400" />}
            {label}
          </span>
          <span className={isTop ? "text-emerald-400 font-bold" : isBad ? "text-red-400" : "text-slate-300"}>
            #{rank} <span className="text-slate-600 font-normal">/ {total}</span>
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${isTop ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : isBad ? 'bg-slate-700' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  };

  // Dynamic WR & ALSA stats computed from format data
  const formatStats = useMemo(() => {
    const validWRs = allCards.filter(c => c.gih_wr !== null && c.gih_wr !== undefined).map(c => c.gih_wr!).sort((a, b) => a - b);
    const validALSAs = allCards.filter(c => c.alsa !== null && c.alsa !== undefined).map(c => c.alsa!).sort((a, b) => a - b);

    // WR stats - utiliser globalMeanWR (WR moyen du format) au lieu de la moyenne des cartes
    const minWRActual = validWRs[0] ?? 45;
    const maxWRActual = validWRs[validWRs.length - 1] ?? 70;

    // ALSA stats
    const avgALSA = validALSAs.length > 0
      ? validALSAs.reduce((sum, a) => sum + a, 0) / validALSAs.length
      : 4.5;

    return {
      avgWR: globalMeanWR,  // WR moyen global du format (pas la moyenne des cartes)
      minWR: Math.floor(minWRActual - 1),
      maxWR: Math.ceil(maxWRActual + 1),
      bestWR: maxWRActual,
      avgALSA,
    };
  }, [allCards, globalMeanWR]);

  const AVG_WR = formatStats.avgWR;
  const minWR = formatStats.minWR;
  const maxWR = formatStats.maxWR;
  const bestWR = formatStats.bestWR;

  const AVG_ALSA = formatStats.avgALSA;
  const minALSA = 1.25;
  const maxALSA = 8.75;

  // For Sealed: use fixed scale with symmetric margins for BOMB (+9 to +12) and CHAFF (-5 to -8)
  const sealedDisplayMinWR = AVG_WR - 8;
  const sealedDisplayMaxWR = AVG_WR + 12;

  const alsa = effectiveALSA ?? 0;
  let statusText = "Average Card"; let statusColor = "text-slate-400";

  if (hasAlsa) {
    // Calcul des seuils de colonnes (ALSA)
    const midLeftALSA = (minALSA + AVG_ALSA) / 2;
    const midRightALSA = (AVG_ALSA + maxALSA) / 2;

    // Calcul des seuils de lignes (WR)
    // Au-dessus de AVG_WR : 3 tiers égaux
    const wrAboveRange = maxWR - AVG_WR;
    const wrRow1Threshold = AVG_WR + (2 * wrAboveRange / 3);
    const wrRow2Threshold = AVG_WR + (wrAboveRange / 3);
    // En-dessous de AVG_WR : 2 moitiés égales
    const wrBelowRange = AVG_WR - minWR;
    const wrRow4Threshold = AVG_WR - (wrBelowRange / 2);

    // Déterminer colonne (1-4)
    const col = alsa < midLeftALSA ? 1 : alsa < AVG_ALSA ? 2 : alsa < midRightALSA ? 3 : 4;

    // Déterminer ligne (1-5)
    const row = effectiveWR >= wrRow1Threshold ? 1
      : effectiveWR >= wrRow2Threshold ? 2
        : effectiveWR >= AVG_WR ? 3
          : effectiveWR >= wrRow4Threshold ? 4
            : 5;

    // Zone centrale PLAYABLE (prioritaire)
    const isPlayable = Math.abs(effectiveWR - AVG_WR) <= 0.5 && col >= 2 && col <= 3;

    // Règle prioritaire #1 : BOMB si WR >= bestWR - 4
    const isBombTier = effectiveWR >= bestWR - 4;

    if (isBombTier) {
      statusText = "Bomb"; statusColor = "text-purple-400";
    } else if (isPlayable) {
      statusText = "Playable"; statusColor = "text-slate-400";
    } else {
      // Grille 5x4 avec labels
      const labels: Record<string, [string, string]> = {
        "1-1": ["Bomb", "text-purple-400"],
        "1-2": ["Underrated Bomb", "text-purple-400"],
        "1-3": ["Absolute Gem", "text-emerald-400"],
        "1-4": ["Absolute Gem", "text-emerald-400"],
        "2-1": ["Top Tier", "text-purple-400"],
        "2-2": ["Underrated Top Tier", "text-indigo-400"],
        "2-3": ["Underrated Gem", "text-emerald-400"],
        "2-4": ["Underrated Gem", "text-emerald-400"],
        "3-1": ["Overrated Top Tier", "text-amber-400"],
        "3-2": ["Good Pick", "text-emerald-400"],
        "3-3": ["Gem", "text-emerald-400"],
        "3-4": ["Good Filler", "text-slate-400"],
        "4-1": ["Overhyped Trap", "text-red-400"],
        "4-2": ["Bait", "text-amber-400"],
        "4-3": ["Mediocre", "text-slate-500"],
        "4-4": ["Filler", "text-slate-500"],
        "5-1": ["Overhyped Trap", "text-red-400"],
        "5-2": ["Bait", "text-amber-400"],
        "5-3": ["Chaff", "text-slate-600"],
        "5-4": ["Unplayable", "text-red-500"],
      };
      let [text, color] = labels[`${row}-${col}`] || ["Average Card", "text-slate-400"];

      // Règle #2 : Overrated Top Tier + ALSA >= 2 → Top Tier
      if (text === "Overrated Top Tier" && alsa >= 2) {
        text = "Top Tier"; color = "text-purple-400";
      }

      statusText = text; statusColor = color;
    }
  } else {
    // Sans ALSA (Sealed) : évaluation basée sur delta par rapport à la moyenne
    const delta = effectiveWR - AVG_WR;
    if (delta >= 9) { statusText = "Bomb"; statusColor = "text-purple-400"; }
    else if (delta >= 7) { statusText = "Top Tier"; statusColor = "text-purple-400"; }
    else if (delta >= 5) { statusText = "Very Good"; statusColor = "text-emerald-400"; }
    else if (delta >= 3) { statusText = "Good"; statusColor = "text-emerald-400"; }
    else if (delta >= 1) { statusText = "Solid Playable"; statusColor = "text-slate-300"; }
    else if (delta >= -1) { statusText = "Playable"; statusColor = "text-slate-400"; }
    else if (delta >= -3) { statusText = "Filler"; statusColor = "text-slate-500"; }
    else if (delta >= -5) { statusText = "Bad"; statusColor = "text-amber-400"; }
    else { statusText = "Chaff"; statusColor = "text-red-500"; }
  }
  const xPos = hasAlsa ? ((Math.max(minALSA, Math.min(maxALSA, alsa)) - minALSA) / (maxALSA - minALSA)) * 100 : 50;
  const xAvg = ((AVG_ALSA - minALSA) / (maxALSA - minALSA)) * 100;

  // Use different WR scale for Sealed (fixed delta-based) vs Draft (dynamic)
  const displayMinWR = hasAlsa ? minWR : sealedDisplayMinWR;
  const displayMaxWR = hasAlsa ? maxWR : sealedDisplayMaxWR;

  // Calculate Y position, clamping to 2-98% range to keep dots visible
  const getYPosition = (wr: number) => {
    const clampedWR = Math.max(displayMinWR, Math.min(displayMaxWR, wr));
    const y = 100 - ((clampedWR - displayMinWR) / (displayMaxWR - displayMinWR)) * 100;
    return Math.max(2, Math.min(98, y));
  };

  // Position de la ligne moyenne (avec le même clamp pour cohérence)
  const yAvg = getYPosition(AVG_WR);

  // Position du point - utiliser yAvg directement si le WR est très proche de la moyenne (évite les décalages de précision)
  const yPos = Math.abs(effectiveWR - AVG_WR) < 0.1 ? yAvg : getYPosition(effectiveWR);

  // Compute peer positions for matrix overlay
  const peerDots = useMemo(() => {
    if (!showPeers && !showAllRarityPeers) return [];

    // Select peers based on mode: color peers or all rarity peers
    const peers = showAllRarityPeers
      ? peersRarity.filter((c: Card) => c.name !== card.name && c.gih_wr)
      : peersColor.filter((c: Card) => c.name !== card.name && c.gih_wr);

    // For Sealed: distribute dots evenly across width with small jitter
    const sealedXPositions = peers.map((_, idx) => {
      const baseX = 10 + (idx / Math.max(1, peers.length - 1)) * 80; // 10% to 90%
      const jitter = (idx % 3 - 1) * 3; // -3, 0, or +3 for slight variation
      return Math.max(8, Math.min(92, baseX + jitter));
    });

    return peers.map((c: Card, idx: number) => ({
      card: c,
      name: c.name,
      wr: c.gih_wr!,
      alsa: c.alsa ?? null,
      x: hasAlsa && c.alsa
        ? ((Math.max(minALSA, Math.min(maxALSA, c.alsa)) - minALSA) / (maxALSA - minALSA)) * 100
        : sealedXPositions[idx],
      y: getYPosition(c.gih_wr!),
      colorClass: showAllRarityPeers ? getManaColor(c.colors) : 'bg-slate-400/70',
    }));
  }, [showPeers, showAllRarityPeers, hasAlsa, peersRarity, peersColor, card.name, displayMinWR, displayMaxWR, minALSA, maxALSA]);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Crosshair size={16} className="text-indigo-400" />
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">Card Evaluation Matrix</h3>
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="text-xs text-slate-500 font-medium">Evaluation:</div>
            <div className={`text-lg font-black ${statusColor}`}>{statusText}</div>
            <div className="text-[10px] text-slate-500 leading-relaxed">
              {hasAlsa ? <>Comparing <strong>Pick Order (ALSA)</strong> vs <strong>Win Rate</strong>.<br />High WR + Late Pick = Underrated.</> : <>Based solely on <strong>Games In Hand Win Rate</strong>.</>}
            </div>
            {peersColor.length > 1 && (
              <div className="flex flex-col gap-1.5 mt-2">
                <button
                  onClick={() => {
                    setShowPeers(!showPeers);
                    if (!showPeers) setShowAllRarityPeers(false);
                  }}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all duration-200 ${showPeers
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-300'
                    }`}
                >
                  <Users size={11} />
                  {showPeers ? 'Hide' : 'Show'} {rarityLabel.toLowerCase()} color peers
                  <span className="text-[9px] opacity-60">({peersColor.length - 1})</span>
                </button>
                <button
                  onClick={() => {
                    setShowAllRarityPeers(!showAllRarityPeers);
                    if (!showAllRarityPeers) setShowPeers(false);
                  }}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all duration-200 ${showAllRarityPeers
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 hover:text-slate-300'
                    }`}
                >
                  <Users size={11} />
                  {showAllRarityPeers ? 'Hide' : 'Show'} all {rarityLabel.toLowerCase()}
                  <span className="text-[9px] opacity-60">({peersRarity.length - 1})</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-row items-center gap-2 md:gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
            <div className="h-32 md:h-44 lg:h-52 xl:h-60 flex items-center justify-center w-4 md:w-5 flex-shrink-0">
              <span className="-rotate-90 text-[9px] md:text-[10px] lg:text-xs font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Win Rate</span>
            </div>
            <div className="flex flex-col gap-2 flex-1 sm:w-48 md:w-56 lg:w-72 xl:w-80">
              {/* Matrix container with zoom & pan */}
              <div
                className={`relative w-full h-32 md:h-44 lg:h-52 xl:h-60 bg-slate-950 rounded-lg md:rounded-xl border border-slate-800 shadow-inner overflow-hidden ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
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
                {/* Zoomable & pannable content */}
                <div
                  className="absolute inset-0 origin-center transition-transform duration-100"
                  style={{ transform: `translate(${position.x}%, ${position.y}%) scale(${scale})` }}
                >
                  {/* Moyenne line (always shown) - avec tooltip pour afficher la valeur */}
                  <Tooltip content={<div className="text-center"><div className="text-[10px] text-slate-400">Format Average WR</div><div className="text-sm font-black text-white">{AVG_WR.toFixed(1)}%</div></div>}>
                    <div className="absolute left-0 right-0 h-3 cursor-help z-10 -translate-y-1/2" style={{ top: `${yAvg}%` }}>
                      <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-600" />
                    </div>
                  </Tooltip>

                  {hasAlsa ? (
                    <>
                      {/* Draft mode: 2D matrix with ALSA axis */}
                      <div className="absolute top-0 bottom-0 border-l border-dashed border-slate-700/50" style={{ left: `${xAvg}%` }}></div>
                      <div className="absolute top-1 left-1 md:top-2 md:left-2 text-[8px] md:text-[10px] lg:text-xs text-purple-500/50 font-black">TOP TIER</div>
                      <div className="absolute top-1 right-1 md:top-2 md:right-2 text-[8px] md:text-[10px] lg:text-xs text-emerald-500/50 font-black">GEM</div>
                      <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 text-[8px] md:text-[10px] lg:text-xs text-red-500/50 font-black">OVERRATED</div>
                      <div className="absolute bottom-1 right-1 md:bottom-2 md:right-2 text-[8px] md:text-[10px] lg:text-xs text-slate-600/50 font-black">CHAFF</div>
                    </>
                  ) : (() => {
                    // Calculate dynamic positions based on WR scale
                    // Use displayMinWR/displayMaxWR for consistent scale with dot positions
                    const wrRange = displayMaxWR - displayMinWR; // 20 points for Sealed (+12 to -8)
                    const pctPerPoint = 100 / wrRange;

                    // Calculate Y positions for each threshold (delta from average)
                    const getY = (delta: number) => Math.max(0, Math.min(100, yAvg - (delta * pctPerPoint)));

                    // Threshold positions
                    const y9 = getY(9);   // BOMB threshold
                    const y7 = getY(7);   // TOP TIER threshold
                    const y5 = getY(5);   // VERY GOOD threshold
                    const y3 = getY(3);   // GOOD threshold
                    const y1 = getY(1);   // PLAYABLE top
                    const yM1 = getY(-1); // PLAYABLE bottom
                    const yM3 = getY(-3); // FILLER threshold
                    const yM5 = getY(-5); // CHAFF threshold

                    // Determine current card's category for dynamic label
                    const cardDelta = effectiveWR - AVG_WR;
                    const fixedLabels = ['Bomb', 'Playable', 'Chaff'];
                    const showDynamicLabel = !fixedLabels.includes(statusText);

                    // Get Y position for dynamic label based on card's category
                    const getDynamicLabelY = () => {
                      if (cardDelta >= 7) return (y9 + y7) / 2;      // TOP TIER
                      if (cardDelta >= 5) return (y7 + y5) / 2;      // VERY GOOD
                      if (cardDelta >= 3) return (y5 + y3) / 2;      // GOOD
                      if (cardDelta >= 1) return (y3 + y1) / 2;      // SOLID PLAYABLE
                      if (cardDelta >= -3) return (yM1 + yM3) / 2;   // FILLER
                      return (yM3 + yM5) / 2;                        // BAD
                    };

                    return (
                      <>
                        {/* Sealed mode: Dynamic horizontal bands based on WR thresholds */}
                        {/* BOMB zone */}
                        <div className="absolute left-0 right-0 bg-purple-500/20" style={{ top: 0, height: `${y9}%` }} />
                        {/* TOP TIER zone */}
                        <div className="absolute left-0 right-0 bg-purple-500/10" style={{ top: `${y9}%`, height: `${y7 - y9}%` }} />
                        {/* VERY GOOD zone */}
                        <div className="absolute left-0 right-0 bg-emerald-500/10" style={{ top: `${y7}%`, height: `${y5 - y7}%` }} />
                        {/* GOOD zone */}
                        <div className="absolute left-0 right-0 bg-emerald-500/5" style={{ top: `${y5}%`, height: `${y3 - y5}%` }} />
                        {/* SOLID PLAYABLE zone */}
                        <div className="absolute left-0 right-0 bg-slate-500/5" style={{ top: `${y3}%`, height: `${y1 - y3}%` }} />
                        {/* PLAYABLE zone - centered on average */}
                        <div className="absolute left-0 right-0 bg-slate-400/10 border-y border-slate-500/20" style={{ top: `${y1}%`, height: `${yM1 - y1}%` }} />
                        {/* FILLER zone */}
                        <div className="absolute left-0 right-0 bg-slate-600/5" style={{ top: `${yM1}%`, height: `${yM3 - yM1}%` }} />
                        {/* BAD zone (-3 to -5) */}
                        <div className="absolute left-0 right-0 bg-amber-500/10" style={{ top: `${yM3}%`, height: `${yM5 - yM3}%` }} />
                        {/* CHAFF zone (-5 to bottom) */}
                        <div className="absolute left-0 right-0 bg-red-500/15" style={{ top: `${yM5}%`, bottom: 0 }} />

                        {/* Average line with tooltip for GIH WR */}
                        <Tooltip content={<div className="text-center"><div className="text-[10px] text-slate-400">Format Average WR</div><div className="text-sm font-black text-white">{AVG_WR.toFixed(1)}%</div></div>}>
                          <div className="absolute left-0 right-0 h-4 cursor-help z-10 flex items-center" style={{ top: `${yAvg}%`, transform: 'translateY(-50%)' }}>
                            <div className="w-full border-t border-dashed border-slate-500/70" />
                          </div>
                        </Tooltip>

                        {/* Fixed labels: BOMB (top), PLAYABLE (center), CHAFF (bottom) */}
                        <div className="absolute right-2 md:right-3 text-[7px] md:text-[9px] text-purple-400/80 font-black" style={{ top: `${y9 / 2}%`, transform: 'translateY(-50%)' }}>BOMB</div>
                        <div className="absolute right-2 md:right-3 text-[7px] md:text-[9px] text-slate-300/80 font-black" style={{ top: `${yAvg}%`, transform: 'translateY(-50%)' }}>PLAYABLE</div>
                        <div className="absolute right-2 md:right-3 text-[7px] md:text-[9px] text-red-400/80 font-black" style={{ top: `${(yM5 + 100) / 2}%`, transform: 'translateY(-50%)' }}>CHAFF</div>

                        {/* Dynamic label for current card's category (if not BOMB, PLAYABLE, or CHAFF) */}
                        {showDynamicLabel && (
                          <div
                            className={`absolute right-2 md:right-3 text-[7px] md:text-[9px] font-black ${statusColor}`}
                            style={{ top: `${getDynamicLabelY()}%`, transform: 'translateY(-50%)' }}
                          >
                            {statusText.toUpperCase()}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Peer dots with staggered animation */}
                  {peerDots.map((peer, idx) => (
                    <Tooltip
                      key={peer.name}
                      content={
                        <div className="text-center whitespace-nowrap">
                          <div className="text-[10px] font-bold text-white mb-1">{peer.name}</div>
                          <div className="flex gap-3 text-[9px]">
                            <span className="text-slate-400">WR: <span className={getDeltaStyle(peer.wr, AVG_WR)}>{peer.wr.toFixed(1)}%</span></span>
                            {peer.alsa !== null && <span className="text-slate-400">ALSA: <span className="text-white">{peer.alsa.toFixed(2)}</span></span>}
                          </div>
                        </div>
                      }
                    >
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 20,
                          delay: idx * 0.025
                        }}
                        onClick={() => onCardSelect?.(peer.card)}
                        className={`absolute w-1.5 h-1.5 md:w-2 md:h-2 ${peer.colorClass} hover:brightness-125 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-150 hover:z-20 ${onCardSelect ? 'cursor-pointer' : ''}`}
                        style={{ left: `${peer.x}%`, top: `${peer.y}%` }}
                      />
                    </Tooltip>
                  ))}

                  {/* Main card dot - always on top */}
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: `${xPos}%`, top: `${yPos}%` }}>
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', delay: 0.2 }}
                      className="w-2.5 h-2.5 md:w-3 md:h-3 lg:w-4 lg:h-4 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] md:shadow-[0_0_10px_rgba(255,255,255,0.8)] border-2 border-indigo-600"
                    />
                  </div>
                </div>
                {/* Zoom level indicator */}
                {scale > 1 && (
                  <div className="absolute bottom-1 right-1 text-[8px] text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded z-20">
                    {scale.toFixed(1)}x
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className="text-[9px] md:text-[10px] lg:text-xs font-black text-slate-500 uppercase tracking-widest">
                  {hasAlsa ? 'Pick Order (ALSA)' : 'Performance vs Format Average'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50">
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among {rarityLabel}</div>
            <RankingRow label="Win Rate Rank" rank={rankWrRarity.rank} total={rankWrRarity.total} type="WR" />
            {hasAlsa && rankAlsaRarity && <RankingRow label="Pick Order Rank" rank={rankAlsaRarity.rank} total={rankAlsaRarity.total} type="ALSA" />}
          </div>
          <div className="space-y-2">
            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Among Color Peers</div>
            <RankingRow label="Win Rate Rank" rank={rankWrColor.rank} total={rankWrColor.total} type="WR" />
            {hasAlsa && rankAlsaColor && <RankingRow label="Pick Order Rank" rank={rankAlsaColor.rank} total={rankAlsaColor.total} type="ALSA" />}
          </div>
        </div>
      </div>
    </div>
  );
});
CardEvaluationBlock.displayName = 'CardEvaluationBlock';

// --- COMPOSANT PARTENAIRE ---
const StrategicPairingCard = ({ pairing, label, colorClass, allCards, onCardSelect }: { pairing: CardSynergy; label: string; colorClass: string; allCards: Card[]; onCardSelect?: (card: Card) => void }) => {
  const partnerCard = allCards.find((c: Card) => c.name === pairing.partner);

  return (
    <div
      onClick={() => partnerCard && onCardSelect?.(partnerCard)}
      className="bg-slate-900/40 backdrop-blur-sm p-2 rounded-xl border border-white/5 flex items-center gap-4 hover:bg-slate-800/60 hover:border-indigo-500/30 cursor-pointer transition-all duration-300 group"
    >
      <div className="w-14 aspect-[2/3] flex-shrink-0 bg-slate-800 rounded-md overflow-hidden ring-1 ring-white/10 group-hover:ring-indigo-500/50 transition-all shadow-lg">
        <img
          src={getCardImage(pairing.partner)}
          alt={pairing.partner}
          className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-100 truncate mb-1 group-hover:text-white transition-colors">{pairing.partner}</div>
        <div className="flex items-center gap-2">
          <div className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-800 border border-white/5 ${colorClass}`}>
            {label}
          </div>
          <span className={`text-xs font-black ${colorClass}`}>
            {label === 'PAIRED' ? `${(pairing.confidence * 100).toFixed(0)}%` : `${pairing.lift_score.toFixed(1)}x`}
          </span>
        </div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---
const CardDetailOverlayComponent: React.FC<CardDetailOverlayProps> = ({ card, activeFormat, activeSet, decks, cards: allCards, globalMeanWR, onClose, onCardSelect }) => {
  const rCode = normalizeRarity(card.rarity);
  const [sortMode, setSortMode] = useState<string>('synergy');
  const [showPeers, setShowPeers] = useState(false);
  const [showAllRarityPeers, setShowAllRarityPeers] = useState(false);

  // Coach marks for onboarding
  const { isUnseen, markAsSeen } = useCoachMarks();

  // React Query for cross-performance data
  const { data, error, isLoading: crossPerfLoading } = useCardCrossPerf(card.name, activeFormat, activeSet, decks);
  const globalStats = data?.globalStats || { gih_wr: null, alsa: null, win_rate_history: null };
  const crossPerf = data?.crossPerf || [];

  // React Query for synergy data
  const { data: synergyData, isLoading: synergyLoading } = useCardSynergies(card.name, activeFormat, activeSet);
  const topConfidence = synergyData?.topConfidence || [];
  const topSynergy = synergyData?.topSynergy || [];

  const fetchError = error ? 'Failed to load card data' : null;

  const sortedPerf = useMemo(() => {
    return [...crossPerf].sort((a: CrossPerformance, b: CrossPerformance) => {
      if (sortMode === 'winrate') {
        return b.cardWr - a.cardWr;
      }
      return (b.cardWr - b.deckWr) - (a.cardWr - a.deckWr);
    });
  }, [crossPerf, sortMode]);

  const minGamesDisplay = activeFormat.toLowerCase().includes('sealed') ? 10 : 500;

  return (
    <SwipeableOverlay onClose={onClose} zIndex={1100}>
      <AnimatePresence mode="wait">
        <motion.div
          key={card.name}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col h-full md:flex-row"
        >
          {fetchError && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              {fetchError}
            </div>
          )}

          {/* Dashboard Compact Header */}
          <div className="bg-slate-900/50 p-4 md:pb-8 md:px-6 flex flex-col border-b border-slate-800 md:border-b-0 md:border-r md:w-1/3 md:justify-center md:pt-0 flex-shrink-0">
            <div className="flex flex-row md:flex-col items-center gap-4 md:gap-0">

              {/* Image Thumbnail (Mobile) / Card Image (Desktop) */}
              <div className="w-[40%] md:w-full flex-shrink-0">
                <motion.img
                  layoutId={`img-${card.id}`}
                  src={getCardImage(card.name)}
                  className="w-full h-auto rounded-[10px] md:rounded-[18px] shadow-2xl shadow-black md:my-4 ring-1 ring-white/10 object-contain"
                />
              </div>

              {/* Information & Stats Panel */}
              <div className="flex-1 md:w-full flex flex-col justify-center pl-3 md:pl-0">
                <div className="mb-3">
                  <h1 className="text-base md:text-2xl font-black text-left md:text-center text-white leading-tight mb-1 line-clamp-2">
                    {card.name}
                  </h1>
                  <div className="flex items-center justify-start md:justify-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border border-white/10 font-black tracking-wide ${RARITY_STYLES[rCode]}`}>
                      {rCode}
                    </span>
                    <ManaIcons colors={card.colors} size="sm" />
                  </div>
                </div>

                {/* Responsive Stats Grid - 3 BLOCS (Always show GLOBAL stats) */}
                <div className="grid grid-cols-2 gap-2 w-full">
                  {/* 1. GIH BLOCK - Global */}
                  <div className="bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-start justify-center pl-3">
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">GIH WR</span>
                    <div className={`text-lg md:text-3xl font-black ${getDeltaStyle(globalStats.gih_wr ?? card.gih_wr, 55)} leading-none`}>
                      {(globalStats.gih_wr ?? card.gih_wr)?.toFixed(1) ?? '--'}%
                    </div>
                  </div>

                  {/* 2. ALSA BLOCK - Global */}
                  <div className="bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-start justify-center pl-3">
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">ALSA</span>
                    <div className="text-lg md:text-3xl font-black text-white leading-none">
                      {(globalStats.alsa ?? card.alsa)?.toFixed(2) ?? '--'}
                    </div>
                  </div>

                  {/* 3. TREND BLOCK - Global (Full Width & Centered) */}
                  {(() => {
                    const rawHistory = globalStats.win_rate_history || (card as any).win_rate_history || [];
                    let history = [...rawHistory];
                    const gihWr = globalStats.gih_wr ?? card.gih_wr;

                    // LOGIQUE "FLAT LINE"
                    if (history.length === 0 && gihWr) {
                      history = [gihWr, gihWr];
                    } else if (history.length === 1) {
                      history = [history[0], history[0]];
                    }

                    return (
                      <div className="col-span-2 bg-slate-800/40 p-2 rounded-lg border border-white/5 flex flex-col items-center justify-center relative group">
                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1 z-10">TREND ({rawHistory.length} days)</span>

                        {/* Container centré sans scale */}
                        <div className="w-full h-10 flex items-center justify-center px-4 relative z-10">
                          {history.length > 1 ? (
                            <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                              <Sparkline data={history} width={60} height={30} />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600 italic">Not enough data yet</span>
                          )}
                        </div>

                        {/* Subtle Background Decoration */}
                        <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/5 to-transparent pointer-events-none"></div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content Section */}
          <div className="flex-1 overflow-y-auto p-5 pb-32 space-y-6 bg-slate-950">
            <CardEvaluationBlock card={card} allCards={allCards} globalMeanWR={globalMeanWR} onCardSelect={onCardSelect} showPeers={showPeers} setShowPeers={setShowPeers} showAllRarityPeers={showAllRarityPeers} setShowAllRarityPeers={setShowAllRarityPeers} displayWR={globalStats.gih_wr} displayALSA={globalStats.alsa} />

            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} /> Performance by Archetype
                </h3>
                <button
                  onClick={() => setSortMode(prev => prev === 'synergy' ? 'winrate' : 'synergy')}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded hover:bg-indigo-400/20 transition-colors"
                >
                  <ArrowUpDown size={10} />
                  {sortMode === 'synergy' ? 'Sort by Win Rate' : 'Sort by Impact'}
                </button>
              </div>

              {crossPerfLoading ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : sortedPerf.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center">
                  <p className="text-xs text-slate-500">Not enough play data across archetypes (min. {minGamesDisplay} games).</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {sortedPerf.map((perf: CrossPerformance, idx: number) => {
                    const grade = calculateGrade(perf.cardWr, perf.deckWr);
                    return (
                      <div key={idx} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1 min-w-[2.5rem]">
                          <span className={`text-xl font-black ${grade.color.split(' ')[0]}`}>{grade.letter}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                              <ManaIcons colors={perf.deckColors} size="sm" />
                              <span className="text-sm font-bold text-slate-200 truncate">
                                <span className="md:hidden">{getArchetypeAcronym(perf.deckName)}</span>
                                <span className="hidden md:inline">{normalizeArchetypeName(perf.deckName)}</span>
                              </span>
                            </div>
                            <span className={`text-xs font-bold ${getDeltaStyle(perf.cardWr, perf.deckWr)}`}>{perf.cardWr.toFixed(1)}%</span>
                          </div>
                          <div className="relative h-1.5 bg-slate-800 rounded-full w-full mt-2">
                            {/* Center dot with deck WR tooltip */}
                            <Tooltip
                              content={
                                <div className="text-center whitespace-nowrap">
                                  <div className="text-[10px] text-slate-400 mb-0.5">Deck Win Rate</div>
                                  <div className="text-sm font-black text-white">{perf.deckWr.toFixed(1)}%</div>
                                </div>
                              }
                            >
                              <motion.div
                                onClick={() => markAsSeen('deck-wr-point')}
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-slate-600 hover:bg-slate-500 rounded-full border-2 border-slate-800 z-20 cursor-help transition-colors"
                                animate={isUnseen('deck-wr-point') && idx === 0 ? {
                                  boxShadow: [
                                    '0 0 0 0 rgba(99, 102, 241, 0)',
                                    '0 0 0 6px rgba(99, 102, 241, 0.4)',
                                    '0 0 0 0 rgba(99, 102, 241, 0)',
                                  ],
                                } : {}}
                                transition={{
                                  duration: 1.5,
                                  repeat: Infinity,
                                  repeatDelay: 0.5,
                                }}
                              />
                            </Tooltip>
                            {/* Delta bar */}
                            <div className={`absolute top-0 bottom-0 ${perf.cardWr >= perf.deckWr ? 'bg-emerald-500 left-1/2 rounded-r-full' : 'bg-red-500 right-1/2 rounded-l-full'}`}
                              style={{ width: `${Math.min(Math.abs(perf.cardWr - perf.deckWr) * 4, 50)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* STRATEGIC PAIRINGS SECTION */}
            {synergyLoading ? (
              <div className="pt-6 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Crosshair size={14} className="text-indigo-400" /> Strategic Pairings in Trophy Decks
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[1, 2].map(i => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-4 w-32" />
                      {[1, 2, 3].map(j => <Skeleton key={j} className="h-16 rounded-xl" />)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (topConfidence.length > 0 || topSynergy.length > 0) && (
              <div className="pt-6 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Crosshair size={14} className="text-indigo-400" /> Strategic Pairings in Trophy Decks
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Strategic Complements (Confidence) */}
                  {topConfidence.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Users size={12} className="text-blue-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Partners with</span>
                        <Tooltip content="Shows how frequently these cards are paired together in winning decks.">
                          <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                        </Tooltip>
                      </div>
                      <div className="space-y-3">
                        {topConfidence.map((p, i) => (
                          <StrategicPairingCard key={i} pairing={p} label="PAIRED" colorClass="text-blue-400" allCards={allCards} onCardSelect={onCardSelect} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Synergy Peaks (Lift) */}
                  {topSynergy.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Trophy size={12} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Synergizes with</span>
                        <Tooltip content="Measures the statistical power boost when these two cards are played in the same deck.">
                          <HelpCircle size={12} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                        </Tooltip>
                      </div>
                      <div className="space-y-3">
                        {topSynergy.map((p, i) => (
                          <StrategicPairingCard key={i} pairing={p} label="LIFT" colorClass="text-emerald-400" allCards={allCards} onCardSelect={onCardSelect} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </SwipeableOverlay>
  );
};

// Memoized export pour éviter les re-renders inutiles
export const CardDetailOverlay = React.memo(CardDetailOverlayComponent);
CardDetailOverlay.displayName = 'CardDetailOverlay';