---
id: feature-onboarding-completion-course-card-preseed
kind: story
stage: implementing
tags: [ui, onboarding]
parent: feature-onboarding-completion
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Pre-seed bootstrap message on canonical-pack course-card click

## Scope

Story 2 of `feature-onboarding-completion`. Two of the three course-card
click handlers (Algebra and Biology) pre-seed a bootstrap-session message
after `session.start` resolves, so the user lands in a session that's
already moving toward their chosen pack. The Syllabus card stays
as-is (no pre-seed; user uploads their own materials).

UI-side approach: after `client.session.start({ modeId: "bootstrap" })`
resolves, call `client.session.send(handle.sessionId, message)` with the
pack-specific message. No new IPC, no `session.start` parameter change.

## Files to touch

- `packages/ui/src/components/onboarding-flow.tsx` (or the course-step file if separate) — extend the Algebra and Biology click handlers. Read the file to find the existing click-handler shape.
- Test file (find existing onboarding-flow test or course-step test) — add cases asserting the send is invoked with the correct message for each card; syllabus produces no `send`.

## Pre-seed messages

- Algebra (canonical) → `"Please use the canonical algebra-1 pack to create my course."`
- Biology (canonical) → `"Please use the canonical biology pack to create my course."`
- Syllabus → no pre-seed.

**Verify pack ids** during implementation: the exact `algebra-1` / `biology pack` wording must match what the bootstrap mode's tutor recognizes (the bootstrap role prompt already nudges canonical packs; the pre-seed message just saves the user a turn). Grep the bootstrap mode prompt or the pack registry for the canonical pack names and adjust the message text if needed.

## Acceptance criteria

- [ ] Clicking "Algebra (canonical)" calls `session.start` → `session.send` with the algebra pre-seed message.
- [ ] Clicking "Biology (canonical)" calls `session.start` → `session.send` with the biology pre-seed message.
- [ ] Clicking "From your own syllabus" calls `session.start` only; no `session.send` follow-up.
- [ ] All three paths still open a bootstrap-mode session and route the user to the chat tab (per existing onboarding behavior).
- [ ] No regression in existing onboarding tests.
- [ ] At least 3 new tests (one per card) lock the contract.

## Implementation notes

- The pre-seed `send` should happen AFTER `session.start` resolves and BEFORE (or as part of) the tab-navigation step, so the user sees the message already in flight when they land in the chat.
- If `session.send` is async with an error path, log warnings but don't block the navigation — the user's experience shouldn't degrade if the pre-seed fails for some transient reason.

## References

- Design: `.work/active/features/feature-onboarding-completion.md` (Story 2)
- Origin idea: `.work/backlog/idea-onboarding-course-card-pre-seed.md`
- Pattern: `session-tab-open-flow` — see `.claude/skills/patterns/session-tab-open-flow.md` for the existing session.start → tabs.open → navigate chain.

<!-- Implementation Notes accumulate here as work progresses. -->
