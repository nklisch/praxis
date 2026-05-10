---
id: idea-bootstrap-prompt-no-inline-outline
created: 2026-05-10
tags: [tutor-ux, prompts]
---

The bootstrap / course-creator agent reliably dumps a full course-outline
recap into chat after `course.show_draft` or `course.start_exploration` —
unit by unit, lesson by lesson — even though the dedicated side-view surface
already renders exactly that. The chat repeat is noise: it's redundant with
the structured panel, it bloats the transcript, it slows the eye, and it
encourages the student to read prose instead of the canonical artifact. The
prompts that drive this are in `packages/curriculum/src/modes/fragments/`
(notably `bootstrap-role.ts`, `bootstrap-tools.ts`, and the workflow rules
about always calling `course.show_draft` after edits). Those rules should be
revised to tell the agent: after `course.show_draft` / `start_exploration`,
the outline appears in the side panel — refer to it ("see the outline panel
to your right" or similar) rather than narrating it; reserve chat for
decisions, questions, and next-step nudges. Probably a small prompt-fragment
edit plus matching language updates in `configure` mode if it shares the
trap.
