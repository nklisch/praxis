---
id: lesson-assessment-pills-add-catch-on-fetch
kind: story
stage: review
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Add .catch() to FetchingPills lessonAssessments call

## Scope

`FetchingPills` in `packages/ui/src/components/lesson-assessment-pills.tsx` fires
`void client.artifacts.lessonAssessments(lessonId).then(...)` without a `.catch()`.
If the IPC call rejects (DB unavailable, stale lessonId, service restart), the
rejection goes unhandled. In Electron/Node this triggers an unhandled rejection
warning and can, depending on configuration, escalate to a process exit.

The rest of the codebase (e.g., `canonical-hints-overlay.tsx`, `ripples-panel.tsx`,
`nav.tsx`) consistently appends `.catch(() => {})` or `.catch(() => { /* silent */ })`
on fire-and-forget async calls inside effects.

## Fix

```typescript
void client.artifacts.lessonAssessments(lessonId)
  .then((rows) => {
    if (!cancelled) setAssessments(rows);
  })
  .catch(() => {
    // Pills are decorative — silently ignore fetch failures.
  });
```

## File

`packages/ui/src/components/lesson-assessment-pills.tsx:90`

## Origin

Triaged from review of `epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render` (2026-05-17).

## Implementation notes

Applied the `.catch(() => {})` pattern matching the codebase convention (canonical-hints-overlay, ripples-panel, nav). One-line addition at `packages/ui/src/components/lesson-assessment-pills.tsx:93`. All 1576 UI tests pass; lint and typecheck have no new errors introduced by this change (pre-existing failures are unrelated).
