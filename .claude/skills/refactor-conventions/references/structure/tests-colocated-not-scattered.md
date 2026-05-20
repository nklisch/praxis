# Structure Rule: tests-colocated-not-scattered

> Per-package tests live in `packages/<pkg>/src/__tests__/` next to the
> code they cover. Integration / cross-package / end-to-end tests live
> at repo-root `tests/`. Type-level tests use the `.test-d.ts` suffix.
> No other locations.

## Motivation

This rule codifies the existing convention so new code keeps following
it. Audit data shows **100% adherence today** — 85 unit/integration
test files in `src/__tests__/` directories across the workspace, 18
top-level tests in `tests/`. The risk isn't a current backlog of
violations; it's drift as the codebase grows.

Co-location means: editing `course-create-service.ts` puts you one
directory away from `__tests__/course-create-service.test.ts`. Tests
that drift away from their target file get out of date and stop
running. Tests scattered into ad-hoc folders escape the workspace
vitest config and silently stop being run at all.

## What Counts

A test file violates this rule when:

1. It is named `*.test.ts` / `*.test.tsx` / `*.spec.ts` / `*.test-d.ts`
   AND
2. It sits in a package's `src/` tree but NOT under a `__tests__/`
   directory.
OR

1. It is an integration / cross-package test AND
2. It lives inside a package rather than at repo-root `tests/`.

It is **acceptable** when:

- Per-package unit/integration test in `packages/<pkg>/src/__tests__/`.
- Cross-package / e2e test in repo-root `tests/`.
- Test helpers live in `__tests__/helpers/` (per-package) or
  `tests/helpers/` (repo root).
- `*.test-d.ts` type tests follow the same locations.

## Before / After

### From this codebase: target shape (already followed)

```
packages/core/src/
├─ services/
│  └─ course-create-service.ts
└─ __tests__/
   ├─ course-create-service.test.ts
   ├─ artifacts-service.test.ts
   └─ helpers/
      └─ fake-engine.ts

tests/
├─ misconception-end-to-end.test.ts
└─ helpers/
   └─ db-setup.ts          # exposes useTempDb()
```

This is the pattern. New tests land here.

### Synthetic violation: test next to source instead of in __tests__/

**Bad**
```
packages/core/src/services/
  course-create-service.ts
  course-create-service.test.ts    <- violation
```

**Good**
```
packages/core/src/services/
  course-create-service.ts
packages/core/src/__tests__/
  course-create-service.test.ts
```

### Synthetic violation: integration test in package

**Bad**
```
packages/core/src/__tests__/
  full-tutoring-flow.test.ts       <- crosses packages, belongs at root
```

**Good**
```
tests/
  full-tutoring-flow.test.ts
```

## Exceptions

- **Component-style co-location** (`Foo.tsx` + `Foo.test.tsx`
  side-by-side). Not used in Praxis. Don't introduce it. If you're
  porting code that uses this convention, move tests into `__tests__/`
  during the port.
- **Mockups / playgrounds** — `.mockups/` and `.work/` may contain
  experimental test-shaped files; those aren't real tests and the
  vitest configs already exclude them.
- **Documentation examples** — `docs/examples/*.test.ts` files are not
  intended to be run.

## Scope

- **Applies to**: All `.test.ts`, `.test.tsx`, `.test-d.ts`, `.spec.ts`
  files in `packages/*/src/`, `apps/*/src/`, and repo-root.
- **Does NOT apply to**:
  - `node_modules/`, `dist/`, `drizzle/`.
  - `.mockups/`, `.work/`, `docs/`.
  - Type-test fixtures inside `tests/helpers/`.

## Detection

```bash
# Tests that look misplaced (in src/ but not in __tests__/):
find packages/*/src apps/*/src \
  -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' \
  -o -name '*.spec.ts' \
  | grep -v '__tests__/'

# Tests at unexpected locations (anywhere outside src/__tests__/ or tests/):
find . -name '*.test.ts' -not -path './node_modules/*' \
  -not -path '*/__tests__/*' -not -path './tests/*' \
  -not -path '*/dist/*'
```

Expect zero output today. The detection step is mainly forward-looking
— surface new violations as the codebase grows.

For High Value entries (when violations exist): cite `file:current
location`, propose the correct location, and confirm imports inside
the test file still resolve (relative paths usually need adjusting).
Bundle multiple violations from one PR/branch into a single substrate
item.
