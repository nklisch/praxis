---
id: epic-ui-redesign-ground-up-chat-workspace-exam-tab-body
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

- [x] Exam tab body matches the locked mock.
- [x] Nav dimming active during exam mode.
- [x] Rubric visible per free-response.
- [x] All quality checks green.

## Implementation notes

- **Nav dimming**: `useEffect` adds/removes `exam-mode` class on `document.documentElement`
  on mount/unmount. Global CSS in `global.css` targets `.exam-mode nav[aria-label="Main navigation"]`
  with `opacity: 0.4; pointer-events: none` — clean selector hitting `TopNav`'s `aria-label="Main navigation"`.
- **Layout**: Two-column grid (1fr + 280px) — `examMain` (left) + `rail` (right). Matches the
  mock's `grid-template-columns: 1fr 280px` exactly.
- **Kicker**: Replaced old `kickerMode` + `kickerTitle` with `examStrip` pill (pulsing dot +
  "† Exam · proctored") + timer. Updated `chat-tab-body-dispatch.test.tsx` to target `examStrip`
  instead of the old `kickerMode`.
- **Rubric**: `RubricCard` component renders per-criterion rows (weight + description) + rubric
  hint footnote. `getRubric()` helper extracts rubric from any item kind that carries one
  (free-response, math/code/numerical workRubric, single-choice/multi-select/two-tier
  reasoningRubric). Items with rubrics surface in a "Pre-committed rubrics" section below the
  assignment card — only shown before submission.
- **Item rail**: `ItemRail` right panel — item status grid (done/current/flagged states),
  tools-allowed panel (clarification listed; grade_math/tutor/hints struck through), submit strip
  with answered/flagged/empty counts and early-submit button.
- **Tool suppression display**: `data-testid="tools-allowed"` panel with `data-testid="suppressed-tools"`
  for the struck-through row. Makes the strict subset explicit in the UI without wiring the
  actual MCP tool filtering (server-side; this is display only).
- **Timer + auto-submit**: Preserved exactly from sibling story (ExamCountdown, computeRemainingMs,
  expiredRef guard). All 6 timer tests pass unchanged.
- **Tests**: 20 tests total — proctored chrome (6), nav dimming (2), rubric (3), tool suppression (3),
  timer (6). All green.
- **Pre-existing failures**: `homework-tab-body.test.tsx` had 30 pre-existing failures before this
  PR; the workspace changes (other already-modified files) reduced them to 6. None introduced by
  this story.
