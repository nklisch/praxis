# Pattern: Engine Session Lifecycle

`Engine.open(opts)` returns an `EngineSession`. Send messages with `session.send(msg)` — returns an `AsyncIterable<EngineEvent>`. Tear down with `session.close()` when the Praxis session ends or the engine is swapped.

## Rationale

Engines are stateful across turns: Claude Code holds a live `Conversation`, Codex holds a live `Thread`, Direct holds an in-memory `messages[]`. The lifecycle pattern keeps that state in the adapter where it belongs while the framework manages when sessions open, persist across turns, and close. A session is scoped to one Praxis session — engine swap mid-session closes the old and opens a new one seeded with prior turns from episodic.

## Examples

### Example 1: `ClaudeCodeEngine.open` — SDK Conversation + MCP bridge
**File**: `packages/engines/src/claude-code/adapter.ts`
```typescript
export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    const bridge = openOpts.tools.list().length > 0
      ? await startToolBridge({ registry: openOpts.tools }) : null;
    const conv = createConversation({
      ...(this.modelHint() !== undefined && { model: this.modelHint() }),
      systemPrompt: openOpts.systemPrompt,
      mcpServers: bridge ? { [bridge.serverName]: { type: "stdio", ... } } : {},
    });
    const sessionId = await conv.sessionId.catch(() => `cc-${Date.now()}`);
    const seedPreface = buildTranscriptPreface(openOpts.priorTurns ?? []);
    return new ClaudeCodeEngineSession({ id: sessionId, conv, bridge, seedPreface });
  }
}
```

### Example 2: `ClaudeCodeEngineSession.send` — seed on first call, native on subsequent, signal-aware
**File**: `packages/engines/src/claude-code/adapter.ts`
```typescript
async *send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
  if (this.closed) {
    yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
    return;
  }
  const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
  this.seedPreface = "";  // clear after first send — subsequent sends are native
  const turn = this.conv.send(message);
  // Adapter wires `signal` to its SDK's abort: when fired, the SDK terminates
  // the turn and the framework synthesises an `interrupted` event upstream.
  signal?.addEventListener("abort", () => this.conv.abort(), { once: true });
  for await (const event of turn) {
    const mapped = mapClaudeCodeEvent(event, { serverName: this.bridge?.serverName ?? "praxis" });
    if (mapped) yield mapped;
  }
}
```

### Cancellation contract

`send(userMessage, signal?)` accepts an optional `AbortSignal` and wires it to the adapter's SDK abort mechanism. When the signal fires mid-turn, the adapter terminates its internal loop and `SessionServiceImpl.send` yields a synthetic `{ type: "interrupted", reason: "user_cancel" }` event as the final event for the turn (no `final` follows). Adapter-initiated aborts (e.g. an SDK-level error path that calls `conv.abort()` without a client-side signal) surface as `reason: "engine_abort"`. All three engine adapters implement this; tests stub it out via `FakeEngine`.

### Example 3: `SessionServiceImpl.openActive` — framework-side lifecycle management
**File**: `packages/core/src/services/session-service.ts`
```typescript
private async openActive(args: { sessionId, engineId, mode, studentId, priorTurns }): Promise<ActiveEntry> {
  const engine = factory(engineConfig, { log });
  const handle = await engine.open({
    systemPrompt,
    tools,
    ...(args.priorTurns.length > 0 && { priorTurns: args.priorTurns }),
  });
  const entry: ActiveEntry = { sessionId, engineId, mode, handle, engine };
  this.active.set(args.sessionId, entry);
  return entry;
}
// On engine swap: await entry.handle.close(); this.active.delete(sessionId);
```

## When to Use

- All engine adapters implement this lifecycle — always `open()` then `send()` then `close()`
- Seed the session with `priorTurns` only when continuing an existing Praxis session (engine swap, process restart) — first turn of a brand-new session leaves `priorTurns` undefined

## When NOT to Use

- Don't call `engine.open()` just to run one message — use `runOneShot(engine, opts, message)` which wraps open/send/close as a convenience
- Don't hold `EngineSession` across Praxis sessions — each Praxis session gets exactly one EngineSession

## Common Violations

- Forgetting `await session.close()` in a `finally` block — leaves SDK conversations / MCP bridge subprocesses dangling
- Calling `session.send()` after `session.close()` — all session implementations check `this.closed` and yield an error event; don't rely on the adapter to catch this at the framework level
- Not seeding with `priorTurns` on engine swap — the new engine won't know prior context; always load from `loadConversationHistory(db, sessionId)` before opening
