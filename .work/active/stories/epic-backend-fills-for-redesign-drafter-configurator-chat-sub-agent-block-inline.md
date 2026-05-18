---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-sub-agent-block-inline
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# `<SubAgentBlock>` inline marginalia + live step events

## Scope

Refactor `sub-agent-block.tsx` to inline marginalia style and wire it
to `SubAgentRegistry` step events.

## Implementation steps

1. Edit `packages/ui/src/components/sub-agent-block.tsx` to:
   - Render italic marginalia with mono kicker
     (`sub-agent · {name} · {durationMs}ms`).
   - Collapse by default; expand to show step events.

2. New hook `packages/ui/src/hooks/use-sub-agent-steps.ts`:
   - Subscribes to `praxisClient.subAgents.events()` (or whatever
     the existing stream surface is). If no subscribable channel
     exists today, add one.
   - Returns `{ steps: SubAgentStep[]; status: "running" | "done" | "failed" }`.

3. If a new IPC stream channel is needed:
   - `praxis.subAgents.events.<streamId>` per
     `ipc-channel-convention` (`.start` / `.events.<streamId>` /
     `.cancel`).
   - `SubAgentRegistry` publishes step events into the channel.

4. Wire `<AuthoringChatPane>` to mount `<SubAgentBlock>` inline
   beneath the originating tool call.

5. Tests with a mocked stream.

6. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `<SubAgentBlock>` renders as marginalia per the locked mock.
- [ ] Live step events stream into the block via the hook.
- [ ] All quality checks green.

## Out of scope

- Persisting sub-agent step events long-term (already handled by
  episodic log).
