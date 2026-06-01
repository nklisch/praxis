import type { Annotation, NoteId } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./note-editor-feynman.module.css";

export interface FeynmanBody {
  kind: "feynman";
  explanation: string;
  followUps: string[];
}

export interface NoteEditorFeynmanProps {
  body: FeynmanBody;
  onChange: (body: FeynmanBody) => void;
  /** Note id used to persist annotations via the API. When absent, annotations are local-only. */
  noteId?: NoteId;
  /**
   * Called when the "Ask Praxis" button is clicked on a non-empty follow-up row.
   * Receives the row index as a string (`cueId`) and the current follow-up text
   * (`cueText`) so the caller can seed the spawned session with the live editor
   * state rather than requiring the note to have been saved first.
   */
  onSpawnFromCue?: (cueId: string, cueText: string) => void;
}

type PassMode = "writing" | "reviewing";

/** Pending popover state: the selected text range + DOM position. */
interface PendingSelection {
  rangeStart: number;
  rangeEnd: number;
  text: string;
  top: number;
  left: number;
}

/**
 * Feynman note editor — two-pass design per locked variant D.
 *
 * Pass 1 (writing): clean surface — just the explanation textarea + the mode
 * toggle. No gap-finding chrome. The student writes freely.
 *
 * Pass 2 (reviewing): the explanation is rendered as read-only annotatable
 * text. Selecting a span of text opens a margin-note popover where the student
 * names the gap and chooses severity ("soft" / "load_bearing"). Existing
 * annotations are rendered as margin notes anchored to their text ranges and
 * colour-coded by severity (warning = soft, danger = load_bearing).
 *
 * Annotations persist via `praxisClient.notes.setAnnotations`.
 */
