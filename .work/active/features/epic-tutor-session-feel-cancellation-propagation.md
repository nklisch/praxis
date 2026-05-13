---
id: epic-tutor-session-feel-cancellation-propagation
kind: feature
stage: done
tags: [core, engines, tools, chat]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Cancellation propagation — stop actually stops everything

## Brief

The Stop button visibly returns control to the user but tool calls and
sub-agent invocations keep running behind it. Tracing the abort signal:

- `Composer` Stop / Escape → `useStreamedSend.cancel()` →
  `iterator.return()` → fires `praxis.session.send.cancel` IPC channel
  (`packages/ui/src/hooks/use-streamed-send.ts:136-138`)
- `SessionServiceImpl.send(..., signal)` receives the `AbortSignal`
  (`packages/core/src/services/session-service.ts:125-250`)
- Signal is threaded into the engine session's `*send` generator
  (line 211: `for await (const event of capturedEntry.handle.send(message, signal))`)
- Engine adapter wires `signal.addEventListener("abort", ...) → conv.abort()`
  (`packages/engines/src/claude-code/adapter.ts:189-216`); Codex
  (`packages/engines/src/codex/adapter.ts:128-142`) and Direct
  (`packages/engines/src/direct/adapter.ts:91-104`) similarly accept it.

**The signal then dies.** `DispatchMeta` at
`packages/tools/src/registry.ts:14-20` carries only `callId` — there is no
`signal` field. Tool handlers don't receive it, and neither do the
sub-agent entries `runConceptExplorer`
(`packages/curriculum/src/bootstrap/explorer.ts:105-145`) and the
small grader agent. So when the user clicks Stop while bootstrap is
running, the engine turn aborts but the sub-agent's own engine session
continues, emitting tool calls and writing drafts until it finishes
naturally. That's the bug.

This feature adds an `AbortSignal` to `DispatchMeta` / `ToolContext`,
threads it through tool dispatch in all three engine adapters
(`claude-code`, `codex`, `direct`), and propagates it into sub-agent
entries. Sub-agent sessions get the parent's signal wired into their own
engine's abort handler. The `SubAgentRegistry` finishes any in-flight
sub-agent items with status `interrupted` when the parent aborts.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent core/plumbing feature — wave 1,
  parallelizable. Largest feature in the epic; touches 3 engine adapters
  + tools + sub-agent flow.

## Foundation references

- `docs/ARCHITECTURE.md:310` — "Tool implementations may themselves call
  sub-agents… Sub-agent activity is published through `SubAgentRegistry`."
  Cancellation needs to walk that tree, not just the top engine session.

## Anchors

### Core types

- `DispatchMeta` shape — `packages/tools/src/registry.ts:14-20` (today
  has only `callId?: string`)
- `dispatch()` — `packages/tools/src/registry.ts:79-120` (builds
  `callContext` and calls `tool.handler(parsed.data, callContext)`)
- `ToolContext` — `packages/core/src/types/tool.ts:96-140` (has
  `studentId`, `sessionId`, `courseId`, etc.; no `signal`)

### Engine adapters (all 3)

- `packages/engines/src/claude-code/adapter.ts:189-216` (signal
  already received at `send()`; wired to `conv.abort()` via listener)
- `packages/engines/src/codex/adapter.ts:128-142` (signal received;
  passed to `thread.runStreamed(..., { signal })`)
