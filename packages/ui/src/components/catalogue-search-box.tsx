import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./catalogue-search-box.module.css";

interface CatalogueSearchBoxProps {
  /** Debounced query change handler. Called after 250 ms of inactivity. */
  onSearchChange: (query: string) => void;
  /** Result count to display at the right of the row; omit while loading. */
  resultCount?: number;
}

/**
 * Big italic serif search field — the visual anchor of the Catalogue header.
 * Debounces input by 250 ms before calling onSearchChange.
 */
export function CatalogueSearchBox({ onSearchChange, resultCount }: CatalogueSearchBoxProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.currentTarget.value;
      setValue(q);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearchChange(q);
      }, 250);
    },
    [onSearchChange],
  );

  // Clear pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <search className={styles.searchRow}>
      <span className={styles.glyph} aria-hidden="true">
        ⌕
      </span>
      <input
        className={styles.input}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="search notes, sketches, cards · or a concept, a lesson, a phrase…"
        aria-label="Search catalogue"
        autoComplete="off"
        spellCheck={false}
      />
      {resultCount !== undefined && (
        <span className={styles.count} aria-live="polite" aria-atomic="true">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </span>
      )}
    </search>
  );
}
