---
id: gate-tests-composer-queue-exam-lockdown-regression
kind: story
stage: done
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

## Review

**Verdict: Approved.**

**Production fix — correct and minimal.** The diff for `chat-tab-body.tsx` is a clean 3-line conditional spread, exactly mirroring the existing `courseId` pattern. No logic was restructured; only the missing field was added. Without it `ExamLockdownGate` would never activate for teach-mode sessions that have an `assignmentId` — the gate was dead code at runtime.

**Sibling components checked.** `ExamTabBody`, `HomeworkTabBody`, and `QuizTabBody` do not construct a `SessionHandle` from the tab object — they pass `tab.assignmentId` directly as a prop, so they don't share this class of bug. `TeachChatTabBody` is the only site that builds a `SessionHandle` in this file, and it is now complete.

**Test quality — sound.** The new `describe("TeachChatTabBody exam lockdown")` block renders `TeachChatTabBody` directly (correctly bypassing the `ChatTabBody` dispatcher that would route `modeId: "exam"` to `ExamTabBody`), mocks `client.assignments.get` to return an assignment without `submittedAt`, waits for the textarea to become `disabled`, then fires an Enter keydown and asserts `session.send` was not called. All three assertions are load-bearing: disabled state, and queue-bypass prevention. The test suite runs at 8/8 passing.

**Bundled fix with test — positive.** The agent went one level deeper than the story asked, identified the root cause that would have made the test permanently fail, fixed it, and pinned the fix with the test. This is the ideal outcome for this class of gate-origin story.
