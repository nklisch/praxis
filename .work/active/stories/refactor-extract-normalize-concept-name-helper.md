---
id: refactor-extract-normalize-concept-name-helper
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: extract normalizeConceptName helper in course-create-service.ts

## Brief

`packages/core/src/services/course-create-service.ts` calls
`.trim().toLowerCase()` on concept names at 7 sites (discovery flagged
lines 222, 275, 310, 371, 443, 446, 957) — always for Set/Map membership
checks. Every site does the exact same normalization. Extract a single
helper to capture the intent ("two names are equivalent for membership
when …") and prevent drift if normalization rules change.

This is **pure refactor** — behavior is preserved exactly.

## Files

- `packages/core/src/services/course-create-service.ts` only

## Current State

```ts
// at 7 different sites:
if (!knownConcepts.has(cn.trim().toLowerCase())) { … }
```

## Target State

```ts
// near top of file (file-private):
const normalizeConceptName = (name: string): string =>
  name.trim().toLowerCase();

// at every former site:
if (!knownConcepts.has(normalizeConceptName(cn))) { … }
```

## Implementation Notes

- File-private helper (not exported) unless cross-module use is needed.
- If `refactor-course-create-service-extract-modules` lands first, the
  helper naturally ends up in the extracted `DraftValidator` module.
  If this story lands first, the helper migrates with that refactor.
- Consider whether the helper should be a branded type for compile-time
  safety (`NormalizedConceptName` brand). Default to NO — too much
  ceremony for a 7-call-site internal helper. The brand can be added
  later if call sites drift across module boundaries.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (concept validation tests in
      `course-create-service.test.ts`)
- [ ] `grep -cn '\.trim()\.toLowerCase()' packages/core/src/services/course-create-service.ts` returns 1 (helper definition only) or 0 if the helper uses an alternative form
- [ ] `grep -cn 'normalizeConceptName' packages/core/src/services/course-create-service.ts` returns ≥8 (1 def + 7 uses)

## Risk

**Very low** — in-file mechanical helper extract; tests cover the
validation paths thoroughly.

## Rollback

`git revert <commit>` — clean.
