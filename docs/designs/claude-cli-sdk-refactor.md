# Design: `@praxis/claude-cli-sdk` surface refactor

## Overview

Eight refactors that tighten the SDK's surface against how Praxis actually consumes it. Praxis is the only consumer, so the SDK can be modified freely; this design moves the SDK from "faithful CLI wrapper" toward "API shaped for our adapter."

The unifying themes:
- **Push work into the SDK** so the engine adapter is thin (units 1, 2, 4, 5, 6).
- **Tighten loose types** that force defensive coercion downstream (units 1, 8).
- **Delete unused surface** that's lived since the upstream fork (unit 3).
- **Encode our deployment assumptions** in the SDK's defaults instead of a comment in the adapter (unit 7).

The goal at the end: `events.ts` has zero `as` casts on SDK-provided fields, `adapter.ts` has zero workaround comments, and the SDK's `index.ts` exports only what Praxis uses.

## Implementation Units

### Unit 1: Tighten `mapClaudeCodeEvent` signature to typed `StreamEvent`

**File**: `packages/engines/src/claude-code/events.ts`

Today the function accepts `unknown` and casts to `Record<string, unknown> & { type: string }`, then individual fields are coerced (`String()`, `Number()`, `as string | undefined`) on every read. The events come from `Turn` (already typed `AsyncIterable<StreamEvent>`), so the loose typing is purely defensive.

```typescript
import type { StreamEvent } from "@praxis/claude-cli-sdk";

export interface MapStreamEventInput {
  serverName: string;
  log?: { warn: (msg: string, fields?: Record<string, unknown>) => void };
}

/**
 * Map a Claude Code SDK StreamEvent to a Praxis EngineEvent. Returns null
 * for events with no useful projection (system.init, allowed-rate-limit).
 */
export function mapClaudeCodeEvent(
  event: StreamEvent,
  ctx: MapStreamEventInput,
): EngineEvent | null {
  switch (event.type) {
    case "system":
      return null;
    case "assistant": {
      const delta = event.delta ?? "";
      if (delta) return { type: "model_message", content: delta, partial: true };
      return { type: "model_message", content: event.text ?? "", partial: false };
    }
    case "tool_use":
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(event.toolName, ctx.serverName),
        args: event.toolInput,
        callId: event.toolId,
      };
    case "tool_result": {
      // event.value is already structured (SDK extracts MCP text + JSON-parses).
      const isError = Boolean(event.isError);
      const result: ToolResult = isError
        ? {
            ok: false,
            error: {
              code: "tool.sdk_reported_error",
              message:
                typeof event.value === "string"
                  ? event.value
                  : JSON.stringify(event.value ?? null),
              recoverable: false,
            },
          }
        : { ok: true, value: event.value, tier: "deterministic" };
      return { type: "tool_result", callId: event.toolId ?? "", result };
    }
    case "result": {
      const usage = event.usage ?? { inputTokens: 0, outputTokens: 0 };
      return {
        type: "final",
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          ...(usage.cacheReadTokens !== undefined && { cacheReadTokens: usage.cacheReadTokens }),
          ...(usage.cacheWriteTokens !== undefined && {
            cacheWriteTokens: usage.cacheWriteTokens,
          }),
        },
        finalReason: mapResultSubtype(event.subtype),
        ...(event.subtype !== "success" &&
          event.error !== undefined && { errorMessage: event.error }),
      };
    }
    case "rate_limit_event":
      // existing logic, no casts needed once event is typed
    default:
      return null;
  }
}
```

**Implementation Notes**:
- `StreamEvent` is already exported from the SDK; this is a consumer-side change only.
- The default branch handles future SDK event types — keep it for forward compat.
- `mapResultSubtype`'s signature changes from `(string | undefined)` to the typed enum union (depends on Unit 8).

**Acceptance Criteria**:
- [ ] `events.ts` contains zero `as ` casts on event fields.
- [ ] `events.ts` contains zero `String(...)` / `Number(...)` coercions on event fields.
- [ ] `mapClaudeCodeEvent`'s parameter type is `StreamEvent`, not `unknown`.
- [ ] `pnpm typecheck` passes.
- [ ] All existing `claude-code-events.test.ts` cases still pass after their input objects are typed correctly.

