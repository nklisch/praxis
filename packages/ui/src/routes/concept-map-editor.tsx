/**
 * Concept-map editor — canonical-hints panel layout.
 *
 * Three-column layout per locked mock:
 *   Left rail  (56px)  — drawing tools (select / node / edge / text / pen / box / erase)
 *   Center     (1fr)   — tldraw canvas with ConceptLinkOverlay
 *   Right panel (320px) — canonical match candidates + confidence + definition +
 *                         source citation + RipplesPanel
 *
 * The CanonicalHintsOverlay (ghost cards for undrawn concepts) was previously
 * floating inside the canvas; it now lives in the right panel's "Unlinked nodes"
 * section below the candidate cards.
 *
 * Selected-node tracking: the store listener watches tldraw's selection and fires
 * `onSelectionChange` whenever a single text/geo shape is selected, exposing the
 * shapeId and its label so the right panel can show match candidates + ripples.
 */

import { matchConceptByLabel } from "@praxis/core/services/concept-link-matcher";
import type { ConceptId, ConceptLink, ConceptMapId, CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createShapeId, type Editor, Tldraw, toRichText } from "tldraw";
import "tldraw/tldraw.css";
import { ConceptLinkOverlay } from "../components/concept-link-overlay.js";
import { RipplesPanel } from "../components/ripples-panel.js";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import styles from "./concept-map-editor.module.css";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CanonicalConcept {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
}

interface SelectedNodeState {
  shapeId: string;
  label: string;
}

// ── Relative time helper ──────────────────────────────────────────────────────

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

// ── Tool definitions ──────────────────────────────────────────────────────────

interface ToolDef {
  id: string;
  glyph: string;
  label: string;
  title: string;
}

// Tool groups — defined directly to avoid noUncheckedIndexedAccess on array literals.
const TOOL_GROUPS: readonly (readonly ToolDef[])[] = [
  [
    { id: "select", glyph: "↘", label: "select", title: "Select (V)" },
    { id: "text", glyph: "T", label: "node", title: "Concept node (T)" },
    { id: "arrow", glyph: "⟶", label: "edge", title: "Edge (A)" },
    { id: "text", glyph: "✎", label: "text", title: "Free text" },
  ],
  [
    { id: "draw", glyph: "✎", label: "pen", title: "Sketch / pen (P)" },
    { id: "geo", glyph: "▢", label: "box", title: "Shape / box (R)" },
  ],
  [{ id: "eraser", glyph: "⌫", label: "erase", title: "Eraser (E)" }],
] as const;

