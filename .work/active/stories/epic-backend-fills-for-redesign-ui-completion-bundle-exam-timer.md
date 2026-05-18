---
id: epic-backend-fills-for-redesign-ui-completion-bundle-exam-timer
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
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

- [ ] `duration_minutes` persists on assignments.
- [ ] Countdown renders + ticks in exam mode.
- [ ] Warn state at last 5 minutes.
- [ ] Auto-submit fires at expiry.
- [ ] All quality checks green.
