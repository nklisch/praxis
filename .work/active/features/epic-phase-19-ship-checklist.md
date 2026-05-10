---
id: epic-phase-19-ship-checklist
kind: feature
stage: drafting
tags: []
parent: epic-phase-19-ship-v1
depends_on:
  - epic-phase-19-biology-pack
  - epic-phase-19-electron-signing
  - epic-phase-19-auto-update
  - epic-phase-19-first-run-flow
  - epic-phase-19-onboarding-docs
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Ship checklist (v1.0.0)

## Brief

The terminal feature in Phase 19 — the v1 acceptance test, end-to-end, on
a clean machine, against the signed installer. ROADMAP names this as the
Phase 19 test checkpoint: "Build signed installer. Install on clean
machine. Self-onboard with real syllabus + textbook. Session, sketch math,
submit homework, pass exam, unlock, notes, flashcards. All works without
dev tools." This feature is where that test is run, where the findings
become substrate items, and where v1.0.0 either gets cut or gets sent
back for fixes.

What this feature covers:

- A formal `docs/v1-ship-checklist.md` (or equivalent location — design
  pass picks) capturing the exact acceptance script: install steps,
  per-mode flows to exercise, expected outputs, known-acceptable
  divergences. This is the dogfooding script.
- An execution pass: build the signed installer, install on a clean
  account or VM that has none of the dev paths set, walk the script
  end-to-end, log every divergence as a substrate item with appropriate
  tags (bugs as stories at `stage: implementing`, observations as
  backlog items).
- A go / no-go decision recorded in this feature's body. If go,
  `epic-phase-19-ship-v1` advances and the v1.0.0 release is cut via
  `/agile-workflow:release-deploy`. If no-go, the blocking findings get
  unblocked first.
- Verification that all six canonical user paths work without dev tools:
  bootstrap a course (canonical pack and syllabus paths), teach session,
  sketch math, submit homework, pass an exam, gate unlock, notes,
  flashcards.

What this feature does NOT cover:

- The actual fixes for any failures uncovered — those become their own
  stories and resolve through the normal flow. This feature is the
  detector and the gate, not the fixer.
- Cutting the release — that's `/agile-workflow:release-deploy` running
  against `v1.0.0` with this epic bound. This feature produces the
  go-signal that justifies running release-deploy.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: terminal aggregator. Depends on every other Phase 19
  feature because the checklist exercises everything together. When this
  feature reaches `done`, the epic is ready to advance and v1 is
  shippable.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 test checkpoint (the script).
- `docs/SPEC.md` — the canonical capability list against which the
  checklist is calibrated.
- The other five Phase 19 features — collectively define what the
  checklist actually tests.

<!-- Feature-design pass will write the explicit checklist script,
including per-platform variations and the failure-triage rubric. -->
