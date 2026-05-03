/**
 * Phase 15b: /courses/$courseId/concept-maps/$conceptMapId — the concept-map editor.
 *
 * Renders tldraw directly (not via SketchCanvas) so we can capture the Editor
 * instance and pass it to the overlays. The behavior is identical to
 * <SketchCanvas variant="full"> — full chrome, debounced onChange, loadSnapshot
 * on mount — but with the editor exposed via editorRef.
 *
 * Two overlays layered over the canvas:
 *   <ConceptLinkOverlay /> — typeahead on text-shape label edits; § markers.
 *   <CanonicalHintsOverlay /> — ghost cards for unlinked canonical concepts.
 *
 * Concept-link reconciliation: before each updateScene call, links whose
 * elementId no longer exists in the scene are dropped.
 */
import type { ConceptLink, CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Editor, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { CanonicalHintsOverlay } from "../components/canonical-hints-overlay.js";
import { ConceptLinkOverlay } from "../components/concept-link-overlay.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import styles from "./concept-map-editor.module.css";

// ── Relative time helper ───────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConceptMapEditorRoute() {
  const { courseId: rawCourseId, conceptMapId: rawMapId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;
  const conceptMapId = rawMapId ? brandId<"ConceptMapId">(rawMapId) : undefined;

  const client = usePraxisClient();
  const navigate = useNavigate();

  // ── Load the map ────────────────────────────────────────────────────────
  const mapLoader = useCallback(
    () => (conceptMapId ? client.conceptMaps.get(conceptMapId) : Promise.resolve(null)),
    [client, conceptMapId],
  );

  const {
    data: map,
    loading: mapLoading,
    error: mapError,
    setData: setMap,
  } = useResource(mapLoader);

  // ── Load version count ──────────────────────────────────────────────────
  const versionsLoader = useCallback(
    () => (conceptMapId ? client.conceptMaps.listVersions(conceptMapId) : Promise.resolve([])),
    [client, conceptMapId],
  );
  const { data: versions } = useResource(versionsLoader);
  const versionCount = versions?.length ?? 0;

  // ── Editor and canvas refs ──────────────────────────────────────────────
  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Concept links state ─────────────────────────────────────────────────
  const [conceptLinks, setConceptLinks] = useState<ConceptLink[]>([]);

  // Sync conceptLinks when the map first loads.
  useEffect(() => {
    if (map) setConceptLinks(map.conceptLinks ?? []);
  }, [map]);

  // ── Hints overlay toggle ────────────────────────────────────────────────
  const [showHints, setShowHints] = useState(false);

  // ── Rename state ────────────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // ── Keep a stable ref to conceptLinks for the debounced save closure ────
  const conceptLinksRef = useRef(conceptLinks);
  conceptLinksRef.current = conceptLinks;

  // ── Reconcile links against current shapes ─────────────────────────────
  const reconcileLinks = useCallback((links: ConceptLink[]): ConceptLink[] => {
    const editor = editorRef.current;
    if (!editor) return links;
    const shapeIds = new Set(editor.getCurrentPageShapes().map((s) => s.id as string));
    return links.filter((l) => shapeIds.has(l.elementId));
  }, []);

  // ── Save scene to server (debounced 500ms) ──────────────────────────────
  const doSave = useCallback(
    async (snapshot: unknown, links: ConceptLink[]) => {
      if (!conceptMapId) return;
      const reconciled = reconcileLinks(links);
      try {
        const updated = await client.conceptMaps.updateScene({
          id: conceptMapId,
          // biome-ignore lint/suspicious/noExplicitAny: tldraw snapshot is opaque
          scene: snapshot as any,
          conceptLinks: reconciled,
        });
        setMap(updated);
        // Only update links if reconciliation removed something.
        if (reconciled.length !== links.length) {
          setConceptLinks(reconciled);
        }
      } catch {
        // Non-fatal — next successful save will sync.
      }
    },
    [client, conceptMapId, reconcileLinks, setMap],
  );

  const debouncedSave = useCallback(
    (snapshot: unknown) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doSave(snapshot, conceptLinksRef.current);
      }, 500);
    },
    [doSave],
  );

  // ── tldraw onMount ──────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — handleMount runs once on mount; map.scene is the initial value; re-subscribing on every map change would cause double-subscription
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Restore initial snapshot.
      if (map?.scene != null) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: tldraw snapshot is opaque
          editor.loadSnapshot(map.scene as any);
        } catch {
          // Malformed snapshot — start fresh.
        }
      }

      // Subscribe to store changes for debounced saves.
      return editor.store.listen(() => {
        const snapshot = editor.getSnapshot();
        debouncedSave(snapshot);
      });
    },
    [debouncedSave],
  );

  // ── Link handler — called by ConceptLinkOverlay ─────────────────────────
  const handleLink = useCallback(
    (link: ConceptLink) => {
      setConceptLinks((prev) => {
        const filtered = prev.filter((l) => l.elementId !== link.elementId);
        const next = [...filtered, link];
        // Trigger immediate save.
        const editor = editorRef.current;
        if (editor) doSave(editor.getSnapshot(), next);
        return next;
      });
    },
    [doSave],
  );

  // ── Add-to-map handler — called by CanonicalHintsOverlay ───────────────
  const handleAddToMap = useCallback(
    (link: ConceptLink) => {
      handleLink(link);
    },
    [handleLink],
  );

  // ── Rename handlers ─────────────────────────────────────────────────────
  const handleRenameStart = useCallback(() => {
    setNewTitle(map?.title ?? "");
    setRenaming(true);
  }, [map]);

  const handleRenameCommit = useCallback(async () => {
    if (!conceptMapId || !newTitle.trim()) {
      setRenaming(false);
      return;
    }
    try {
      const updated = await client.conceptMaps.rename(conceptMapId, newTitle.trim());
      setMap(updated);
    } catch {
      // Non-fatal.
    }
    setRenaming(false);
  }, [client, conceptMapId, newTitle, setMap]);

  // ── Derived state ───────────────────────────────────────────────────────
  const drawnConceptIds = useMemo(() => conceptLinks.map((l) => l.conceptId), [conceptLinks]);

  const deck = map
    ? `${versionCount} version${versionCount !== 1 ? "s" : ""} · last edit ${relativeTime(map.updatedAt)}`
    : "";

  // ── Loading / error states ──────────────────────────────────────────────
  if (mapLoading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>{COPY.loading.default}</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className={styles.layout}>
        <p className={styles.error}>{mapError}</p>
      </div>
    );
  }

  if (!map) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Map not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Header */}
      <RouteHeader
        ornament="§"
        kicker="CONCEPT MAP"
        title={map.title}
        deck={deck}
        actions={
          <button
            type="button"
            className={styles.backBtn}
            onClick={() =>
              navigate({
                to: "/courses/$courseId/concept-maps",
                params: { courseId: rawCourseId ?? "" },
              })
            }
          >
            ← Maps
          </button>
        }
      />

      {/* Rename inline form */}
      {renaming && (
        <div className={styles.renameRow}>
          <input
            className={styles.renameInput}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameCommit();
              if (e.key === "Escape") setRenaming(false);
            }}
            // biome-ignore lint/a11y/noAutofocus: rename input is shown by explicit user action
            autoFocus
            aria-label="Map title"
          />
          <button
            type="button"
            className={styles.renameSaveBtn}
            onClick={() => void handleRenameCommit()}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.renameCancelBtn}
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolbarBtn} onClick={() => setShowHints((s) => !s)}>
          {showHints ? "Hide" : "Show"} canonical hints
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={handleRenameStart}>
          Rename
        </button>
      </div>

      {/* Canvas container — position: relative, overlays are position: absolute */}
      <div className={styles.canvasContainer}>
        {/* Render tldraw directly so we can access the Editor via onMount */}
        <div className={styles.canvasInner}>
          <Tldraw onMount={handleMount} />
        </div>

        {/* ConceptLinkOverlay — always visible; watches for label edits */}
        {courseId && (
          <ConceptLinkOverlay
            map={{ ...map, conceptLinks }}
            editorRef={editorRef}
            courseId={courseId as CourseId}
            onLink={handleLink}
          />
        )}

        {/* CanonicalHintsOverlay — only when toggled on */}
        {showHints && courseId && (
          <CanonicalHintsOverlay
            courseId={courseId as CourseId}
            drawnConceptIds={drawnConceptIds}
            editorRef={editorRef}
            onAddToMap={handleAddToMap}
          />
        )}
      </div>
    </div>
  );
}
