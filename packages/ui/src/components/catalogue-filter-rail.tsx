import styles from "./catalogue-filter-rail.module.css";

// ── Filter model ──────────────────────────────────────────────────────────────

/** Format facet: which artifact kinds to show. */
export type FormatFilter = "all" | "note" | "flashcard";

/** Saved-filter facet: semantic pre-canned views. */
export type SavedFilter = "due" | "recent" | "orphan" | null;

/** The current filter state — all keys together form AND semantics. */
export interface CatalogueFilters {
  format: FormatFilter;
  saved: SavedFilter;
}

export const DEFAULT_FILTERS: CatalogueFilters = {
  format: "all",
  saved: null,
};

interface CatalogueFilterRailProps {
  filters: CatalogueFilters;
  onChange: (next: CatalogueFilters) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Left-rail filter panel for the Catalogue.
 * Three groups: By format / By saved filter.
 * Clicking an already-active pill deselects it (back to default for that facet).
 */
export function CatalogueFilterRail({ filters, onChange }: CatalogueFilterRailProps) {
  const setFormat = (f: FormatFilter) => {
    onChange({ ...filters, format: filters.format === f ? "all" : f });
  };

  const setSaved = (s: SavedFilter) => {
    onChange({ ...filters, saved: filters.saved === s ? null : s });
  };

  return (
    <aside className={styles.rail} aria-label="Filter catalogue">
      {/* ── By format ── */}
      <div className={styles.group}>
        <h3 className={styles.groupLabel}>By format</h3>
        <fieldset className={styles.pillRow}>
          <FormatPill
            label="All"
            glyph="¶"
            active={filters.format === "all"}
            onClick={() => setFormat("all")}
          />
          <FormatPill
            label="Notes"
            glyph="¶"
            active={filters.format === "note"}
            onClick={() => setFormat("note")}
          />
          <FormatPill
            label="Flashcards"
            glyph="‖"
            active={filters.format === "flashcard"}
            onClick={() => setFormat("flashcard")}
          />
        </fieldset>
      </div>

      {/* ── Saved filters ── */}
      <div className={styles.group}>
        <h3 className={styles.groupLabel}>Saved</h3>
        <fieldset className={styles.pillRow}>
          <SavedPill
            label="due for review"
            active={filters.saved === "due"}
            onClick={() => setSaved("due")}
          />
          <SavedPill
            label="recent (today)"
            active={filters.saved === "recent"}
            onClick={() => setSaved("recent")}
          />
          <SavedPill
            label="orphan (unlinked)"
            active={filters.saved === "orphan"}
            onClick={() => setSaved("orphan")}
          />
        </fieldset>
      </div>
    </aside>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FormatPillProps {
  label: string;
  glyph: string;
  active: boolean;
  onClick: () => void;
}

function FormatPill({ label, glyph, active, onClick }: FormatPillProps) {
  return (
    <button
      type="button"
      className={`${styles.pill} ${active ? styles.active : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={styles.pillGlyph} aria-hidden="true">
        {glyph}
      </span>
      {label}
    </button>
  );
}

interface SavedPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function SavedPill({ label, active, onClick }: SavedPillProps) {
  return (
    <button
      type="button"
      className={`${styles.pill} ${active ? styles.active : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