export function NoteEditorFeynman({
  body,
  onChange,
  noteId,
  onSpawnFromCue,
}: NoteEditorFeynmanProps) {
  const client = usePraxisClient();

  const [localBody, setLocalBody] = useState<FeynmanBody>(body);
  const [mode, setMode] = useState<PassMode>("writing");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [popoverText, setPopoverText] = useState("");
  const [popoverSeverity, setPopoverSeverity] = useState<Annotation["severity"]>("soft");
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const bodyContainerRef = useRef<HTMLDivElement>(null);

  // ── Load annotations on mount (or when noteId changes) ───────────────────

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    client.notes
      .getAnnotations(noteId)
      .then((ann) => {
        if (!cancelled) setAnnotations(ann);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.warn("[NoteEditorFeynman] failed to load annotations", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, client]);

  // ── Body edits (writing mode) ─────────────────────────────────────────────

  const emit = (updated: FeynmanBody) => {
    setLocalBody(updated);
    onChange(updated);
  };

  const handleExplanationChange = (val: string) => {
    emit({ ...localBody, explanation: val });
  };

  const handleFollowUpChange = (i: number, val: string) => {
    const followUps = [...localBody.followUps];
    followUps[i] = val;
    emit({ ...localBody, followUps });
  };

  const addFollowUp = () => {
    emit({ ...localBody, followUps: [...localBody.followUps, ""] });
  };

  const removeFollowUp = (i: number) => {
    emit({ ...localBody, followUps: localBody.followUps.filter((_, idx) => idx !== i) });
  };

  // ── Review-mode: text selection → popover ─────────────────────────────────

  const handleReviewMouseUp = useCallback(() => {
    if (!bodyContainerRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const container = bodyContainerRef.current;

    // Compute character offsets within the container's textContent.
    const preCaretRange = document.createRange();
    preCaretRange.setStart(container, 0);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const rangeStart = preCaretRange.toString().length;
    const rangeEnd = rangeStart + range.toString().length;

    if (rangeStart >= rangeEnd) return;

    // Position the popover near the selection.
    const rects = range.getClientRects();
    const firstRect = rects[0];
    const containerRect = container.getBoundingClientRect();
    const top = firstRect ? firstRect.bottom - containerRect.top + 8 : 0;
    const left = firstRect ? firstRect.left - containerRect.left : 0;

    setPending({ rangeStart, rangeEnd, text: range.toString(), top, left });
    setPopoverText("");
    setPopoverSeverity("soft");
  }, []);

  const handlePopoverSave = useCallback(async () => {
    if (!pending) return;
    setSavingAnnotation(true);
    try {
      const newAnnotation: Annotation = {
        rangeStart: pending.rangeStart,
        rangeEnd: pending.rangeEnd,
        text: popoverText,
        severity: popoverSeverity,
      };
      const updated = [...annotations, newAnnotation];
      setAnnotations(updated);
      if (noteId) {
        await client.notes.setAnnotations({ noteId, annotations: updated });
      }
      setPending(null);
      setPopoverText("");
    } finally {
      setSavingAnnotation(false);
    }
  }, [pending, popoverText, popoverSeverity, annotations, noteId, client]);

  const handlePopoverCancel = () => {
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteAnnotation = useCallback(
    async (index: number) => {
      const updated = annotations.filter((_, i) => i !== index);
      setAnnotations(updated);
      if (noteId) {
        await client.notes.setAnnotations({ noteId, annotations: updated });
      }
    },
    [annotations, noteId, client],
  );

  // ── Render annotated body (review mode) ───────────────────────────────────

  /**
   * Build an array of {text, annotationIndex | null} segments from the
   * explanation string + annotations. Overlapping annotations are handled
   * by the first one winning; the second becomes plain text for that span.
   */
  function buildSegments(): Array<{ text: string; annotationIndex: number | null }> {
    const text = localBody.explanation;
    if (annotations.length === 0) return [{ text, annotationIndex: null }];

    // Sort by start offset so we can sweep left-to-right.
    const sorted = annotations
      .map((a, i) => ({ ...a, originalIndex: i }))
      .sort((a, b) => a.rangeStart - b.rangeStart);

    const segments: Array<{ text: string; annotationIndex: number | null }> = [];
    let cursor = 0;

    for (const ann of sorted) {
      const start = Math.max(ann.rangeStart, cursor);
      const end = Math.min(ann.rangeEnd, text.length);
      if (start >= end) continue;

      if (start > cursor) {
        segments.push({ text: text.slice(cursor, start), annotationIndex: null });
      }
      segments.push({ text: text.slice(start, end), annotationIndex: ann.originalIndex });
      cursor = end;
    }

    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), annotationIndex: null });
    }

    return segments;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.editor}>
      {/* ── Mode toggle ────────────────────────────────────────────────── */}
      <fieldset className={styles.modeToggle} aria-label="Editor mode">
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === "writing" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("writing")}
          aria-pressed={mode === "writing"}
        >
          <span className={styles.modeOrnament}>¶</span>
          I&apos;m writing
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === "reviewing" ? styles.modeBtnActive : ""}`}
          onClick={() => setMode("reviewing")}
          aria-pressed={mode === "reviewing"}
        >
          <span className={styles.modeOrnament}>⁂</span>
          I&apos;m reviewing
        </button>
      </fieldset>

      {/* ── Pass 1: writing surface ─────────────────────────────────────── */}
      {mode === "writing" && (
        <div className={styles.writingPass}>
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="feynman-explanation">
              Explanation
              <span className={styles.hint}> — write as if teaching a 12-year-old</span>
            </label>
            <textarea
              id="feynman-explanation"
              className={styles.explanationTextarea}
              value={localBody.explanation}
              onChange={(e) => handleExplanationChange(e.target.value)}
              placeholder="Explain the concept in plain language…"
              rows={10}
            />
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>
              Follow-up questions
              <span className={styles.hint}> — gaps in your understanding</span>
            </span>

            {localBody.followUps.length > 0 && (
              <ul className={styles.followUpList}>
                {localBody.followUps.map((q, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: follow-ups indexed by position
                  <li key={i} className={styles.followUpItem}>
                    <textarea
                      className={styles.followUpTextarea}
                      value={q}
                      onChange={(e) => handleFollowUpChange(i, e.target.value)}
                      placeholder="What do I still not understand?"
                      rows={2}
                      aria-label={`Follow-up ${i + 1}`}
                    />
                    {onSpawnFromCue !== undefined && q.trim().length > 0 && (
                      <button
                        type="button"
                        className={styles.spawnBtn}
                        onClick={() => onSpawnFromCue(String(i), q)}
                        aria-label={`Talk to Praxis about follow-up ${i + 1}`}
                        title="Ask Praxis about this follow-up"
                      >
                        <span aria-hidden="true">▶</span> Ask Praxis
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeFollowUp(i)}
                      aria-label={`Remove follow-up ${i + 1}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className={styles.addBtn} onClick={addFollowUp}>
              + Add follow-up
            </button>
          </div>
        </div>
      )}

      {/* ── Pass 2: review surface ──────────────────────────────────────── */}
      {mode === "reviewing" && (
        <div className={styles.reviewPass}>
          <div className={styles.reviewInstructions}>
            <em>Re-reading your own explanation.</em> Where do <em>you</em> pause and think
            &ldquo;I&rsquo;m not sure why I said that&rdquo;? Select that text to mark a gap — it
            appears in the margin next to it.
          </div>

          <div className={styles.reviewColumns}>
            {/* Left: annotatable explanation */}
            <div className={styles.writingCol}>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: selection-based interaction on read-only text */}
              <div
                ref={bodyContainerRef}
                className={styles.annotationBody}
                onMouseUp={handleReviewMouseUp}
                data-testid="annotation-body"
              >
                {localBody.explanation.length > 0 ? (
                  buildSegments().map((seg, i) => {
                    if (seg.annotationIndex === null) {
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable segment ordering
                      return <span key={i}>{seg.text}</span>;
                    }
                    const ann = annotations[seg.annotationIndex];
                    const cls =
                      ann?.severity === "load_bearing"
                        ? styles.highlightStrong
                        : styles.highlightSoft;
                    return (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable segment ordering
                        key={i}
                        className={cls}
                        title={ann?.text}
                        data-annotation-index={seg.annotationIndex}
                      >
                        {seg.text}
                      </span>
                    );
                  })
                ) : (
                  <span className={styles.reviewEmptyHint}>
                    Nothing written yet — switch to writing mode to add your explanation.
                  </span>
                )}
              </div>

              {/* Selection popover */}
              {pending && (
                <div
                  className={styles.popover}
                  style={{ top: pending.top, left: pending.left }}
                  role="dialog"
                  aria-label="Add gap note"
                  data-testid="gap-popover"
                >
                  <div className={styles.popoverSelected}>&ldquo;{pending.text}&rdquo;</div>
                  <div className={styles.popoverSeverityRow}>
                    <button
                      type="button"
                      className={`${styles.severityBtn} ${styles.severitySoft} ${popoverSeverity === "soft" ? styles.severityActive : ""}`}
                      onClick={() => setPopoverSeverity("soft")}
                      aria-pressed={popoverSeverity === "soft"}
                    >
                      ¶ soft gap
                    </button>
                    <button
                      type="button"
                      className={`${styles.severityBtn} ${styles.severityStrong} ${popoverSeverity === "load_bearing" ? styles.severityActive : ""}`}
                      onClick={() => setPopoverSeverity("load_bearing")}
                      aria-pressed={popoverSeverity === "load_bearing"}
                    >
                      ⚠ load-bearing
                    </button>
                  </div>
                  <textarea
                    className={styles.popoverTextarea}
                    value={popoverText}
                    onChange={(e) => setPopoverText(e.target.value)}
                    placeholder="Describe the gap…"
                    rows={3}
                    aria-label="Gap note text"
                  />
                  <div className={styles.popoverActions}>
                    <button
                      type="button"
                      className={styles.popoverSave}
                      onClick={handlePopoverSave}
                      disabled={savingAnnotation}
                    >
                      {savingAnnotation ? "Saving…" : "Save gap"}
                    </button>
                    <button
                      type="button"
                      className={styles.popoverCancel}
                      onClick={handlePopoverCancel}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: margin notes column */}
            <aside className={styles.marginCol} aria-label="Gap notes">
              {annotations.length === 0 && (
                <div className={styles.marginEmpty}>Select text on the left to mark a gap</div>
              )}
              {annotations.map((ann, i) => (
                <div
                  key={`${ann.rangeStart}-${ann.rangeEnd}-${ann.severity}`}
                  className={`${styles.marginNote} ${ann.severity === "load_bearing" ? styles.marginNoteStrong : ""}`}
                  data-testid={`margin-note-${i}`}
                >
                  <span className={styles.marginPointer} aria-hidden="true" />
                  <div className={styles.marginLabel}>
                    {ann.severity === "load_bearing" ? "⚠ load-bearing gap" : "¶ gap"}
                  </div>
                  <div className={styles.marginQuote}>&ldquo;{ann.text}&rdquo;</div>
                  <button
                    type="button"
                    className={styles.marginDelete}
                    onClick={() => handleDeleteAnnotation(i)}
                    aria-label={`Delete gap note ${i + 1}`}
                    title="Delete gap note"
                  >
                    ×
                  </button>
                </div>
              ))}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
