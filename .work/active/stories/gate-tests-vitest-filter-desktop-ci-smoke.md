---
id: gate-tests-vitest-filter-desktop-ci-smoke
kind: story
stage: implementing
tags: [testing, infra]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# `pnpm --filter @praxis/desktop test` exit-0 not guarded by a CI step

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-fix-desktop-vitest-filter-tests-dir`
Acceptance criterion:
> `pnpm --filter @praxis/desktop test` exits 0 (or with real test
> failures only, not a missing-dir error).

## Gap type
e2e-seam / adversarial-spec-silent — infrastructure-config fix; a
future workspace-config tweak that re-breaks the per-package filter
would not be caught by the workspace-wide `pnpm test`.

## Suggested test
CI step that runs `pnpm --filter @praxis/desktop test` separately
from `pnpm test`. No unit test is a clean fit.

```bash
# CI step (.github/workflows/*) or tests/desktop-filter.smoke.test.ts
pnpm --filter @praxis/desktop test --run --reporter=basic
```

## Test location (suggested)
CI workflow or `tests/desktop-filter.smoke.test.ts`
