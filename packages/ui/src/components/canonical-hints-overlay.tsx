/**
 * Phase 15b: CanonicalHintsOverlay
 *
 * When toggled on, renders ghost cards for canonical concepts the student
 * hasn't yet drawn (i.e., not in drawnConceptIds). v1 layout: simple
 * 3-column grid in the canvas's right margin, screen-anchored (not
 * page-anchored — ghosts stay put when the canvas pans/zooms).
 *
 * "+ add to map" creates a tldraw text shape at a default position and
 * emits a ConceptLink upward via onAddToMap.
 *
 * The overlay div is `position: absolute; pointer-events: none` so the
 * canvas underneath remains usable. Individual ghost buttons re-enable
 * pointer events.
 */
import type { ConceptId, ConceptLink, CourseId } from "@praxis/core/types";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { createShapeId, type Editor, toRichText } from "tldraw";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./canonical-hints-overlay.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface CanonicalConcept {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
}

export interface CanonicalHintsOverlayProps {
  courseId: CourseId;
  /** Concept ids the student has already linked — don't ghost these. */
  drawnConceptIds: ReadonlyArray<ConceptId>;
  /** Ref to the tldraw Editor — needed to create new shapes on the canvas. */
  editorRef: RefObject<Editor | null>;
  /** Called when the student clicks "+ add to map" on a ghost. */
  onAddToMap: (link: ConceptLink) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CanonicalHintsOverlay({
  courseId,
  drawnConceptIds,
  editorRef,
  onAddToMap,
}: CanonicalHintsOverlayProps) {
  const client = usePraxisClient();
  const [concepts, setConcepts] = useState<CanonicalConcept[]>([]);

  // Fetch canonical concepts on mount.
  useEffect(() => {
    client.artifacts
      .concepts(courseId)
      .then(setConcepts)
      .catch(() => {
        // Non-fatal — overlay remains empty.
      });
  }, [client, courseId]);

  // Filter to concepts not yet drawn. Cast through string[] since ConceptId is branded.
  // biome-ignore lint/suspicious/noExplicitAny: branded string cast for Set construction
  const drawnSet = new Set(drawnConceptIds as any as string[]);
  const undrawnConcepts = concepts.filter((c) => !drawnSet.has(c.id));

  const handleAddToMap = useCallback(
    (concept: CanonicalConcept) => {
      const editor = editorRef.current;
      if (!editor) return;

      // Place the new shape in the current viewport center.
      const viewportBounds = editor.getViewportPageBounds();
      const x = viewportBounds.x + viewportBounds.w / 2;
      const y = viewportBounds.y + viewportBounds.h / 2;

      // Create a text shape on the canvas with the concept name.
      // tldraw v4 uses richText (TLRichText) not a plain text prop.
      const shapeId = createShapeId(`concept-${concept.id}`);
      editor.createShape({
        id: shapeId,
        type: "text",
        x,
        y,
        props: {
          richText: toRichText(concept.name),
          size: "m",
        },
      });

      // Emit the link upward (elementId is the tldraw shape id string).
      onAddToMap({
        elementId: shapeId as string,
        conceptId: concept.id as ConceptId,
        confidence: 1.0,
      });
    },
    [editorRef, onAddToMap],
  );

  if (undrawnConcepts.length === 0) return null;

  return (
    <section className={styles.overlay} aria-label="Canonical concept hints">
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelOrnament}>§</span>
          <span className={styles.panelTitle}>canonical concepts</span>
          <span className={styles.panelCount}>{undrawnConcepts.length} to explore</span>
        </div>
        <div className={styles.grid}>
          {undrawnConcepts.map((concept) => (
            <div key={concept.id} className={styles.ghost}>
              <span className={styles.ghostName}>{concept.name}</span>
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => handleAddToMap(concept)}
              >
                + add to map
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
