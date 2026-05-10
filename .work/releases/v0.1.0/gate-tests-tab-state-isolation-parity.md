---
id: gate-tests-tab-state-isolation-parity
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

## Implementation notes
Appended one test to `packages/ui/src/__tests__/study-skills-tab-body.test.tsx` in a new
`describe("Tab-state isolation — teach ↔ study-skills chip parity")` block. The story sketch
proposed `data-chip='study-skills'` but `StudySkillsTabBody` renders a plain `<span
className={styles.chip}>study skills</span>` with no data attribute. Used
`screen.queryByText("study skills")` for absence and `screen.getAllByText(...).length > 0` for
presence instead — equivalent semantically. `ChatTabBody` is a pure dispatcher (switch on
`modeId`), so state isolation is structural; the test pins this so a future keep-alive
refactor can't silently break it.

## Review (2026-05-10)

**Verdict: Approve.** Test correctly uses `queryByText`/`getAllByText` since the chip is a plain `<span>` with no data attribute — equivalent coverage to the story sketch's `data-chip` approach. The three-step teach→study-skills→teach rerender sequence precisely pins the no-bleed invariant. Structural isolation via `ChatTabBody`'s dispatcher pattern makes this durable.
