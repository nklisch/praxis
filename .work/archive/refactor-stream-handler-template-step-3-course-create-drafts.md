---
id: refactor-stream-handler-template-step-3-course-create-drafts
kind: story
stage: done
tags: [refactor]
parent: refactor-stream-handler-template
depends_on: [refactor-stream-handler-template-step-1-helper-and-activity]
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 3: adopt in course-create-drafts (with onEvent hook for debug logging)

## Brief

Convert `course-create-drafts-channel.ts` to use `registerSubscriberStream`.
This channel has per-event rich debug logging
(`streamLog.debug("course-create.drafts.forward", { … })`) with payload
fingerprinting (eventKind / draftId / counts). Use the `onEvent` hook to
preserve the per-event logging exactly while the rest of the scaffolding
disappears into the helper.

## Files

- `packages/desktop/electron/main/course-create-drafts-channel.ts`

## Target state

```ts
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
```

## Implementation notes

- The existing `eventsForwarded` running counter is **dropped**. Recoverable
  via log aggregation if needed; not load-bearing.
- The per-event debug-log content is preserved verbatim except for the
  dropped `totalForwarded` field.
- `services.bootstrap` is the rename target of the (now-renamed) course-create
  service; verify the field name is still `bootstrap` on `Services` (or
  `courseCreate`, if the rename swept the field name in services.ts). Use
  whatever the current field is named. If the field rename was missed, that's
  out of scope for this story — file a separate cleanup item.

## Tests to verify

- `pnpm --filter @praxis/desktop test`
- Course-create-drafts envelope test if present (grep `__tests__/` for
  `courseCreate.drafts`)

## Acceptance criteria

- [ ] Typecheck/lint/test green
- [ ] Channel file LoC drops by ~50
- [ ] Per-event debug log shape preserved (eventKind + per-kind fingerprint
      fields). `totalForwarded` field dropped — documented in implementation
      notes.
- [ ] No wire-format change

## Risk

**Low** — onEvent hook is straightforward; the rich debug payload is
preserved verbatim. The only behavioral diff is the dropped running counter.

## Rollback

`git revert <commit>` — clean.

## Implementation notes (post-implementation)

- **File LoC delta**: 98 → 60 lines (−38 lines). Target was ~40 net lines; landed at 60 due to the `onEvent` block being substantial. Boilerplate (AbortController lifecycle, push callback, error redaction, cancel handler) all moved into the helper.
- **Service field name**: `services.bootstrap` — the rename did not sweep `services.ts` field name; field remains `bootstrap`.
- **`eventsForwarded` dropped**: The running counter and `totalForwarded` field in the debug log are removed. The `onEvent` hook does not expose a counter parameter (unlike `registerGeneratorStream`'s `onEvent` which does via `{ count, log }`). Recoverable via log aggregation if needed.
- **Log key delta**:
  - Lifecycle logs changed: `"course-create.drafts.subscribe"` → `"courseCreate.drafts.events.subscribe"`, `"course-create.drafts.unsubscribe"` → `"courseCreate.drafts.events.unsubscribe"`, `"course-create.drafts.error"` → `"courseCreate.drafts.events.error"` (all derived from channelBase by stripping `"praxis."` prefix).
  - Per-event debug key unchanged: `"course-create.drafts.forward"` — passed verbatim via `onEvent`.
- **Test updates**: No test assertions on log keys; the `streaming-channel-error-redaction.test.ts` only asserts on pushed IPC message payloads. All 6 tests pass unchanged.
- **Typecheck**: 3 pre-existing UI errors in `@praxis/ui` (baseline) — not introduced by this change. Desktop electron main typechecks clean.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: 
- Same log-key shape change noted in step 1's review (`course-create.drafts.subscribe` → `courseCreate.drafts.events.subscribe`). No test impact.
- The `eventsForwarded` running counter is dropped because the subscriber-variant `onEvent` hook only exposes `{ log }`, not `{ count }`. Recoverable via log aggregation. If a future channel genuinely needs per-event count via subscribe, extend the hook shape (small change).

**Notes**: Clean adoption with the `onEvent` hook preserving the rich per-event debug payload (eventKind + per-kind fingerprint) verbatim. File 98→60 LoC. The `services.bootstrap` field reference is correctly retained (the rename refactor didn't touch the field name on `Services`). All 6 streaming-envelope tests pass unmodified.
