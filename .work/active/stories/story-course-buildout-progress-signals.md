---
id: story-course-buildout-progress-signals
kind: story
stage: drafting
tags: [ux, bootstrap]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Course build-out: replace misleading time estimate with progress signals

## Brief

The time estimate shown for course build-out (during the bootstrap explorer / course creation flow) is significantly shorter than actual elapsed time, leaving users staring at a stalled-looking UI well past the quoted ETA. The displayed expectation should be revised upward to reflect real-world durations — or better, replaced with progress signals (units processed, lessons drafted, current step) instead of a fixed time estimate that's almost always wrong. A misleading low estimate erodes trust more than a high one or no estimate at all.

## Direction

Two viable shapes:

1. **Drop the estimate** — replace the "~N seconds remaining" line with a live progress description ("Drafting unit 3 of 7 — 'Photosynthesis basics'…") sourced from the bootstrap explorer's activity stream. Aligns with the `activity-rail-producer` pattern.
2. **Recalibrate** — if a number is required, base it on measured real durations from telemetry and skew high; pair with the activity description for context.

Prefer (1) — progress signals are more honest and already wired through the activity rail.

## Acceptance criteria

- The bootstrap UI no longer shows a fixed time estimate that is reliably wrong.
- Users see a live signal of current work (unit being drafted, lessons-so-far, or similar) sourced from real explorer events.
- The displayed signal matches what the explorer is actually doing within ~1 turn.

## Anchors

- Bootstrap UI — `packages/ui/src/routes/courses.tsx` (modified per git status), `packages/ui/src/components/` bootstrap surface
- Activity rail pattern — see `activity-rail-producer` in `.claude/skills/patterns/`
