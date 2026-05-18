---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-sub-agent-block-inline
kind: story
stage: done
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Implementation notes

- **No new IPC channel needed.** `praxis.subAgent.events.*` was already
  implemented in `subagent-channel.ts` and `sub-agent-client.ts`. The
  `SubAgentRegistry.subscribe()` was already wired up server-side.

- **New hook `useSubAgentSteps`** (`packages/ui/src/hooks/use-sub-agent-steps.ts`)
  provides a narrower interface than `useSubAgent`: `{ steps, status, label }`.
  `interrupted` maps to `"failed"` for the UI — both mean the run ended badly.
  The existing `useSubAgent` hook is retained for other consumers (it remains
  used by nothing else at this point, but keeping it avoids a churn-only removal).

- **`<SubAgentBlock>` restyle** per locked mock `03-explorer-running.html`:
  accent left-border (`border-left: 3px solid var(--color-accent)`), secondary
  background, mono kicker `¶ sub-agent · {label} · N steps`, pulsing dot when
  running. Expand toggle appears only once steps arrive. Step list shows ✓/✗/◐
  icons, capped to 8 most recent when expanded.

- **`<AuthoringChatPane>` now renders `<SubAgentBlock>`** inline for
  `kind === "sub-agent"` items (previously returned null). Uses
  `item.toolName` as `initialLabel` (no label field on `SubAgentSpawn`).
  Uses spread conditional for `errored` to satisfy `exactOptionalPropertyTypes`.

- **17 `sub-agent-block.test.tsx` tests + 11 `use-sub-agent-steps.test.ts` tests**
  — all green. Full workspace test suite: 1407 tests passing.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `useSubAgent` (the old hook) is now unused by production code but kept to avoid churn-only removal. Fine for now; worth a `park` item if dead-weight becomes an issue later.
- `steps.slice(-8)` in the render path caps the displayed list, but the hook accumulates up to 200 steps in memory (`slice(-200)`). Reasonable for v1 — not a leak.

**Notes**: Clean implementation. `useSubAgentSteps` correctly narrows the existing event stream contract (no new IPC needed). The `spread conditional` pattern for `errored` satisfies `exactOptionalPropertyTypes` correctly. `isSettledFailed` captures both the parent prop and agent-stream failure paths. Test coverage is thorough — all UI states (pulse dot, step icons ✓/✗/◐, collapsed/expanded, aria-expanded, phase label update) are exercised. No foundation-doc drift.
