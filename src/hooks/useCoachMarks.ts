import { useState, useEffect, useCallback } from 'react';

export interface CoachMark {
  id: string;
  message: string;
  seen: boolean;
}

const STORAGE_KEY = 'limitless-coach-marks';

const DEFAULT_COACH_MARKS: Record<string, string> = {
  // FormatComparison hints
  'format-toggle-mobile': 'Appuyez sur ⟳ pour voir les stats du second format',
  'format-metric-mode': 'Basculez entre Winrate et Meta Share',
  'format-sort-direction': 'Triez pour voir les surperformances ou sous-performances',
  'format-tap-stats': 'Appuyez sur les stats pour voir les détails',
  // CardDetailOverlay hint
  'deck-wr-point': 'Ce point indique le winrate du deck. Appuyez pour plus de détails.',
  // Sparkline hint
  'sparkline-longpress': 'Appuyez longuement pour voir les détails de tendance',
};

export function useCoachMarks() {
  const [seenMarks, setSeenMarks] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSeenMarks(new Set(parsed));
      }
    } catch (e) {
      console.warn('Failed to load coach marks from localStorage');
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when seenMarks changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenMarks]));
      } catch (e) {
        console.warn('Failed to save coach marks to localStorage');
      }
    }
  }, [seenMarks, isLoaded]);

  const markAsSeen = useCallback((id: string) => {
    setSeenMarks(prev => new Set([...prev, id]));
  }, []);

  const isUnseen = useCallback((id: string): boolean => {
    return isLoaded && !seenMarks.has(id);
  }, [seenMarks, isLoaded]);

  const getMessage = useCallback((id: string): string => {
    return DEFAULT_COACH_MARKS[id] || '';
  }, []);

  const resetAll = useCallback(() => {
    setSeenMarks(new Set());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    isUnseen,
    markAsSeen,
    getMessage,
    resetAll,
    isLoaded,
  };
}
