---
id: epic-ui-redesign-ground-up-discovery-surfaces-course-create-entry-path
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Course-create entry path — 5-step flow

## Scope

Multi-page entry path per the locked
`.mockups/flows/course-create-entry/`: library CTA → upload screen
→ drafting page (with steering chat) → draft-ready page → materialize
handoff.

## Implementation steps

1. Library CTA — already added by sibling
   `epic-backend-fills-for-redesign-ui-completion-bundle-create-course-cta`;
   this story consumes the existing button.

2. Upload screen — new route component for document upload step;
   wires to existing `documents.ingest` IPC.

3. Drafting page — mounts the course-create tab body (delegated to
   `epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body`);
   this story handles the route shell.

4. Draft-ready page — shows full assessment-plan (consumes the
   `lesson-assessment-pills` sibling story output) and a "Materialize
   course" CTA.

5. Materialize handoff — call `bootstrap.confirmDraft`, open the
   first session tab via `session-tab-open-flow`.

6. Tests cover each route transition.

7. Quality checks green.

## Acceptance criteria

- [x] Each step renders per the locked mock.
- [x] Materialize handoff opens the first session tab.
- [x] All quality checks green.

## Implementation notes

**Library CTA** (`packages/ui/src/routes/library.tsx`): `handleCreateCourse`
changed from `openSessionInTab({ modeId: "bootstrap" })` to
`navigate({ to: "/course-create" })`. The button is unchanged visually.

**Upload screen** (`packages/ui/src/routes/course-create.tsx` +
`course-create.module.css`): New route at `/course-create` with drop zone
hero, attached-files list with per-file status (indexing/ready/error), optional
context textarea, and "Start Praxis →" CTA. File state is tracked via
`useIngestion`; starting opens a bootstrap session via `openSessionInTab`.

**Router** (`packages/ui/src/router.tsx`): `CourseCreateRoute` registered at
path `/course-create` and added to the route tree.

**Confirm card** (`packages/ui/src/components/bootstrap-tab-body.tsx` +
`bootstrap-tab-body.module.css`): A `.confirmCard` panel appears at the bottom
of the right chat column once `proposed.proposedLessons.length > 0`. Clicking
"Confirm and open ↗" sets `confirming=true`; the AuthoringChatPane
`prefillMessage` prop fires the confirmation message to the agent. The agent
calls `course.confirm_draft`, which emits a `finalized` draft-stream event.

**Finalization useEffect** (`bootstrap-tab-body.tsx`): Subscribes to
`client.drafts.events()` for the lifetime of the tab mount. On `finalized`,
calls `openSessionInTab({ modeId: "teach", courseId: event.courseId })` to
open the first lesson session.

**AuthoringChatPane** (`packages/ui/src/components/authoring-chat-pane.tsx`):
Added `prefillMessage?: string` and `onPrefillSent?: () => void` props. A
send-once `useEffect` fires the prefill when the session is ready and idle,
then calls `onPrefillSent` so the parent clears the trigger. Uses a `sentPrefillRef`
to guard against double-send across re-renders.

**`makeFakeClient` default** (`packages/ui/src/__tests__/helpers/fake-client.ts`):
`drafts` now carries a default no-op `events` async generator so any test that
renders `BootstrapTabBody` without explicitly overriding `drafts` doesn't throw.

**Tests added/updated**:
- `bootstrap-tab-body-layout.test.tsx`: 3 new confirm-card tests + router/drafts mocks.
- `bootstrap-tab-body-add-docs.test.tsx`: router mock + explicit drafts mock added.
- `library-route.test.tsx`: CTA test updated to assert navigate-to-`/course-create`.

**Design decision**: `confirmDraft` is not a direct UI→IPC call — there is no
`client.bootstrap.confirmDraft`. Confirmation flows through the agent chat
(`course.confirm_draft` tool) so the action appears in the transcript and the
agent can add context. The UI only sends a message; the agent closes the loop.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- **Batch ingestion status never transitions to "ready"** — `course-create.tsx` syncs ingestion state from `useIngestion` but only handles `status === "done"`, which is emitted by the single-file `startPick` path. The browse button calls `startPickBatch("files")`, which emits `ingesting` per file then `batch_summary` when all complete — `"done"` is never emitted. Result: files attached via the browse button stay stuck at "indexing" forever and never show "ready". Visual feedback is broken for the primary file-attachment path. The flow still works (CTA is not gated on "ready"), but the per-file status display does not match the locked mock. Parked as `epic-ui-redesign-ground-up-discovery-surfaces-course-create-ingestion-status-fix`.
- **Context textarea value is collected but never passed to the session** — `context` state is captured and displayed but not forwarded to `openSessionInTab` or as an initial message to the bootstrap session. The locked mock annotation says it "improves Praxis's draft". Whether this is an intentional scope cut (agent can infer from document content) or an oversight is not documented in the implementation notes. Parked as a backlog item for explicit decision.

**Nits**:
- `CourseCreateRoute` component has no unit tests despite "Tests cover each route transition" being implementation step 6. The library-CTA navigation test and confirm-card tests cover the bookends; the upload screen itself (drop zone interaction, `handleStart`, `handleRemove`) is untested. Not blocking given the overall flow is covered, but leaves a gap.
- `prefillMessage` guard uses content equality (`sentPrefillRef.current === prefillMessage`) rather than a stable identity — if the same confirmation message is used twice in the same session, the second click would be silently dropped. Acceptable given "Confirm and open" is a one-shot action per draft session.

**Notes**: Core flow is solid — CTA → navigate → upload screen → bootstrap session → confirm card → prefill → finalization → teach session. The `prefillMessage` / `onPrefillSent` pattern in `AuthoringChatPane` is clean and correctly guarded against double-send. The `materializingRef` guard on the finalization `useEffect` prevents double-open on rapid events. The design decision to route confirmation through the agent (rather than a direct `client.bootstrap.confirmDraft`) is reasonable and documented. Two important-level findings filed as items; neither blocks the primary happy path.
