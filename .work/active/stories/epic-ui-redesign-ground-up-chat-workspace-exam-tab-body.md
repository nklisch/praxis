---
id: epic-ui-redesign-ground-up-chat-workspace-exam-tab-body
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Exam tab body — proctored chrome + rubric + strict tool subset

## Scope

Rewrite `ExamTabBody` per the locked `mode-exam.html` mock: chrome
reduced (other nav dimmed); exam-mode strip in header; pre-committed
rubric visible per free-response (per-criterion + weighted sum);
strict tool subset (clarification tool only).

Timer + auto-submit lands via sibling
`epic-backend-fills-for-redesign-ui-completion-bundle-exam-timer`;
this story is the surface restyle.

## Implementation steps

1. Edit `packages/ui/src/components/exam-tab-body.{tsx,module.css}`.
2. Dim/disable surrounding nav while in exam mode (set a class on the
   root layout that downstream CSS reads).
3. Render rubric per item (read from assignment).
4. Suppress tool-call rendering for tools outside the exam-allowed
   set (clarification only).
5. Tests covering rubric render, nav dimming, and tool suppression.
6. Quality checks green.

## Acceptance criteria

- [ ] Exam tab body matches the locked mock.
- [ ] Nav dimming active during exam mode.
- [ ] Rubric visible per free-response.
- [ ] All quality checks green.
