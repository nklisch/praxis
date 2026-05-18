---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
  - epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry
  - epic-backend-fills-for-redesign-drafter-configurator-chat-sub-agent-block-inline
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Course-create tab body — Canvas + Side Chat

## Scope

Re-shape `bootstrap-tab-body.tsx` to mount Canvas (draft preview) +
`<AuthoringChatPane>` (side chat) matching the locked
`mode-course-create.html` mock.

## Implementation steps

1. Edit `packages/ui/src/components/bootstrap-tab-body.tsx`:
   - Replace current layout with Canvas (left, flexible) + side chat
     (right, 380px fixed).
   - Canvas renders the draft preview (units + lessons + assessment
     plan) by reading the current draft state from
     `praxisClient.bootstrap.getCurrentDraft` (or equivalent).
   - Side chat mounts `<AuthoringChatPane mode="course_create"
     artifactId={draftId} />`.

2. Inline `<SubAgentBlock>` already mounts via the chat pane (Story
   3); no extra wiring here.

3. Tests: `bootstrap-tab-body.test.tsx` with fake draft state.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Course-create mode renders Canvas + Side Chat layout per the
      mock.
- [ ] Tool calls render via `<ToolCallEntry>` with revert when
      `actionId` available.
- [ ] Sub-agent block renders inline.
- [ ] All quality checks green.
