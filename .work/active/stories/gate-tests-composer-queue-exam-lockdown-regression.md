---
id: gate-tests-composer-queue-exam-lockdown-regression
kind: story
stage: review
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

## Implementation

Added test in `packages/ui/src/__tests__/chat-tab-body-dispatch.test.tsx` (lines 164–239), in a new `describe("TeachChatTabBody exam lockdown")` block.

The test renders `TeachChatTabBody` directly (bypassing the `ChatTabBody` dispatcher that routes `modeId: "exam"` to `ExamTabBody`) with a tab that has `assignmentId` set and `modeId: "exam"`. It mocks `client.assignments.get` to return an assignment without `submittedAt`, which causes `ExamLockdownGate` to set `examLockdown=true`. The test then:
1. Waits for `examLockdown` to propagate (the textarea gains `disabled`).
2. Fires a `keyDown` Enter event and asserts `client.session.send` was NOT called.

During implementation, a production bug was found and fixed: `TeachChatTabBody` was building `session` from `tab` but omitting `tab.assignmentId`, so `ExamLockdownGate` never rendered (it gates on `session.assignmentId`). Fixed by propagating `tab.assignmentId` into the `session` object (`packages/ui/src/components/chat-tab-body.tsx`, same spread pattern as `courseId`).
