---
id: epic-course-structured-tutor-draft-resumption-mode-wiring
kind: story
stage: review
tags: [tutor-ux, bootstrap, mode-prompts]
parent: epic-course-structured-tutor-draft-resumption
depends_on: [epic-course-structured-tutor-draft-resumption-tool]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Wire `course.list_drafts` into bootstrap mode (mode-tool-scoping + prompt fragment)

## Scope

Expose the new `course.list_drafts` tool to the bootstrap mode only:

1. Add `"course.list_drafts"` to `bootstrapMode.toolNames`.
2. Add a one-line entry for the tool to the `bootstrap-tools.ts` prompt fragment
   so the model knows when and how to use it (i.e. on resume requests).
3. Confirm no other mode (`teach`, `quiz`, `homework`, `exam`, `study-skills`,
   `configure`) references the tool name.

Pattern reference: `mode-tool-scoping` (`.claude/skills/patterns/mode-tool-scoping.md`).

## Files

- `packages/curriculum/src/modes/bootstrap.ts` (edit)
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` (edit)
- `packages/curriculum/src/modes/__tests__/bootstrap.test.ts` (edit or new — assertions)

## Acceptance Criteria

- [ ] `bootstrapMode.toolNames` includes `"course.list_drafts"`.
- [ ] `bootstrap-tools.ts` lists the tool with a one-sentence usage hint:
      "enumerate the student's active drafts when they ask to resume something
      they started; pass the chosen draftId back into
      `course.start_exploration` to continue building."
- [ ] No other mode's `toolNames` includes `"course.list_drafts"` (verify in test).
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum` green.

## Implementation Notes

- This story depends on Unit 1 (the tool must be registered in `COURSE_TOOLS`
  first) — otherwise the mode references a name that maps to nothing in the
  tool registry filter.
- Keep the `toolNames` and the fragment in sync. The pattern's "common
  violations" section calls out drift between these as the #1 trap.
