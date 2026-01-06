import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: 'top' | 'left'; // Position relative to trigger
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content, position: positionProp = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [placement, setPlacement] = useState<'top' | 'bottom' | 'left'>('top');
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 140;
      const tooltipHeight = 80;
      const padding = 10;

      if (positionProp === 'left') {
        // Position tooltip to the LEFT of trigger - aggressively left
        setPlacement('left');
        setCoords({
          x: rect.left - padding - 70, // Push much further left
          y: rect.top + rect.height / 2
        });
      } else {
        // Position tooltip ABOVE or BELOW trigger
        const spaceAbove = rect.top;
        const newPlacement = spaceAbove < tooltipHeight + padding ? 'bottom' : 'top';
        setPlacement(newPlacement);

        const centerX = rect.left + rect.width / 2;

        // Clamp X to keep tooltip on screen
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

  const getTooltipStyle = (): React.CSSProperties => {
    let transform = '';

    if (placement === 'left') {
      // Tooltip to the left of trigger
      transform = 'translateX(-100%) translateY(-50%)';
    } else if (placement === 'top') {
      transform = 'translateX(-50%) translateY(-100%)';
    } else {
      // bottom
      transform = 'translateX(-50%)';
    }

    return {
      position: 'fixed',
      left: coords.x,
      top: coords.y,
      transform,
      zIndex: 9999,
    };
  };

  const getArrowStyle = (): React.CSSProperties => {
    if (placement === 'left') {
      // Arrow pointing right
      return {
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 0,
        height: 0,
        borderTop: '6px solid transparent',
        borderBottom: '6px solid transparent',
        borderLeft: '6px solid rgba(30, 41, 59, 0.95)',
      };
    }

    // Arrow pointing down (top) or up (bottom)
    return {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      ...(placement === 'top'
        ? { top: '100%', borderTop: '6px solid rgba(30, 41, 59, 0.95)' }
        : { bottom: '100%', borderBottom: '6px solid rgba(30, 41, 59, 0.95)' }
      ),
    };
  };

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onTouchStart={() => setIsVisible(true)}
        onTouchEnd={() => setTimeout(() => setIsVisible(false), 1500)}
      >
        {children}
      </div>

      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={getTooltipStyle()}
            >
              <div className="bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-lg px-3 py-2 shadow-xl shadow-black/40">
                {content}
              </div>
              <div style={getArrowStyle()} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
