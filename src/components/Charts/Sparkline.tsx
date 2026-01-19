import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SparklineProps } from '../../types';
import { Tooltip } from '../Common/Tooltip';

export const Sparkline: React.FC<SparklineProps & { width?: number; height?: number }> = ({
  data,
  width = 40,
  height = 20
}) => {
  const safeData: number[] = (data && data.length > 0) ? data : [0, 0];

  const first = safeData[0];
  const last = safeData[safeData.length - 1];
  const delta = last - first;
  const days = safeData.length;

  // Seuil de significativité : entre -0.1 et +0.1 est considéré comme stable
  const isRising = delta > 0.1;
  const isFalling = delta < -0.1;
  const isFlat = !isRising && !isFalling;

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;

  // Calculer les points de la ligne
  const pointsData = useMemo(() => {
    if (isFlat) {
      return [
        { x: 0, y: height / 2 },
        { x: width, y: height / 2 }
      ];
    }
    return safeData.map((d: number, i: number) => ({
      x: (i / ((safeData.length - 1) || 1)) * width,
      y: height - ((d - min) / range) * height
    }));
  }, [safeData, width, height, min, range, isFlat]);

  const points = pointsData.map(p => `${p.x},${p.y}`).join(' ');

  // Chemin pour l'area fill (ferme le polygone en bas)
  const areaPath = useMemo(() => {
    const pathPoints = pointsData.map(p => `${p.x},${p.y}`).join(' L');
    return `M${pathPoints} L${width},${height} L0,${height} Z`;
  }, [pointsData, width, height]);

  // Position du dernier point
  const lastPoint = pointsData[pointsData.length - 1];

  const colorClass = isRising ? 'text-emerald-400' : isFalling ? 'text-red-400' : 'text-slate-400';
  const strokeColor = isRising ? '#10b981' : isFalling ? '#ef4444' : '#64748b';
  const glowColor = isRising ? '#10b981' : isFalling ? '#ef4444' : '#64748b';
  const Icon = isRising ? TrendingUp : isFalling ? TrendingDown : Minus;

  // ID unique pour le gradient (évite les conflits si plusieurs sparklines)
  const gradientId = useMemo(() => `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`, []);
  const glowId = useMemo(() => `sparkline-glow-${Math.random().toString(36).substr(2, 9)}`, []);

  const tooltipContent = (
    <div className="flex flex-col items-center gap-1 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={colorClass} />
        <span className={`text-sm font-black ${colorClass}`}>
          {isRising ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="text-[10px] text-slate-400">
        {first.toFixed(1)}% → {last.toFixed(1)}%
      </div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">
        over {days} days
      </div>
    </div>
  );

  const svgElement = (
    <svg width={width} height={height} className="overflow-visible pointer-events-none">
      <defs>
        {/* Gradient pour l'area fill */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
        {/* Filtre glow pour le point */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Area fill avec gradient */}
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
      />

      {/* Ligne principale */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Point lumineux à la fin */}
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="3"
        fill={strokeColor}
        filter={`url(#${glowId})`}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="1.5"
        fill="white"
      />
    </svg>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div
        className="relative flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity cursor-help"
        style={{ width, height, padding: 8 }}
      >
        {svgElement}
      </div>
    </Tooltip>
  );
};
