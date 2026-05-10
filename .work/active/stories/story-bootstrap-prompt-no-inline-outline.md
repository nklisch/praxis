---
id: story-bootstrap-prompt-no-inline-outline
kind: story
stage: implementing
tags: [bootstrap, prompts, tutor-ux]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Bootstrap prompts — point at the outline panel, don't narrate it

## Symptom

The bootstrap / course-creator agent reliably dumps a full course-outline
recap into chat after `course.show_draft` or `course.start_exploration`
— unit by unit, lesson by lesson — even though the dedicated side-view
surface already renders exactly that. The chat repeat is redundant noise:
it bloats the transcript, it slows the eye, and it encourages the
student to read prose instead of the canonical artifact.

## Root cause

The bootstrap prompt fragments don't tell the agent that the outline has
a dedicated render surface. The current `bootstrapToolsFragment`
(`packages/curriculum/src/modes/fragments/bootstrap-tools.ts`) says
"Always call `course.show_draft` after `course.start_exploration` to
display the result" without specifying that the result lands in the side
panel automatically. So the agent's natural next move — narrate what it
saw — is encouraged rather than discouraged.

## Fix shape

Revise the relevant prompt fragments in
`packages/curriculum/src/modes/fragments/`:

- `bootstrap-tools.ts` — after-`course.show_draft` and
  -`course.start_exploration` rules: the outline appears in the side
  panel; refer to it ("see the outline panel to your right" or similar)
  rather than narrating its contents.
- `bootstrap-role.ts` — reinforce that chat is for decisions, questions,
  and next-step nudges — not for re-rendering structured artifacts.
- Audit `configure` mode's prompt fragments for the same trap (the
  configure mode in `packages/curriculum/src/modes/configure.ts` subsumes
  bootstrap; same risk).

Probably a small surgical edit — one to three prompt fragments. No
behaviour-code changes.

## Acceptance

- After a `course.start_exploration` or `course.show_draft` call in a
  bootstrap session, the agent's text response no longer reproduces the
  outline structurally (no per-unit / per-lesson recap). It may briefly
  summarise the *shape* ("8 units, 26 lessons — see the outline on the
  right") and asks the student what to do next.
- The same restraint applies in `configure` mode.
- Acceptance is judgement-based — a fragment-snapshot test that asserts
  the new prompt language is present, plus a manual smoke check during
  the parent-epic's integration test, is sufficient. No formal
  behavioural test for the prompt change.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: independent — pure prompt edit. May benefit from
  landing after `expressive-draft-api` if chunked-query ops change what
  the agent should narrate, but it's worth landing now regardless to fix
  the current trap.

## Originating backlog
- `idea-bootstrap-prompt-no-inline-outline` — consumed by this story;
  will be removed from `.work/backlog/` as part of epic-design.
