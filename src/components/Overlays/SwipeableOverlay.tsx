import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SwipeableOverlayProps } from '../../types';

export const SwipeableOverlay: React.FC<SwipeableOverlayProps> = ({ children, onClose, zIndex = 50 }) => {
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
        <div className="w-full flex justify-center pt-3 pb-1 absolute top-0 z-20 pointer-events-none md:hidden">
          <div className="w-12 h-1.5 bg-slate-700 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors backdrop-blur-md border border-white/10"
        >
          <X size={20} />
        </button>

        {children}
      </motion.div>
    </motion.div>
  );
};
