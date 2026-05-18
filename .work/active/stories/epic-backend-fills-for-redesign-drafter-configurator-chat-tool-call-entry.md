---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry
kind: story
stage: review
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-snapshot-restore-ipc
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

- [x] Tool calls render as one-line entries with verdict glyph + name
      + summary.
- [x] Revert button visible when `actionId` is set; calls
      `restoreAction` and surfaces success/failure.
- [x] All quality checks green.

## Implementation notes

### Files

- `packages/ui/src/components/tool-call-entry.tsx` — new component.
  Props: `{ name, summary, verdict, actionId?, restoredAt? }`.
  Calls `client.author.restoreAction` directly; uses local state to
  reflect "restored" immediately after a successful call without
  waiting for a parent re-fetch.
- `packages/ui/src/components/tool-call-entry.module.css` — one-line
  entry with left-accent border per verdict state (green/red/amber),
  revert button styled danger-outlined, confirmation modal content
  styled within the same module.
- `packages/ui/src/components/authoring-chat-pane.tsx` — replaced
  `<ToolEntry>` with `<ToolCallEntry>`. Added `listConfiguratorActions`
  fetch on session mount and on streaming turn end; correlation by
  toolName = action.kind, zipped in time order within each kind group.
- `packages/ui/src/components/__tests__/tool-call-entry.test.tsx` —
  12 tests covering all verdict states, revert button visibility,
  modal open/cancel/confirm flow, success and error outcomes.

### Correlation approach

There is no shared key between the engine-level `callId` and the
`configurator_actions` audit-log row. Correlation is by kind
(`toolName === action.kind`) and time order (n-th settled entry of a
kind maps to n-th action row of that kind, sorted by `ts`). This is
reliable for authoring sessions because tool calls in a single turn
are not concurrent (no fan-out). If a `callId` column is ever added
to the audit table, this can be simplified to a direct join.

### `restoredAt` type

`ConfiguratorActionRow.restoredAt` is `Timestamp | null | undefined`
(branded number). The prop on `ToolCallEntry` is typed accordingly.
The desktop package's `exactOptionalPropertyTypes: true` required
explicit conditional spreading to avoid type errors.