- `packages/engines/src/direct/adapter.ts:91-104` (signal received;
  passed as `abortSignal` to Vercel AI SDK's `streamText`)
- **Tool dispatch sites in each adapter** — need to find: each adapter
  has a loop that intercepts the SDK's tool-call events and calls
  `registry.dispatch(name, args, { callId })`. That's where to thread
  the signal next. Likely in:
  - `packages/engines/src/claude-code/mcp/` (MCP server bridge)
  - `packages/engines/src/codex/` (Codex SDK callback or events.ts)
  - `packages/engines/src/direct/` (Vercel tool call handler)

### Sub-agent flow

- `runConceptExplorer` — `packages/curriculum/src/bootstrap/explorer.ts:105-145`
  (takes `RunConceptExplorerInput` with `engine`, `subAgentHandle`, etc.;
  **no `signal` parameter today**)
- `course.start_exploration` handler —
  `packages/tools/src/course/start-exploration.ts` (calls
  `runConceptExplorer`; receives `ctx: ToolContext`)
- Other sub-agent entry: `grade_with_rubric` — verify in
  `packages/tools/src/` during impl

### Sub-agent registry

- `SubAgentRegistryImpl` —
  `packages/core/src/services/subagent-registry.ts` (has start, step,
  finish lifecycle; needs an interrupt-on-abort hook)
- `SubAgentHandle` interface — verify the existing methods (`stepStarted`,
  `stepSettled`, `phaseChanged`, `finish`); the abort path uses
  `finish("interrupted")` or similar terminal status

### Session cancel path (already wired)

- `SessionServiceImpl.send` —
  `packages/core/src/services/session-service.ts:125-250` (esp.
  233-249 where `signal?.aborted` already short-circuits)

## Design decisions (resolved by epic + autopilot)

From the epic-design resolution:
- **Sub-agent abort mechanism**: reuses the parent's `conv.abort()` /
  engine `send` signal path. When the parent aborts, the sub-agent's
  own engine session aborts via the SAME signal threaded into its
  `engine.open()` / `session.send()`. Recursive abort walk for free.

Resolved by autopilot:
- **`DispatchMeta.signal`**: optional. Tests and direct invocations
  that don't supply a signal continue to work; tool handlers must
  tolerate `ctx.signal === undefined`.
- **`ToolContext.signal`**: optional, populated by `dispatch()` when
  `meta.signal` is present. Threaded into the shallow-copied
  `callContext`, never mutated on the registry's stored context.
- **Idempotency**: tool handlers may check `ctx.signal?.aborted` at
  entry and return promptly. Re-aborting an already-aborted signal is
  a no-op (standard `AbortController` behavior).
- **Tools-in-loops**: handlers with long-running loops should
  periodically check `signal.aborted` and bail. v1 wires the signal
  EVERYWHERE; per-tool eager-bail polish is best-effort and not part
  of acceptance — the engine adapter's abort+turn-shutdown gets the
  user out the door; tools complete the current iteration but the
  result is discarded.
- **Sub-agent registry interrupt**: when the parent session emits an
  `interrupted` engine event (which `SessionServiceImpl.send` already
  does on `signal?.aborted` at line 233-249), the SubAgentRegistry
  receives an `interruptAll(parentSessionId)` call from the session
  service. Items still in `running` status transition to `interrupted`.
  Listeners get a final event so the UI updates.
- **Engine-adapter dispatch sites**: each adapter's tool-call
  handler receives the per-turn signal via closure. When dispatching
  to the registry, it passes `{ callId, signal }`. The exact site
  varies by adapter (MCP bridge for Claude Code, callback for
  Codex/Direct).
- **`runConceptExplorer` signal**: added as optional
  `signal?: AbortSignal` on `RunConceptExplorerInput`. Threaded into:
  - `engine.open(...)` — if the engine's open accepts a signal,
    pass it (most adapters' open is synchronous and doesn't need it).
  - `session.send(message, signal)` — passed to each send call (the
    explorer sends one initial message inside the loop).
  - The explorer's finally block checks `signal?.aborted` and
    early-exits the result with `reason: "interrupted"`.
- **`course.start_exploration` handler**: reads `ctx.signal` from the
  new `ToolContext.signal`, passes it into `runConceptExplorer`.
- **`grade_with_rubric` (and any other sub-agent tool)**: same
  pattern — read `ctx.signal`, thread into the sub-agent's engine
  session.

## Architectural choice

**Single AbortSignal threaded through every layer.** The same signal
the user creates by clicking Stop flows: UI → IPC → session service →
engine adapter → engine SDK + tool dispatch → tool handler → sub-agent
engine session → sub-agent's tool dispatch → … recursively. One signal
to rule them all; standard `AbortController` semantics throughout.

Two alternatives rejected:
- *Higher-level "session-aborted" event channel.* Each tool / adapter
  subscribes and acts. Loses fine-grained timing (each subscriber
  might lag by an event); custom protocol where the standard one
  works. Reject.
- *Per-tool kill switches.* Each tool registers a cancel callback;
  registry tracks per-call cancel. Reinvents AbortController. Reject.

## Implementation Units

### Unit 1: Signal field on `DispatchMeta` + `ToolContext`

**Files**:
- `packages/tools/src/registry.ts:14-20` (`DispatchMeta`)
- `packages/core/src/types/tool.ts:96-140` (`ToolContext`)

Extend both:

```typescript
// DispatchMeta
export interface DispatchMeta {
  callId?: string;
  /**
   * AbortSignal threaded from the engine's send-turn signal. When
   * the user clicks Stop (or the session is otherwise interrupted),
   * this signal aborts; tool handlers should bail and sub-agents
   * should propagate it further. Optional — test stubs and direct
   * invocations may omit it.
   */
  signal?: AbortSignal;
}
```

```typescript
// ToolContext (add new optional field)
export interface ToolContext {
  // … existing fields …
  /**
   * AbortSignal for the current engine turn. Populated by
   * `InProcessToolRegistry.dispatch(..., { signal })` when the engine
   * adapter passes the per-turn signal. Tools should check
   * `signal?.aborted` at entry and periodically during long loops;
   * sub-agent-spawning tools pass it into the sub-agent's engine
   * session.
   */
  signal?: AbortSignal;
}
```

**Acceptance Criteria**:
- [ ] `DispatchMeta.signal` and `ToolContext.signal` both typed.
- [ ] `pnpm typecheck` passes (no breakage from optional field).

---

### Unit 2: `dispatch()` threads signal into `callContext`

**File**: `packages/tools/src/registry.ts:97-119`

Extend the shallow-copy block:

```typescript
const callContext: ToolContext = {
  ...this.context,
  ...(meta?.callId !== undefined && { callId: meta.callId }),
  ...(meta?.signal !== undefined && { signal: meta.signal }),
};
```

(Today's code uses the conditional spread for `callId`; mirror that for
`signal`.)

**Acceptance Criteria**:
- [ ] Calling `dispatch(name, args, { callId, signal })` results in
      the tool's handler receiving `ctx.signal === signal`.
- [ ] Calling `dispatch(name, args)` (no meta) results in
      `ctx.signal === undefined`.

---

### Unit 3: Engine adapters thread signal into dispatch

**Files** (3 adapters, all under `packages/engines/src/`):

#### 3a. Claude Code (`packages/engines/src/claude-code/`)

Find where the MCP bridge or tool-call event handler calls
`registry.dispatch(name, args, { callId })`. The signal is already in
scope in the outer `send()` generator (line 189). Capture it in a closure
accessible to the dispatch site (likely via the MCP server's handler
registration that happens in `open()` or before the `send()` loop).

If `open()` constructs the MCP server with handlers that don't have
the per-turn signal in scope yet, the cleanest fix is: store the
"current send signal" on the adapter instance (`this.currentSignal:
AbortSignal | undefined`), set it at the start of `send()`, clear it
in the finally. MCP handlers read `this.currentSignal` when
dispatching.

Pseudocode:
```typescript
class ClaudeCodeAdapter implements EngineSession {
  private currentSignal: AbortSignal | undefined;

  async *send(userMessage: string, signal?: AbortSignal) {
    this.currentSignal = signal;
    try {
      // … existing logic …
    } finally {
      this.currentSignal = undefined;
    }
  }

  // Inside the MCP tool-call handler (or wherever dispatch happens):
  private async handleToolCall(name, args, callId) {
    return this.registry.dispatch(name, args, {
      callId,
      ...(this.currentSignal !== undefined && { signal: this.currentSignal }),
    });
  }
}
```

#### 3b. Codex (`packages/engines/src/codex/adapter.ts`)

Codex passes `{ signal }` directly to `thread.runStreamed`. Find where
the Codex SDK invokes tool callbacks; same closure-capture pattern.

#### 3c. Direct (`packages/engines/src/direct/adapter.ts`)

The Direct adapter uses Vercel AI SDK's `streamText` with `abortSignal`
already passed (line 104). Tool calls are invoked via the SDK's tool
callback — find that site, capture the signal via closure or instance,
pass into dispatch.

**Acceptance Criteria**:
- [ ] When a turn is aborted, the next `dispatch()` call inside the
      adapter receives the aborted signal — handlers can bail.
- [ ] All three adapters have equivalent behavior.

---

### Unit 4: `runConceptExplorer` accepts and propagates signal

**File**: `packages/curriculum/src/bootstrap/explorer.ts`

Extend `RunConceptExplorerInput`:

```typescript
export interface RunConceptExplorerInput {
  // … existing fields …
  signal?: AbortSignal;
}
```

Thread into the explorer's engine session lifecycle:

```typescript
export async function runConceptExplorer(input: RunConceptExplorerInput) {
  // … construct registry, open session …

  // Check abort up front
  if (input.signal?.aborted) {
    return { ok: false, reason: "interrupted" as const, stepsUsed: 0 };
  }

  const session = await input.engine.open({
    systemPrompt: EXPLORER_SYSTEM_PROMPT,
    tools: registry,
    maxSteps: input.maxSteps ?? 30,
  });

  try {
    const stream = session.send(initialMessage, input.signal);
    for await (const event of stream) {
      if (input.signal?.aborted) break;
      // … existing event handling …
    }
  } finally {
    await session.close?.();
  }

  if (input.signal?.aborted) {
    return {
      ok: false,
      reason: "interrupted" as const,
      // … carry partial draftId/stepsUsed if useful …
      draftId,
      stepsUsed,
    };
  }
  // … existing return logic …
}
```

Add `"interrupted"` to the `reason` union:

```typescript
reason?: "no_draft_init" | "engine_error" | "interrupted";
```

**Acceptance Criteria**:
- [ ] `runConceptExplorer({ signal })` with an already-aborted signal
      returns `{ ok: false, reason: "interrupted" }` without calling
      `engine.open`.
- [ ] Aborting mid-explorer terminates the inner session's send loop
      and returns `interrupted`.

---

### Unit 5: `course.start_exploration` passes signal

**File**: `packages/tools/src/course/start-exploration.ts`

In the handler, read `ctx.signal` and pass it to `runConceptExplorer`:

```typescript
async handler(args, ctx: ToolContext) {
  // … existing arg validation, engine resolution, etc …
  const result = await runConceptExplorer({
    // … existing fields …
    ...(ctx.signal !== undefined && { signal: ctx.signal }),
  });
  // … existing return mapping …
}
```

**Acceptance Criteria**:
- [ ] Parent abort during a `course.start_exploration` call results
      in `runConceptExplorer` returning early with `interrupted`.

---

### Unit 6: Other sub-agent tools (`grade_with_rubric`)

**File**: `packages/tools/src/` — find `grade_with_rubric` or
similar sub-agent-spawning tools.

Apply the same pattern: read `ctx.signal`, thread into the sub-agent's
engine session.

**Acceptance Criteria**:
- [ ] Every sub-agent-spawning tool passes its `ctx.signal` to its
      child engine.

---

### Unit 7: SubAgentRegistry interrupt-on-abort

**File**: `packages/core/src/services/subagent-registry.ts`

Add a method to `SubAgentRegistry` interface and implementation:

```typescript
/**
 * Mark all in-flight sub-agent items for the given parent session as
 * interrupted. Called by SessionServiceImpl when the parent turn is
 * aborted. Listeners receive a terminal event for each affected item.
 */
interruptAllForSession(parentSessionId: SessionId): void;
```

Implementation: iterate `items`, for each item whose
`parentSessionId === parentSessionId` and `status === "running"`,
transition to `status: "interrupted"`, emit terminal event, schedule
linger cleanup.

Wire the call in `SessionServiceImpl.send` around line 233-249, where
`signal?.aborted` already short-circuits:

```typescript
if (signal?.aborted) {
  this.deps.subAgents?.interruptAllForSession(sessionId);
  // emit interrupted event, return …
}
```

(If `subAgents` is optional on `ServiceDeps`, add it; many tests construct
`SessionServiceImpl` with minimal deps and don't need this.)

**Acceptance Criteria**:
- [ ] When the parent session is aborted, in-flight `SubAgentItem`s
      for that session transition to `interrupted` and emit a final
      event.

---

### Unit 8: Tests

**Files**:
- `packages/tools/src/__tests__/registry.test.ts` (or
  `registry-dispatch.test.ts` — find existing file): add test for
  `dispatch(name, args, { signal })` threading signal into context.
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` (if
  exists): test that an already-aborted signal results in
  `interrupted`; test that abort mid-loop bails.
- `packages/core/src/services/__tests__/session-service.test.ts`:
  test that abort triggers `subAgents.interruptAllForSession`.
- `packages/core/src/services/__tests__/subagent-registry.test.ts`:
  test that `interruptAllForSession` settles in-flight items.
- Engine-adapter conformance tests (under `packages/engines/src/__tests__/`):
  for each adapter, test that aborting the send signal causes the next
  dispatch call to receive an aborted ctx.signal.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing engine-adapter tests pass.

---

## Implementation Order — 2 child stories

Two stories: foundation + propagation. The first lands the types and
the registry threading; the second extends it through the engine
adapters and sub-agent layer.

### Story 1: Core signal plumbing

- Unit 1 (signal field on types)
- Unit 2 (dispatch threads signal)
- Unit 8 (registry test)

After story 1: types compile, registry threads signal, tools that
choose to read `ctx.signal` can. No behavior change yet because
engine adapters don't supply the signal to dispatch.

### Story 2: Engine + sub-agent propagation

- Unit 3 (3 engine adapters)
- Unit 4 (runConceptExplorer)
- Unit 5 (course.start_exploration handler)
- Unit 6 (grade_with_rubric and others)
- Unit 7 (SubAgentRegistry interrupt + SessionServiceImpl wire)
- Unit 8 (engine, explorer, sub-agent tests)

After story 2: Stop button actually stops sub-agents. The bug is
fixed end-to-end.

## Testing

Covered in Unit 8 across both stories. Key invariants:
- Aborting at any layer propagates downward.
- Tool handlers that don't check `signal.aborted` still complete
  their current iteration but the result is discarded (engine
  shutdown handles it).
- Sub-agent items reflect interrupted status in the UI.

## Risks

1. **Adapter-specific dispatch sites** (medium). Each engine adapter
   intercepts tool calls differently — MCP bridge for Claude Code,
   SDK callback for Codex and Direct. Story 2 must find each site;
   `grep`ing for `registry.dispatch` is the canonical sweep.
2. **Sub-agent recursion depth** (low). Per the architecture, sub-agents
   may themselves invoke sub-agent-spawning tools. The signal-threading
   pattern handles this by construction — each layer reads `ctx.signal`
   and passes it down. Verify with a 2-deep test if practical.
3. **Tests that construct ToolContext without signal** (low). All
   existing test stubs that build a ToolContext don't need to change
   — `signal` is optional. New tests that exercise abort behavior
   construct an `AbortController` and pass its signal.
4. **`engine.open` signal vs `session.send` signal** (low). The
   abort applies to a turn (`send`), not the whole session
   (`open`). Aborting a turn doesn't necessarily close the session;
   the explorer's finally still runs `session.close?.()`. Verified:
   existing code already separates these.
5. **Engine adapter API surface changes** (none expected). Adapters
   already accept `signal` at `send()`. The change is internal —
   threading it down to the tool dispatch site. No interface change.

## Implementation Notes (orchestrator)

Both child stories landed and are at `stage: review`:
- `…-core-plumbing` (commit `95193e2`) — `signal?: AbortSignal` on
  `DispatchMeta` and `ToolContext`; `dispatch()` threads it into the
  per-call `callContext`.
- `…-engine-and-subagent` (commit `d77a751`) — All three engine adapters
  (Claude Code, Codex, Direct) supply the per-turn signal to
  `registry.dispatch`. `runConceptExplorer` accepts and propagates signal
  with `"interrupted"` reason. `SubAgentRegistry.interruptAllForSession`
  added and wired into `SessionServiceImpl.send`'s abort short-circuit.

End-to-end: clicking Stop now actually stops sub-agents within ~1s.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Both child stories reviewed individually and at `stage: done`:
  - `…-core-plumbing` (Approve) — `signal` field on `DispatchMeta` + `ToolContext`; `dispatch()` threading
  - `…-engine-and-subagent` (Approve) — 3 engine adapters thread signal; `runConceptExplorer` propagates with `"interrupted"` reason; `SubAgentRegistry.interruptAllForSession`
- Capability completeness check: ✓ Stop button propagates abort end-to-end. Signal path: UI Stop → IPC `cancel` → `SessionServiceImpl.send(signal)` → engine adapter (`send(signal)`) → MCP bridge / direct closure captures it → `registry.dispatch(name, args, { callId, signal })` → `ctx.signal` on the tool handler → sub-agent's engine `session.send(signal)` → recursive abort all the way down.
- Sub-agent registry interrupt: in-flight items transition from `running` → `interrupted`, emit terminal event, schedule linger cleanup. UI is informed via existing subscriber-fanout pattern.
- Foundation-doc alignment: `docs/ARCHITECTURE.md:310` sub-agent transparency contract honored — cancellation walks the same tree the registry already publishes.
- No other sub-agent-spawning tools found in `packages/tools/` (only `course.start_exploration` resolves an engine). Story 2 documented this negative finding cleanly.
- Aggregate verification: workspace typecheck/lint/test all green after the engine-and-subagent commit; 12 new tests across 5 files; pre-existing 1000+ tests still pass.
