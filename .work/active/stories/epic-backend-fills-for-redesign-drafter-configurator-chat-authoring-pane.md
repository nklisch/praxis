---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on: [epic-backend-fills-for-redesign-snapshot-restore-ipc]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Extract `<AuthoringChatPane>` from `<ConfigureChatPane>`

## Scope

Extract the chat-pane primitive used by both configure and
course-create surfaces.

## Implementation steps

1. New `packages/ui/src/components/authoring-chat-pane.{tsx,module.css}`.
2. Move the body of `configure-chat-pane.tsx` into the new component;
   parameterize over mode id and artifact id via props.
3. `configure-chat-pane.tsx` becomes a thin wrapper passing
   `mode: "configure"` plus the configurator-specific artifact ids.
4. Tests: `authoring-chat-pane.test.tsx` covering both mode mounts.
5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `<AuthoringChatPane>` accepts mode + artifact-id props.
- [ ] `<ConfigureChatPane>` continues to render identically (existing
      consumers untouched).
- [ ] Tests cover both mounts.
- [ ] All quality checks green.
