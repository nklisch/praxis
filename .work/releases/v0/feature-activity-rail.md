---
id: feature-activity-rail
kind: feature
stage: done
tags: [ui, refactor]
parent: null
depends_on: [feature-phase-13-editorial-foundation]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Activity rail — ambient progress for long-running work

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/activity-rail.md`.

**Goal that shipped:** Replace the blocking `IngestionProgress` modal with an ambient `<ActivityRail>` anchored to the bottom of the app chrome. While work happens (a textbook reading, the explorer mapping, math tools warming) the rail shows one editorial line per activity; while idle, the rail is invisible.

**Notes:** `ActivityRegistry` server-side service injected via `ServiceDeps.activity`; producers call `start({ label, metadata? })` → hold `ActivityHandle` → `update(patch)` / `finish("done"|"failed")`. New long-running services must use this rather than spawning modals (see `activity-rail-producer` pattern).
