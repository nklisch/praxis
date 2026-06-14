---
id: release-v0.1.4
kind: release
stage: released
tags: []
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: null
created: 2026-05-23
updated: 2026-05-24
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

- **gate-docs** (2026-05-23) — 8 findings, 6 High / 2 Medium / 0 Low.
  Highs (release-blocking, `stage: implementing`):
  `gate-docs-contract-session-active-modeid` (CONTRACT.md missing
  `modeId?` arg),
  `gate-docs-contract-session-list-excludemodeids` (CONTRACT.md
  missing `excludeModeIds?` arg),
  `gate-docs-pattern-ipc-channel-convention-session-active` (stale
  `wrapEnvelope` example for `praxis.session.active`),
  `gate-docs-pattern-async-generator-event-stream-line`,
  `gate-docs-pattern-episodic-append-ordering-line`,
  `gate-docs-pattern-streaming-ipc-channel-helpers-line` (3 stale
  file:line citations now resolving to wrong lines post-bundle).
  Mediums (release-blocking, `stage: drafting`):
  `gate-docs-pattern-editorial-ui-primitives-library-routeheader`
  (Workbench library has no `<RouteHeader>` — example must point at a
  different consumer),
  `gate-docs-pattern-session-tab-open-flow-library-handleopenintab`
  (Workbench `handleRecAction` shape replaces old `handleOpenInTab`).
  CHANGELOG.md sanity passed for v0.1.0–v0.1.3; v0.1.4 entry skipped
  per orchestration note (drafted in Phase 5.5). No README drift, no
  doc misplacement, no generated-file regen needed.

- **gate-patterns** (2026-05-23) — 4 new patterns extracted, 2
  inconsistencies flagged. New patterns (codified directly, tracker at
  `gate-patterns-v0.1.4` is `stage: done`):
  `dynamic-where-predicate` (6+ Drizzle accumulator sites),
  `use-resource-aggregation-loader` (6+ `Promise.all` loader sites),
  `ipc-envelope-test-triad` (9+ test files repeating the 4-assertion
  shape with path-leakage check),
  `server-resolved-student-id` (14 handler files using
  `getStudentId(services)`; Zod schema declares no `studentId`).
  Inconsistencies (release-blocking, `stage: drafting`):
  `gate-patterns-inconsistency-shared-test-fakes-logger` (~37
  channel-envelope tests inline `makeFakeLogger()`; bundle entrenches
  the drift). The `editorial-ui-primitives` Workbench divergence is
  already tracked as the corresponding gate-docs item.

- **gate-patterns (rerun, 2026-05-24)** — full-project sweep per user
  request "re-run patterns before releasing". Opus discovery scanned
  ~1,150 TS/TSX files across all 11 packages, surfacing emergent shapes
  from the post-bind refactor wave (artifacts/assignment/author-channel
  /buildServices/course-create/engine-adapter/memory/session-spawn
  /use-ingestion/use-streamed-send decompositions). 8 additional
  patterns codified: `builder-module-composition`,
  `service-facade-sibling-dir`, `one-shot-llm-inference`,
  `agent-prompt-sidecar`, `row-to-domain-mapper`,
  `hook-decomposition-setitems-callback`, `ref-cell-bridge`,
  `kind-adapter-registry`. 3 additional inconsistencies flagged as
  `[refactor]` stories at `stage: drafting` WITHOUT release binding
  (deferred to a future release so the rerun doesn't add v0.1.4
  readiness blockers): `gate-patterns-inconsistency-noop-dispatch-duplication`
  (6 copies of `noopDispatch`),
  `gate-patterns-inconsistency-require-unlocked-duplication`
  (7 author/config channels reinvent `requireUnlocked()`),
  `gate-patterns-inconsistency-builder-positional-deps`
  (`buildMemoryServices` + `buildEmbeddingsServices` use positional
  params instead of typed deps object).

## Ship summary

- **Date shipped**: 2026-05-24
- **Mapping**: tag-based (annotated tag `v0.1.4`)
- **Total items shipped**: 41 (12 bound + 29 gate-produced)
- **Gates run**: 5/5 (security, tests, cruft, docs, patterns)
- **Gate findings**: 3 Low security (parked); 17 tests (0C/4H/7M/6L); 7
  cruft (3H/2M/2L); 8 docs (6H/2M); 12 new patterns codified across
  bind + rerun; 1 systemic test-fakes inconsistency resolved in-cycle;
  3 new pattern inconsistencies filed unbound (deferred).

## Collapsed items

