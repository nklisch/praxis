---
id: feature-root-tsconfig-typecheck-coverage
kind: feature
stage: review
tags: [tooling]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

## Design decisions

- **Extend the existing `typecheck` script** rather than introducing a parallel
  `typecheck:root`. One command should give a complete answer. Concretely:
  `"typecheck": "pnpm -r run typecheck && tsgo --noEmit -p tsconfig.json"`. The
  per-package step still runs first (most work, most likely to fail with
  useful errors); root is appended as the final gate.
- **Clean up before enabling.** Land cleanup as separate commits, then enable
  the gate as the final commit. Reverse order (enable then clean up) leaves
  the workspace red between commits, which complicates bisect and review.
- **`scripts/run-session.ts` decision is delegated to the implementer.** The
  file imports stale exports (`IsolatedVmHost`, `codeSandboxTool`,
  `LocalCodeSandbox`) that haven't existed since the
  `language-sandbox-registry` refactor swapped isolated-vm for QuickJS. The
  script is wired as `pnpm script:run-session` in `package.json` but has been
  broken silently for some time. The implementer should `git log -p
  scripts/run-session.ts` to see how long it's been rotten, then either
  (a) port to current APIs if there's evidence of recent intentional use, or
  (b) delete it and remove the `script:run-session` entry. Either is fine;
  the gate just needs the file to either compile or be gone.
- **`tsconfig.json` already has `include: ["scripts/**/*", "tests/**/*", "drizzle.config.ts"]`.**
  No tsconfig changes needed. The gap is purely in the workspace script.

## Architectural choice

There aren't multiple architectural options here — it's "wire a missing
typecheck step". The interesting decisions are in the cleanup half:

