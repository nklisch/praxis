import type { IpcStreamMessage } from "@praxis/client";
import type { DraftStreamEvent, Logger } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Streams course-create-mode draft events from `services.bootstrap` to the
 * renderer. The right-pane outline subscribes once and rebuilds its
 * Map<draftId, DraftCourseState> from each event as it arrives.
 *
 * Channel naming follows the project's streaming convention:
 *   praxis.courseCreate.drafts.events.start  (invoke with streamId) — kicks off subscription
 *   praxis.courseCreate.drafts.events.events.<streamId> (push)      — IpcStreamMessage<DraftStreamEvent>
 *   praxis.courseCreate.drafts.events.cancel (on)                   — unsubscribes
 *
 * The course-create service emits a `snapshot` first on subscribe so a fresh
 * subscriber sees current state without waiting for the next mutation.
 */
export function registerCourseCreateDraftsHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.courseCreate.drafts.events.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "course-create.drafts", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.courseCreate.drafts.events.events.${streamId}`;

    const push = (msg: IpcStreamMessage<DraftStreamEvent>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("course-create.drafts.subscribe");
    let unsubscribe: (() => void) | null = null;
    let eventsForwarded = 0;
    try {
      unsubscribe = services.bootstrap.subscribe((event) => {
        if (controller.signal.aborted) return;
        eventsForwarded++;
        // Per-event debug log so we can verify the chain
        // course-create-service -> IPC -> renderer is intact when the UI doesn't
        // appear to update. Keep payload fingerprint small — `event.kind`
        // plus the draftId is enough to correlate with drafter logs.
        streamLog.debug("course-create.drafts.forward", {
          eventKind: event.kind,
          ...(event.kind === "snapshot" && { draftCount: event.drafts.length }),
          ...(event.kind === "started" && { draftId: event.draft.draftId }),
          ...(event.kind === "updated" && {
            draftId: event.draft.draftId,
            conceptCount: event.draft.proposed.proposedConcepts.length,
            lessonCount: event.draft.proposed.proposedLessons.length,
            unitCount: (event.draft.proposed.proposedUnits ?? []).length,
          }),
          ...(event.kind === "finalized" && {
            draftId: event.draftId,
            courseId: event.courseId,
          }),
          ...(event.kind === "discarded" && {
            draftId: event.draftId,
            reason: event.reason,
          }),
          totalForwarded: eventsForwarded,
        });
        push({ kind: "event", payload: event });
      });

      // Hold open until cancelled. We piggy-back on AbortController for that.
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      streamLog.info("course-create.drafts.unsubscribe");
    } catch (err) {
      streamLog.error("course-create.drafts.error", { err: serializeErrorRedacted(err) });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      unsubscribe?.();
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.courseCreate.drafts.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
