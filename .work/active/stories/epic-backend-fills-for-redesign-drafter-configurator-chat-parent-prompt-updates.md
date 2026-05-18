---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-parent-prompt-updates
kind: story
stage: done
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

## Implementation notes

Files changed:
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` — rewrote
  role fragment to frame Praxis as "the drafter"; added "Praxis drafts;
  you steer" posture, execute-immediately + ↶ revert language, explicit
  guidance on when to spawn `course.start_exploration` as a sub-agent,
  "act on chat directives immediately" rule. Removed "explorer" as a
  user-visible agent name (tool name `start_exploration` preserved).
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — updated
  tool catalogue header to "drafting mode"; swapped "concept-explorer
  agent" → "document-reading sub-agent"; added ↶ revert note on
  `course.edit_draft`; replaced undo rule ("discard and re-run explorer")
  with "↶ revert in the UI" language; added "Act on chat directives
  immediately" workflow rule; removed "explorer" from user-visible text.
- `packages/curriculum/src/modes/fragments/configure-role.ts` — rewrote
  role to "Praxis, the configurator"; added "act on chat directives
  immediately" posture; added "Execute first on unambiguous directives"
  concrete rule with example; preserved destructive-write confirmation
  requirement.
- `packages/curriculum/src/modes/fragments/configure-tools.ts` — updated
  `course.start_exploration` description from "concept-explorer" → "document-
  reading sub-agent"; added ↶ revert notes on all direct-write tools (course.edit,
  lesson.create/edit, gate.create/edit, prompt.override_fragment/set_style);
  added "Act on unambiguous directives immediately" workflow rule; renamed
  section header "Course authoring (from bootstrap)" → "Course authoring".
- `packages/curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts`
  — new test file; 22 token-assertion tests covering drafter posture
  (bootstrap), configurator posture (configure), ↶ revert mentions, sub-agent
  framing, and absence of "explorer" as user-visible agent name.

Tone choices:
- "Praxis drafts; you steer." mirrors the mockup hint text exactly.
- "Execute first on unambiguous directives" is the operative rule that
  makes authoring-tool calls feel immediate and confident — consistent with
  how the configure mockup shows the agent acting (tool call before text).
- "sub-agent" is the replacement for "explorer" in user-visible text; it
  is neutral, accurate, and consistent with the architecture docs.
- Kept the structural-progress / no-ETA language intact (covered by
  existing tests `bootstrap-no-time-estimate.test.ts`).

## Review (2026-05-17)

**Verdict**: Approve with comments

**Blockers**: none (one blocker found and fixed inline — see Notes)
**Important**: none
**Nits**:
- The story commit bundled three stray file changes out of scope: `packages/core/src/types/client.ts` (duplicate `Recommendation` import), `packages/desktop/electron/main/ipc-server.ts` (import of `registerRecommendationsHandlers`), and `packages/desktop/electron/main/services.ts` (duplicate `SqliteDraftStore` import). The `client.ts` duplicate was cleaned up by a later story's commit; the `services.ts` duplicate survived and caused `TS2300: Duplicate identifier 'SqliteDraftStore'` — fixed inline during this review by removing the extra line.

**Notes**: The four fragment files and 22-test suite deliver exactly what the scope called for: drafter posture in bootstrap, configurator posture in configure, ↶ revert language on all authoring tools, "sub-agent" replacing "explorer" in user-visible text, and "execute-first on unambiguous directives" rule. All 22 new tests and all 465 curriculum tests pass. The stray edits appear to have been accidentally staged from another story's working tree at commit time; the only lasting damage was the `services.ts` duplicate, which is a one-line fix. Quality checks are green after the fix.
