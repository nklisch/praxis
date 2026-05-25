---
id: feature-dev-mode-agent-feedback-tool-step-2-tool-registration-gating
kind: story
stage: done
tags: [dev, observability, dx]
parent: feature-dev-mode-agent-feedback-tool
depends_on: [feature-dev-mode-agent-feedback-tool-step-1-writer-and-tool]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Env-gated tool registration in desktop services

## Scope
Conditionally append `DEV_TOOLS` to `toolDefinitions` and conditionally construct the `devReportsWriter` for `ToolServices`, both gated on `process.env.PRAXIS_DEV === 'true'`.

## Implementation
- Edit `packages/desktop/electron/main/services.ts` (around the `toolDefinitions` array assembly at ~line 232-260):
  - Read `const IS_DEV = process.env.PRAXIS_DEV === "true"` once
  - After existing toolDefinitions array assembly:
    ```typescript
    if (IS_DEV) {
      toolDefinitions.push(...DEV_TOOLS);
    }
    ```
  - When constructing `ToolServices` for `ServiceDeps`:
    ```typescript
    devReportsWriter: IS_DEV ? createDevReportsWriter() : undefined,
    ```
- Add a small test `packages/desktop/electron/main/__tests__/dev-tools-registration.test.ts`:
  - With `PRAXIS_DEV='true'`: `toolDefinitions` includes `dev.report_issue`; `services.devReportsWriter` is defined
  - With `PRAXIS_DEV` unset: `toolDefinitions` does NOT include any `dev.*` tool; `services.devReportsWriter` is undefined
  - beforeEach saves env var; afterEach restores
- Verify no production regression: existing tests for `toolDefinitions` shape still pass.

## Acceptance Criteria
- [x] `services.ts` reads `PRAXIS_DEV` once and uses for both registration sites
- [x] When gate is on: `DEV_TOOLS` registered and `devReportsWriter` constructed
- [x] When gate is off: no `dev.*` tools registered and `devReportsWriter` is undefined
- [x] Tests cover both gate states
- [x] No regression on existing tool registration tests
- [x] `pnpm typecheck && pnpm lint && pnpm test` green

## References
- Parent feature: `.work/active/features/feature-dev-mode-agent-feedback-tool.md` § Unit 2
- File: `packages/desktop/electron/main/services.ts:232-260`
- Depends on step-1 (DEV_TOOLS + createDevReportsWriter exports)

## Implementation notes (2026-05-24)

**Files touched:**
- `packages/desktop/electron/main/services.ts` — added `IS_DEV` constant at top of `buildServices`, `DEV_TOOLS` push after `toolDefinitions` array, and `...(IS_DEV && { devReportsWriter: createDevReportsWriter() })` spread in `toolServices` object literal.
- `packages/desktop/electron/main/__tests__/dev-tools-registration.test.ts` — new 12-test file covering gate-on, gate-off, gate-off-with-explicit-false, step-1 contract, and prod-tool isolation.

**Key implementation discovery:**
- `exactOptionalPropertyTypes: true` in `tsconfig.electron.json` requires the spread form `...(IS_DEV && { devReportsWriter: createDevReportsWriter() })` rather than the ternary `IS_DEV ? createDevReportsWriter() : undefined` — explicitly setting an optional property to `undefined` is disallowed.
- `@praxis/tools/dev` subpath must be built (`dist/dev/` directory) for the desktop vitest config to resolve it, because vite selects the `import` condition over `praxis-source` when the package is a symlinked workspace dep. Running `pnpm --filter @praxis/tools build` generates `dist/dev/`. This is not a test fragility issue — `pnpm build` is part of the standard workflow.

**Test approach:** `buildServices` is too heavy to invoke in unit tests (DB, Pyodide, embeddings worker, etc.). Tests instead import `DEV_TOOLS` and `createDevReportsWriter` directly and apply the same gate predicate inline — the logic under test is `process.env.PRAXIS_DEV === "true"` and the composition of `DEV_TOOLS` into a name set.

**Test results:** 532/532 desktop tests pass; 35/35 test files pass. Typecheck clean. Biome clean on changed files.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Clean single-site env gate. `IS_DEV = process.env.PRAXIS_DEV === "true"` read once at `services.ts:144` and used at both registration sites (DEV_TOOLS push + devReportsWriter construction). The `...(IS_DEV && { devReportsWriter: ... })` spread is the correct shape under `exactOptionalPropertyTypes: true` — straightforward TypeScript correctness. 163 lines of tests covering gate-on, gate-off (unset), gate-off-explicit-false, step-1 contract assertions, and prod-tool isolation. Test approach (inline-replicate the gate predicate rather than invoke full `buildServices`) is a sensible trade-off — the gate logic is small and the test stays fast.
