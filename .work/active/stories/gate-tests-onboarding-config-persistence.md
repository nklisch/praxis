---
id: gate-tests-onboarding-config-persistence
kind: story
stage: review
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# `onboarding-config.ts` persistence layer has no direct unit test

## Priority
High

## Spec reference
Item: `epic-phase-19-first-run-flow`
Acceptance criterion: "Unit 1 — Service layer (db/onboarding-config.ts):
`readOnboardingConfig(db)` returns `{ firstRunCompletedAt: null }` for
fresh DB; After `markFirstRunComplete(db)`, the read returns a valid
timestamp; Calling `markFirstRunComplete` twice updates the timestamp"

## Gap type
Missing test for valid partition / boundary / state transition

## Suggested test

```ts
// packages/core/src/config/__tests__/onboarding-config.test.ts (new file)
describe("readOnboardingConfig", () => {
  it("returns { firstRunCompletedAt: null } for a fresh database");
});
describe("markFirstRunComplete", () => {
  it("writes a valid ISO timestamp on first call");
  it("updates the timestamp on a second call (idempotent upsert)");
  it("the second timestamp is strictly newer than the first");
});
```

## Test location (suggested)
`packages/core/src/config/__tests__/onboarding-config.test.ts`

## Rationale
The hook test (`use-first-run.test.tsx`) and the client routing test
(`client.test.ts`) both stub the service layer. The actual SQL upsert
against `config_kv`, the JSON round-trip through `valueJson`, and the
merge-with-defaults read path have no test in the bundle. A malformed
schema migration or a Drizzle column-name typo would not be caught until
manual smoke. The bootstrap-config sibling file
(`bootstrap-config.test.ts`) tests exactly this surface for `maxSteps` —
symmetry argues for the missing onboarding-config tests.

## Implementation notes

- Created `packages/core/src/config/__tests__/onboarding-config.test.ts`
  with 4 tests: fresh-DB null read, valid ISO timestamp on first write,
  upsert on second call, and strict ordering of two timestamps (with a 2ms
  `setTimeout` to guarantee the `toISOString()` values differ).
- Follows the `bootstrap-config.test.ts` pattern exactly: `useTempDb()` +
  `makeDb()` helper, no shared state between tests, `openDb` from core.
- The "strictly newer" test uses a real 2ms sleep rather than fake timers
  because `markFirstRunComplete` calls `new Date()` internally — faking
  timers here would require invasive mocking for negligible gain.
