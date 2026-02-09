import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getCardImage } from '../../../utils/helpers';

interface CardZoomOverlayProps {
  cardName: string | null;
  onClose: () => void;
}

export const CardZoomOverlay: React.FC<CardZoomOverlayProps> = ({
  cardName,
  onClose,
}) => (
  <AnimatePresence>
    {cardName && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.82, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col items-center gap-3 max-w-sm w-full"
        >
          <img
            src={getCardImage(cardName)}
            alt={cardName}
            className="max-h-[70vh] w-auto rounded-2xl shadow-2xl border border-slate-600"
          />
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
