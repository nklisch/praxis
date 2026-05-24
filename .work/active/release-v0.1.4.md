---
id: release-v0.1.4
kind: release
stage: quality-gate
tags: []
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Release v0.1.4

Fifth versioned release after v0.1.0 / v0.1.1 / v0.1.2 / v0.1.3. Captures
everything that landed between v0.1.3 shipping on 2026-05-18 and the
v0.1.4 bind on 2026-05-23. Smaller bundle than v0.1.3 — focused on
follow-on hygiene from the UI redesign, two configure-mode features, and
document-attachment polish.

Headline themes:

- **Configure-mode session hygiene** — configure sessions stop appearing
  in the library; route reuses one session per (course × tab) and
  exposes a clear/restart control; a Drizzle migration deletes legacy
  configure sessions so the new contract starts clean.
- **Document attachment UX** — inline upload inside the "Attach from
  Library" picker, multi-file upload on the Library route's Upload
  button.
- **Session service tightening** — `SessionService.active` gains an
  optional `modeId` filter; `SessionService.list` gains `excludeModeIds`
  so the library can hide configure sessions.
- **Workspace polish** — workspace content hugs panel edges (UI redesign
  follow-on).
- **Quality follow-ons from v0.1.3 review** — `recordCitation`
  inverted-range refine to match the citation schema fix; fix
  `session-service.ts` exactOptional baseline regression; fix
  `pnpm --filter @praxis/desktop test` looking for a non-existent
  `tests/` dir.

## Bound items

- feature-configure-mode-session-hygiene — Configure-mode session hygiene
- feature-streamline-document-attachment-ux — Streamline document attachment UX
- story-citation-schema-inverted-range-refine — `recordCitation` schema has the same inverted-range validation gap as `spawnFromPassage` did
- story-configure-cleanup-migration — Drizzle migration — delete legacy configure sessions
- story-configure-route-reuse-and-reset — Configure route reuse on mount + "Clear / restart" control
- story-fix-desktop-vitest-filter-tests-dir — Fix `pnpm --filter @praxis/desktop test` — vitest looks for a non-existing `tests/` dir
- story-fix-session-service-exactoptional-baseline — Fix the 4th `exactOptionalPropertyTypes` baseline error in `session-service.ts`
- story-inline-upload-in-attach-from-library — Inline upload inside the "Attach from Library" picker — drop-zone overlay + "+ Upload" button
- story-multi-document-upload — Multi-file document upload — Library route Upload button
- story-session-active-mode-filter — Extend `SessionService.active` with optional `modeId` filter
- story-session-list-exclude-modes — Extend `SessionService.list` with `excludeModeIds` + wire library to hide configure sessions
- story-workspace-edge-padding — Workspace content hugs panel edges

## Gate runs

(populated during Phase 4)