- **Use the canonical helper, don't reinvent.** `tests/helpers/mocks.ts`
  exports a working `noopLogger()` that already implements `Logger.child`. The
  `scripts/db-gates.ts` and `scripts/db-packs.ts` files each construct their
  own ad-hoc logger object missing the `child` method. Don't fix the ad-hoc
  loggers by adding `child: () => fakeLogger` — replace them with
  `noopLogger()` (or hoist the helper into a shared `scripts/helpers/` if
  scripts/ can't import from tests/). The DRY win is small in lines but real
  in maintenance: the next field that's added to `Logger` should only need
  to be wired in `noopLogger()`, not in N ad-hoc copies.
- **Test-side `deps` drift is mechanical.** Most test-tier errors are the
  same class: a deps interface got a new mandatory field, the test factory
  wasn't updated. Each fix is "add the missing field to the deps literal,
  pass a minimal/noop instance". No design judgment required per occurrence.

## Implementation Units

### Unit 1: `scripts/` cleanup
**Files**: `scripts/db-gates.ts`, `scripts/db-packs.ts`, `scripts/run-session.ts`
**Story**: `feature-root-tsconfig-typecheck-coverage-scripts-cleanup`

```typescript
// scripts/db-gates.ts and scripts/db-packs.ts
// Before: ad-hoc logger object missing `child`
//   const log = { debug: (msg) => {}, info: ..., warn: ..., error: ... };
// After: use the canonical helper
import { noopLogger } from "../tests/helpers/mocks.js";
const log = noopLogger();
```

**Implementation Notes**:
- 5 of the 43 errors live in `scripts/`. The two `Logger.child` issues are
  trivially fixed by switching to `noopLogger()`.
- `scripts/run-session.ts` has structural rot — see "Design decisions" above
  for the port-vs-delete call. If deleting: also remove the
  `script:run-session` entry from `package.json` and grep for any stale
  references in `docs/` (the brief noted multiple).
- If `scripts/` can't reach `tests/helpers/` cleanly (path quirks), hoist
  `noopLogger` into `scripts/helpers/logging.ts` or
  `packages/core/src/test-helpers/`. Either is fine — keep the canonical
  version a single source.

**Acceptance Criteria**:
- [ ] `pnpm exec tsgo --noEmit -p tsconfig.json` reports 0 errors from `scripts/`.
- [ ] If `scripts/run-session.ts` was deleted, `package.json` no longer
      references it, and a one-line note in this story's implementation
      notes records why (link to last meaningful commit).
- [ ] No regression elsewhere: `pnpm -r run typecheck` still green.

---

### Unit 2: `tests/` cleanup
**Files**: 11 root-tier test files (see Survey in Brief)
**Story**: `feature-root-tsconfig-typecheck-coverage-tests-cleanup`

```typescript
// Pattern A — missing mandatory deps field
// Before:
//   const deps = { db, log, modes, toolDefinitions, toolServices, engineFactory };
// After: add the missing field (here, lockService)
import { noopLockService } from "./helpers/mocks.js";  // create if absent
const deps = { db, log, modes, toolDefinitions, toolServices, engineFactory, lockService: noopLockService() };

// Pattern B — branded type cast
// Before:
//   courseId: "course-1",                        // string assigned to Brand<string, CourseId>
// After:
//   courseId: brandId<"CourseId">("course-1"),   // use the brand helper from @praxis/core/types
```

**Implementation Notes**:
- 38 of the 43 errors live in `tests/`. Cluster them by pattern when fixing
  so the same edit isn't re-derived:
  - **`ServiceDeps.lockService` missing** — `full-turn-with-fake-engine` (6×)
    and `gates-end-to-end` (1×). One helper or one minimal stub per file;
    consider extending `tests/helpers/mocks.ts` with `noopLockService()` if
    none exists.
  - **`BootstrapServiceDeps.courseDocuments` missing** — `adaptive-routing`.
    Same shape as above.
  - **`Brand<string, X>` mismatches** — `exam-end-to-end` (6×). Use
    `brandId<"CourseId">(...)` from `@praxis/core/types`.
  - **Missing module / stale imports** — `engine-conformance` (`@praxis/claude-cli-sdk`),
    `foundation` (`better-sqlite3`). Either add the type dep to root or
    fix the import path. `better-sqlite3` types might just need `@types/better-sqlite3` at the root, or an `import type` from `@praxis/core/db`.
  - **`ToolContext` shape mismatch** — `engine-conformance`. Look at the
    in-tree `ToolContext` type; likely a new field was added.
  - **Misc undefined-checks** — `foundation` lines 41/44. Address with `?.` or `// biome-ignore`.
- Tests for `mastery-end-to-end`, `notes-flashcards-end-to-end`,
  `pack-import-end-to-end`, `quick-check-tool-context-wiring`,
  `quiz-end-to-end` weren't fully diagnosed at scope time. Implementer
  should re-run the typecheck and triage each cluster. Most should fall
  into one of the patterns above.
- **Do not rewrite test logic.** This is mechanical type repair, not a
  refactor. If a test seems genuinely broken (assertions stale, mocks
  drifted from runtime behavior), record it in implementation notes and
  file a follow-up; don't expand scope.

**Acceptance Criteria**:
- [ ] `pnpm exec tsgo --noEmit -p tsconfig.json` reports 0 errors from `tests/`.
- [ ] No test was deleted to silence an error.
- [ ] `pnpm test` still passes — same test count as before (modulo any
      tests genuinely fixed in passing).
- [ ] If new helpers (`noopLockService`, etc.) were added to
      `tests/helpers/mocks.ts`, they're documented at the call sites.

---

### Unit 3: Enable the gate
**File**: `package.json`
**Story**: `feature-root-tsconfig-typecheck-coverage-enable-gate`

```jsonc
// package.json — root `scripts` section
{
  "scripts": {
    // Before:
    "typecheck": "pnpm -r run typecheck",
    // After:
    "typecheck": "pnpm -r run typecheck && tsgo --noEmit -p tsconfig.json"
  }
}
```

**Implementation Notes**:
- One-line edit. Depends on Units 1 and 2 leaving the workspace green.
- Verify with `pnpm typecheck` from the repo root — expect green. Then
  introduce a deliberate type error in a root-tier file (e.g. `tests/foundation.test.ts`),
  re-run, expect red. Revert the deliberate error. Smoke-test that the
  gate actually catches regressions.
- Don't add a `typecheck:root` alias — keep the entry point unified.

**Acceptance Criteria**:
- [ ] `pnpm typecheck` (from repo root) runs both the per-package and the
      root-tsconfig steps and exits 0.
- [ ] Introducing a deliberate type error anywhere under `tests/` or
      `scripts/` causes `pnpm typecheck` to exit non-zero (verified by
      one-off smoke test; the test is described in the implementation notes,
      not committed).
- [ ] `CLAUDE.md`'s "Common commands" block (the `pnpm typecheck` line) is
      updated to note that root-tier files are now covered, if the current
      wording implies otherwise. (Light edit — read it and check.)

---

## Implementation Order

Stories 1 and 2 are independent — different files, different concerns — and
can run in parallel. Story 3 must wait for both to land:

```
Story 1 (scripts/ cleanup) ─┐
                            ├──► Story 3 (enable gate)
Story 2 (tests/ cleanup)  ──┘
```

`/agile-workflow:implement-orchestrator feature-root-tsconfig-typecheck-coverage`
will compute this graph and run Stories 1 & 2 in a single parallel wave,
then Story 3 in a second wave.

## Testing

This is tooling work; the "tests" are the gate itself:

- **Per-story**: each cleanup story's acceptance criteria include
  `tsgo --noEmit -p tsconfig.json` reporting 0 errors *in its scope*
  (scripts or tests). The other scope can still be red — the orchestrator
  doesn't run integration verification until both land.
- **Cross-story**: after Story 3 lands, `pnpm typecheck` from the repo root
  should exit 0. A deliberate-error smoke test (introduce a `let x: string
  = 1;` in `tests/foundation.test.ts`, run `pnpm typecheck`, expect red,
  revert) confirms the gate is wired correctly.
- **Regression**: `pnpm test` count stays the same. If any test was fixed
  to compile and now actually passes meaningful assertions for the first
  time, note it but don't celebrate it as a feature win — that's accidental
  bonus.

## Risks

- **Cleanup uncovers more errors than enumerated.** TypeScript hides errors
  behind other errors; fixing the 43 found at scope time may expose another
  layer. Mitigation: the orchestrator verifies after each wave; if Story 2
  ends with leftover errors, file a follow-up story rather than extending
  Story 2's scope mid-flight.
- **`scripts/run-session.ts` deletion regret.** If it's deleted and someone
  later wants the smoke-test functionality back, they'll have to reconstruct
  from git. Mitigation: keep a backlog idea
  (`idea-engine-cli-integration-smoke-test` already exists per the recent
  backlog sweep — it's likely the same concept) and link to the deletion
  commit there. The implementer should check that backlog item before deleting.
- **The gate catches "intentional looseness".** Some root-tier tests may
  have intentionally-loose types (e.g. fake engine that returns deliberately
  malformed events). If so, fix with narrow `as` casts and a comment, not
  with `any` — preserve the intent while satisfying the checker.

<!-- Implementation Notes accumulate here as work progresses. -->

## Children complete (2026-05-12)

All three child stories have landed and are at `stage: review` or `done`:

- `feature-root-tsconfig-typecheck-coverage-scripts-cleanup` — **done** (commit `3693287`, reviewed and approved `11211d5`). `db-gates.ts`/`db-packs.ts` use canonical `noopLogger()`; `scripts/run-session.ts` deleted (broken since `language-sandbox-registry` shipped); `package.json` `script:run-session` entry removed.
- `feature-root-tsconfig-typecheck-coverage-tests-cleanup` — **done** (commit `52327ff`, reviewed and approved `028f209`). 33 type errors across 11 root-tier test files repaired via patterns A–E; `noopLockService()` + `noopCourseDocuments()` added to `tests/helpers/mocks.ts`; `SqliteDatabase` re-exported from `@praxis/core/db`; root tsconfig gained path entries for `@praxis/engines`, `@praxis/tools`, `@praxis/claude-cli-sdk`.
- `feature-root-tsconfig-typecheck-coverage-enable-gate` — **review** (commit `d58c66c`). `package.json` `typecheck` now runs `pnpm -r run typecheck && tsgo --noEmit -p tsconfig.json`. Smoke-test confirmed the gate catches root-tier regressions. CLAUDE.md "Common commands" line updated to note root coverage. Found and fixed one additional pre-existing error in `tests/configure-end-to-end.test.ts` (missing `promptCustomization` field on AuthoringServiceImpl, surfaced by the now-active gate).

**Verification (workspace-wide)**: `pnpm typecheck` runs both steps and exits 0. The gate is wired and working — regressions in `tests/` or `scripts/` will now break CI.

**Capability realized**: the root tier (`tests/`, `scripts/`, `drizzle.config.ts`) is now type-checked alongside the per-package code. Future type-level regressions in those files surface at `pnpm typecheck` instead of slipping past CI.

Advancing feature `implementing → review`. The next autopilot review pass will evaluate the bundle.
