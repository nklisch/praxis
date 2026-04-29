# Pattern: Async-Generator Event Stream

Every agent turn produces an ordered stream of `EngineEvent` values. The stream is an `async function*` generator that yields events to callers via `for await`.

## Rationale

`EngineEvent` is the universal protocol between engines, the core session orchestrator, and the UI. Using an `AsyncIterable<EngineEvent>` rather than callbacks or Promises lets the caller:
- Stream token-by-token to the UI without buffering
- Persist each event to episodic immediately (before the turn ends)
- Cancel mid-stream via `break` or by dropping the iterator

## Examples

### Example 1: `SessionServiceImpl.send` — the full orchestration chain
**File**: `packages/core/src/services/session-service.ts:91`
```typescript
async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
  // ... validation yields error events and returns
  yield { type: "user_message", content: message };  // echo immediately

  for await (const event of entry.handle.send(message)) {
    try {
      appendEpisodic({ ..., event });  // persist every event
    } catch (cause) {
      yield { type: "error", error: engineError("episodic.write_failed", ...) };
    }
    yield event;  // forward to UI via IPC
  }
}
```

### Example 2: `DirectEngineSession.send` — Vercel AI SDK streaming
**File**: `packages/engines/src/direct/adapter.ts`
```typescript
async *send(userMessage: string): AsyncIterable<EngineEvent> {
  this.messages.push({ role: "user", content: userMessage });
  const result = streamText({ model, system, messages: this.messages, tools, stopWhen });
  let assistantContent = "";
  for await (const part of result.fullStream) {
    const event = mapVercelPart(part, state);
    if (!event) continue;
    if (event.type === "model_message" && event.partial !== true) {
      assistantContent += event.content;
    }
    yield event;
  }
  this.messages.push({ role: "assistant", content: assistantContent });
}
```

### Example 3: `runOneShot` — convenience single-turn wrapper
**File**: `packages/engines/src/types.ts:12`
```typescript
export async function* runOneShot(
  engine: Engine,
  opts: EngineOpenOptions,
  userMessage: string,
): AsyncGenerator<EngineEvent, void, void> {
  const session = await engine.open(opts);
  try {
    yield* session.send(userMessage);  // forward the entire inner stream
  } finally {
    await session.close();
  }
}
```

## When to Use

- Any function that produces a sequence of engine events over time
- When the caller needs to observe events as they arrive (streaming to UI, persisting in real time)
- When the implementation drives a loop internally (e.g., multi-step tool calls)

## When NOT to Use

- When you have a single result (return a `Promise<T>` instead)
- When callers always need the complete array before acting (use `Array.from(stream)` at the callsite, not a generator)

## Common Violations

- Buffering all events and yielding them at the end — defeats streaming; use a `Promise` returning an array instead
- Mixing `throw` and `yield { type: "error" }` — errors that occur during iteration should be yielded as `error` events so the caller can continue handling the stream cleanly; only throw for pre-iteration setup failures
- Forgetting `yield*` when delegating to a nested generator — must use `yield*` not `for await ... yield` to preserve the return value
