---
id: story-bootstrap-prompt-no-inline-outline
kind: story
stage: done
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

## Implementation notes

### Files changed

- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — added two new workflow rules after the existing `course.show_draft` call rules:
  - "After course.show_draft or course.start_exploration, the structured outline appears in the right-side panel automatically. Do NOT re-narrate the outline in chat — instead, summarise it in one sentence (e.g., '8 units, 26 lessons — outline is on the right') and ask what to do next."
  - "Keep chat for decisions, questions, and short next-step nudges. The outline panel is the canonical view of the course structure; do not reproduce it in text."

- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` — appended a `Chat discipline:` paragraph at the end of the template reinforcing the same restraint: "Never reproduce the outline unit-by-unit or lesson-by-lesson in chat. A brief one-sentence shape summary ('8 units, 26 lessons — see the outline on the right') followed by a concrete next-step question is the correct response pattern."

- `packages/curriculum/src/modes/fragments/configure-tools.ts` — configure mode has its own tools fragment (it does NOT reuse `bootstrapToolsFragment`). Added the same two outline-panel rules to its `Workflow rules` section. The `After course.show_draft` rule that previously said "offer to confirm or keep editing" was replaced with the panel-reference rule (confirm/keep-editing guidance is already embedded in the role fragment).

- `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-inline-outline.test.ts` — new snapshot test (11 assertions) verifying the key phrases are present in all three fragments.

### Verification

- `pnpm --filter @praxis/curriculum test`: 358 tests passed (27 test files), including the 11 new assertions.
- `pnpm typecheck`: clean across all packages.
- `pnpm lint`: pre-existing errors in `packages/claude-cli-sdk` and `tests/` only — zero errors in any file touched by this story.

## Originating backlog
- `idea-bootstrap-prompt-no-inline-outline` — consumed by this story;
  will be removed from `.work/backlog/` as part of epic-design.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Clean prompt-fragment edits matching the design. The agent correctly discovered that configure mode has its own tools fragment (rather than reusing bootstrap-tools) and applied the same rules — appropriate independent judgment. 11 snapshot assertions verify the new restraint language lands in all three fragments. No foundation-doc drift; prompt-fragment composition is a curriculum-internal concern.