---

### Unit 2: Drop adapter's dead `result.resultEvent` defensive check

**File**: `packages/engines/src/claude-code/adapter.ts`

`TurnResult.resultEvent: ResultEvent` is already non-optional in the SDK type. The adapter's `if (!result.resultEvent) { synthesize final }` branch at lines 162-169 is dead code that signals mistrust without serving any purpose.

```typescript
async *send(userMessage: string): AsyncIterable<EngineEvent> {
  if (this.closed) {
    yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
    return;
  }
  const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
  this.seedPreface = "";

  const turn = this.conv.send(message);
  for await (const event of turn) {
    const mapped = mapClaudeCodeEvent(event, { serverName: this.serverName });
    if (mapped) yield mapped;
  }

  // Drain `turn.result` so unhandled rejection isn't logged. The final event
  // already flowed through the stream above (the SDK guarantees a result
  // event ends every turn — see Conversation contract in the SDK).
  await turn.result.catch(() => {});
}
```

**Implementation Notes**:
- Keep the `await turn.result` — drains pending rejection. Drop the synthesized-final branch.
- Update the comment to reference the SDK contract instead of describing a workaround.

**Acceptance Criteria**:
- [ ] No call site constructs a synthetic `{ type: "final", usage: { inputTokens: 0, outputTokens: 0 } }` from the adapter.
- [ ] `turn.result`'s promise is still awaited (or `.catch(() => {})`-d) so `unhandledRejection` doesn't fire.
- [ ] All existing claude-code adapter tests pass.

---

### Unit 3: Delete unused SDK exports

**Files**: Multiple — see file list below.

Confirmed unused outside the SDK itself (`grep -r '@praxis/claude-cli-sdk'` excluding the SDK source):

- `discover.ts` — `discoverTools`, `computeDisallowedTools`, `DiscoverOptions`, `DiscoverResult`
- `extensions/` directory — `buildPlugin`, `buildSettings`, `buildSkill`, `writePlugin`, `writePluginToTemp`, `toolPattern`, all `*Config` and `Generated*` types, `HookEvent`, `HookHandler`, `HookMatcher`
- `interactive-tools.ts` — `InteractiveTool`, `askUserQuestionHandler`, `sendUserMessageHandler`, `InteractiveToolName`

Praxis-used exports (verified via grep — keep):
- Auth: `authLogin`, `authStatus`, `ClaudeAuthLoginEvent`, `ClaudeAuthLoginOptions`, `ClaudeAuthStatus`
- Conversation: `createConversation`, `Conversation`, `ToolResultContent`, `Turn`, `TurnResult`, `ConversationOptions`
- Query: `query`, `Query`
- Tool registration: `tool`, `startToolServer`, `ToolDefinition`, `ToolHandler`, `ToolHandlerResult`, `ToolResult`, `ToolServerHandle`
- Structured output: `collectResult`, `zodToOutputFormat` (used by vision tests)
- Errors: `CLIError`, `CLINotFoundError`, `CLITimeoutError`, `InvalidOptionError`, `StructuredOutputError`
- Events: `StreamEvent`, `ResultEvent`, `ToolResultEvent`, `ToolUseEvent`, `RateLimitEvent`, `RateLimitInfo`, `SystemInitEvent`, `AssistantTextEvent`, `TokenUsage`, `ModelUsageEntry`
- Options: `Options`, `OptionsBase`, `PermissionMode`, `ToolControl`, `ToolFilter`, `McpServer*Config`, `McpServerStatus`, `ModelAlias`, `JsonSchemaOutputFormat`, `AgentDefinition`, `UUID`
- Helpers: `isUUID`, `uuid`

Delete:
- `packages/claude-cli-sdk/src/discover.ts`
- `packages/claude-cli-sdk/src/extensions/` (entire directory)
- `packages/claude-cli-sdk/src/interactive-tools.ts`

Update `packages/claude-cli-sdk/src/index.ts` to remove all references to the deleted modules.

