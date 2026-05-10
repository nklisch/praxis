---
id: gate-tests-tab-state-isolation-parity
kind: story
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# Tab-state isolation between teach and study-skills tabs is not parity-tested

## Priority
Low

## Spec reference
Item: `epic-phase-18-coach-mode-impl`
Acceptance criterion: "Switching between a teach tab and a study-skills
tab in succession does NOT bleed mode-specific state" (Unit 4 acceptance)

## Gap type
Missing test for state-transition invariant

## Suggested test

```ts
// Append to packages/ui/src/__tests__/study-skills-tab-body.test.tsx
it("switching teach → study-skills → teach preserves chip absence vs presence per tab", () => {
  const { rerender, container } = render(<ChatTabBody session={teachSession} />);
  expect(container.querySelector("[data-chip='study-skills']")).toBeNull();
  rerender(<ChatTabBody session={studySkillsSession} />);
  expect(container.querySelector("[data-chip='study-skills']")).not.toBeNull();
  rerender(<ChatTabBody session={teachSession} />);
  expect(container.querySelector("[data-chip='study-skills']")).toBeNull();
});
```

## Test location (suggested)
`packages/ui/src/__tests__/study-skills-tab-body.test.tsx`

## Rationale
The `tab-body-isolation` pattern in `.claude/rules/patterns.md` is
load-bearing (all tabs mount at once with `display:none`), and the
explicit acceptance asks for the no-bleed property. Today the test
renders each mode in isolation only.
