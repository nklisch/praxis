---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-snapshot-restore-ipc
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# `<ToolCallEntry>` — summary + verdict + ↶ revert

## Scope

New `<ToolCallEntry>` component rendered by `<AuthoringChatPane>`
in place of inline tool-call rendering. Props:
`{ name, summary, verdict, actionId? }`. When `actionId` is present,
renders ↶ revert calling
`praxisClient.authoring.restoreAction({ actionId })`.

## Implementation steps

1. New `packages/ui/src/components/tool-call-entry.{tsx,module.css}`.
2. Edit `authoring-chat-pane.tsx` to dispatch tool-call events to the
   new component. Pull `actionId` from the existing audit log
   (`praxisClient.authoring.listConfiguratorActions`) by correlating
   on the tool-call id.
3. Revert button: confirmation modal (using `<Modal>` primitive) →
   call `restoreAction` → surface result; on success, refresh the
   canvas.
4. Tests: `tool-call-entry.test.tsx` covering all props + revert
   flow with a fake `praxisClient.authoring`.
5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Tool calls render as one-line entries with verdict glyph + name
      + summary.
- [ ] Revert button visible when `actionId` is set; calls
      `restoreAction` and surfaces success/failure.
- [ ] All quality checks green.
