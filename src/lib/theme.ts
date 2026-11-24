'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const storageKey = 'ppob-theme';
const themeEvent = 'ppob-theme-change';

function readStoredTheme(): ThemeMode | null {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function readDocumentTheme(): ThemeMode | null {
  const value = document.documentElement.dataset.theme;
  return value === 'light' || value === 'dark' ? value : null;
}

function systemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return readDocumentTheme() ?? readStoredTheme() ?? systemTheme();
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // Theme still applies for this page even when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<ThemeMode>(themeEvent, { detail: mode }));
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const sync = () => setTheme(getTheme());
    sync();
    window.addEventListener(themeEvent, sync);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (!readStoredTheme()) sync();
    };
    media.addEventListener('change', onSystemChange);
    return () => {
      window.removeEventListener(themeEvent, sync);
      media.removeEventListener('change', onSystemChange);
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    applyTheme(mode);
    setTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }, []);

  return { theme, setTheme: setThemeMode, toggleTheme };
}
