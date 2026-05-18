---
id: epic-backend-fills-for-redesign-ui-completion-bundle-exam-timer
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Exam mode timer + auto-submit

## Scope

- Add `duration_minutes` column to `assignments`.
- Render countdown timer in `ExamTabBody`.
- Warn (orange) in last 5 minutes; auto-submit at expiry.

## Implementation steps

1. Schema:
   - Edit `packages/artifacts/src/schema.ts` to add
     `durationMinutes: integer("duration_minutes")` (nullable) on
     `assignments`.
   - `pnpm db:generate` → migration; verify.

2. Service / authoring:
   - Update `AuthoringService` (or the assignments creation path) so
     authors can set the duration when creating exam-type assignments.

3. UI:
   - Edit `packages/ui/src/components/exam-tab-body.tsx`:
     - Read `assignment.durationMinutes` and `assignment.startedAt`
       (compute remainingMs at render).
     - Render countdown in the mode header (mm:ss).
     - Apply `warn` styling to the countdown in the last 5 minutes.
     - On expiry: call `assignment.submit` (or the existing exam
       submit path) automatically; surface a one-line "Time's up —
       auto-submitting" notice.

4. Tests:
   - Schema round-trip.
   - ExamTabBody renders countdown, applies warn class at the
     threshold, calls submit at expiry (use vitest fake timers).

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [x] `duration_minutes` persists on assignments.
- [x] Countdown renders + ticks in exam mode.
- [x] Warn state at last 5 minutes.
- [x] Auto-submit fires at expiry.
- [x] All quality checks green.

## Implementation notes

### Schema

Added `durationMinutes: integer("duration_minutes")` (nullable) to the `assignments` table in
`packages/artifacts/src/schema.ts`. Migration: `drizzle/0018_secret_the_enforcers.sql`.

### Types

`packages/core/src/types/artifacts.ts` — `Assignment.durationMinutes?: number | null`.
`packages/core/src/types/tool.ts` — `AssignmentService.create` input extended with the optional field.

### Service

`packages/core/src/services/assignment-service.ts`:
- `rowToAssignment` maps the column to the domain type (spread-if-present pattern, consistent with other nullable fields).
- `create()` input param + Drizzle insert extended with `durationMinutes`.

### Tool

`packages/tools/src/assignment/create.ts` — `InputSchema` extended with `durationMinutes: z.number().int().positive().nullable().optional()`. Handler passes the value through to `ctx.services.assignments.create`.

### UI

`packages/ui/src/components/exam-tab-body.tsx`:
- Loads assignment via `useAssignment()` (same hook used by `AssignmentCard`, avoiding a second fetch).
- `ExamCountdown` subcomponent: `setInterval` at 1 Hz inside `useEffect`; `expiredRef` guards against double-submit across tick boundaries; cleans up on unmount.
- `formatMmSs(ms)` formats remaining time as `mm:ss` using `Math.ceil` so "0:01" shows for the final partial second.
- `WARN_THRESHOLD_MS = 5 * 60 * 1000` (5 minutes).
- Auto-submit path: calls `useAssignment().submit()` on expiry; surfaces a one-line `autoSubmitNotice` banner.

`packages/ui/src/components/exam-tab-body.module.css` — added `.timer`, `.timerWarn` (composes from `.timer`), and `.autoSubmitNotice`.

### Tests

`packages/core/src/__tests__/assignment-service.test.ts` — 2 new round-trip tests: `durationMinutes: 45` persists and is readable; `durationMinutes: null` persists as undefined (absent field).

`packages/ui/src/__tests__/exam-tab-body.test.tsx` — 6 new timer tests using `vi.useFakeTimers()`:
- Countdown renders at t=0.
- Ticks (1-second advance → correct `mm:ss`).
- Warn class applied below 5-minute threshold.
- Submit called at expiry + notice shown.
- Double-fire guard (only one submit even when many ticks fire past expiry).
- No timer rendered when `durationMinutes` is null.

### Reference time

`assignedAt` (already on `Assignment`) is the clock start — the exam timer starts when the
assignment is assigned, not when the student opens the tab. This is the right semantics for
proctored exams and avoids a new column. The mock at `.mockups/screens/.../mode-exam.html` confirms
this approach (the timer in the header shows "26:14 left" with no separate "started at" concept).

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `ExamTabBody` calls `useAssignment(assignmentId)` and then renders `<AssignmentCard assignmentId={assignmentId}>` which also calls `useAssignment` internally — two independent fetches, not one shared instance. The impl note "avoiding a second fetch" is inaccurate. Functionally harmless (separate state trees, no interference) but the comment is misleading.
- `useEffect([assignment])` dep in `ExamCountdown`: if `assignment` object identity ever changed before expiry (e.g., due to polling), `expiredRef` would reset, enabling a theoretical double-submit. Non-triggerable today because `ExamTabBody`'s `useAssignment` only refreshes on submit (at which point the countdown unmounts), but it's latent fragility. Could be hardened by using `[assignment.id, assignment.durationMinutes, assignment.assignedAt]` as the dep array.

**Notes**: All six timer tests pass using fake timers (render, tick, warn-class, submit-on-expiry, double-fire guard, no-timer-when-null). Schema, service, tool, and type layers are consistent and correctly wired. Migration is clean. `assignedAt`-as-clock-start is the right call.
