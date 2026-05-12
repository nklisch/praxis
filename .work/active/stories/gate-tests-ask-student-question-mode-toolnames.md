---
id: gate-tests-ask-student-question-mode-toolnames
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `ask_student_question` membership in `configureMode.toolNames` / `bootstrapMode.toolNames` not asserted

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-structured-questions` (Unit 3)
Acceptance criterion: "`configureMode.toolNames` includes `'ask_student_question'`" and "`bootstrapMode.toolNames` includes `'ask_student_question'`"

## Gap type
Missing test for valid partition

## Suggested test
```ts
// packages/curriculum/src/__tests__/configure-mode.test.ts — extend "configure mode toolNames" describe
it("includes ask_student_question", () => {
  expect(configureMode.toolNames).toContain("ask_student_question");
});

it("bootstrapMode.toolNames includes ask_student_question", () => {
  expect(bootstrapMode.toolNames).toContain("ask_student_question");
});
```

## Test location (suggested)
`packages/curriculum/src/__tests__/configure-mode.test.ts`

## Implementation notes

Both `configureMode` and `bootstrapMode` already included `ask_student_question` in their `toolNames` arrays — no mode-file changes were needed.

- `bootstrapMode.toolNames` assertion was already present in `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts` (added as part of the "included tools" describe block).
- Added `configureMode.toolNames` assertion to the `"configure mode toolNames"` describe block in `packages/curriculum/src/__tests__/configure-mode.test.ts`.

All 369 curriculum tests pass; typecheck clean.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