Check `packages/claude-cli-sdk/src/types/options.ts` for transitive types (`DiscoverOptions`, extension-config types) and remove. Check `Options` / `ConversationOptions` for fields that reference deleted types and remove them too.

`structured.ts`: keep `query`, `collectResult`, `zodToOutputFormat`. Verify whether `parseStructuredOutput` is used; if not, drop.

**Implementation Notes**:
- Run `pnpm typecheck` after each file deletion to surface transitive references.
- The SDK's own internal references to deleted exports get cleaned up — e.g. if `Options` had a `discover?: DiscoverOptions` field, drop it.
- `pnpm test` confirms nothing in Praxis silently depended on a deleted export through a re-export chain.

**Acceptance Criteria**:
- [ ] Files listed above no longer exist.
- [ ] `index.ts` has no exports that reference deleted modules.
- [ ] `grep -r 'discoverTools\|InteractiveTool\|buildPlugin\|askUserQuestion' packages/` returns zero matches outside test snapshots / git history.
- [ ] `pnpm typecheck` and `pnpm test` pass.

---

### Unit 4: `onSessionReady` callback for eager session id

**File**: `packages/claude-cli-sdk/src/conversation.ts` (and `types/options.ts`)

`Conversation.sessionId` is a `Promise<string>` that resolves on first send. The Praxis adapter can't `await` it inside `Engine.open` (would hang forever before the first send), so it currently synthesizes `claude-code-${Date.now()}` and never wires the real CLI session id into log bindings.

Add a callback option that fires synchronously with the real id when the CLI's `init` event lands:

```typescript
// types/options.ts (within ConversationOptions / OptionsBase as appropriate)
export interface ConversationOptions extends OptionsBase {
  // ... existing fields ...
  /**
   * Called once when the CLI emits its `init` event with the real session ID.
   * Fires inside the first turn — before any user-visible events flow. Use
   * this to wire the real session id into your logger bindings without
   * having to await `conversation.sessionId` (which would deadlock at open
   * time, before any send).
   */
  onSessionReady?: (sessionId: string) => void;
}
```

In `conversation.ts`'s line handler dispatch:

```typescript
// Inside createConversation, where init event is parsed:
if (event.type === "system" && event.subtype === "init") {
  sessionId.resolve(event.sessionId);
  options.onSessionReady?.(event.sessionId); // NEW
}
```

Adapter usage in `packages/engines/src/claude-code/adapter.ts`:

```typescript
async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
  // ... existing setup ...
  let realSessionId: string | undefined;
  conv = createConversation({
    // ... existing options ...
    onSessionReady: (id) => {
      realSessionId = id;
      this.opts.deps.log.info("engine.claude-code.session_ready", { sessionId: id });
    },
  });

  // synthesized id used only as initial placeholder; real id surfaces via the callback
  const placeholderId = `claude-code-${Date.now()}`;

  return new ClaudeCodeEngineSession({
    id: placeholderId,
    getRealId: () => realSessionId, // optional accessor, used by `id` getter
    conv,
    /* ... */
  });
}
```

`ClaudeCodeEngineSession` exposes `id` as a getter that prefers `getRealId()` when set:

```typescript
class ClaudeCodeEngineSession implements EngineSession {
  private readonly placeholderId: string;
  private readonly getRealId: () => string | undefined;

  constructor(init: ClaudeCodeSessionInit) {
    this.placeholderId = init.id;
    this.getRealId = init.getRealId;
    // ... rest ...
  }

  get id(): string {
    return this.getRealId() ?? this.placeholderId;
  }
}
```

**Implementation Notes**:
- The callback runs synchronously inside the SDK's line handler — keep it cheap (assignment + log).
- Don't break the existing `conversation.sessionId` Promise contract; both paths coexist.
- Praxis log records start with the placeholder id and switch to the real id after the first turn — acceptable for diagnostics.

**Acceptance Criteria**:
- [ ] `ConversationOptions.onSessionReady` is typed and exported.
- [ ] `onSessionReady` fires exactly once per conversation, with the real session id, before any tool_call or assistant event.
- [ ] Adapter's `EngineSession.id` returns the real CLI session id once available.
- [ ] New SDK test: `onSessionReady` fires with the parsed session id from a fixture init event.
- [ ] Adapter test: after the first turn, `session.id` returns a UUID-shaped string (not `claude-code-<timestamp>`).

