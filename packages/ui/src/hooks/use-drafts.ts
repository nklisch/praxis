import type { DraftCourseState } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseDraftsResult {
  /** Currently-live drafts (i.e. not finalized, not discarded, not expired). */
  drafts: readonly DraftCourseState[];
  /**
   * The draft most recently mutated — convenient for the course-create right-pane
   * outline, which only needs to render the active draft. Null until the
   * drafter fires its first `draft_init`.
   */
  current: DraftCourseState | null;
}

/**
 * Subscribe to the course-create drafts stream for the lifetime of the component.
 * Returns the current set of live drafts and a `current` shortcut to the
 * most recently mutated one.
 *
 * Mirrors `useActivity` — same Map+state shape, same lifecycle. Mounted by
 * `<CourseCreateTabBody>`; multiple consumers are safe but waste IPC overhead.
 */
export function useDrafts(): UseDraftsResult {
  const client = usePraxisClient();
  const [drafts, setDrafts] = useState<readonly DraftCourseState[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const local = new Map<string, DraftCourseState>();

    (async () => {
      try {
        for await (const event of client.drafts.events()) {
          if (cancelled) break;
          switch (event.kind) {
            case "snapshot":
              local.clear();
              for (const d of event.drafts) local.set(d.draftId, d);
              break;
            case "started":
            case "updated":
              local.set(event.draft.draftId, event.draft);
              setCurrentId(event.draft.draftId);
              break;
            case "finalized":
            case "discarded":
              local.delete(event.draftId);
              setCurrentId((prev) => (prev === event.draftId ? null : prev));
              break;
          }
          setDrafts(Array.from(local.values()));
        }
      } catch {
        // stream errored — fall to empty until next mount
        if (!cancelled) {
          setDrafts([]);
          setCurrentId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const current = currentId !== null ? (drafts.find((d) => d.draftId === currentId) ?? null) : null;

  return { drafts, current };
}
