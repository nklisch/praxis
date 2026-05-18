import type { DraftStreamEvent, Logger } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

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

  registerSubscriberStream<DraftStreamEvent>(
    {
      channelBase: "praxis.courseCreate.drafts.events",
      log,
      webContentsGetter,
      activeAbortControllers,
    },
    { handle, on },
    {
      subscribe: (cb) => services.bootstrap.subscribe(cb),
      onEvent: (event, { log: streamLog }) => {
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
        });
      },
    },
  );
}