---

### Unit 5: `priorTurns` as a structured `ConversationOptions` field

**Files**: `packages/claude-cli-sdk/src/types/options.ts`, `packages/claude-cli-sdk/src/conversation.ts`, `packages/engines/src/claude-code/adapter.ts`, `packages/engines/src/util/transcript.ts`

Today the adapter encodes prior turns as a text preface that's spliced onto the first user message. The mechanism stays the same on the wire (the CLI doesn't have a structured "prior turns" parameter), but the **API** moves into the SDK so the adapter doesn't carry the splice logic.

```typescript
// types/options.ts
export interface PriorTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationOptions extends OptionsBase {
  // ... existing fields ...
  /**
   * Prior conversation turns to seed the model's context on the first send.
   * The SDK formats them as a transcript preface attached to the first user
   * message — the model reads them as conversation history. Subsequent sends
   * don't re-attach them.
   *
   * Use this when restoring a session after an engine swap or a process
   * restart. Empty array is equivalent to `undefined`.
   */
  priorTurns?: ReadonlyArray<PriorTurn>;
}
```

In `conversation.ts`, on first `send()`:

```typescript
let firstSendDone = false;

function send(content: string): Turn {
  let body = content;
  if (!firstSendDone && options.priorTurns && options.priorTurns.length > 0) {
    body = formatTranscriptPreface(options.priorTurns) + content;
  }
  firstSendDone = true;
  // ... existing turn creation with `body` ...
}

function formatTranscriptPreface(turns: ReadonlyArray<PriorTurn>): string {
  // Same shape that's currently in @praxis/engines/src/util/transcript.ts;
  // copied here so the SDK is self-contained.
  const lines: string[] = [
    "Previous conversation (for context — do not respond to these):",
    "",
  ];
  for (const t of turns) {
    lines.push(`${t.role === "user" ? "User" : "Assistant"}: ${t.content}`);
    lines.push("");
  }
  lines.push("--- Continue from here ---", "");
  return lines.join("\n");
}
```

Adapter changes:

```typescript
// packages/engines/src/claude-code/adapter.ts
async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
  // ... existing setup ...
  conv = createConversation({
    // ... existing options ...
    ...(openOpts.priorTurns && openOpts.priorTurns.length > 0 && {
      priorTurns: openOpts.priorTurns.map((t) => ({
        role: t.role === "user" ? "user" : "assistant",
        content: t.content,
      })),
    }),
  });
  // No more seedPreface, no more buildTranscriptPreface call here.
}
```

Delete (or simplify to re-export from the SDK):
- `packages/engines/src/util/transcript.ts` — `buildTranscriptPreface` has one caller, which is being removed.

**Implementation Notes**:
- Keep `formatTranscriptPreface` private to the SDK (unexported). The function is one place; if Praxis ever needs the transcript text directly, expose it then.
- Existing `engine-session-lifecycle` pattern says priorTurns are seeded only on engine swap/restart; semantics don't change — only the API moves.
- The SDK doesn't change wire behavior: it still produces the same `--input-format stream-json` user message that the CLI consumes.

**Acceptance Criteria**:
- [ ] `ConversationOptions.priorTurns` is typed and accepted.
- [ ] When `priorTurns` is provided, the first `send()` sends a message that contains both the formatted preface and the user's content.
- [ ] When `priorTurns` is empty or absent, the first `send()` sends only the user's content.
- [ ] Subsequent sends (turn 2+) never re-include the preface.
- [ ] `buildTranscriptPreface` is no longer called from `claude-code/adapter.ts`.
- [ ] New SDK test: priorTurns content appears in the wire message captured from the first send; absent on the second send.

---

### Unit 6: Optional `outputSchema` on `tool()` for handler-result validation

**Files**: `packages/claude-cli-sdk/src/tools.ts`, `packages/claude-cli-sdk/src/types/tools.ts`, `packages/claude-cli-sdk/src/tool-server.ts`

