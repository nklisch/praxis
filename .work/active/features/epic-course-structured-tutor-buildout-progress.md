---
id: epic-course-structured-tutor-buildout-progress
kind: feature
stage: drafting
tags: [tutor-ux, bootstrap]
parent: epic-course-structured-tutor
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Buildout progress signals — replace misleading ETA with structural progress

## Brief

The course-buildout flow shows a time estimate that's consistently
shorter than reality, leaving the user staring at a UI that appears
stalled well past the quoted ETA. A misleading low estimate erodes
trust more than no estimate; it tells the user "this should have
finished by now," which makes the still-running build feel broken even
when it's healthy.

This feature replaces the fixed ETA with **structural progress signals
that update as the explorer works**: units processed (e.g., "3 of 8"),
lessons drafted, current step ("draft_add_unit for Unit 3 — Cellular
Respiration"), and elapsed time. The numerator changes as the work
progresses, so a slow run looks slow but not stalled. The activity-rail
surface (`<ActivityRail />`) is the natural host — the bootstrap
service injects `ActivityRegistry` via `ServiceDeps.activity` and
updates the rail entry per step. The current ETA shown elsewhere (the
explorer didn't surface one in `bootstrap-tab-body.tsx`; feature-design
must locate the exact source — possibly a separate panel or toast)
gets retired in favor of "elapsed: X" and the structural counters.

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `idea-course-buildout-time-estimate` — replace the misleading ETA
  with structural progress signals.

## Foundation references

- `docs/ARCHITECTURE.md` — activity rail (ambient progress surface),
  bootstrap explorer pipeline
- `docs/designs/activity-rail.md` — design rationale for the rail
- `CLAUDE.md` — pattern `activity-rail-producer`,
  `service-deps-injection`

## Anchors (current implementation)

- Activity rail — `packages/ui/src/components/ActivityRail.tsx` mounted
  in `packages/ui/src/router.tsx`
- Activity registry — `packages/core/src/services/activity-registry.ts`
  (or wherever the producer interface lives); `ServiceDeps.activity`
- Bootstrap service —
  `packages/core/src/services/bootstrap-service.ts` (today does NOT
  inject `ActivityRegistry` per anchor verification; feature must add
  it)
- Bootstrap UI — `packages/ui/src/components/bootstrap-tab-body.tsx`
  (no ETA found here per anchor verification — search elsewhere for
  the misleading ETA the user is reporting; likely a separate
  progress component, toast, or activity-rail entry that already
  exists with an estimate-too-low contract)
- Course-design tool calls that mark progress milestones —
  `packages/tools/src/course/` (each `draft_add_*` could emit a
  rail update)
