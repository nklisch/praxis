---
id: epic-backend-fills-for-redesign-drafter-configurator-chat
kind: feature
stage: done
tags: []
parent: epic-backend-fills-for-redesign
depends_on: [epic-backend-fills-for-redesign-snapshot-restore]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Drafter & Configurator chat surfaces

## Brief

The architecture — parent-agent chat in bootstrap and configure modes,
with sub-agents (e.g. the explorer) invoked via tools — is already in
place. `ConfigureChatPane` already renders the configure-mode parent
agent chat. What's missing is the **UI surface** matching the locked
Canvas + Side Chat mockup direction, and a few rendering refinements:

- **Bootstrap-mode UI rebuild** as Canvas + Side Chat (draft canvas on
  left, parent-agent chat on right) — currently the bootstrap session
  doesn't expose the parent chat prominently
- **Tool-entry rendering with summary + ↶ revert** — replaces the
  current invisible/collapsed tool-call rendering with a "what was
  done" pill that links the snapshot/restore layer
- **`<SubAgentBlock>` inline in chat for `course.start_exploration`** —
  the SubAgentRegistry already publishes step events; this feature
  renders them inline as a live block within the parent's tool call
- **Parent prompt updates** — bootstrap-mode parent becomes "drafter
  posture"; configure-mode parent stays as configurator posture; both
  call authoring tools liberally in response to user chat

What this feature does **not** cover: the snapshot/restore mechanism
itself (separate feature); the authoring tools themselves (already
exist in `packages/tools/src/authoring/`); the UI redesign of the
chat-workspace as a whole (that's an `epic-ui-redesign-ground-up`
implementation feature).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **depends on snapshot-restore** for the ↶ revert
  affordance. Can otherwise parallelize with other features.
- UI co-ships with: `epic-ui-redesign-ground-up-chat-workspace`
  implementation (which provides the mode-body shell for course-create
  + the Refined-Bubbles base for both modes' chats).

## Foundation references

- `docs/ARCHITECTURE.md` § "Tool dispatch architecture" — parent/sub-
  agent pattern, `SubAgentRegistry`, inline `<SubAgentBlock>` rendering
- `docs/CURRICULUM.md` § "configure mode" and "bootstrap mode" —
  current parent-agent definitions + tool sets
- `packages/curriculum/src/modes/bootstrap.ts` — current bootstrap
  mode definition; parent prompt update lands here
- `packages/curriculum/src/modes/configure.ts` — "subsumes bootstrap
  mode"; same parent pattern
- `packages/ui/src/components/configure-chat-pane.tsx` — existing
  scaffold; this feature extends + likely refactors into a shared
  AuthoringChatPane primitive
- `.mockups/screens/.../mode-course-create.html` and
  `.mockups/screens/.../configure/option-5.html` — re-mocked surfaces

## Design decisions

- **Extract `AuthoringChatPane` from `ConfigureChatPane`.** Both
  course-create and configure use the Canvas + Side Chat shape with
  the same tool-entry rendering and revert affordance. One primitive,
  two mounts.
- **`<ToolCallEntry>` is the new render unit**, replacing the
  invisible/collapsed tool call. Props: `{ name, summary, verdict,
  actionId? }`. When `actionId` is set, surfaces ↶ revert.
- **`<SubAgentBlock>` becomes inline marginalia**, subscribing to
  `SubAgentRegistry` step events via a hook.
- **Parent prompt deltas land in mode definitions** — `bootstrap.ts`
  gets the drafter posture; `configure.ts` stays configurator
  posture. Both updated to encourage liberal authoring-tool calls.

## Architectural choice

Five parallel stories along clean boundaries: chat-pane extraction,
tool-entry rendering, sub-agent block restyle, course-create tab
body shell, and parent-prompt updates.

## Implementation Units (one story each)

### Unit 1: `AuthoringChatPane` extraction
**File**: `packages/ui/src/components/authoring-chat-pane.{tsx,module.css}`
(new). Extract from `configure-chat-pane.tsx`. Generic over which
mode (`course_create` vs `configure`) and which artifact id.
`ConfigureChatPane` becomes a thin wrapper.

### Unit 2: `<ToolCallEntry>` rendering
**File**: `packages/ui/src/components/tool-call-entry.{tsx,module.css}`
(new). Replaces inline tool-call rendering in `AuthoringChatPane`.
Props: `{ name, summary, verdict, actionId? }`. When `actionId` is
present, button calls
`praxisClient.authoring.restoreAction({ actionId })`.

### Unit 3: `<SubAgentBlock>` inline restyle
Refactor existing `packages/ui/src/components/sub-agent-block.tsx` to
inline marginalia style (italic, mono kicker, collapsed-by-default).
Subscribe to step events via a hook reading from
`SubAgentRegistry`'s subscribable channel (add the channel if it
doesn't exist).

### Unit 4: Course-create tab body shell
Re-shape existing `packages/ui/src/components/bootstrap-tab-body.tsx`
to mount Canvas (draft preview) + `AuthoringChatPane` (side chat) per
mock `mode-course-create.html`.

### Unit 5: Parent prompt updates
`packages/curriculum/src/modes/bootstrap.ts` +
`packages/curriculum/src/modes/configure.ts`. Update parent prompt
fragments to encourage authoring-tool calls and frame Praxis as the
drafter / configurator (no named "explorer").

## Implementation Order

Five stories, all depend on
`epic-backend-fills-for-redesign-snapshot-restore-ipc` for the
revert IPC. Internal sequencing:
- Story 1 first (extraction)
- Stories 2 + 3 + 5 in parallel after Story 1
- Story 4 after Stories 1+2+3 (consumes them all)

## Acceptance Criteria

- [x] `AuthoringChatPane` mounts under both configure and course-create.
- [x] Tool calls render as `<ToolCallEntry>` with revert button when
      `actionId` available.
- [x] `<SubAgentBlock>` renders inline marginalia with live step events.
- [x] Course-create mode renders Canvas + Side Chat.
- [x] Parent prompts updated; no named "explorer" agent surfaces.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green.

## Risks

- **`ConfigureChatPane` consumers** must switch to the extracted
  primitive. Mitigation: keep `ConfigureChatPane` as a thin wrapper.
- **Sub-agent step-event channel** may not exist. If
  `SubAgentRegistry` doesn't publish events on a subscribable
  channel today, add it as part of Story 3.

## Children complete (2026-05-18)

All 5 child stories at `stage: done`. Feature advanced `implementing → review`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: All five child stories were individually reviewed and approved in the same session. Aggregate review confirms: `AuthoringChatPane` is correctly mounted under both `configure` and `bootstrap` modes; `ToolCallEntry` renders with ↶ revert via `restoreAction`; `SubAgentBlock` renders inline marginalia with live step events from the existing IPC channel; `bootstrap-tab-body` delivers Canvas + Side Chat per the locked mock; prompt fragments remove "explorer" as a user-visible agent name and adopt drafter/configurator posture. No foundation-doc drift — ARCHITECTURE.md's `SubAgentBlock` reference remains accurate; `ConfigureChatPane` was not a named architecture component. All acceptance criteria met. Feature advancing to `stage: done`; parent epic advancing `implementing → review`.
