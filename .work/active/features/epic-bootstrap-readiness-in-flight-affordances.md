---
id: epic-bootstrap-readiness-in-flight-affordances
kind: feature
stage: done
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

## Architectural choice

**Thread an AbortSignal through the existing send pipeline, end-to-end,
plus a new `interrupted` EngineEvent type for clean episodic accounting.**

The cancel infrastructure today is half-built — `praxis.session.send.cancel`
already aborts an `AbortController` in `packages/desktop/electron/main/ipc-server.ts:165`,
but the abort only `break`s the for-await loop in the IPC server. It
does NOT propagate down into `services.session.send(...)` or
`EngineSession.send`, so the CLI subprocess keeps generating tokens
until completion. The user's "cancel" today is cosmetic — they stop
seeing output, but Pro/Max billing keeps ticking.

Alternatives considered:

- **Don't add an AbortSignal — kill the engine session on cancel.**
  Simpler: on cancel, call `entry.handle.close()` and drop the
  `activeSessions` entry. Next send re-opens. Rejected: closing the
  session loses native resume context, costs another `claude` startup,
  and bleeds state if any in-flight side effects (tool calls, episodic
  writes) need to finish cleanly. Signal-threading lets the engine
  abort its current turn while keeping the session warm.
- **Reuse `EngineEvent { type: "error" }` with a code for cancel.**
  Avoids the contract change. Rejected: the UI hook needs to render
  "Cancelled by you" not a red error; the indexers should NOT treat
  cancel as a session-end signal; a dedicated event type makes both
  surfaces correct by construction.

The chosen approach extends `EngineEvent` with one new variant
`{ type: "interrupted" }`, accepts an optional `AbortSignal` on
`SessionService.send` and `EngineSession.send`, and wires the existing
IPC AbortController down to the engine adapter's `conv.abort()`.
That's the smallest surface that delivers real cancel.

For the thinking indicator: a UI-only state machine in
`use-streamed-send.ts`. No contract change, no engine change. The
indicator renders when `isStreaming === true` AND no `model_message`
has arrived since the last segment boundary (turn start, or end of the
last `tool_result`).

## Implementation Units

### Unit 1: Add `interrupted` to the `EngineEvent` union

**File**: `packages/core/src/types/event.ts` (or wherever `EngineEvent` is defined)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-signal`

```typescript
// Extend EngineEvent — exhaustive switch consumers gain one new case.

export type EngineEvent =
  | { type: "user_message"; content: string }
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "final"; usage: Usage; finalReason: FinalReason; errorMessage?: string }
  | { type: "error"; error: EngineError }
  | { type: "interrupted"; reason: "user_cancel" | "engine_abort" }; // ← new
```

Touches every exhaustive switch on `EngineEvent`. Grep `event.type ===`
across the workspace and add a case in each one. Most non-UI consumers
treat `interrupted` like `final` (turn over, no state to update). UI
hooks treat it as "stop streaming, render cancellation note."

**Acceptance**:
- [ ] Type defined; no TypeScript exhaustiveness errors after running
      `pnpm typecheck` across the workspace.
- [ ] All current `switch (event.type)` sites handle `interrupted`
      either explicitly or via a `default` branch that's a no-op.

---

### Unit 2: Thread `AbortSignal` through `SessionService.send`

**File**: `packages/core/src/services/session-service.ts`

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-signal`

Signature change:

```typescript
async *send(
  sessionId: SessionId,
  message: string,
  signal?: AbortSignal, // ← new optional param
): AsyncIterable<EngineEvent> {
  // ... existing setup ...

  capturedEntry.turnInFlight = true;
  try {
    for await (const event of capturedEntry.handle.send(message, signal)) {
      // ... existing appendEpisodic + yield logic ...
      yield event;

      // Defensive: if the consumer (IPC server) bailed via iterator
      // return(), the for-await loop terminates cleanly via the
      // generator protocol. The signal abort below is for the case
      // where the consumer kept consuming but we want to short-circuit.
      if (signal?.aborted) {
        const interrupted: EngineEvent = {
          type: "interrupted",
          reason: "user_cancel",
        };
        try {
          appendEpisodic({
            db: this.deps.db,
            sessionId,
            studentId,
            engineId: capturedEntry.engineId,
            modeId: mode.id,
            turnIndex,
            event: interrupted,
          });
        } catch { /* non-fatal */ }
        yield interrupted;
        return;
      }
    }
  } catch (cause) {
    // ... existing error handling ...
  } finally {
    capturedEntry.turnInFlight = false;
  }
}
```

