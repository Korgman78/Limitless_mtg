/**
 * Haptic feedback utility for mobile devices
 * Uses the Vibration API when available
 */

export const haptics = {
  // Light tap feedback (10ms) - for buttons, filters
  light: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  },

  // Medium feedback (20ms) - for important actions
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }
  },

  // Success pattern - for completed actions (vote, etc.)
  success: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([10, 50, 20]);
    }
  },

  // Selection feedback (5ms) - very subtle
  selection: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  }
};
