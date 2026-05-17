---
id: story-course-buildout-progress-signals
kind: story
stage: review
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

## Implementation notes

### Option chosen: A — drop misleading estimate, add live structural progress

The bootstrap-role fragment (`packages/curriculum/src/modes/fragments/bootstrap-role.ts`) already forbade the model from quoting time estimates ("Do NOT promise a specific duration") and the fragment tests at `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-time-estimate.test.ts` already pin those constraints. The model-side fix was already complete.

On the UI side, the `BootstrapTabBody` right pane already shows a live `DraftCard` that updates on every `draft_add_unit` call. The `SubAgentPanel` coarse labels ("reading your materials" → "drafting an outline" → "finalizing the draft") were the remaining gap — they didn't tell the user how many units had been drafted.

### Changes made

**`packages/curriculum/src/bootstrap/explorer.ts`**:
- Added `pendingCallTool: Map<string, string>` to track `toolName` by `callId` across the `tool_call` → `tool_result` pair.
- Added `unitsAdded: number` counter initialized to 0.
- In the `tool_call` handler: `pendingCallTool.set(ev.callId, ev.toolName)`.
- In the `tool_result` handler: look up and delete the pending tool name; when it is `"course.draft_add_unit"` and the result is ok, increment `unitsAdded` and call `input.subAgentHandle?.setLabel(\`unit \${unitsAdded} drafted\`)`.

The result: the sub-agent panel label updates to "unit 1 drafted", "unit 2 drafted", etc. as each unit is committed — showing live structural progress instead of a static phase label for the entire build-out.

### Test coverage

Two new tests added in `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` inside the existing `runConceptExplorer — subAgentHandle emissions` describe block:

- `"emits setLabel('unit N drafted') after each successful draft_add_unit"` — verifies the label fires once for a single unit add.
- `"increments label counter across multiple draft_add_unit calls"` — verifies the counter increments and labels are in order ("unit 1 drafted", "unit 2 drafted").

Both tests pre-populate a draft via the bootstrap service directly, then run the explorer in continuation mode with a `ScriptedEngine` that calls `draft_add_unit`. All 20 explorer tests pass.
