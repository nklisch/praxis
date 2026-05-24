# Pattern: One-Shot LLM Inference

Background LLM passes (graders, indexers, server-side notes generation) follow a four-step shape:

1. Build user message.
2. Call `runOneShot(engineResolver(), { systemPrompt, tools: { list: () => [], dispatch: noopDispatch }, maxSteps: 1 }, userMessage)`.
3. `for await` accumulating `assistantText` while catching `event.type === "error"` for graceful degradation.
4. `extractJsonBlock(assistantText)` and validate.

## Rationale

Background passes don't need MCP tools or multi-turn loops — they just want "model, here's a prompt, give me back parseable JSON." The `runOneShot` helper centralizes the open/send/close-in-finally engine session lifecycle; the for-await + accumulator shape lets every consumer accumulate streamed model text and intercept engine errors uniformly. The `noopDispatch` sentinel makes the no-tools contract explicit and produces a friendly error if the model improvises a tool call.

## Examples

### Example 1: AffectiveIndexer

**File**: `packages/core/src/services/indexers/affective-indexer.ts:175`

```ts
const events = runOneShot(
  deps.engineResolver(),
  {
    systemPrompt: AFFECTIVE_SYSTEM_PROMPT,
    tools: { list: () => [], dispatch: noopDispatch },
    maxSteps: 1,
  },
  userMessage,
);
let assistantText = "";
for await (const ev of events) {
  if (ev.type === "model_message") assistantText += ev.content;
  if (ev.type === "error") {
    deps.log.warn("affective.engine_error", { error: ev.error.message });
    return null;
  }
}
```

### Example 2: rubric-agent

**File**: `packages/core/src/services/graders/rubric-agent.ts:74`

```ts
const events = runOneShot(
  ctx.services.engineResolver(),
  {
    systemPrompt: RUBRIC_SYSTEM_PROMPT,
    tools: { list: () => [], dispatch: noopDispatch },
    maxSteps: 1,
  },
  userMessage,
);
let assistantText = "";
for await (const ev of events) {
  if (ev.type === "model_message") assistantText += ev.content;
  if (ev.type === "error") return null;
}
const raw = extractJsonBlock(assistantText);
```

### Example 3: ConceptMapDivergenceIndexer

**File**: `packages/core/src/services/indexers/concept-map-divergence-indexer.ts:162`

### Example 4: NotesService.fromSessionSummary

**File**: `packages/core/src/services/notes-service.ts:283`

### Example 5: enrichWithApproachFeedback grader

**File**: `packages/core/src/services/graders/approach-feedback.ts:54`

### Example 6: MisconceptionIndexer

**File**: `packages/core/src/services/indexers/misconception-indexer.ts:107`

## When to Use

- A background task needs the model for a single inference pass with no tools.
- The output is structured (JSON) and you want to parse it after a clean stream drain.
- You want explicit `engine error → graceful degradation` instead of an exception.

## When NOT to Use

- Multi-turn loops or tools needed — open an `EngineSession` directly via `engine.open()` and stream `send()` (see `engine-session-lifecycle`).
- You need to stream tokens to a renderer with partial deltas — use the engine session directly.
- The output is meant to be free-form prose (no JSON parse) — keep the accumulator but skip `extractJsonBlock`.

## Common Violations

- Re-implementing the open/send/close lifecycle inline instead of using `runOneShot` — a `finally` close is easy to forget.
- Defining `tools: { list: () => [], dispatch: async () => ({ ok: false, error: ... }) }` inline at every site instead of importing a shared `noopDispatch` — every site currently has a private copy (tracked as `gate-patterns-inconsistency-noop-dispatch-duplication` for v0.1.4).
- Treating `event.type === "error"` as fatal — these are recoverable; log + return a graceful fallback.
- Calling `JSON.parse` directly on `assistantText` — use `extractJsonBlock` which handles fenced and bare JSON.
