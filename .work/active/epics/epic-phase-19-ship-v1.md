---
id: epic-phase-19-ship-v1
kind: epic
stage: drafting
tags: [content]
parent: null
depends_on: [epic-phase-18-study-skills]
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Phase 19 — Biology canonical + Electron packaging + ship v1

Source: `docs/ROADMAP.md` Phase 19 — the M3 milestone.

**Goal:** Shippable v1 — signed installer for at least one platform with both canonical
packs (Algebra/Geometry from Phase 10 plus Biology landing here).

## What ROADMAP says

- Curated canonical biology concept graph (parallel to the math pack from Phase 10).
- Signed Electron installer for macOS, Windows, or Linux (at least one).
- Auto-update channel decision (built-in updater vs manual download).
- A complete v1 user-facing first-run flow: install → sign in → bootstrap a course →
  start a teach session.
- Documentation pass: README + onboarding video / screencast.

## Status

`stage: drafting` — no design doc yet. Depends on `epic-phase-18-study-skills` per
ROADMAP phase ordering: the metacognition coach informs how the study-skills story
shows up in the canonical pedagogy packs, and the v1 ship flow needs the full memory
stack from Phase 18 to demo well.

## Next step

After Phase 18 reaches `stage: done`:

1. Run `/agile-workflow:design` to decompose this epic.
2. Likely child features: biology-canonical-graph, electron-signing,
   auto-update-channel, first-run-flow, ship-checklist.
3. Cut release `v1.0.0` (real tag this time, not retro). Bind features and run
   `/agile-workflow:release-deploy` for the full gate sweep.
