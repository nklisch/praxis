---
id: gate-tests-update-banner-version-edge-inputs
kind: story
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# `compareVersions` lacks stress test for prerelease / non-3-part versions

## Priority
Low

## Spec reference
Item: `epic-phase-19-auto-update`
Acceptance criterion: "`compareVersions` returns 0 for equal, -1 for a<b,
1 for a>b. Versions must be `MAJOR.MINOR.PATCH`." (Unit 1 acceptance)
plus the implicit "no telemetry / fail-safe" stance ("never throws").

## Gap type
Boundary / error-guessing — what happens for `"1.0"`, `"1.0.0-beta"`, `""`?

## Suggested test

```ts
// Append to packages/core/src/services/__tests__/update-service.test.ts
describe("compareVersions edge inputs", () => {
  it("treats missing patch segment as 0 (1.0 == 1.0.0)", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
  it("ignores prerelease suffix (NaN-Number coerces to 0)", () => {
    // Documents whatever the current implementation does — pin behaviour.
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThanOrEqual(0);
  });
});
describe("checkLatest with feed containing prerelease tags", () => {
  it("rejects 1.0.0-beta via schema (regex requires \\d+\\.\\d+\\.\\d+)");
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/update-service.test.ts`

## Rationale
The schema regex (`/^\d+\.\d+\.\d+$/`) and the
`[aMaj, aMin, aPatch] = a.split(".").map(Number)` pattern interact in
subtle ways for non-conforming inputs. Current tests only cover well-formed
inputs across versions; an attacker-controlled or upstream-corrupted feed
could plausibly carry a SemVer prerelease. The schema parse should reject
it (returning `error` status, never throwing) — that path is currently
asserted only for `"not-semver"`, not the more realistic `"1.0.0-beta"`.
