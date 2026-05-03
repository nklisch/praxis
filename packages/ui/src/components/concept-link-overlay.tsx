/**
 * Phase 15b: ConceptLinkOverlay
 *
 * Watches for tldraw text-shape label edits, fuzzy-matches against the
 * course's canonical concepts, and shows a floating typeahead near the shape.
 * Clicking a match fires onLink({ elementId, conceptId, confidence }).
 * Linked shapes get a § marker overlay positioned near their screen coords.
 *
 * The `editorRef` is populated by the parent (ConceptMapEditorRoute) via its
 * tldraw onMount callback. The overlay subscribes to store changes in a
 * useEffect so the subscription is properly torn down on unmount.
 */
import type { ConceptId, ConceptLink, ConceptMapDrawing, CourseId } from "@praxis/core/types";
import { type ConceptMatch, matchConceptByLabel } from "@praxis/core/services";
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

interface MarkerState {
  shapeId: string;
  screenX: number;
  screenY: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConceptLinkOverlay({ map, editorRef, courseId, onLink }: ConceptLinkOverlayProps) {
  const client = usePraxisClient();

  // Canonical concepts — fetched once on mount, cached in ref.
  const conceptsRef = useRef<CanonicalConcept[]>([]);

  // Active typeahead popup.
  const [typeahead, setTypeahead] = useState<TypeaheadState | null>(null);

  // § markers for linked shapes.
  const [markers, setMarkers] = useState<MarkerState[]>([]);

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

  // Update § markers whenever conceptLinks change.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || map.conceptLinks.length === 0) {
      setMarkers([]);
      return;
    }

    const nextMarkers: MarkerState[] = [];
    for (const link of map.conceptLinks) {
      // elementId is a tldraw shape id string; cast to TLShapeId branded type.
      const bounds = editor.getShapePageBounds(link.elementId as TLShapeId);
      if (bounds) {
        const screenPt = editor.pageToScreen({ x: bounds.maxX, y: bounds.y });
        nextMarkers.push({ shapeId: link.elementId, screenX: screenPt.x - 8, screenY: screenPt.y });
      }
    }
    setMarkers(nextMarkers);
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

  return (
    <div className={styles.overlay} aria-live="polite">
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

      {/* § markers for already-linked shapes */}
      {markers.map((marker) => (
        <span
          key={marker.shapeId}
          className={styles.linkedMarker}
          style={{ left: marker.screenX, top: marker.screenY }}
          aria-hidden="true"
          title="Linked to canonical concept"
        >
          §
        </span>
      ))}
    </div>
  );
}

export type { CanonicalConcept };
