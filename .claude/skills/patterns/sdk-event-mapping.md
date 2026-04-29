# Pattern: SDK Event Mapping

Each engine adapter exports a `map*Event(sdkEvent, context)` function that translates SDK-native events into normalized `EngineEvent` values. Returns `null` for events with no meaningful projection (e.g., lifecycle noise).

## Rationale

The three SDKs (Vercel AI, Claude Code, Codex) each have their own event shapes and streaming granularity. Centralizing the translation into a dedicated mapper per adapter keeps the adapter's `send()` method clean and makes the normalization logic independently testable.

## Examples

### Example 1: `mapVercelPart` — Vercel AI SDK fullStream parts
**File**: `packages/engines/src/direct/events.ts`
```typescript
export function mapVercelPart(
  part: unknown,
  state: { textBuf: string },
): EngineEvent | null {
  const p = part as Record<string, unknown> & { type: string };
  switch (p.type) {
    case "text-delta":
      state.textBuf += String(p.delta ?? "");
      return { type: "model_message", content: String(p.delta ?? ""), partial: true };
    case "text-end":
      const full = state.textBuf;
      state.textBuf = "";
      return { type: "model_message", content: full, partial: false };
    case "tool-call":
      return { type: "tool_call", toolName: String(p.toolName), args: p.input, callId: String(p.toolCallId) };
    case "finish":
      return { type: "final", usage: { inputTokens: Number(p.totalUsage?.inputTokens ?? 0), ... } };
    default:
      return null;  // start, start-step, reasoning, etc. — not projected
  }
}
```

### Example 2: `mapClaudeCodeEvent` — Claude Code SDK StreamEvents
**File**: `packages/engines/src/claude-code/events.ts`
```typescript
export function mapClaudeCodeEvent(event: unknown, ctx: { serverName: string }): EngineEvent | null {
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "assistant":
      const delta = (e.delta as string | undefined) ?? "";
      if (delta) return { type: "model_message", content: delta, partial: true };
      return { type: "model_message", content: (e.text as string) ?? "", partial: false };
    case "tool_use":
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(String(e.toolName), ctx.serverName),  // strips "mcp__praxis__" prefix
        args: e.toolInput,
        callId: String(e.toolId),
      };
    case "result":
      return { type: "final", usage: { inputTokens: ..., outputTokens: ... } };
    case "system": return null;  // init metadata — not projected
  }
}
```

### Example 3: `mapCodexEvent` — Codex SDK ThreadEvents
**File**: `packages/engines/src/codex/events.ts`
```typescript
export function mapCodexEvent(
  event: unknown, ctx: { serverName: string }, state: MapState, itemIndex: { value: number },
): EngineEvent[] {
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "item.completed":  return mapItemCompleted(e.item, ctx, state, itemIndex);
    case "turn.completed":  return [{ type: "final", usage: { inputTokens: ..., outputTokens: ... } }];
    case "turn.failed":     return [{ type: "error", error: engineError("engine.turn_failed", ...) }];
    default:                return [];  // thread.started, turn.started, item.started/updated — noise
  }
}
// Codex returns [] or EngineEvent[] (not null) because one item.completed can produce tool_call + tool_result
```

## When to Use

- When adding a new engine adapter — write a `map*Event` function in `src/{adapter-name}/events.ts`
- Keep the mapper free of I/O — it receives event data and returns normalized events; no async, no dispatch

## When NOT to Use

- Don't inline mapping logic inside the `send()` method — keep it in a dedicated events file for testability

## Common Violations

- Returning `null` from Codex mapper (it returns `EngineEvent[]`) — the three mappers have slightly different signatures because Codex can produce multiple events per SDK event
- Forgetting to strip the MCP prefix on Claude Code tool names (`mcp__praxis__tool.name`) — the `stripMcpPrefix` helper in `claude-code/events.ts` handles this; call it on every `tool_use.toolName`
- Projecting `tool_result` events in Direct adapter via the mapper when the Vercel SDK handles tool execution internally — the `tool-result` SDK part arrives from Vercel's internal execution, not from `registry.dispatch`
