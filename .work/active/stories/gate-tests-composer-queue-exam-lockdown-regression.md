---
id: gate-tests-composer-queue-exam-lockdown-regression
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Composer-queue exam-lockdown regression case is missing

## Priority
Medium

## Spec reference
Bound item: `epic-tutor-session-feel-composer-queue`

Acceptance criterion (Unit 5): "Exam mode still locks input (regression
check)." Design risk #4 also calls out "Exam mode interaction"
explicitly.

## Gap type
Missing test for valid partition (regression check the design called out).

## Suggested test

```tsx
// packages/ui/src/__tests__/chat-tab-body-dispatch.test.tsx (addition)

it("composer textarea IS disabled when examLockdown is true (regression check — queue must not bypass exam lock)", async () => {
  // Render ChatTabBody with mode='exam' or examLockdown=true
  // Assert textarea.disabled === true
  // Submitting via Enter when disabled is a no-op (no queue entry created)
});
```
