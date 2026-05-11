---
id: feature-root-tsconfig-typecheck-coverage
kind: feature
stage: drafting
tags: [tooling]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Root-tsconfig typecheck coverage

## Brief

`pnpm typecheck` runs `pnpm -r run typecheck` — recursive over packages only. It
does NOT typecheck the root `tsconfig.json` that governs `tests/` and
`scripts/`, even though that tsconfig declares
`include: ["scripts/**/*", "tests/**/*", "drizzle.config.ts"]`. Type-level
regressions in root-tier files slip past CI because vitest doesn't enforce
strict typing at runtime — `pnpm test` will happily green on code whose types
don't compile.

Discovered during review of `feature-powerpoint-ingestion`: making
`IngestionServiceDeps.embeddedImageStore` mandatory broke 3 sites in
`tests/textbook-rag-end-to-end.test.ts`; the per-package typechecks all
stayed green, vitest ran the tests, and the regression only surfaced because
review explicitly ran `tsgo --noEmit -p tsconfig.json` against the root config.

The fix is structurally one line — wire a root typecheck into the
workspace `typecheck` script. The hard part is that turning on the gate today
finds **43 pre-existing errors across 14 files** that have accumulated
because nothing has been checking. Those need to be cleaned up before the
gate can be enforced; otherwise it'll just be permanently red.

## Survey: what's broken today

From `pnpm exec tsgo --noEmit -p tsconfig.json` at the time of scoping:

**`scripts/` (3 files)**:
- `scripts/db-gates.ts` — `Logger` missing `child` property (3 occurrences). A
  locally-constructed `noopLogger`-style stub doesn't implement the full
  `Logger` interface that picked up a new method.
- `scripts/db-packs.ts` — same `Logger.child` issue (2 occurrences).
- `scripts/run-session.ts` — broader rot: imports stale exports
  (`IsolatedVmHost`, `codeSandboxTool`, `LocalCodeSandbox` no longer exist —
  drift since `language-sandbox-registry` replaced isolated-vm with QuickJS),
  plus `ToolContext` shape mismatch.

**`tests/` (11 files)**:
- `tests/adaptive-routing-end-to-end.test.ts` — `BootstrapServiceDeps.courseDocuments` mandatory but not passed.
- `tests/engine-conformance.test.ts` — `@praxis/claude-cli-sdk` import path issue, `ToolContext` shape mismatch.
- `tests/exam-end-to-end.test.ts` — `Brand<string, CourseId>` vs `CourseId` mismatch (6 occurrences). Branding changed and the test factory wasn't updated.
- `tests/foundation.test.ts` — `Cannot find module 'better-sqlite3'` and undefined-check warnings.
- `tests/full-turn-with-fake-engine.test.ts` — `ServiceDeps.lockService` mandatory but not passed (6 occurrences).
- `tests/gates-end-to-end.test.ts` — same `lockService` issue + `studentId` not in expected props.
- `tests/mastery-end-to-end.test.ts` — TBD (in error list but not enumerated here).
- `tests/notes-flashcards-end-to-end.test.ts` — TBD.
- `tests/pack-import-end-to-end.test.ts` — TBD.
- `tests/quick-check-tool-context-wiring.test.ts` — TBD.
- `tests/quiz-end-to-end.test.ts` — TBD.

The pattern is clear: when packages added mandatory fields to deps types
(`courseDocuments`, `lockService`, `child` on `Logger`, etc.) the
implementations under `packages/*` were updated and tests under
`packages/*/__tests__/` were updated alongside them, but the root-tier tests
(which exist outside any package's typecheck scope) were left as silent
drift.

## Out of scope

- Refactoring the root-tier tests beyond what's needed to typecheck. Some of
  these tests may have other issues; this feature is about restoring the
  contract, not rewriting them.
- Adopting a different typecheck tool. Keep `tsgo` to match what the
  packages use.
- Adding lint coverage for the root tier. Biome already runs over the whole
  repo; that's not the gap.

<!-- Design and child stories will be added by /agile-workflow:feature-design. -->
