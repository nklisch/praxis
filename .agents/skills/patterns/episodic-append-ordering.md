# Pattern: Episodic Append Ordering

Within a single turn: **record user message → yield user_message event → iterate engine events → append each engine event immediately → yield each engine event**. The user message is always appended to episodic before the engine runs.

## Rationale

Episodic is the immutable source of truth for the entire conversation. If the process crashes mid-turn, the user message and any events that had been persisted survive. `turnIndex` monotonically increases so later event loading (`loadConversationHistory`) can reconstruct turns in order.

## Examples

### Example 1: `SessionServiceImpl.send` — the canonical ordering
**File**: `packages/core/src/services/session-service.ts:177`
```typescript
async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
  // ...guard checks...
  const turnIndex = nextTurnIndex(this.deps.db, sessionId);  // max(turnIndex)+1

  // 1. Persist user message FIRST (before engine runs)
  recordUserMessage({ db, sessionId, studentId, engineId, modeId, turnIndex, content: message });
  // 2. Echo to UI immediately (don't wait for engine)
  yield { type: "user_message", content: message };

  // 3. Drive engine session — persist every event as it arrives
  for await (const event of entry.handle.send(message)) {
    try {
      appendEpisodic({ db, sessionId, studentId, engineId, modeId, turnIndex, event });
    } catch (cause) {
      yield { type: "error", error: engineError("episodic.write_failed", ..., { cause }) };
      // non-fatal: keep draining the engine stream even if persistence failed
    }
    yield event;  // forward to UI after persisting
  }
}
```

### Example 2: `appendEpisodic` — the low-level append
**File**: `packages/core/src/session/episodic.ts:19`
```typescript
export function appendEpisodic(input: AppendEpisodicInput): string {
  const id = uuidv7();
  input.db.insert(episodicEvents).values({
    id,
    sessionId: input.sessionId,
    studentId: input.studentId,
    ts: input.ts ?? new Date(),
    engineId: input.engineId,
    modeId: input.modeId,
    turnIndex: input.turnIndex,
    eventJson: input.event,  // full EngineEvent JSON
  }).run();
  return id;
}
```

### Example 3: `nextTurnIndex` — monotonically increasing turn index
**File**: `packages/core/src/session/episodic.ts`
```typescript
export function nextTurnIndex(db: PraxisDb, sessionId: string): number {
  const row = db.select({ maxTurn: max(episodicEvents.turnIndex) })
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, sessionId)).get();
  const current = row?.maxTurn ?? null;
  return current === null ? 0 : current + 1;
}
```

## When to Use

- Any new turn-like interaction that should appear in the conversation history must follow this ordering
- `recordUserMessage` (which calls `appendEpisodic` with `{ type: "user_message" }`) must be called before the engine session's `send()` is invoked

## When NOT to Use

- Don't call `appendEpisodic` after the fact (e.g., buffering all events then persisting at turn end) — crash-safety requires per-event persistence

## Common Violations

- Calling `engine.open()` or `session.send()` before `recordUserMessage` — breaks `loadConversationHistory` which expects a `user_message` event at the start of each turn
- Swallowing episodic write errors — persist failures should yield an `error` event to the UI and continue draining the engine stream; DON'T stop the turn or re-throw