**Implementation Notes**:
- The `signal?.aborted` check after each yielded event is a safety net
  for the case where `EngineSession.send` doesn't honor the signal
  promptly. With Unit 3 wiring the Claude Code adapter to
  `conv.abort()`, this rarely fires — but it guarantees the user-facing
  cancel works even on adapters that haven't been updated.
- Append the `interrupted` event to the episodic log so the next turn's
  recovery prompt can see what happened.
- The `turnInFlight` flag continues to gate concurrent sends.

**Acceptance**:
- [ ] `SessionService.send` accepts an optional `AbortSignal` and forwards it.
- [ ] When `signal.abort()` fires mid-turn, the generator yields one
      final `{ type: "interrupted", reason: "user_cancel" }` event and
      returns.
- [ ] The `interrupted` event lands in the episodic log.
- [ ] No regression for the non-signal path (existing tests pass with
      `send(sessionId, message)` continuing to work).

---

### Unit 3: Thread `AbortSignal` through `EngineSession.send` and trigger `conv.abort()`

**Files**:
- `packages/core/src/types/engine.ts` (or wherever `EngineSession` interface is)
- `packages/engines/src/claude-code/adapter.ts`
- `packages/engines/src/codex/adapter.ts` (parity — wire even if codex doesn't have native abort yet)
- `packages/engines/src/direct/adapter.ts` (parity)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-signal`

Interface change:

```typescript
// EngineSession contract:
export interface EngineSession {
  readonly id: string;
  send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent>;
  close(): Promise<void>;
}
```

Claude Code adapter wiring:

```typescript
// packages/engines/src/claude-code/adapter.ts (inside ClaudeCodeEngineSession)

async *send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
  if (this.closed) {
    yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
    return;
  }
  const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
  this.seedPreface = "";

  const turn = this.conv.send(message);

  // Wire the AbortSignal → conv.abort(). One-shot listener; if the
  // consumer aborts mid-stream, ask the CLI subprocess to stop. The
  // SDK already exposes abort() at packages/claude-cli-sdk/src/conversation.ts.
  const onAbort = (): void => {
    try {
      this.conv.abort();
    } catch (err) {
      this.log.warn("engine.claude-code.abort_failed", { err: serializeError(err) });
    }
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    for await (const event of turn) {
      const mapped = mapClaudeCodeEvent(event, { serverName: this.serverName });
      if (mapped) yield mapped;
    }
    await turn.result.catch(() => {});
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
```

For Codex and Direct adapters: accept the signal in the same way; do
the best the underlying SDK allows. Codex's Vercel-AI SDK and Direct's
streaming both support an `AbortSignal` on the underlying request —
forward it. Document in the adapter's comment if the underlying SDK
can't actually cancel a turn (then signal-honor is best-effort).

**Acceptance**:
- [ ] `EngineSession.send` signature updated in the interface
      (`packages/core/src/types/engine.ts`).
- [ ] Claude Code adapter: aborting the signal mid-turn calls
      `conv.abort()` and stops the CLI subprocess (verify by checking
      that no further `tool_call` / `model_message` events arrive after
      the abort).
- [ ] Codex and Direct adapters: signal threaded through to the
      underlying SDK request.
- [ ] Existing engine tests pass without modification (send works the
      same when no signal is passed).
- [ ] New test in `packages/engines/src/__tests__/claude-code.test.ts`:
      passing an `AbortSignal` and aborting it triggers `conv.abort()`
      (verify via mock).

---

### Unit 4: Wire IPC AbortController signal into `services.session.send`

**File**: `packages/desktop/electron/main/ipc-server.ts` (lines 119-163)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-signal`

Today:

```typescript
const stream = services.session.send(sessionId as any, message);
for await (const event of stream) {
  if (controller.signal.aborted) break;
  // ...
}
```

New:

```typescript
const stream = services.session.send(sessionId as any, message, controller.signal);
for await (const event of stream) {
  if (controller.signal.aborted) break; // safety net; the generator returns on its own
  // ...
}
```

**Acceptance**:
- [ ] `services.session.send` is invoked with `controller.signal`.
- [ ] Sending `praxis.session.send.cancel` mid-turn now propagates all
      the way to `conv.abort()` in the Claude Code adapter.

---

### Unit 5: Thinking-indicator state in `useStreamedSend`

**File**: `packages/ui/src/hooks/use-streamed-send.ts`

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-ui`

Add a `thinking` boolean to the hook's return value, separate from
`isStreaming`:

```typescript
export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  thinking: boolean; // ← new — true when isStreaming AND no model_message has arrived in the current segment
  lastError: string | null;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  cancel: () => void; // ← new — triggers iterator return() to fire cancel IPC
  clearMessages: () => void;
  loadHistory: (sessionId: SessionId) => Promise<void>;
}
```

State machine for `thinking`:
- **true** when `send()` starts and `isStreaming` flips to true.
- **false** as soon as any `model_message` event arrives in the
  current segment.
- **true** again when a `tool_result` event arrives (next thing the
  agent does is think before its next assistant chunk).
- **false** when `final` or `interrupted` arrives, or when
  `isStreaming` flips back to false.

Cancel implementation:

```typescript
let activeIterator: AsyncIterator<EngineEvent> | null = null;
// ... inside send():
const stream = client.session.send(sessionId, message);
const iterator = stream[Symbol.asyncIterator]();
activeIterator = iterator;
try {
  while (true) {
    const r = await iterator.next();
    if (r.done) break;
    // ... handle event ...
  }
} finally {
  activeIterator = null;
}

const cancel = (): void => {
  if (activeIterator) {
    activeIterator.return?.(); // triggers cancel IPC via the transport
  }
};
```

**Acceptance**:
- [ ] `thinking` is true when streaming AND no `model_message` has
      arrived in the current segment.
- [ ] `thinking` is false during streaming text.
- [ ] `thinking` flips back to true between a `tool_result` and the
      next `model_message`.
- [ ] `cancel()` triggers iterator return → cancel IPC → engine abort
      (verifiable via mock client).
- [ ] `interrupted` event closes the active bubble and sets a
      cancellation marker on the last bubble (or as a system note).

---

### Unit 6: `<ThinkingIndicator />` component

**File**: `packages/ui/src/components/thinking-indicator.tsx` (new)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-ui`

```tsx
import type { JSX } from "react";
import styles from "./thinking-indicator.module.css";

export interface ThinkingIndicatorProps {
  variant?: "dots" | "compact"; // dots by default; compact for inline
}

export function ThinkingIndicator({ variant = "dots" }: ThinkingIndicatorProps): JSX.Element {
  return (
    <p
      className={styles.indicator}
      aria-live="polite"
      aria-label="Tutor is thinking"
    >
      <span className={styles.label}>Thinking</span>
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}
```

CSS reuses the dots animation from
`packages/ui/src/components/tool-interstitial.module.css`. Import the
animation via composes-from or duplicate the keyframes; pick whichever
the editorial-ui-primitives pattern in `.claude/skills/patterns/`
prefers.

**Acceptance**:
- [ ] Component renders one line with "Thinking" + three animated dots.
- [ ] `aria-live="polite"` so screen readers announce it.
- [ ] Visually consistent with the `<ToolInterstitial />` dots pattern.

---

### Unit 7: Render `<ThinkingIndicator />` in chat tab body

**File**: `packages/ui/src/components/chat-tab-body.tsx`

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-ui`

After the messages map, before the quick-check cards:

```tsx
{thinking && <ThinkingIndicator />}
```

**Acceptance**:
- [ ] Indicator appears when `thinking === true` and disappears
      otherwise.
- [ ] Indicator appears at the bottom of the messages list, before
      quick-check cards.
- [ ] No flicker between a `tool_result` and the next chunk — the
      indicator stays visible through that gap.

---

### Unit 8: Cancel button + Esc key binding

**File**: `packages/ui/src/components/chat-tab-body.tsx` (and a small
component or inline button)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-ui`

Add a "Stop" button visible only when `isStreaming === true`. Bind Esc
when streaming:

```tsx
useEffect(() => {
  if (!isStreaming) return;
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [isStreaming, cancel]);
```

Button placement: in the chat input area, replacing or sitting next to
the send button while streaming.

**Acceptance**:
- [ ] Stop button visible only while `isStreaming` is true.
- [ ] Click triggers `cancel()`; iterator `return()` fires; engine
      receives abort.
- [ ] Esc keypress while streaming triggers `cancel()`.
- [ ] Cancellation results in an `interrupted` event being received by
      the hook; UI renders a "Cancelled" note inline.

---

### Unit 9: UI tests

**File**: `packages/ui/src/__tests__/use-streamed-send.test.tsx` (extend)
and `packages/ui/src/components/__tests__/thinking-indicator.test.tsx` (new)

**Story**: `story-epic-bootstrap-readiness-in-flight-affordances-ui`

Test cases:
- `thinking` is true at send start and before first model_message.
- `thinking` flips to false on first model_message.
- `thinking` flips back to true on tool_result, then false on next model_message.
- `thinking` false after final / interrupted / error.
- `cancel()` while streaming triggers iterator return().
- ThinkingIndicator component renders with `aria-live` and three dots.

Use `makeFakeClient` per the `ui-test-helper` pattern.

**Acceptance**:
- [ ] All new UI tests pass.
- [ ] Existing `use-streamed-send` tests untouched / pass.

## Implementation Order

1. **Unit 1** — `interrupted` EngineEvent type (foundation; nothing
   else compiles without it).
2. **Unit 2** — `SessionService.send` signal threading + interrupted
   yield/episodic write.
3. **Unit 3** — `EngineSession.send` signal threading; Claude Code
   adapter `conv.abort()` wiring.
4. **Unit 4** — IPC server passes its `controller.signal` to
   `services.session.send`.
5. **Unit 5** — `useStreamedSend` adds `thinking` + `cancel` + handles
   `interrupted` event.
6. **Unit 6** — `<ThinkingIndicator />` component.
7. **Unit 7** — Chat tab body renders the indicator when `thinking`.
8. **Unit 8** — Stop button + Esc binding.
9. **Unit 9** — UI tests.

Units 1-4 land under the **signal** story. Units 5-9 land under the
**ui** story. The two stories are mutually independent: ui story works
even without signal threading (cancel is cosmetic — iterator `return()`
fires the existing IPC abort that breaks the for-await but doesn't yet
stop the engine), and signal story works headlessly via tests even
without UI changes. Landing both completes the feature; one alone is
half a feature, not a broken one.

## Testing

### Backend tests
- `packages/core/src/__tests__/session-service.test.ts` — add a test
  where the consumer aborts mid-turn, verify one final `interrupted`
  event is yielded and persisted to the episodic log.
- `packages/engines/src/__tests__/claude-code.test.ts` — add a test
  where the signal aborts mid-turn, verify `conv.abort()` is called.

### Frontend tests
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — thinking
  state machine across the segment boundaries.
- `packages/ui/src/components/__tests__/thinking-indicator.test.tsx` —
  rendering + aria.
- `packages/ui/src/components/__tests__/chat-tab-body.test.tsx` (if
  exists, else add) — cancel button visibility + Esc handler.

## Risks

- **`conv.abort()` doesn't actually stop in-flight token generation
  for the current Anthropic API turn.** The SDK exposes abort, but
  the underlying API call may not honor an in-flight cancel cleanly —
  it might still bill for the remaining tokens of the current
  generation. Mitigation: smoke-test with a long-running turn (request
  a 1k-token essay, cancel at 100 tokens, verify the stream actually
  stops within ~1s). If the engine doesn't honor, document the gap and
  ship the UI side anyway — the user-visible behavior (output stops,
  state cleans up) is the more important half.
- **`EngineEvent` exhaustiveness errors.** Adding `interrupted` will
  break every `switch (event.type)` site. Mitigation: TypeScript surfaces
  these at `pnpm typecheck`; fix each one mechanically (most cases just
  need a no-op branch). Allow extra time for the cleanup pass.
- **Race between iterator return() and the engine's next yielded event.**
  If the consumer breaks out of `for-await` and the engine yields one
  more event before the AbortController fires, that event is discarded
  by the iterator's `return()` semantics — but the episodic write may
  still hit. Probably fine (the transcript records a yielded event),
  but verify the test that the post-abort state is internally
  consistent.

## Implementation run summary (2026-05-10)

Both child stories landed at `stage: review`. Build, typecheck, and full test
suite green (2498 tests).

- `story-epic-bootstrap-readiness-in-flight-affordances-signal` — added
  `{ type: "interrupted"; reason: "user_cancel" | "engine_abort" }` to
  `EngineEvent`; threaded optional `AbortSignal` through
  `SessionService.send` → `EngineSession.send` → `conv.abort()` in the
  Claude Code adapter; Codex + Direct adapters honor the signal natively;
  IPC server passes `controller.signal` through. Only one switch site
  needed a new case (`packages/ui/src/hooks/episodic-to-messages.ts`);
  indexer switches were already default-safe. 7 new tests.
- `story-epic-bootstrap-readiness-in-flight-affordances-ui` — `useStreamedSend`
  gained `thinking: boolean` and `cancel: () => void`; new
  `<ThinkingIndicator />` component; chat-tab-body renders the indicator
  + Stop button + Esc keybinding; `interrupted` event closes the active
  bubble and appends a `cancel-marker` item. 18 new tests.

Combined effect: a real cancel now stops the engine subprocess via
`conv.abort()`, the chat surfaces both the pending state (thinking dots)
and the cancel affordance (button + Esc), and the episodic log records
the interruption cleanly.

## Feature Review (2026-05-10)

**Verdict**: Approve

Both child stories at `done`. The brief's promised capability — "a thinking
indicator + a working cancel that actually stops the engine subprocess" — is
delivered end-to-end:

- `EngineEvent` union has `interrupted`. `SessionService.send` and
  `EngineSession.send` both accept optional `AbortSignal`. The Claude Code
  adapter wires the signal to `conv.abort()` (synchronous if pre-aborted,
  one-shot listener otherwise). Codex (`thread.runStreamed({ signal })`)
  and Direct (`streamText({ abortSignal })`) thread the signal natively.
  IPC server passes `controller.signal` through. End-to-end: a student
  Esc in the renderer → `iter.return()` → `praxis.session.send.cancel`
  → `controller.abort()` → engine subprocess stops generating.
- `useStreamedSend` exposes `thinking: boolean` + `cancel: () => void`.
  State machine: true on send start, false on first `model_message`,
  true again on `tool_result`, false on `final`/`interrupted`/`error`.
- `<ThinkingIndicator />` renders three animated dots + "Thinking" with
  `aria-live="polite"` + `aria-atomic="true"`.
- Stop button + Esc keybinding in `chat-tab-body.tsx`; `interrupted`
  event closes the open bubble and appends a `cancel-marker` line.

Per-child review nits flagged `docs/SPEC.md` doesn't yet document the
end-to-end cancel mechanism. The docs gate during release-deploy will
catch this.

Test count delta: 25 new tests (7 signal + 18 ui). Full workspace suite
2498 passing.
