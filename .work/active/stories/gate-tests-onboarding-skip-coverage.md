---
id: gate-tests-onboarding-skip-coverage
kind: story
stage: done
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# Skip on engine and course steps of the onboarding flow not exercised

## Priority
Medium

## Spec reference
Item: `epic-phase-19-first-run-flow`
Acceptance criterion: `"Skip" on any step calls onComplete immediately`
(Unit 5 acceptance)

## Gap type
Missing test for valid partition (3 step states × skip action; only the
welcome partition is covered)

## Suggested test

```ts
// Append to packages/ui/src/__tests__/onboarding-flow.test.tsx
it("skip on engine step calls onComplete", async () => {
  const onComplete = vi.fn(async () => undefined);
  renderFlow({ onComplete });
  fireEvent.click(screen.getByText(COPY.onboarding.continueLabel)); // → engine
  await waitFor(() => screen.getByText(COPY.onboarding.engineTitle));
  fireEvent.click(screen.getByText(COPY.onboarding.skipLabel));
  await waitFor(() => expect(onComplete).toHaveBeenCalled());
});
it("skip on course step calls onComplete", async () => { /* analogous */ });
```

## Test location (suggested)
`packages/ui/src/__tests__/onboarding-flow.test.tsx`

## Rationale
The acceptance reads "any step" but only welcome is asserted; a regression
that wires the skip handler differently per step (a plausible refactor
outcome of step-specific guard logic) wouldn't fail.

## Implementation notes
Added two tests reusing the existing `renderFlow` helper. The engine-step test uses `getAllByText(skipLabel)[0]` because the engine step renders both a Back and a Skip button alongside Continue — `getByText` would throw on duplicates. The course-step test navigates through engine via a second `continueLabel` click then finds the lone skip button. All 8 tests pass.

## Review (2026-05-10)

Approve. Both missing partitions covered: skip-on-engine and
skip-on-course. Each test has its own `vi.fn()` for `onComplete` — no
shared state. `waitFor` guards on rendered titles before clicking skip
— correct async hygiene. The engine-step `getAllByText(...)[0]` is the
right call given the multiple-button layout; the course-step correctly
drops back to `getByText` since only one skip is rendered there. All 3
"any step" partitions (welcome + engine + course) are now asserted. No
blockers, no important findings.
