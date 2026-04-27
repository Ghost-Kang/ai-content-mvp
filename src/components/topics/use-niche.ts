// W4-03 — niche hook shared between NichePanel + TopicCard.
//
// Niche lives in localStorage so a refresh keeps it. Cross-component
// sync within the same tab uses a `CustomEvent`; cross-tab is the
// browser's built-in `storage` event. Both wired so editing the niche
// in NichePanel re-renders every TopicCard immediately.

'use client';

import { useCallback, useEffect, useState } from 'react';

export const NICHE_STORAGE_KEY = 'topic-analysis-niche';
export const NICHE_CHANGE_EVENT = 'niche-changed';

function readStored(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(NICHE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useNiche(): { niche: string; setNiche: (s: string) => void } {
  const [niche, set] = useState<string>('');

  useEffect(() => {
    set(readStored());
    const refresh = () => set(readStored());
    window.addEventListener(NICHE_CHANGE_EVENT, refresh);
    window.addEventListener('storage', (e) => {
      if (e.key === NICHE_STORAGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener(NICHE_CHANGE_EVENT, refresh);
    };
  }, []);

  const setNiche = useCallback((value: string) => {
    set(value);
    try {
      if (value.length === 0) localStorage.removeItem(NICHE_STORAGE_KEY);
      else localStorage.setItem(NICHE_STORAGE_KEY, value);
      window.dispatchEvent(new Event(NICHE_CHANGE_EVENT));
    } catch {
      // Private browsing / quota — non-fatal.
    }
  }, []);

  return { niche, setNiche };
}