Today `tool()` validates input via Zod but treats handler returns as `unknown`. A buggy handler returning the wrong shape silently sends garbage to the model. With Praxis's growing tool registry (40+ tools), output validation catches drift early.

```typescript
// types/tools.ts
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  /**
   * Optional Zod schema for the handler's `value` on success. When set, the
   * SDK validates handler returns at the wire boundary and returns
   * `{ success: false, error: "..." }` on failure instead of forwarding a
   * malformed value to the model.
   */
  outputSchema?: z.ZodType<TOutput>;
  handler: (input: TInput) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>;
}

export type ToolResult<TOutput = unknown> =
  | { success: true; value: TOutput }
  | { success: false; error: string };
```

```typescript
// tools.ts
export function tool<TInput, TOutput = unknown>(
  name: string,
  description: string,
  inputSchema: z.ZodType<TInput>,
  handler: (input: TInput) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>,
  outputSchema?: z.ZodType<TOutput>,
): ToolDefinition<TInput, TOutput> {
  return outputSchema
    ? { name, description, inputSchema, handler, outputSchema }
    : { name, description, inputSchema, handler };
}
```

In `tool-server.ts`'s `handleToolCall`, after the handler runs:

```typescript
// inside handleToolCall, after `const result = await handler(msg.input);`
if (result.success && tool.outputSchema) {
  const parsed = tool.outputSchema.safeParse(result.value);
  if (!parsed.success) {
    const errResult: ToolResult = {
      success: false,
      error: `tool "${tool.name}" returned a value that failed its outputSchema: ${parsed.error.message}`,
    };
    conn.write(JSON.stringify({ id: msg.id, result: errResult }) + "\n");
    return;
  }
  // `parsed.data` is the validated value; pass it through.
  conn.write(JSON.stringify({ id: msg.id, result: { success: true, value: parsed.data } }) + "\n");
  return;
}
conn.write(JSON.stringify({ id: msg.id, result }) + "\n");
```

`packages/engines/src/mcp/tool-bridge.ts` doesn't need to change — `outputSchema` is opt-in and existing bridge calls don't pass one.

**Implementation Notes**:
- Praxis tools already have a Zod `output` schema (`ToolDefinition.output` in `@praxis/core/types`). Future work: thread that into `tool-bridge.ts` so SDK output validation matches Praxis tool contracts. **Out of scope for this design** — that's a follow-on once this option exists.
- Validation runs at the wire boundary (worker side), not in the handler — handler can construct any shape; the schema is the gate.
- `parsed.data` is what flows on; don't pass `result.value` through after validation.

**Acceptance Criteria**:
- [ ] `tool()` accepts an optional 5th argument `outputSchema`.
- [ ] When `outputSchema` is set, a handler returning a value that fails the schema produces a `{ success: false, error }` result with a message containing `"failed its outputSchema"`.
- [ ] When `outputSchema` is absent, behavior is identical to today.
- [ ] When validation passes, the parsed (possibly-coerced-by-Zod) value is what flows on, not the original.
- [ ] New SDK test in `tool-server.test.ts` (create if missing): output validation rejects bad shape, accepts good shape.

---

### Unit 7: Default `permissionMode` when `mcpServers` is set

**File**: `packages/claude-cli-sdk/src/conversation.ts`

The CLI's default `permissionMode` is `"default"`, which prompts on every tool call and silently fails when no human is present. Praxis sets `"bypassPermissions"` with a long comment explaining this is correct because all MCP tools are first-party Praxis tools the user opted into by running the app.

Encode that decision in the SDK: when `mcpServers` is provided AND `permissionMode` is not, default to `"bypassPermissions"`. The deployment context (programmatic SDK consumer with first-party MCP tools) is the SDK's concern, not every adapter's.

```typescript
// In createConversation or buildConversationArgs:
function resolvePermissionMode(options: ConversationOptions): PermissionMode {
  if (options.permissionMode) return options.permissionMode;
  // When the caller registers MCP tools, they're explicitly enabling
  // programmatic tool dispatch — there's no human at the CLI to answer
  // permission prompts. Default to bypass so MCP tools actually run.
  // Callers can still set permissionMode explicitly to opt out.
  if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
    return "bypassPermissions";
  }
  return "default";
}
```

