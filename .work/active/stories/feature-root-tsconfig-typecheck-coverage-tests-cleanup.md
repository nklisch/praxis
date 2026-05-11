---
id: feature-root-tsconfig-typecheck-coverage-tests-cleanup
kind: story
stage: implementing
tags: [tooling]
parent: feature-root-tsconfig-typecheck-coverage
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Root-tsconfig cleanup: `tests/`

## Scope

Fix the 38 typecheck errors across 11 files under `tests/` that block enabling
a root-tier typecheck gate. This is mechanical type repair — the test logic
should be left alone unless a fix happens to incidentally improve it.

## Files (from `pnpm exec tsgo --noEmit -p tsconfig.json` at scope time)

Confirmed clusters:

- **`tests/adaptive-routing-end-to-end.test.ts`** — `BootstrapServiceDeps.courseDocuments` missing
- **`tests/engine-conformance.test.ts`** — `@praxis/claude-cli-sdk` import path issue, `ToolContext` shape mismatch
- **`tests/exam-end-to-end.test.ts`** — `Brand<string, CourseId>` and `Brand<string, StudentId>` not assignable to `CourseId`/`StudentId` (6 occurrences)
- **`tests/foundation.test.ts`** — `Cannot find module 'better-sqlite3'`, undefined-check warnings (lines 41, 44)
- **`tests/full-turn-with-fake-engine.test.ts`** — `ServiceDeps.lockService` missing (6 occurrences)
- **`tests/gates-end-to-end.test.ts`** — `ServiceDeps.lockService` missing + `studentId` not in expected props

Triage required (not fully enumerated at scope time — start by re-running
the typecheck):

- `tests/mastery-end-to-end.test.ts`
- `tests/notes-flashcards-end-to-end.test.ts`
- `tests/pack-import-end-to-end.test.ts`
- `tests/quick-check-tool-context-wiring.test.ts`
- `tests/quiz-end-to-end.test.ts`

Most should fall into one of the patterns below.

## Patterns and fixes

### Pattern A — missing mandatory deps field

When a `ServiceDeps`-shaped object literal is missing a field that became
mandatory:

```typescript
// Before
const deps = { db, log, modes, toolDefinitions, toolServices, engineFactory };
// After — add the missing field (here, lockService)
import { noopLockService } from "./helpers/mocks.js";  // add to mocks.ts if absent
const deps = {
  db, log, modes, toolDefinitions, toolServices, engineFactory,
  lockService: noopLockService(),
};
```

If `tests/helpers/mocks.ts` doesn't yet export a `noopLockService` (or
analogous noop helpers for `courseDocuments`, etc.), add them there.
Match the style of existing `noopLogger`. **Do not** stub fields ad-hoc at
each call site — extend the helpers module so the next deps field that's
added is also a single-place fix.

### Pattern B — branded type assignment

`Brand<string, CourseId>` vs `CourseId` mismatches usually indicate the
test is constructing the value the wrong way:

```typescript
// Before — implicit cast, breaks under newer brand definition
courseId: "course-1",
// After — use the brand helper
import { brandId } from "@praxis/core/types";
courseId: brandId<"CourseId">("course-1"),
```

Verify `brandId` is the actual helper name — read
`packages/core/src/types/common.ts` to confirm.

### Pattern C — stale imports

`engine-conformance.test.ts` imports from `@praxis/claude-cli-sdk` and the
resolver can't find it. Check whether that package's exports moved or
whether the workspace path resolution in root tsconfig is missing an entry
for it. If the package was renamed or its public API changed, adapt the
import.

`foundation.test.ts` imports `better-sqlite3` directly. Two options:
(a) install `@types/better-sqlite3` at the root, or (b) re-export
`Database` from `@praxis/core/db` and import via the package alias. (b) is
preferred — keeps the native dep abstracted behind the core package, same
as the rest of the codebase does.

### Pattern D — `ToolContext` shape drift

`engine-conformance.test.ts` constructs a `ToolContext`-shaped object that
no longer matches the type. Read the current `ToolContext` definition in
`packages/core/src/types/tool.ts` (or wherever it lives), figure out which
fields are new, and add minimal stubs.

### Pattern E — undefined-checks

`foundation.test.ts` lines 41/44 — `Object is possibly 'undefined'`. Fix
with `?.` or `// biome-ignore lint/style/noNonNullAssertion: <reason>` plus
`!` if the undefined-ness is genuinely impossible given test setup.

## Acceptance criteria

- [ ] `pnpm exec tsgo --noEmit -p tsconfig.json 2>&1 | grep "^tests/"`
      returns no error lines.
- [ ] No test was deleted or `.skip`'d to silence an error. If a test seems
      genuinely broken (assertions stale, mocks drifted from runtime
      behavior), record it in implementation notes and let the reviewer
      decide whether to file a follow-up — don't expand scope here.
- [ ] `pnpm test` count is identical to pre-story baseline (record both
      counts in implementation notes).
- [ ] Any new helpers added to `tests/helpers/mocks.ts` (e.g.
      `noopLockService`, `noopCourseDocuments`) follow the existing style
      and are used at every relevant call site, not just the ones in
      this story's scope.

## Out of scope

- Cleaning up `scripts/` errors — sibling story.
- Enabling the gate in `package.json` — Story 3.
- Rewriting tests that are simply old / mock-heavy. Type-clean is the bar,
  not test-rewrite.
- Cross-package refactors triggered by what you find. If a deps interface
  has 8 mandatory fields and 6 of them are arguably non-essential, that's
  a separate refactor — note it, don't expand.
