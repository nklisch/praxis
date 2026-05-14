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
updated: 2026-05-14
---

# Buildout progress claims — stop the bootstrap explorer from promising bad ETAs

## Brief

The "misleading ETA" the user reported is not a UI element. It's the
**bootstrap explorer agent itself**, in its response text, saying
things like "this should take about 30 seconds" while the actual run
takes minutes. Anchor verification confirmed there is no ETA component
in `bootstrap-tab-body.tsx` or adjacent UI. The agent is freelancing
a time estimate based on no real signal, the user reads it as a
commitment, and when the run blows past the quoted time the UI looks
stalled.

This feature is a **prompt fix to the bootstrap explorer's mode
fragments**. The fragment(s) that drive the explorer's response style
get instructions that explicitly **forbid time-estimate claims**
("don't promise specific durations") and **direct the model to
describe progress in structural terms only** if it talks about
progress at all ("Unit 3 of 8 drafted" rather than "30 seconds left").
Bounded to the curriculum modes/fragments package — no UI changes, no
activity-rail integration, no service wiring.

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `idea-course-buildout-time-estimate` — replace the misleading ETA
  with structural progress signals.

## Foundation references

- `CLAUDE.md` — pattern `mode-prompt-fragment-composition`
- `docs/ARCHITECTURE.md` — bootstrap explorer pipeline; mode + pedagogy
  pack composition

## Anchors (current implementation)

- Bootstrap mode definition —
  `packages/curriculum/src/modes/bootstrap.ts` (mode declares the
  `promptFragments` array that drives the explorer's response style)
- Shared fragment directory —
  `packages/curriculum/src/modes/fragments/` (the specific fragment
  responsible for response-style guidance lives here; feature-design
  locates the exact file by reading the bootstrap mode's fragment
  imports and the fragment text that today permits ETA claims)
- Prompt composition pipeline —
  `packages/curriculum/src/compose-system-prompt.ts` (or wherever
  `composeSystemPrompt` lives — for context, no changes expected
  here)

## Pre-design decisions (2026-05-14)

- **Source of the bad ETA**: agent prompt output, NOT a UI element.
  The original brief was based on a misread; corrected here. No
  `<ActivityRail>` integration, no service wiring, no UI work in this
  feature.
- **Fix shape**: update the bootstrap explorer's mode prompt fragment
  to (a) explicitly forbid time-estimate claims like "this should take
  X seconds/minutes", and (b) instruct the model to describe progress
  in structural terms only ("Unit 3 of 8 drafted", "current step:
  drafting assessment plan for Lesson 5") if it talks about progress
  at all.
- **Scope**: bounded to `packages/curriculum/src/modes/` — the
  bootstrap mode definition and the fragment file that drives response
  style. No other packages touched.
