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

- **gate-security** (2026-05-23) — 3 Low findings, 0 Critical / 0 High /
  0 Medium. Items parked to backlog (don't block readiness):
  `gate-security-spawn-from-assignment-parent-validation`,
  `gate-security-spawn-from-passage-offset-cap`,
  `gate-security-session-list-limit-cap`. Positive verifications:
  migration 0025 cascade scope correct (foreign_keys=ON;
  `episodic_events` + `tabs` CASCADE; non-FK columns in SQL comment
  enumerated); new `excludeModeIds` / `modeId` queries Drizzle-bound (no
  SQL injection); all 9 bundled session/citation channels go through
  `handleEnvelope` (Zod + redacted internal errors); mass-assignment of
  internal `_persistImmediately` not reachable via IPC schema;
  citation inverted-range fix has direct test coverage; vitest config
  scope reduction surfaces no env / secret exposure; no `package.json`
  / lockfile delta in bundle (zero supply-chain change).

- **gate-tests** (2026-05-23) — 17 findings, 0 Critical / 4 High /
  7 Medium / 6 Low. Highs (release-blocking, `stage: implementing`):
  `gate-tests-configure-cleanup-migration-idempotency`,
  `gate-tests-sessions-fk-cascade-contract`,
  `gate-tests-configure-route-unmount-vs-reuse` (bug-or-spec
  investigation — `session.end` in configure-route unmount appears to
  contradict the reuse contract),
  `gate-tests-multi-document-upload-positive-path`. Mediums
  (release-blocking, `stage: drafting`):
  `gate-tests-configure-route-race-on-simultaneous-mount`,
  `gate-tests-configure-route-unmount-cleanup-no-warning`,
  `gate-tests-session-active-studentid-isolation`,
  `gate-tests-session-list-excludemodeids-studentid-isolation`,
  `gate-tests-session-list-includeended-and-excludemodeids`,
  `gate-tests-picker-close-midingestion-no-abort`,
  `gate-tests-rework-cancelbatch-weak-oracle`. Lows parked to backlog:
  `gate-tests-vitest-filter-desktop-ci-smoke`,
  `gate-tests-session-list-empty-excludemodeids-envelope`,
  `gate-tests-useingestion-duplicate-paths-spec`,
  `gate-tests-library-picker-drag-overlay-child-leave-guard`,
  `gate-tests-workspace-edge-padding-token-presence`,
  `gate-tests-recordcitation-error-message-text`. No tests silenced or
  deleted; `configure-route` test that was replaced asserts a stronger
  contract than the original (legitimate behavior-change replacement
  per story implementation notes).

- **gate-cruft** (2026-05-23) — 7 findings, 3 High / 2 Medium / 2 Low.
  Highs (release-blocking, `stage: implementing`):
  `gate-cruft-use-ingestion-startpick-dead` (dead single-file path —
  `startPick` + `runIngestion` have zero production callers),
  `gate-cruft-spawn-from-passage-studentid-phantom-arg` (silently
  dropped `studentId?` arg on client + service-type),
  `gate-cruft-use-ingestion-activity-rail-stale-comment` (comment
  references unused `ActivityRail` instead of `StatusStrip`).
  Mediums (release-blocking, `stage: drafting`):
  `gate-cruft-session-service-assignmentid-undefined-defensive`
  (`!== null && !== undefined` on columns that are never `undefined`,
  3 sites),
  `gate-cruft-library-handle-use-pack-pack-name-unused`
  (`_packName` arg unused; tight interface forces it). Lows parked to
  backlog: `gate-cruft-library-handle-use-pack-orientation-comment`,
  `gate-cruft-library-double-fetch-documents`.
