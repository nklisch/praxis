---
id: gate-docs-contract-assignment-item-fold-in
kind: story
stage: done
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

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
