import { useEffect, useRef } from "react";

export interface UseFirstOccurrenceOptions {
  /** The current student's ID. Used as part of the memoization key. */
  studentId: string;
  /** Session ID passed to `markTermSeen` when `recordOccurrence` is true. */
  sessionId: string;
  /**
   * Async lookup: has this student already seen this term?
   * Called once per term in the `terms` array during the effect.
   */
  hasSeenTerm: (studentId: string, term: string) => Promise<boolean>;
  /**
   * Async writer: records that the student saw this term in `sessionId`.
   * Only called for terms where `isFirst` returns true and `recordOccurrence`
   * is true.
   */
  markTermSeen: (studentId: string, term: string, sessionId: string) => Promise<void>;
  /**
   * The set of terms extracted from the current content.
   * The hook builds a per-turn `Map<term, boolean>` from this list.
   */
  terms: string[];
  /**
   * When true, each term that is genuinely first-occurrence will have
   * `markTermSeen` called for it after the populate step completes.
   * Set to false for read-only / preview contexts.
   */
  recordOccurrence: boolean;
}

export interface UseFirstOccurrenceResult {
  /**
   * Returns true if `term` is a first occurrence for this student in this
   * render context. Falls back to false for unknown terms (not in `terms`)
   * or before the async populate has finished.
   */
  isFirst: (term: string) => boolean;
}

/**
 * Builds a per-turn `Map<term, boolean>` of first-occurrence status and
 * optionally records newly-seen terms via `markTermSeen` after population.
 *
 * The map is stored in a ref so reads from `isFirst` always access the latest
 * state without triggering re-renders. A single `useEffect` with `terms` as a
 * dep first clears + repopulates the map (via `hasSeenTerm`) then, if
 * `recordOccurrence` is true, calls `markTermSeen` for each genuinely-first
 * term. This sequencing ensures recording never races with population.
 *
 * Until the async populate resolves, `isFirst` returns false for all terms.
 * The hook avoids triggering re-renders during async lookups — it is designed
 * for content-renderer contexts where `[[def:term]]` markers drive styling on
 * a best-effort basis.
 */
export function useFirstOccurrence(opts: UseFirstOccurrenceOptions): UseFirstOccurrenceResult {
  const { studentId, sessionId, hasSeenTerm, markTermSeen, terms, recordOccurrence } = opts;

  // Stable map ref — identity never changes; we clear + repopulate inside the
  // effect each time the (studentId, terms) epoch changes.
  const occurrenceMapRef = useRef(new Map<string, boolean>());

  useEffect(() => {
    const map = occurrenceMapRef.current;
    map.clear();

    if (terms.length === 0) return;
    let cancelled = false;

    async function run() {
      // ── Step 1: populate ───────────────────────────────────────────────────
      const entries = await Promise.all(
        terms.map(async (term) => {
          const seen = await hasSeenTerm(studentId, term);
          return [term, !seen] as const;
        }),
      );
      if (cancelled) return;

      for (const [term, isFirstOccurrence] of entries) {
        map.set(term, isFirstOccurrence);
      }

      // ── Step 2: record (only after populate completes) ─────────────────────
      if (!recordOccurrence || cancelled) return;

      await Promise.all(
        entries.map(async ([term, isFirstOccurrence]) => {
          if (isFirstOccurrence) {
            await markTermSeen(studentId, term, sessionId);
          }
        }),
      );
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [studentId, sessionId, terms, hasSeenTerm, markTermSeen, recordOccurrence]);

  return {
    isFirst(term) {
      return occurrenceMapRef.current.get(term) ?? false;
    },
  };
}
