/**
 * Phase 15b + three-state: ConceptLinkOverlay
 *
 * Watches for tldraw text-shape label edits, fuzzy-matches against the
 * course's canonical concepts, and shows a floating typeahead near the shape.
 * Clicking a match fires onLink({ elementId, conceptId, confidence }).
 *
 * Three-state glyph overlays:
 *   ✓  (linked)     — student confirmed canonical link
 *   ?  (best_guess) — Praxis tentative match awaiting confirmation
 *   ○  (unlinked)   — no canonical link yet (no glyph shown — just absence)
 *
 * Ghost edges: hovering a `best_guess` node renders a floating dashed connector
 * to a placeholder near the map center to suggest the candidate relationship
 * before the student confirms.
 *
 * The `editorRef` is populated by the parent (ConceptMapEditorRoute) via its
 * tldraw onMount callback. The overlay subscribes to store changes in a
 * useEffect so the subscription is properly torn down on unmount.
 */

import { type ConceptMatch, matchConceptByLabel } from "@praxis/core/services/concept-link-matcher";
import type { ConceptId, ConceptLink, ConceptMapDrawing, CourseId } from "@praxis/core/types";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./concept-link-overlay.module.css";

// ── Canonical concept shape returned by client.artifacts.concepts() ────────
// Stays loose to match the IPC return type. The matcher accepts any
// `{ id, name }` shape via ConceptForMatching, so this works directly.

interface CanonicalConcept {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
}

// Matcher imported from @praxis/core/services — the canonical implementation.
// Token-aware fuzzy + normalized Levenshtein blend, tuned for abbreviations
// like "linear eqs" → "Linear Equations".

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConceptLinkOverlayProps {
  map: ConceptMapDrawing;
  /** Ref to the tldraw Editor instance — populated by parent via onMount. */
  editorRef: RefObject<Editor | null>;
  courseId: CourseId;
  onLink: (link: ConceptLink) => void;
}

interface TypeaheadState {
  shapeId: string;
  screenX: number;
  screenY: number;
  matches: ConceptMatch[];
}

/** State for a three-state glyph positioned near a node. */
interface GlyphMarker {
  shapeId: string;
  screenX: number;
  screenY: number;
  /** Display glyph: ✓ for linked, ? for best_guess */
  glyph: "✓" | "?";
  linkState: "linked" | "best_guess";
}

/** Ghost edge drawn from a best_guess node toward a phantom "canonical" anchor. */
interface GhostEdge {
  /** Shape being hovered. */
  shapeId: string;
  /** Start = center of the hovered shape (screen coords). */
  x1: number;
  y1: number;
  /** End = a nearby phantom anchor position (screen coords). */
  x2: number;
  y2: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConceptLinkOverlay({ map, editorRef, courseId, onLink }: ConceptLinkOverlayProps) {
  const client = usePraxisClient();

  // Canonical concepts — fetched once on mount, cached in ref.
  const conceptsRef = useRef<CanonicalConcept[]>([]);

  // Active typeahead popup.
  const [typeahead, setTypeahead] = useState<TypeaheadState | null>(null);

  // Three-state glyph markers (✓ and ?) for linked/best_guess nodes.
  const [glyphs, setGlyphs] = useState<GlyphMarker[]>([]);

  // Ghost edge for the currently hovered best_guess node.
  const [ghostEdge, setGhostEdge] = useState<GhostEdge | null>(null);

  // Fetch canonical concepts on mount.
  useEffect(() => {
    client.artifacts
      .concepts(courseId)
      .then((cs) => {
        conceptsRef.current = cs;
      })
      .catch(() => {
        // Non-fatal — typeahead won't work without concepts.
      });
  }, [client, courseId]);

  // Subscribe to tldraw store changes in a separate effect so we can cleanly
  // unsubscribe on unmount. The editor is captured via editorRef.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const unsubscribe = editor.store.listen((entry) => {
      // Look for changed records of type "shape"
      for (const [, record] of Object.entries(entry.changes.updated)) {
        if (!record) continue;
        // record is [prevRecord, nextRecord] tuple
        const [, next] = record as [unknown, unknown];
        if (!next || typeof next !== "object") continue;
        // tldraw v4: text shapes have richText prop (TLRichText), not plain text.
        // We extract the text via the editor's getText helper or by reading
        // the richText prop. For matching purposes, fallback to checking props.
        const shape = next as {
          id?: string;
          type?: string;
          props?: {
            // biome-ignore lint/suspicious/noExplicitAny: richText is TLRichText opaque type
            richText?: any;
            text?: string;
          };
        };
        if (shape.type !== "text" || !shape.id) continue;

        // Extract plain text — editor.getShape(id).props.text is a legacy alias;
        // use editor API to get text when available.
        let label = "";
        try {
          const editorShape = editor.getShape(shape.id as TLShapeId);
          if (editorShape && "props" in editorShape) {
            const shapeUtil = editor.getShapeUtil(editorShape);
            if ("getText" in shapeUtil && typeof shapeUtil.getText === "function") {
              label = shapeUtil.getText(editorShape) ?? "";
            }
          }
        } catch {
          // Fallback to raw prop inspection.
          label = (shape.props?.text as string | undefined) ?? "";
        }
        if (!label) continue;
        const linkedConceptIds = new Set(map.conceptLinks.map((l) => l.conceptId as string));
        // Typeahead uses a more permissive threshold than the indexer:
        // "Linear" should suggest "Linear Equations" even though it scores ~0.5.
        // The student gates each suggestion via click — false positives are cheap.
        const matches = matchConceptByLabel(label, conceptsRef.current, 0.4)
          .filter((m) => !linkedConceptIds.has(m.conceptId))
          .slice(0, 3); // top-3 typeahead suggestions

        if (matches.length > 0) {
          // Convert shape page position to screen position.
          // Cast shape.id to TLShapeId (branded string) for the editor API.
          const shapeBounds = editor.getShapePageBounds(shape.id as TLShapeId);
          const screenPt = shapeBounds
            ? editor.pageToScreen({ x: shapeBounds.x, y: shapeBounds.maxY })
            : { x: 0, y: 0 };

          setTypeahead({
            shapeId: shape.id,
            screenX: screenPt.x,
            screenY: screenPt.y + 4,
            matches,
          });
        } else {
          setTypeahead((prev) => (prev?.shapeId === shape.id ? null : prev));
        }
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef, map.conceptLinks]);

