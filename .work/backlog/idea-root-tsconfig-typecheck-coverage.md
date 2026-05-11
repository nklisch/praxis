---
id: idea-root-tsconfig-typecheck-coverage
created: 2026-05-11
tags: [tooling]
---

`pnpm typecheck` runs `pnpm -r run typecheck` — recursive over packages only. It does NOT typecheck the root `tsconfig.json` that governs `tests/` and `scripts/`, even though the root tsconfig has `include: ["scripts/**/*", "tests/**/*", "drizzle.config.ts"]`. As a result, type-level regressions in the root-level integration tests (e.g. `tests/textbook-rag-end-to-end.test.ts`) slip past CI even though those files are part of the repo's TypeScript surface. Discovered during review of `feature-powerpoint-ingestion`: a mandatory new field on `IngestionServiceDeps` left 3 root-test sites broken; vitest still ran the tests because it doesn't enforce strict typecheck, masking the regression. Fix: add a root typecheck step (e.g. `tsgo --noEmit -p tsconfig.json` or wire it into the workspace `typecheck` script) so root-tier .ts files are part of the verification gate. Note that several pre-existing root-tsconfig errors will surface (`scripts/db-gates.ts` Logger missing `child`, `tests/foundation.test.ts` missing `better-sqlite3` types, etc.) — those need cleanup before the gate can be enforced strictly, but the gap itself is the real finding.
