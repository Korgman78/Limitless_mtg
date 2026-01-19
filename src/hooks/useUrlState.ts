import { useEffect, useCallback } from 'react';

interface UrlStateConfig {
  set?: string;
  format?: string;
  tab?: string;
  card?: string;
  deck?: string;
}

/**
 * Hook to sync app state with URL query parameters
 * Allows sharing links with specific state
 */
export function useUrlState(
  state: UrlStateConfig,
  onStateFromUrl: (state: UrlStateConfig) => void
) {
  // Read URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlState: UrlStateConfig = {};

    const set = params.get('set');
    const format = params.get('format');
    const tab = params.get('tab');
    const card = params.get('card');
    const deck = params.get('deck');

    if (set) urlState.set = set;
    if (format) urlState.format = format;
    if (tab) urlState.tab = tab;
    if (card) urlState.card = decodeURIComponent(card);
    if (deck) urlState.deck = decodeURIComponent(deck);

    // Only call if we have URL params
    if (Object.keys(urlState).length > 0) {
      onStateFromUrl(urlState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Update URL when state changes (without triggering navigation)
  const updateUrl = useCallback(() => {
    const params = new URLSearchParams();

    if (state.set) params.set('set', state.set);
    if (state.format) params.set('format', state.format);
    if (state.tab) params.set('tab', state.tab);
    if (state.card) params.set('card', encodeURIComponent(state.card));
    if (state.deck) params.set('deck', encodeURIComponent(state.deck));

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    // Use replaceState to avoid polluting browser history
    window.history.replaceState({}, '', newUrl);
  }, [state]);

  useEffect(() => {
    updateUrl();
  }, [updateUrl]);

  // Generate shareable URL
  const getShareableUrl = useCallback(() => {
    const params = new URLSearchParams();

    if (state.set) params.set('set', state.set);
    if (state.format) params.set('format', state.format);
    if (state.tab) params.set('tab', state.tab);
    if (state.card) params.set('card', encodeURIComponent(state.card));
    if (state.deck) params.set('deck', encodeURIComponent(state.deck));

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [state]);

  return { getShareableUrl };
}
