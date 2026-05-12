---
id: gate-docs-contract-assignment-item-fold-in
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# CONTRACT.md `AssignmentItem` still shows pre-Phase-17 shape as primary; Phase 17 expansion lives only in a "(planned)" callout

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:405-411` (primary) followed by `:413-530` (Phase 17 quoted block); same pattern at `:511-529` for QuickCheckAnswer/QuickCheckEvent
- Code: `packages/core/src/types/artifacts.ts` (current `AssignmentItem` discriminated union)

## Current doc text
> "interface AssignmentItem { id: string; kind: \"multiple-choice\" | \"short-answer\" | \"free-response\" | \"math\" | \"code\"; prompt: string; options?: string[]; rubric?: Rubric; }"
followed by a `>` blockquote: "**Phase 17 (planned) — `AssignmentItem` rename + expansion**" with the full expanded union.

## Reality
Phase 17 SHIPPED (per CHANGELOG v0 retro and the existing Phase 17 design doc). The "(planned)" marker is stale; the discriminated union shown in the callout is the source of truth. Same applies to the "Phase 17 (planned)" QuickCheckAnswer / QuickCheckEvent callout.

## Required edit
Promote the discriminated union from the callout into the primary inline definition, replacing the pre-Phase-17 shape. Remove the "(planned)" qualifiers from both Phase 17 callouts. The lower CONTRACT.md "Phase 17 additive changes" section (line 1262+) already documents the changes as current — fold the two presentations into a single in-place definition to match rolling-foundation discipline.

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.
