import { useCallback, useEffect, useState } from "react";

export type ThemePref = "auto" | "light" | "dark";

const STORAGE_KEY = "praxis.theme.preference";

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  } catch {
    // localStorage unavailable (SSR or restricted context)
  }
  return "auto";
}

function applyToDocument(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  if (pref === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

export interface UseThemeResult {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

/**
 * Manages the user's light/dark/auto theme preference.
 *
 * - Reads from `localStorage` on mount; defaults to `"auto"`.
 * - On `setPref`: persists to storage and sets (or removes)
 *   `data-theme` on `<html>`. The `"auto"` branch delegates to the
 *   existing `@media (prefers-color-scheme: dark)` rule in global.css.
 */
export function useTheme(): UseThemeResult {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const stored = readStored();
    // Apply immediately during initialisation so the attribute is set
    // synchronously before the first paint whenever possible.
    applyToDocument(stored);
    return stored;
  });

  // Keep the data-theme attribute in sync whenever pref changes.
  useEffect(() => {
    applyToDocument(pref);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — proceed with in-memory state only
    }
    setPrefState(next);
  }, []);

  return { pref, setPref };
}
