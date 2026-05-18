import type { NoteBody } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ArtifactCard } from "../../components/artifact-card.js";
import {
  CatalogueFilterRail,
  type CatalogueFilters,
  DEFAULT_FILTERS,
} from "../../components/catalogue-filter-rail.js";
import { CatalogueSearchBox } from "../../components/catalogue-search-box.js";
import { NoteFormatPicker } from "../../components/note-format-picker.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useResource } from "../../hooks/use-resource.js";
import styles from "./notes-list.module.css";

// ── Note format helpers ───────────────────────────────────────────────────────

type NoteFormat = "cornell" | "feynman" | "outline" | "free";

function emptyBody(format: NoteFormat): NoteBody {
  switch (format) {
    case "cornell":
      return { kind: "cornell", questions: [""], details: [""], summary: "" };
    case "feynman":
      return { kind: "feynman", explanation: "", followUps: [] };
    case "outline":
      return { kind: "outline", root: { text: "", children: [] } };
    case "free":
      return { kind: "free", text: "" };
  }
}

// ── Recency constant ──────────────────────────────────────────────────────────

/** 24 hours in milliseconds — "recent today" filter window. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// ── NotesListTab (Catalogue) ──────────────────────────────────────────────────

/**
 * Workspace Catalogue — search-first flat index of every artifact the student
 * has made: notes (all formats), flashcards, sketches surface together with the
 * same card primitive, distinguished by mono kicker.
 *
 * Layout: big italic search box at top, left filter rail, result grid.
 * Filters compose with AND semantics; search is debounced 250 ms.
 *
 * No RouteHeader: this is a tab panel inside <WorkspaceRoute>.
 */
export function NotesListTab() {
  const client = usePraxisClient();
  const navigate = useNavigate();

  // ── State ──
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CatalogueFilters>(DEFAULT_FILTERS);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Library search ──
  const loader = useCallback(() => {
    const params: Parameters<typeof client.library.search>[0] = {};
    if (query.trim()) params.query = query.trim();
    if (filters.saved === "due") params.dueOnly = true;
    if (filters.saved === "recent") params.recentWindowMs = RECENT_WINDOW_MS;
    if (filters.saved === "orphan") params.orphan = true;
    return client.library.search(params);
  }, [client, query, filters.saved]);

  const { data: allHits, loading, error } = useResource(loader);

  // ── Client-side format facet (cheap, no round-trip) ──
  const hits = (allHits ?? []).filter((h) => {
    if (filters.format === "all") return true;
    if (filters.format === "note") return h.kind === "note";
    if (filters.format === "flashcard") return h.kind === "flashcard";
    return true;
  });

  // ── New-note handlers ──
  const handleNewNote = () => {
    setShowFormatPicker(true);
    setCreateError(null);
  };

  const handleFormatSelect = async (format: NoteFormat) => {
    setShowFormatPicker(false);
    setCreating(true);
    setCreateError(null);
    try {
      const note = await client.notes.create({
        format,
        body: emptyBody(format),
        context: {},
      });
      await navigate({ to: "/workspace/notes/$noteId", params: { noteId: note.id } });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  };

  // ── Card navigation ──
  const handleCardClick = useCallback(
    (hit: (typeof hits)[number]) => {
      if (hit.kind === "note") {
        navigate({ to: "/workspace/notes/$noteId", params: { noteId: hit.id } });
      }
      // Flashcard navigation: for now, navigate to cards list
      // (full flashcard editor routing is a separate story)
    },
    [navigate],
  );

  // ── Render ──
  return (
    <div>
      {/* ── Catalogue head ── */}
      <header className={styles.catalogueHead}>
        <p className={styles.kicker}>¶ workspace · the catalogue</p>
        <h1 className={styles.headTitle}>
          Everything you&apos;ve <em>made</em>
        </h1>
        <CatalogueSearchBox
          onSearchChange={setQuery}
          resultCount={loading ? undefined : hits.length}
        />
      </header>

      {/* ── Two-column layout ── */}
      <div className={styles.layout}>
        <CatalogueFilterRail filters={filters} onChange={setFilters} />

        <main className={styles.results} aria-label="Catalogue results" aria-busy={loading}>
          {createError && <p className={styles.error}>{createError}</p>}

          {loading && <p className={styles.status}>Loading…</p>}
          {!loading && error && <p className={styles.error}>{error}</p>}

          {!loading && !error && hits.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyPrimary}>
                {query || filters.saved ? "No matches." : "Nothing here yet."}
              </p>
              <p className={styles.emptyHint}>
                {query || filters.saved
                  ? "Try a different search or clear the filters."
                  : "Take your first note — pick a format and start writing."}
              </p>
              {!query && !filters.saved && (
                <button
                  type="button"
                  className={styles.newBtn}
                  onClick={handleNewNote}
                  disabled={creating}
                >
                  {creating ? "Creating…" : "+ New note"}
                </button>
              )}
            </div>
          )}

          {!loading &&
            !error &&
            hits.length > 0 &&
            hits.map((hit) => (
              <ArtifactCard
                key={`${hit.kind}-${hit.id}`}
                hit={hit}
                onClick={() => handleCardClick(hit)}
              />
            ))}
        </main>
      </div>

      {/* ── Format picker modal ── */}
      {showFormatPicker && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerModal}>
            <NoteFormatPicker
              onSelect={handleFormatSelect}
              onCancel={() => setShowFormatPicker(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