All 41 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| bug-picker-close-aborts-ingestion | Bug: closing the picker modal mid-ingestion aborts the in-flight batch | story | — | ab62e445 |
| feature-configure-mode-session-hygiene | Configure-mode session hygiene | feature | — | ab62e445 |
| feature-streamline-document-attachment-ux | Streamline document attachment UX | feature | — | ab62e445 |
| gate-cruft-library-handle-use-pack-pack-name-unused | `_packName` parameter in `handleUsePack` is unused — interface forces a value the consumer doesn't want | story | — | ab62e445 |
| gate-cruft-session-service-assignmentid-undefined-defensive | Defensive `assignmentId !== null && !== undefined` checks on non-nullable-undefined columns | story | — | ab62e445 |
| gate-cruft-spawn-from-passage-studentid-phantom-arg | `studentId` parameter on `SessionClient.spawnFromPassage` is silently dropped | story | — | ab62e445 |
| gate-cruft-use-ingestion-activity-rail-stale-comment | Stale comment references `ActivityRail` (unused) instead of `StatusStrip` | story | — | ab62e445 |
| gate-cruft-use-ingestion-startpick-dead | Dead single-file ingestion path: `startPick` + `runIngestion` have no production callers | story | — | ab62e445 |
| gate-docs-contract-session-active-modeid | `docs/CONTRACT.md` `SessionService.active` signature drops the new `modeId` filter | story | — | ab62e445 |
| gate-docs-contract-session-list-excludemodeids | `docs/CONTRACT.md` Phase-14 `SessionService.list` signature missing `excludeModeIds` | story | — | ab62e445 |
| gate-docs-pattern-async-generator-event-stream-line | Pattern skill `async-generator-event-stream` cites stale `session-service.ts:125` for `send` | story | — | ab62e445 |
| gate-docs-pattern-editorial-ui-primitives-library-routeheader | Pattern skill `editorial-ui-primitives` `<RouteHeader>` example for `library.tsx:97` no longer exists | story | — | ab62e445 |
| gate-docs-pattern-episodic-append-ordering-line-followup | Pattern skill `episodic-append-ordering` cites stale `session-service.ts:166` | story | — | ab62e445 |
| gate-docs-pattern-episodic-append-ordering-line | Pattern skill `episodic-append-ordering` cites stale `session-service.ts:125` | story | — | ab62e445 |
| gate-docs-pattern-ipc-channel-convention-session-active | Pattern skill `ipc-channel-convention` shows stale `wrapEnvelope` shape for `praxis.session.active` | story | — | ab62e445 |
| gate-docs-pattern-session-tab-open-flow-library-handleopenintab | Pattern skill `session-tab-open-flow` cites stale `library.tsx:48-55` / `:67-74` for `handleOpenInTab` | story | — | ab62e445 |
| gate-docs-pattern-streaming-ipc-channel-helpers-line | Pattern skill `streaming-ipc-channel-helpers` cites stale `session-channel.ts:143` for `praxis.session.send` | story | — | ab62e445 |
| gate-patterns-inconsistency-shared-test-fakes-logger | Channel-envelope tests inline `makeFakeLogger()` instead of using shared `makeSpyLogger` | story | — | ab62e445 |
| gate-patterns-v0.1.4 | Patterns extracted for v0.1.4 | story | — | ab62e445 |
| gate-tests-configure-cleanup-migration-idempotency | Migration 0025 idempotency on re-run has no automated test | story | — | ab62e445 |
| gate-tests-configure-route-race-on-simultaneous-mount | Two-tab configure-route mount race regression test missing | story | — | ab62e445 |
| gate-tests-configure-route-unmount-cleanup-no-warning | Unmount-during-pending-`active()` cleanup is implicit — no console-warning assertion | story | — | ab62e445 |
| gate-tests-configure-route-unmount-vs-reuse | Configure route's `session.end` in unmount cleanup may contradict the reuse contract | story | — | ab62e445 |
| gate-tests-multi-document-upload-positive-path | Multi-file selection (N > 1) positive path not exercised through the library route | story | — | ab62e445 |
| gate-tests-picker-close-midingestion-no-abort | Closing the picker modal mid-ingestion not asserted to leave the batch running | story | — | ab62e445 |
| gate-tests-rework-cancelbatch-weak-oracle | `cancelBatch` test has a race-tolerant assertion that hides bugs | story | — | ab62e445 |
| gate-tests-session-active-studentid-isolation | `session.active({ modeId })` cross-student isolation not regression-guarded | story | — | ab62e445 |
| gate-tests-session-list-excludemodeids-studentid-isolation | `session.list({ excludeModeIds })` student-scoping not regression-guarded | story | — | ab62e445 |
| gate-tests-session-list-includeended-and-excludemodeids | `includeEnded: false` combined with `excludeModeIds` not tested | story | — | ab62e445 |
| gate-tests-sessions-fk-cascade-contract | `sessions` FK-cascade contract for `episodic_events` / `tabs` is comment-only — no test | story | — | ab62e445 |
| review-async-generator-event-stream-line-restale | Pattern skill `async-generator-event-stream` cites stale `session-service.ts:166` for `send` | story | — | ab62e445 |
| story-citation-schema-inverted-range-refine | `recordCitation` schema has the same inverted-range validation gap as `spawnFromPassage` did | story | — | ab62e445 |
| story-configure-cleanup-migration | Drizzle migration — delete legacy configure sessions | story | — | ab62e445 |
| story-configure-route-reuse-and-reset | Configure route reuse on mount + "Clear / restart" control | story | — | ab62e445 |
| story-fix-desktop-vitest-filter-tests-dir | Fix `pnpm --filter @praxis/desktop test` — vitest looks for a non-existing `tests/` dir | story | — | ab62e445 |
| story-fix-session-service-exactoptional-baseline | Fix the 4th `exactOptionalPropertyTypes` baseline error in `session-service.ts` | story | — | ab62e445 |
| story-inline-upload-in-attach-from-library | Inline upload inside the "Attach from Library" picker — drop-zone overlay + "+ Upload" button | story | — | ab62e445 |
| story-multi-document-upload | Multi-file document upload — Library route Upload button | story | — | ab62e445 |
| story-session-active-mode-filter | Extend `SessionService.active` with optional `modeId` filter | story | — | ab62e445 |
| story-session-list-exclude-modes | Extend `SessionService.list` with `excludeModeIds` + wire library to hide configure sessions | story | — | ab62e445 |
| story-workspace-edge-padding | Workspace content hugs panel edges | story | — | ab62e445 |