  // Compute three-state glyph markers (✓ / ?) whenever conceptLinks change.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      setGlyphs([]);
      return;
    }

    const nextGlyphs: GlyphMarker[] = [];
    for (const link of map.conceptLinks) {
      const state = link.linkState ?? "unlinked";
      if (state === "unlinked") continue; // no glyph for unlinked nodes

      const bounds = editor.getShapePageBounds(link.elementId as TLShapeId);
      if (!bounds) continue;

      // Position the glyph at the top-right corner of the shape.
      const screenPt = editor.pageToScreen({ x: bounds.maxX, y: bounds.y });
      nextGlyphs.push({
        shapeId: link.elementId,
        screenX: screenPt.x + 2,
        screenY: screenPt.y - 2,
        glyph: state === "linked" ? "✓" : "?",
        linkState: state,
      });
    }
    setGlyphs(nextGlyphs);
  }, [editorRef, map.conceptLinks]);

  const handleSelect = useCallback(
    (match: ConceptMatch, shapeId: string) => {
      onLink({
        elementId: shapeId,
        conceptId: match.conceptId as ConceptId,
        confidence: match.confidence,
      });
      setTypeahead(null);
    },
    [onLink],
  );

  const handleDismiss = useCallback(() => setTypeahead(null), []);

  // Ghost edge: show on hover of a best_guess glyph marker.
  const handleGlyphMouseEnter = useCallback(
    (glyph: GlyphMarker) => {
      if (glyph.linkState !== "best_guess") return;
      const editor = editorRef.current;
      if (!editor) return;

      // Center of hovered shape as start point.
      const bounds = editor.getShapePageBounds(glyph.shapeId as TLShapeId);
      if (!bounds) return;
      const centerPt = editor.pageToScreen({
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h / 2,
      });

      // Ghost end = offset 120px to the right and 40px up (suggests a canonical neighbor).
      setGhostEdge({
        shapeId: glyph.shapeId,
        x1: centerPt.x,
        y1: centerPt.y,
        x2: centerPt.x + 120,
        y2: centerPt.y - 40,
      });
    },
    [editorRef],
  );

  const handleGlyphMouseLeave = useCallback(() => {
    setGhostEdge(null);
  }, []);

  return (
    <div className={styles.overlay} aria-live="polite">
      {/* Ghost edge SVG — drawn below all interactive elements */}
      {ghostEdge && (
        <svg
          className={styles.ghostEdgeSvg}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <line
            className={styles.ghostEdge}
            x1={ghostEdge.x1}
            y1={ghostEdge.y1}
            x2={ghostEdge.x2}
            y2={ghostEdge.y2}
          />
          {/* Ghost arrowhead at end */}
          <circle cx={ghostEdge.x2} cy={ghostEdge.y2} r={4} className={styles.ghostEdgeDot} />
        </svg>
      )}

      {/* Floating typeahead popup near the editing shape */}
      {typeahead && typeahead.matches.length > 0 && (
        <div
          className={styles.typeahead}
          style={{ left: typeahead.screenX, top: typeahead.screenY }}
        >
          <div className={styles.typeaheadHeader}>
            <span className={styles.typeaheadLabel}>link to concept</span>
            <button
              type="button"
              className={styles.dismissBtn}
              onClick={handleDismiss}
              aria-label="Dismiss concept suggestions"
            >
              ×
            </button>
          </div>
          <ul className={styles.typeaheadList}>
            {typeahead.matches.slice(0, 3).map((match) => (
              <li key={match.conceptId}>
                <button
                  type="button"
                  className={styles.typeaheadItem}
                  onClick={() => handleSelect(match, typeahead.shapeId)}
                >
                  <span className={styles.typeaheadOrnament}>§</span>
                  <span className={styles.typeaheadName}>{match.conceptName}</span>
                  <span className={styles.typeaheadConfidence}>
                    {Math.round(match.confidence * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Three-state glyph markers: ✓ (linked) or ? (best_guess) */}
      {glyphs.map((glyph) => (
        <span
          key={glyph.shapeId}
          className={glyph.linkState === "linked" ? styles.linkedGlyph : styles.bestGuessGlyph}
          style={{ left: glyph.screenX, top: glyph.screenY }}
          aria-label={
            glyph.linkState === "linked"
              ? "Confirmed canonical link"
              : "Tentative canonical link — click to confirm"
          }
          title={
            glyph.linkState === "linked"
              ? "Linked to canonical concept"
              : "Best-guess match — hover to preview, click to confirm"
          }
          onMouseEnter={() => handleGlyphMouseEnter(glyph)}
          onMouseLeave={handleGlyphMouseLeave}
          role="img"
        >
          {glyph.glyph}
        </span>
      ))}
    </div>
  );
}

export type { CanonicalConcept };