// Confidence → star string
function stars(confidence: number): string {
  if (confidence >= 0.8) return "★★★";
  if (confidence >= 0.5) return "★★";
  return "★";
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ConceptMapEditorRoute() {
  const { courseId: rawCourseId, conceptMapId: rawMapId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;
  const conceptMapId = rawMapId ? brandId<"ConceptMapId">(rawMapId) : undefined;

  const client = usePraxisClient();
  const navigate = useNavigate();

  // ── Load the map ─────────────────────────────────────────────────────────
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

  // ── Load version count ────────────────────────────────────────────────────
  const versionsLoader = useCallback(
    () => (conceptMapId ? client.conceptMaps.listVersions(conceptMapId) : Promise.resolve([])),
    [client, conceptMapId],
  );
  const { data: versions } = useResource(versionsLoader);
  const versionCount = versions?.length ?? 0;

  // ── Canonical concepts (needed for right panel matching) ──────────────────
  const [concepts, setConcepts] = useState<CanonicalConcept[]>([]);
  useEffect(() => {
    if (!courseId) return;
    client.artifacts
      .concepts(courseId as CourseId)
      .then(setConcepts)
      .catch(() => {
        // Non-fatal — right panel matching will be empty.
      });
  }, [client, courseId]);

  // ── Editor and canvas refs ────────────────────────────────────────────────
  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Concept links state ───────────────────────────────────────────────────
  const [conceptLinks, setConceptLinks] = useState<ConceptLink[]>([]);

  // Sync conceptLinks when the map first loads.
  useEffect(() => {
    if (map) setConceptLinks(map.conceptLinks ?? []);
  }, [map]);

  // ── Selected node state (drives right panel) ──────────────────────────────
  const [selectedNode, setSelectedNode] = useState<SelectedNodeState | null>(null);

  // ── Active tool state ─────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState("select");

  // ── Rename state ──────────────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // ── Keep a stable ref to conceptLinks for the debounced save closure ──────
  const conceptLinksRef = useRef(conceptLinks);
  conceptLinksRef.current = conceptLinks;

  // ── Reconcile links against current shapes ────────────────────────────────
  const reconcileLinks = useCallback((links: ConceptLink[]): ConceptLink[] => {
    const editor = editorRef.current;
    if (!editor) return links;
    const shapeIds = new Set(editor.getCurrentPageShapes().map((s) => s.id as string));
    return links.filter((l) => shapeIds.has(l.elementId));
  }, []);

  // ── Save scene to server (debounced 500ms) ────────────────────────────────
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

  // ── tldraw onMount ────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — handleMount runs once on mount; map.scene is the initial value
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

      // Subscribe to store changes: debounced save + selection tracking.
      return editor.store.listen(() => {
        const snapshot = editor.getSnapshot();
        debouncedSave(snapshot);

        // Track selected shape for right panel.
        const selectedIds = editor.getSelectedShapeIds();
        if (selectedIds.length === 1) {
          // noUncheckedIndexedAccess: length === 1 guarantees index 0 is defined.
          // biome-ignore lint/style/noNonNullAssertion: length === 1 guards this
          const selectedId = selectedIds[0]!;
          const shapeId = selectedId as string;
          const shape = editor.getShape(selectedId);
          if (shape) {
            let label = "";
            try {
              const util = editor.getShapeUtil(shape);
              if ("getText" in util && typeof util.getText === "function") {
                label = util.getText(shape) ?? "";
              }
            } catch {
              // Fallback.
            }
            if (!label) {
              // Try legacy text prop.
              const props = (shape as { props?: { text?: string } }).props;
              label = props?.text ?? "";
            }
            setSelectedNode({ shapeId, label });
          }
        } else {
          setSelectedNode(null);
        }
      });
    },
    [debouncedSave],
  );

  // ── Handle tool selection ─────────────────────────────────────────────────
  const handleToolSelect = useCallback((toolId: string) => {
    setActiveTool(toolId);
    const editor = editorRef.current;
    if (editor) {
      try {
        editor.setCurrentTool(toolId);
      } catch {
        // Tool id may not be exact — tldraw is tolerant.
      }
    }
  }, []);

  // ── Link handler — called by ConceptLinkOverlay ───────────────────────────
  const handleLink = useCallback(
    (link: ConceptLink) => {
      setConceptLinks((prev) => {
        const filtered = prev.filter((l) => l.elementId !== link.elementId);
        const next = [...filtered, link];
        const editor = editorRef.current;
        if (editor) doSave(editor.getSnapshot(), next);
        return next;
      });
    },
    [doSave],
  );

  // ── Add concept to map from right panel ───────────────────────────────────
  const handleAddToMap = useCallback(
    (link: ConceptLink) => {
      handleLink(link);
    },
    [handleLink],
  );

  // ── Rename handlers ───────────────────────────────────────────────────────
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

  // ── Derived: candidates for selected node ────────────────────────────────
  const linkedConceptIds = useMemo(
    () => new Set(conceptLinks.map((l) => l.conceptId as string)),
    [conceptLinks],
  );

  const selectedNodeCandidates = useMemo(() => {
    if (!selectedNode?.label || concepts.length === 0) return [];
    return matchConceptByLabel(selectedNode.label, concepts, 0.35)
      .filter((m) => !linkedConceptIds.has(m.conceptId))
      .slice(0, 5);
  }, [selectedNode, concepts, linkedConceptIds]);

  // The top candidate drives RipplesPanel — the one Praxis would suggest.
  const topCandidate = selectedNodeCandidates[0] ?? null;
  const [chosenCandidateId, setChosenCandidateId] = useState<ConceptId | null>(null);

  // Reset chosen candidate when the selected shape id changes.
  const selectedShapeId = selectedNode?.shapeId ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedShapeId is the trigger; setChosenCandidateId is stable
  useEffect(() => {
    setChosenCandidateId(null);
  }, [selectedShapeId]);

  const activeCandidateId = chosenCandidateId ?? (topCandidate?.conceptId as ConceptId | null);

  // ── Derived: undrawn concepts (for right panel bottom section) ────────────
  const drawnConceptIds = useMemo(() => conceptLinks.map((l) => l.conceptId), [conceptLinks]);
  // biome-ignore lint/suspicious/noExplicitAny: branded string cast
  const drawnSet = new Set(drawnConceptIds as any as string[]);
  const undrawnConcepts = concepts.filter((c) => !drawnSet.has(c.id));

  // ── Derived: node state counts for canvas legend ─────────────────────────
  const linkedCount = conceptLinks.filter((l) => (l.linkState ?? "linked") === "linked").length;
  const bestGuessCount = conceptLinks.filter((l) => l.linkState === "best_guess").length;
  const totalShapeCount = editorRef.current?.getCurrentPageShapes().length ?? 0;
  const unlinkedCount = Math.max(0, totalShapeCount - conceptLinks.length);

  const deck = map
    ? `${versionCount} version${versionCount !== 1 ? "s" : ""} · last edit ${relativeTime(map.updatedAt)}`
    : "";

  // ── Loading / error states ────────────────────────────────────────────────
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
    <div className={styles.layout} data-testid="concept-map-editor">
      {/* ── Editor strip: kicker + title + actions ─────────────────────── */}
      <div className={styles.editorStrip}>
        <span className={styles.editorKicker}>‡ Concept map</span>
        {renaming ? (
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
        ) : (
          <h1 className={styles.editorTitle}>{map.title}</h1>
        )}
        <span className={styles.editorDeck}>{deck}</span>
        <div className={styles.editorActions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() =>
              navigate({
                to: "/courses/$courseId/concept-maps",
                params: { courseId: rawCourseId ?? "" },
              })
            }
          >
            ← Maps
          </button>
          <button type="button" className={styles.actionBtn} onClick={handleRenameStart}>
            Rename
          </button>
        </div>
      </div>

      {/* ── Three-column surface ────────────────────────────────────────── */}
      <div className={styles.surface} data-testid="three-column-surface">
        {/* Left tools rail */}
        <div className={styles.toolsRail} data-testid="tools-rail">
          {TOOL_GROUPS.map((group) => (
            <div key={group.map((t) => t.id).join("-")} className={styles.toolGroup}>
              {group.map((tool) => (
                <button
                  key={`${tool.id}-${tool.label}`}
                  type="button"
                  className={`${styles.tool} ${activeTool === tool.id ? styles.toolActive : ""}`}
                  title={tool.title}
                  aria-label={tool.title}
                  onClick={() => handleToolSelect(tool.id)}
                >
                  <span className={styles.toolGlyph} aria-hidden="true">
                    {tool.glyph}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <span className={styles.toolMeta} aria-hidden="true">
            {activeTool}
          </span>
        </div>

        {/* Canvas — tldraw + ConceptLinkOverlay */}
        <div className={styles.canvas} data-testid="canvas-area">
          <div className={styles.canvasInner}>
            <Tldraw onMount={handleMount} />
          </div>

          {/* ConceptLinkOverlay — always visible; watches for label edits + renders glyphs */}
          {courseId && (
            <ConceptLinkOverlay
              map={{ ...map, conceptLinks }}
              editorRef={editorRef}
              courseId={courseId as CourseId}
              onLink={handleLink}
            />
          )}

          {/* Canvas legend — node state counts */}
          <section className={styles.canvasLegend} aria-label="Node state counts">
            <span className={`${styles.legendPill} ${styles.legendLinked}`}>
              <span className={styles.legendDot} />
              linked · {linkedCount}
            </span>
            <span className={`${styles.legendPill} ${styles.legendSuggested}`}>
              <span className={styles.legendDot} />
              best-guess · {bestGuessCount}
            </span>
            <span className={`${styles.legendPill} ${styles.legendUnlinked}`}>
              <span className={styles.legendDot} />
              unlinked · {unlinkedCount}
            </span>
          </section>
        </div>

        {/* Right panel — canonical hints + ripples */}
        <aside className={styles.hintsPanel} data-testid="hints-panel">
          {/* Selected node info */}
          <section className={styles.hintSection}>
            <h3 className={styles.hintSectionTitle}>
              {selectedNode ? `Selected · "${selectedNode.label}"` : "Selected node"}
            </h3>
            {selectedNode ? (
              <div className={styles.selectionCard}>
                <div className={styles.selectionKicker}>your node · best-guess candidates</div>
                <div className={styles.selectionTitle}>{selectedNode.label}</div>
              </div>
            ) : (
              <p className={styles.hintEmpty}>
                Click a node on the canvas to see canonical matches.
              </p>
            )}
          </section>

          {/* Canonical match candidates */}
          {selectedNode && (
            <section className={styles.hintSection}>
              <h3 className={styles.hintSectionTitle}>Canonical match candidates</h3>
              {selectedNodeCandidates.length > 0 ? (
                <ul className={styles.candidateList}>
                  {selectedNodeCandidates.map((match) => {
                    const concept = concepts.find((c) => c.id === match.conceptId);
                    const isChosen = chosenCandidateId === (match.conceptId as ConceptId);
                    return (
                      <li key={match.conceptId}>
                        <button
                          type="button"
                          className={`${styles.candidate} ${isChosen ? styles.candidateChosen : ""}`}
                          onClick={() => {
                            const cid = match.conceptId as ConceptId;
                            setChosenCandidateId((prev) => (prev === cid ? null : cid));
                          }}
                          aria-pressed={isChosen}
                        >
                          <div className={styles.candidateHead}>
                            <span className={styles.candidateName}>{match.conceptName}</span>
                            <span className={styles.candidateConfidence}>
                              {stars(match.confidence)} · {Math.round(match.confidence * 100)}%
                            </span>
                          </div>
                          {concept?.description && (
                            <p className={styles.candidateDefinition}>{concept.description}</p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.hintEmpty}>No close canonical matches found.</p>
              )}
            </section>
          )}

          {/* Confirm link button */}
          {selectedNode && activeCandidateId && (
            <div className={styles.confirmRow}>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => {
                  if (!selectedNode || !activeCandidateId) return;
                  handleLink({
                    elementId: selectedNode.shapeId,
                    conceptId: activeCandidateId,
                    confidence: topCandidate?.confidence ?? 1.0,
                    linkState: "linked",
                  } as ConceptLink);
                  setChosenCandidateId(null);
                  setSelectedNode(null);
                }}
              >
                ✓ Confirm link
              </button>
            </div>
          )}

          {/* Ripples panel */}
          {map && (
            <section className={styles.hintSection} data-testid="ripples-section">
              <h3 className={styles.hintSectionTitle}>Link ripples</h3>
              <RipplesPanel
                mapId={map.id as ConceptMapId}
                elementId={selectedNode?.shapeId ?? null}
                candidateId={activeCandidateId}
              />
            </section>
          )}

          {/* Make this concept your own */}
          <section className={styles.hintSection}>
            <h3 className={styles.hintSectionTitle}>Or — make this concept your own</h3>
            <div className={styles.ownConceptBox}>
              <div className={styles.ownConceptLabel}>↑ none fit</div>
              <input
                className={styles.ownConceptInput}
                placeholder={
                  selectedNode
                    ? `describe what you mean by "${selectedNode.label}"…`
                    : "describe what you mean by this node…"
                }
                aria-label="Describe your own concept meaning"
              />
            </div>
          </section>

          {/* Unlinked nodes — undrawn canonical concepts */}
          {undrawnConcepts.length > 0 && (
            <section className={styles.hintSection}>
              <h3 className={styles.hintSectionTitle}>
                Undrawn canonical concepts · {undrawnConcepts.length}
              </h3>
              <ul className={styles.undrawnList}>
                {undrawnConcepts.slice(0, 8).map((concept) => (
                  <li key={concept.id}>
                    <button
                      type="button"
                      className={styles.undrawnItem}
                      onClick={() => {
                        const editor = editorRef.current;
                        if (!editor || !concept) return;
                        const vp = editor.getViewportPageBounds();
                        const x = vp.x + vp.w / 2;
                        const y = vp.y + vp.h / 2;
                        const shapeId = createShapeId(`concept-${concept.id}`);
                        editor.createShape({
                          id: shapeId,
                          type: "text",
                          x,
                          y,
                          props: { richText: toRichText(concept.name), size: "m" },
                        });
                        handleAddToMap({
                          elementId: shapeId as string,
                          conceptId: concept.id as ConceptId,
                          confidence: 1.0,
                        });
                      }}
                    >
                      <span className={styles.undrawnName}>{concept.name}</span>
                      <span className={styles.undrawnAdd}>+ add to map</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
