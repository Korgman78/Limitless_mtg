import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SparklineProps } from '../../types';

// On étend les props pour accepter width/height optionnels
export const Sparkline: React.FC<SparklineProps & { width?: number; height?: number }> = ({ 
  data, 
  width = 40, 
  height = 20 
}) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const safeData: number[] = (data && data.length > 0) ? data : [0, 0];

  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;

  // On utilise les props width/height pour le calcul des points
  const points = safeData.map((d: number, i: number) => {
    const x = (i / ((safeData.length - 1) || 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const first = safeData[0];
  const last = safeData[safeData.length - 1];
  const delta = last - first;
  const isRising = delta >= 0;
  const days = safeData.length;

  return (
    <div
      className="relative flex flex-col items-end opacity-80 cursor-help"
      // On applique la taille au conteneur pour garantir l'espace
      style={{ width, height }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={isRising ? "#10b981" : "#ef4444"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            // Le tooltip reste indépendant de la taille du SVG
            className="absolute bottom-full mb-2 right-0 bg-slate-800 text-[9px] font-bold py-1 px-2 rounded border border-slate-700 whitespace-nowrap z-50 shadow-xl"
          >
            <span className={isRising ? "text-emerald-400" : "text-red-400"}>
              {isRising ? '+' : ''}{delta.toFixed(1)}%
            </span>
            <span className="text-slate-400 ml-1 font-medium italic">since {days} days</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};