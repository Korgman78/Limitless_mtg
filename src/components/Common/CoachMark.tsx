import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb } from 'lucide-react';

interface CoachMarkProps {
  id: string;
  message: string;
  isVisible: boolean;
  onDismiss: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const CoachMark: React.FC<CoachMarkProps> = ({
  id,
  message,
  isVisible,
  onDismiss,
  position = 'bottom',
  delay = 500,
}) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setShow(true), delay);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isVisible, delay]);

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-indigo-600',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-indigo-600',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-indigo-600',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-indigo-600',
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className={`absolute z-50 ${positionClasses[position]}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative bg-indigo-600 text-white px-3 py-2 rounded-lg shadow-xl shadow-indigo-500/30 max-w-[200px] min-w-[160px]">
            {/* Arrow */}
            <div className={`absolute w-0 h-0 border-[6px] ${arrowClasses[position]}`} />

            {/* Content */}
            <div className="flex items-start gap-2">
              <Lightbulb size={14} className="text-yellow-300 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed flex-1">{message}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="text-white/70 hover:text-white transition-colors flex-shrink-0 -mr-1 -mt-0.5"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Wrapper component that handles the coach mark logic
interface CoachMarkWrapperProps {
  id: string;
  message: string;
  isUnseen: boolean;
  onMarkSeen: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactNode;
  className?: string;
}

export const CoachMarkWrapper: React.FC<CoachMarkWrapperProps> = ({
  id,
  message,
  isUnseen,
  onMarkSeen,
  position = 'bottom',
  delay = 500,
  children,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      {children}
      <CoachMark
        id={id}
        message={message}
        isVisible={isUnseen}
        onDismiss={onMarkSeen}
        position={position}
        delay={delay}
      />
    </div>
  );
};
