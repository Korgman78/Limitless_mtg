import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronLeft } from 'lucide-react';
import type { SwipeableOverlayProps } from '../../types';

export const SwipeableOverlay: React.FC<SwipeableOverlayProps> = ({ children, onClose, zIndex = 50, title, breadcrumb, onBack }) => {
  const [showHint, setShowHint] = useState(false);

  // Show swipe hint on first open (mobile only)
  useEffect(() => {
    if (window.innerWidth < 768) {
      const hasSeenHint = sessionStorage.getItem('swipe-hint-seen');
      if (!hasSeenHint) {
        setShowHint(true);
        sessionStorage.setItem('swipe-hint-seen', 'true');
        const timer = setTimeout(() => setShowHint(false), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col justify-end md:justify-center md:items-center"
      style={{ zIndex }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full h-[92vh] md:h-auto md:max-h-[90vh] md:max-w-6xl md:w-full bg-gradient-to-b from-slate-900/98 to-slate-950/99 backdrop-blur-xl rounded-t-[30px] md:rounded-[30px] overflow-hidden flex flex-col shadow-2xl border border-white/10 relative"
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.2 }}
        onDragEnd={(_, info) => { if (window.innerWidth < 768 && info.offset.y > 150) onClose(); }}
      >
        {/* Swipe handle with hint */}
        <div className="w-full flex flex-col items-center pt-3 pb-1 absolute top-0 z-20 pointer-events-none md:hidden">
          <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 font-medium"
              >
                <ChevronDown size={12} className="animate-bounce" />
                <span>Swipe down to close</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Header with breadcrumb and back button */}
        {(title || breadcrumb || onBack) && (
          <div className="absolute top-4 left-4 z-50 flex items-center gap-2 max-w-[60%]">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-md border border-white/10 flex-shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {(breadcrumb || title) && (
              <div className="flex items-center gap-1.5 text-sm truncate">
                {breadcrumb && (
                  <>
                    <span className="text-slate-500 truncate">{breadcrumb}</span>
                    <ChevronLeft size={12} className="text-slate-600 rotate-180 flex-shrink-0" />
                  </>
                )}
                {title && <span className="text-white font-semibold truncate">{title}</span>}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-2 right-2 md:top-4 md:right-4 z-50 p-1.5 md:p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-md border border-white/10"
        >
          <X size={16} className="md:hidden" />
          <X size={20} className="hidden md:block" />
        </button>

        {children}
      </motion.div>
    </motion.div>
  );
};
