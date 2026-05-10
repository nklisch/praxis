---
id: epic-bootstrap-readiness-in-flight-affordances
kind: feature
stage: drafting
tags: [tutor-ux, chat]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# In-flight chat affordances — thinking indicator + turn cancel

## Brief

Two missing in-flight chat affordances make every turn feel like a coin
flip. (1) When a turn is inbound and the model hasn't started streaming
text yet — or in the gap between a tool call and the next assistant
chunk — the chat shows nothing, so the student can't tell whether
anything is happening. (2) There's no way to cancel an in-flight turn:
if the student realises mid-stream that the tutor misunderstood, they
have to wait it out. Both surfaced during the same broken bootstrap
session as the rest of the parent epic; both apply to every mode, but
they hurt bootstrap worst because bootstrap turns are long (explorer
runs, multi-op edit batches).

This feature adds:

- **Thinking indicator** — render a small animated dots/spinner
  component in the chat whenever the engine stream is open and no
  `model_message` chunk has arrived yet *or* the model is paused between
  a `tool_result` and the next assistant chunk. The same shape as the
  existing tool-interstitial dots (`packages/ui/src/components/tool-interstitial.tsx`)
  but bound to "waiting on the model" rather than "waiting on a tool."
- **Turn cancel** — wire an Esc-or-button cancel down through the
  existing IPC plumbing. `praxis.session.send.cancel` already aborts the
  AbortController in `packages/desktop/electron/main/ipc-server.ts:165`,
  but the abort only breaks the for-await loop in the IPC server — it
  does NOT propagate down to `EngineSession.send` or the underlying
  `conv.abort()` call, so the engine subprocess keeps generating until
  done. Pipe the AbortSignal into the engine session so cancellation
  truly stops the model.
- **Interrupted-turn episodic mark** — emit a synthetic
  `{ type: "interrupted" }` event into the episodic log so the next
  send doesn't replay confused state. The next turn's compaction /
  recovery logic can read this and decide whether to apologise, ignore,
  or summarise.

This feature does NOT add a "regenerate" button (separate concern),
does NOT change the engine adapter contract (still
`EngineSession.send(): AsyncIterable<EngineEvent>`), and does NOT touch
the activity rail (different surface for ambient long-running work).

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: standalone — pure UI + IPC + engine-signal plumbing,
  no cross-feature dependencies. Useful immediately even before the
  bootstrap-specific features land.

## Foundation references
- `docs/ARCHITECTURE.md` — IPC channel convention (`praxis.{domain}.{action}`)
  and streaming split (`.start` / `.events.<streamId>` / `.cancel`); the
  cancel channel already exists.
- `packages/desktop/electron/main/ipc-server.ts:118-168` — the existing
  cancel handler and AbortController plumbing; extend to pipe the signal
  down through `session.send`.
- `packages/engines/src/claude-code/adapter.ts` — `EngineSession.send`
  currently iterates `conv.send(...)`; needs an AbortSignal input that
  triggers `conv.abort()` (the SDK already exposes this — see
  `packages/claude-cli-sdk/src/conversation.ts`).
- `packages/ui/src/components/tool-interstitial.tsx` — visual template
  for the thinking indicator.

## Originating backlog
- `idea-thinking-indicator-and-turn-cancel` — consumed by this feature;
  will be removed from `.work/backlog/` as part of epic-design.

<!-- Design pass (`/agile-workflow:feature-design`) will fill in:
       - ThinkingIndicator component shape + state machine (when shown / hidden)
       - AbortSignal threading through SessionServiceImpl → EngineSession.send
       - Engine-event "interrupted" type addition (or reuse of "error" with code)
       - UI cancel affordance (Esc key, button, both)
       - Episodic-log shape for interrupted turns
       - Test approach (UI unit + signal propagation + episodic round-trip) -->