Adapter changes (`packages/engines/src/claude-code/adapter.ts`): drop the explicit `permissionMode: "bypassPermissions"` and the comment block at lines 53-60. The default kicks in because we always pass `mcpServers`.

**Implementation Notes**:
- Document the default in `ConversationOptions.permissionMode` JSDoc.
- This is a behavior change: previously calling `createConversation({ mcpServers })` without `permissionMode` got `"default"` mode. Audit other callers — `query()` and any test stubs — and update if anyone relied on the old default. Praxis itself always set it explicitly, so internal impact is zero.

**Acceptance Criteria**:
- [ ] When `mcpServers` is set and `permissionMode` is omitted, the resolved mode is `"bypassPermissions"`.
- [ ] When `permissionMode` is explicit, the resolved mode is whatever was passed.
- [ ] When `mcpServers` is absent, the resolved mode is `"default"`.
- [ ] Adapter no longer passes `permissionMode` explicitly (and the comment block is gone).
- [ ] New SDK test in `conversation.test.ts` (or extend existing): asserts the three resolution cases above.
- [ ] `pnpm dev` end-to-end: bootstrap mode tool calls succeed without the explicit option.

---

### Unit 8: Make `ResultEvent.subtype` non-nullable + tighten parser

**Files**: `packages/claude-cli-sdk/src/types/events.ts`, `packages/claude-cli-sdk/src/cli/schemas.ts`, `packages/claude-cli-sdk/src/cli/parser.ts`, `packages/engines/src/claude-code/events.ts`

`ResultEvent.subtype` is required in `RawResultSchema` (`.enum([...]).catch("error_during_generation")`), so it always parses to a known string. The TS type already declares it required: `subtype: "success" | "error_max_turns" | "error_during_generation" | "error_interrupted"`.

The remaining looseness is in `mapResultSubtype` in the adapter, which has a `subtype === undefined` branch even though the type says it can't be undefined:

```typescript
// packages/engines/src/claude-code/events.ts — current (loose)
function mapResultSubtype(
  subtype: string | undefined,
): "success" | "max_turns" | "generation_error" | "interrupted" {
  switch (subtype) {
    // ... cases ...
    default:
      return subtype === undefined ? "success" : "generation_error";
  }
}
```

Tighten:

```typescript
import type { ResultEvent } from "@praxis/claude-cli-sdk";

function mapResultSubtype(
  subtype: ResultEvent["subtype"],
): "success" | "max_turns" | "generation_error" | "interrupted" {
  switch (subtype) {
    case "success": return "success";
    case "error_max_turns": return "max_turns";
    case "error_interrupted": return "interrupted";
    case "error_during_generation": return "generation_error";
    default: {
      const _exhaustive: never = subtype;
      throw new Error(`unhandled ResultEvent subtype: ${String(_exhaustive)}`);
    }
  }
}
```

**Implementation Notes**:
- The `never` exhaustiveness check fails compile if a new subtype is added without updating the switch.
- No SDK type change needed — the type was already correct; just the adapter was tolerating impossible cases.
- Combine with Unit 1: once `event` is typed `StreamEvent`, calling `mapResultSubtype(event.subtype)` is type-safe with no cast.

**Acceptance Criteria**:
- [ ] `mapResultSubtype` parameter is `ResultEvent["subtype"]`, not `string | undefined`.
- [ ] The default branch uses `_exhaustive: never` for compile-time exhaustiveness.
- [ ] The `subtype === undefined ? "success" : "generation_error"` branch is gone.
- [ ] Existing tests pass without modification.

---

## Implementation Order

Order chosen to minimize blast radius and let each unit's tests stand alone:

