---
id: epic-backend-fills-for-redesign-drafter-configurator-chat
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: [epic-backend-fills-for-redesign-snapshot-restore]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

<!-- The design pass will define the AuthoringChatPane primitive (if
extraction is warranted), the tool-entry rendering schema (summary +
verdict + revert), the SubAgentBlock inline display contract, and the
parent prompt deltas for bootstrap vs configure modes. -->
