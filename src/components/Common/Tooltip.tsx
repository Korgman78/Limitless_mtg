import React, { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'left'; // Position relative to trigger
}

const LONG_PRESS_DELAY = 350; // ms before showing tooltip on mobile

export const Tooltip: React.FC<TooltipProps> = ({ children, content, position: positionProp = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [placement, setPlacement] = useState<'top' | 'bottom' | 'left'>('top');
  const triggerRef = useRef<HTMLDivElement>(null);

  // Long press detection
  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 140;
      const tooltipHeight = 80;
      const padding = 10;

      if (positionProp === 'left') {
        setPlacement('left');
        setCoords({
          x: rect.left - padding - 70,
          y: rect.top + rect.height / 2
        });
      } else {
        const spaceAbove = rect.top;
        const newPlacement = spaceAbove < tooltipHeight + padding ? 'bottom' : 'top';
        setPlacement(newPlacement);

        const centerX = rect.left + rect.width / 2;
        const minX = tooltipWidth / 2 + 10;
        const maxX = window.innerWidth - tooltipWidth / 2 - 10;
        const clampedX = Math.max(minX, Math.min(maxX, centerX));

        setCoords({
          x: clampedX,
          y: newPlacement === 'top' ? rect.top - padding : rect.bottom + padding
        });
      }
    }
  }, [isVisible, positionProp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const getTooltipStyle = (): React.CSSProperties => {
    let transform = '';

    if (placement === 'left') {
      transform = 'translateX(-100%) translateY(-50%)';
    } else if (placement === 'top') {
      transform = 'translateX(-50%) translateY(-100%)';
    } else {
      transform = 'translateX(-50%)';
    }

    return {
      position: 'fixed',
      left: coords.x,
      top: coords.y,
      transform,
      zIndex: 9999,
      pointerEvents: 'none',
    };
  };

  // Touch handlers for long press detection
  const handleTouchStart = useCallback(() => {
    isLongPressRef.current = false;

    longPressTimerRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      setIsVisible(true);
    }, LONG_PRESS_DELAY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    // Clear the timer if touch ends before long press
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If it was a long press, hide tooltip after delay
    if (isLongPressRef.current) {
      setTimeout(() => setIsVisible(false), 1500);
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if user moves finger
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Click handler - only stop propagation if it was a long press
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
    // Reset for next interaction
    isLongPressRef.current = false;
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onClick={handleClick}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {children}
      </div>

      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              style={getTooltipStyle()}
            >
              <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-lg px-3 py-2 shadow-xl shadow-black/40 text-slate-200">
                {content}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