1. **Unit 8** — tighten subtype mapping (small, contained, no API change).
2. **Unit 1** — adapter signature tightening (depends on 8 for the `mapResultSubtype` parameter type).
3. **Unit 2** — drop dead defensive code (depends on 1 to confirm we trust the types).
4. **Unit 7** — `permissionMode` default (independent SDK change; isolates a single behavior).
5. **Unit 3** — delete unused exports (mechanical, contained, but wider blast radius).
6. **Unit 4** — `onSessionReady` callback (additive SDK API).
7. **Unit 5** — `priorTurns` as structured option (additive SDK API + adapter cleanup).
8. **Unit 6** — `outputSchema` on `tool()` (additive SDK API; most invasive — last).

Each unit gets its own commit (or two — design + tests, code) so a regression can be bisected to a single concern.

## Testing

### Unit 1: `packages/engines/src/__tests__/claude-code-events.test.ts`

Existing tests already pass typed event objects matching the new signature — they should pass unchanged once the function accepts `StreamEvent`. Verify by running. Add no new tests.

### Unit 2: `packages/engines/src/__tests__/claude-code.test.ts` (or wherever adapter is tested)

If there's an existing test that relied on the synthesized-final fallback, delete it (it asserts dead code). Otherwise no test changes.

### Unit 3: New tests not needed; verify by `pnpm typecheck && pnpm test`.

### Unit 4: `packages/claude-cli-sdk/src/__tests__/conversation-callbacks.test.ts` (NEW)

```typescript
describe("onSessionReady", () => {
  it("fires exactly once with the parsed session id from the init event");
  it("does not fire when no init event arrives");
  it("does not block conversation.sessionId resolution");
});
```

Plus an adapter-side test:

```typescript
describe("ClaudeCodeEngineSession.id", () => {
  it("returns the real CLI session id after the first turn (not the placeholder)");
});
```

### Unit 5: `packages/claude-cli-sdk/src/__tests__/conversation-prior-turns.test.ts` (NEW)

```typescript
describe("priorTurns option", () => {
  it("prepends a transcript preface to the first send when priorTurns is non-empty");
  it("does not prepend anything when priorTurns is empty or undefined");
  it("does not re-prepend on subsequent sends");
});
```

Capture the string written to the CLI's stdin in a `MockChildProcess` fixture and assert the preface presence.

### Unit 6: `packages/claude-cli-sdk/src/__tests__/tool-server-output-schema.test.ts` (NEW)

```typescript
describe("tool() outputSchema", () => {
  it("validates handler return values when outputSchema is set");
  it("returns { success: false, error } when validation fails");
  it("forwards Zod-parsed value (not the original) on success");
  it("does not validate when outputSchema is absent");
});
```

### Unit 7: extend `packages/claude-cli-sdk/src/__tests__/conversation.test.ts` (or create)

```typescript
describe("permissionMode resolution", () => {
  it("defaults to bypassPermissions when mcpServers is set and mode is omitted");
  it("respects explicit permissionMode when provided");
  it("defaults to default when mcpServers is absent");
});
```

### Unit 8: existing `claude-code-events.test.ts` covers the result-event path; the exhaustive `never` is a compile-time check, not a runtime test.

## Verification Checklist

```bash
# After each unit:
pnpm --filter @praxis/claude-cli-sdk build
pnpm typecheck
pnpm exec biome check packages/claude-cli-sdk/src packages/engines/src/claude-code packages/engines/src/mcp
pnpm vitest run packages/claude-cli-sdk packages/engines/src/__tests__

# After all units:
pnpm rebuild better-sqlite3 canvas
pnpm test          # full suite
pnpm typecheck
pnpm dev           # smoke-test bootstrap mode in the desktop app

# Inspect adapter for residual casts (should return zero matches on event fields):
grep -E '\bas (string|number|unknown|Record<)' packages/engines/src/claude-code/events.ts
grep -E 'String\(|Number\(' packages/engines/src/claude-code/events.ts

# Inspect SDK for residual unused exports:
grep -rn 'discoverTools\|InteractiveTool\|buildPlugin\|askUserQuestion' packages/ \
  --include='*.ts' --include='*.tsx' | grep -v packages/claude-cli-sdk
```

Expected end state: zero matches on the cast greps, zero matches on the unused-export grep (outside the SDK itself, which is gone), `pnpm typecheck && pnpm test && pnpm lint` all green.
