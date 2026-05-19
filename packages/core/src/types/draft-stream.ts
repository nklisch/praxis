import type { DraftCourseState } from "./artifacts.js";
import type { CourseId } from "./ids.js";
import type { DraftId } from "./recommendation.js";

/**
 * Discriminated event streamed from the course-create service to the renderer
 * each time a draft is created, mutated, persisted, or dropped.
 *
 * Modeled on `ActivityEvent` — `snapshot` is sent first so a fresh
 * subscriber sees the current state without waiting for the next change.
 *
 * - `snapshot`: current set of live drafts (sent on subscribe)
 * - `started`: a new draft just appeared (`initDraft`)
 * - `updated`: any incremental mutation that changes the draft body
 *   (concept, edge, lesson, unit, assessment, metadata, edit-op)
 * - `finalized`: `confirmDraft` succeeded — the draft has been materialised
 *   as a course and removed from the in-memory cache. `courseId` lets the
 *   renderer pivot to the persisted course view if it wants to.
 * - `discarded`: the draft is gone without persisting, either because the
 *   user (or the model) called `discardDraft`, or because it expired in
 *   the TTL sweep.
 */
export type DraftStreamEvent =
  | { kind: "snapshot"; drafts: readonly DraftCourseState[] }
  | { kind: "started"; draft: DraftCourseState }
  | { kind: "updated"; draft: DraftCourseState }
  | { kind: "finalized"; draftId: DraftId; courseId: CourseId }
  | { kind: "discarded"; draftId: DraftId; reason: "expired" | "discarded" };

export type DraftStreamListener = (event: DraftStreamEvent) => void;

/**
 * Renderer-side client for the draft stream. `events()` opens a persistent
 * subscription. Multiple consumers are safe but redundant — the course-create
 * tab body is the only intended renderer.
 */
export interface DraftStreamClient {
  events(): AsyncIterable<DraftStreamEvent>;
}
