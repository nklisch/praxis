---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-parent-prompt-updates
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Parent prompt updates — drafter + configurator postures

## Scope

Update mode definitions for `bootstrap.ts` and `configure.ts`:
- `bootstrap` parent gets the drafter posture (Praxis is drafting a
  course in collaboration with the user via authoring tools).
- `configure` stays as configurator posture; refresh strings to
  remove any "explorer" agent naming and encourage liberal authoring
  tool calls in response to user chat.

## Implementation steps

1. Edit `packages/curriculum/src/modes/bootstrap.ts`:
   - Update the parent prompt fragment(s) to frame Praxis as the
     drafter; mention that authoring tools execute immediately and
     are revertable; describe when to invoke
     `course.start_exploration` as a sub-agent.
   - Remove any "explorer" naming from user-visible strings.

2. Edit `packages/curriculum/src/modes/configure.ts`:
   - Refresh to encourage liberal authoring-tool calls.
   - Match the language of the locked configure-mode mock.

3. Tests:
   - `bootstrap.test.ts` and `configure.test.ts` snapshot the
     composed prompt; update goldens to match the new fragments.
   - Or assert specific phrasing tokens to keep tests resilient to
     small edits.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `bootstrap` parent prompt frames Praxis as the drafter, calls
      out reversible authoring tools, describes when to spawn
      `course.start_exploration` sub-agent.
- [ ] `configure` parent prompt encourages authoring-tool calls; no
      "explorer" wording remains.
- [ ] All quality checks green.

## Out of scope

- Renaming the underlying mode id / agent class / tool name. Tracked
  separately at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`.
