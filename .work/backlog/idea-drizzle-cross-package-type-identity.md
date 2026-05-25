---
id: idea-drizzle-cross-package-type-identity
kind: idea
stage: parked
tags: [tooling, typecheck, drizzle, follow-up]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Resolve drizzle-orm cross-package type-identity errors in `@praxis/memory`

## Brief
Persistent typecheck errors in `packages/memory/src/term-first-occurrences.ts` (lines 41, 42, 44, 56) that surfaced when the file was created in `feature-content-renderer-pipeline-step-5-definition-tracking` (commit `30c3c6d1`) and have been flagged as pre-existing by multiple subsequent stories. The errors are:

```
error TS2322: Type 'SQLiteColumn<...>' is not assignable to type '... | SQLiteColumn<ColumnBaseConfig<ColumnDataType, string>, {}, {}> | ...'.
  Two different types with this name exist, but they are unrelated.
```

The error message reveals the root cause: two copies of `drizzle-orm@0.45.2` appear in the node_modules tree (same `.pnpm/drizzle-orm@0.45.2_...` path printed in both halves of the diagnostic), and TypeScript sees them as distinct types. This is a classic pnpm dependency hoisting / version-pinning issue.

## What's affected
- `packages/memory/src/term-first-occurrences.ts` — typecheck fails on 4 lines (the `.select().from().where()` chain + the `.insert().values().onConflictDoNothing()` chain)
- Runtime: presumably works fine (the agent's tests pass; only TypeScript's structural type comparison fails)
- All downstream packages that consume `@praxis/memory` see the same cascade in typecheck

## Investigation paths
1. **`pnpm why drizzle-orm`** to identify what's pulling in the second copy
2. **`pnpm dedupe`** or update `pnpm-workspace.yaml` to enforce single-version hoisting
3. **Pinning `drizzle-orm` in `pnpm-workspace.yaml`'s `overrides`** field to force a single resolution
4. **Audit the per-package `package.json` deps** to see if some packages have different version specifiers (`^0.45.2` vs exact `0.45.2`)

## Workaround applied so far
Stories have been shipping despite the typecheck error by noting it as "pre-existing, unrelated" in implementation notes. The codebase has accumulated this debt; the next clean-up should address it.

## Sizing
Small to medium. Likely a 1-line `pnpm-workspace.yaml` fix once the duplicate source is identified. Could escalate if multiple packages pin different versions.

## Origin
- First surfaced: `feature-content-renderer-pipeline-step-5-definition-tracking` (commit `30c3c6d1`)
- Subsequently flagged in: step-7, step-8 of content-renderer; step-5 of math-rendering; question-panel-rework bundle commit
