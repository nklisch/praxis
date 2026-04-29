# Design: Phase 3 — UI Shell + IPC Transport + Multi-Turn Chat

> **Revision history**
> - **v1** (e404785) — initial design with stateless engines + transcript-prefix history workaround
> - **v2** (this) — engine lifecycle (`open` / `send` / `close`); native SDK multi-turn for Claude Code + Codex; framework as unified surface, runtimes own their loops

## Overview

Phase 3 closes the loop: a real Electron app where a student opens the desktop window, types into a chat, and watches a streamed tutor response — multi-turn, with the agent fully aware of the conversation so far. The same vertical slice runs against any of the three Phase 2 engines, selected from a settings UI.

**The core architectural decision in v2:** engines are no longer single-call stateless. We replace `Engine.run(brief, tools)` with a session lifecycle: `engine.open(opts) → EngineSession`, then `session.send(userMessage)` per turn, then `session.close()`. Claude Code uses the SDK's `Conversation` natively; Codex uses `Thread` natively; the Direct adapter (Vercel AI SDK) holds an in-memory `messages[]` since the underlying API is stateless. The framework provides the unified `EngineSession` surface and records every event to episodic; the runtimes own their internal multi-turn behavior including prompt caching.

This phase lands four things:

1. **Engine lifecycle contract.** `Engine.open(...) → EngineSession`. SDK-native multi-turn for Claude Code + Codex (cache hits, full tool-call fidelity); messages-array multi-turn for Direct. The framework is a unified surface; the runtimes do what they were built to do.
2. **`@praxis/client`** — typed PraxisClient surface plus an `IpcTransport` for Electron and a typed-stub `WebSocketTransport` (Phase 15 fills the latter in).
3. **`@praxis/desktop`** — Electron main + preload + IPC server. Routes IPC channels to service implementations in `@praxis/core`. Loads the `@praxis/ui` renderer in a BrowserWindow.
4. **`@praxis/ui`** — Vite + React 19 + TanStack Router shell. Two routes: `/` (chat) and `/settings` (engine selection). CSS Modules. Streamed assistant messages render token-by-token.

After Phase 3, `pnpm dev` opens an Electron window. The user types; the assistant streams back; the conversation continues across turns with full memory; the engine can be switched in settings without restarting; the entire transcript persists to SQLite as immutable episodic events. **Integration milestone M1** is reached: UI → IPC → core → engine → response → episodic → display, working across all three adapters.

**What ships:**

- Type contract changes: `Engine.open(...) → EngineSession`, new `EngineSession` interface, new `EngineOpenOptions` type, `EngineEvent.user_message` variant, new `ConversationTurn` type
- Phase 2 adapter rewrites (lifecycle pattern) + Phase 2 conformance suite updated to use lifecycle (with a `runOneShot` convenience wrapper for the single-turn case)
- `scripts/run-session.ts` updated to use lifecycle
- `@praxis/core/session` additions: `recordUserMessage`, `loadConversationHistory`, `nextTurnIndex`
- `@praxis/core/services`: `SessionServiceImpl` (manages active EngineSessions in memory, detects engine swap, closes/reopens) + `ConfigServiceImpl`
- `@praxis/curriculum/brief`: `composeBrief` produces `{systemPrompt, userMessage}`; new `composeSystemPrompt(mode, overrides?)` factored out for session-open use
- `@praxis/client`: typed RPC, `IpcTransport`, `WebSocketTransport` stub, `createPraxisClient(transport)`
- `@praxis/desktop`: electron-vite scaffolding, main + preload + window + IPC server
- `@praxis/ui`: React 19 shell + TanStack Router (code-based) + ChatRoute + SettingsRoute + components, CSS Modules
- Root `pnpm dev` script

**What does not ship (later phases):**

- Multi-student install (one student per install via `config_kv` singleton)
- Lock-code gating (Phase 11)
- Course / lesson context loading (Phase 6)
- Authoring / memory inspector UIs (Phase 11)
- Conversation summarization for very-long contexts (Phase 7)
- Native installer / packaging (Phase 15)

## Why the lifecycle (rationale)

Phase 2's contract: *"Engines are stateless across `run()` calls."* That was the right call when Phase 2 had only single-turn — statelessness was free. With multi-turn in Phase 3, statelessness has a real cost:

- **Claude Code SDK's `Conversation`** caches the system prompt + history through Anthropic's prompt cache. Rebuilding fresh per turn = zero cache hits. For a 20-turn session: ~5–10× cost, ~2–3× latency.
- **Codex SDK's `Thread`** holds structured items (`mcp_tool_call`, `command_execution`, `agent_message`). Flattening to a text transcript loses the structure entirely.
- **Tool-call fidelity** matters for the agent. If it called a tool last turn, the next turn's reasoning should see what it called and what came back — not a third-person summary.

The lifecycle pattern lets each runtime do what it was built to do (Conversation, Thread) while the framework keeps a unified surface and a normalized episodic record. The Direct adapter, whose underlying API actually is stateless, holds its messages array in memory — the same shape as the lifecycle, just implemented differently.

**Engine swap mid-session** is the only case where the lifecycle hits a "rebuild from history" path: when the user changes engines in Settings, the framework closes the old `EngineSession`, opens a new one on the new engine, and seeds it with `priorTurns` loaded from episodic. The new adapter's first send may include a transcript prefix (Claude Code / Codex) or a pre-populated messages array (Direct), and from that point on it's native multi-turn again.

## Scope and assumptions

- **Multi-turn is non-negotiable.** Tutor sessions are inherently conversational; an agent that forgets between turns of the same session would be a fundamental product break.
- **Engines own per-Praxis-session state** through `EngineSession`. The framework holds the active `EngineSession` in memory, keyed by Praxis sessionId. Process restart drops the in-memory map; the next `send()` re-opens the session by reading episodic — episodic remains source of truth.
- **Episodic stays authoritative** as the cross-engine normalized record (used by indexers, UI playback, memory projections). Native SDK sessions are a *performance + fidelity layer* on top — used when present, rebuilt from episodic when absent.
- **History fidelity for rebuilds = text turns.** When seeding a freshly-opened session with `priorTurns`, the history is text-only (`{ role, content }` pairs). Tool-call replay isn't part of the contract — re-running them would change behavior, and most rebuild scenarios (engine swap, restart) are rare. Phase 7 may upgrade fidelity if needed.
- **Default-student singleton.** Phase 3 has one student per install. The studentId is stored under `config_kv` key `"default_student_id"` — generated on first launch as a UUIDv7, never rotated.
- **Default course = none.** `SessionService.start({ modeId: "teach" })` doesn't require `courseId` (additive contract change — `courseId` becomes optional).
- **Active-session resume**: the desktop window always starts fresh on launch; `client.session.active()` returns `null` until a session is started. A "New chat" button creates a new session.
- **Settings scope**: engine selection (`engineId`) plus per-engine fields (`model`, `apiKey`, `baseUrl`). Save writes through `ConfigService.setEngineConfig()`. Engine swap is detected on the next `send()`.
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer sees only `window.praxis`, exposed via `contextBridge.exposeInMainWorld()`.
- **Build tool**: `electron-vite` 5.x.
- **React 19** + **TanStack Router 1.x** (code-based routes; no file-based generator).
- **Styling**: CSS Modules, co-located.
- **No Playwright / E2E** in Phase 3 — manual verification for the test checkpoint.

## Dependency direction (Phase 3)

```
@praxis/desktop                          (electron, electron-vite, React renderer entry)
  ├─ runtime: @praxis/core, @praxis/ui, @praxis/client
  └─ Electron main loads bundled @praxis/ui via local file URL or dev server URL

@praxis/ui                               (React 19 + TanStack Router, CSS Modules)
  ├─ runtime: @praxis/client, react, react-dom, @tanstack/react-router
  └─ NO direct import of @praxis/core, @praxis/engines, or @praxis/desktop

@praxis/client                           (typed RPC surface; transport adapters)
  ├─ runtime: nothing from @praxis/* (only browser/Node primitives)
  └─ type-only: @praxis/core/types

@praxis/core                             (Phase 3 additions: services, session history)
  ├─ existing: @praxis/artifacts, @praxis/memory, @praxis/curriculum
  └─ Phase 3 NEW exports: ./services (SessionServiceImpl, ConfigServiceImpl)
                          (uses @praxis/engines + @praxis/tools at runtime — see CLAUDE.md exception)

@praxis/engines                          (Phase 3 changes: lifecycle pattern)
  └─ unchanged direction; adapters implement Engine.open() returning EngineSession
```

The renderer never imports `@praxis/core` at runtime. The IPC bridge is the only crossing point. Both deployment shapes (local Electron, future hosted) reuse the same `@praxis/client` surface — only the transport implementation changes.

---

## Implementation Units

### Unit 1: Engine lifecycle contract

**Files**:
- `packages/core/src/types/engine.ts` (modified — replaces `Engine.run` with `Engine.open`)
- `packages/core/src/types/conversation.ts` (new — `ConversationTurn`)
- `packages/core/src/types/index.ts` (modified — re-export)
- `packages/core/src/types/client.ts` (modified — `courseId` optional, `EngineConfigSnapshot`)
- `docs/CONTRACT.md` (modified — `## Engine adapter contract` section rewritten)

```typescript
// packages/core/src/types/conversation.ts (NEW)

/**
 * One side of a conversation turn, in chronological order. Used to seed an
 * EngineSession when rebuilding from episodic (engine swap, process restart).
 *
 * Phase 3 fidelity: text-only. Assistant content for a multi-step turn is the
 * concatenation of all final (non-partial) model_message contents in that
 * turn, joined with "\n". Tool calls within turns are not re-injected when
 * seeding — the agent sees the assistant's final textual response. Adequate
 * because rebuilds are rare; native multi-turn (the common case) preserves
 * full fidelity through the SDK.
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
```

```typescript
// packages/core/src/types/engine.ts — REWRITTEN

import type { GenerationParams, TokenUsage } from "./common.js";
import type { ConversationTurn } from "./conversation.js";

/**
 * Options for opening a multi-turn engine session. The systemPrompt and tools
 * are fixed for the lifetime of the session. priorTurns seeds the session
 * when continuing an existing conversation (engine swap, process restart);
 * adapters use them to bootstrap their internal state. On the first turn of
 * a brand new conversation, priorTurns is undefined or empty.
 */
export interface EngineOpenOptions {
  systemPrompt: string;
  tools: ToolRegistry;
  /** When set, the session is being re-opened with prior context to restore. */
  priorTurns?: ConversationTurn[];
  /** Per-turn maximum step count (looped engines) or model calls (single-shot). */
  maxSteps?: number;
  generation?: GenerationParams;
}

/**
 * A multi-turn engine session. Adapters wrap their SDK's native conversation
 * primitive (Conversation for Claude Code, Thread for Codex) or hold an
 * in-memory messages array (Direct). The framework holds one EngineSession
 * per Praxis session and calls `.send()` per user turn.
 */
export interface EngineSession {
  /**
   * Stable session identifier for diagnostics. May match the SDK's native
   * session id (e.g., Claude Code's sessionId, Codex's thread id) when
   * applicable, or be a synthesized UUID for adapters without native ids.
   */
  readonly id: string;

  /**
   * Send one user message; yield engine events; resolves when the engine's
   * internal loop completes for this turn. Subsequent calls continue the same
   * conversation — the adapter's underlying SDK preserves history natively
   * (Claude Code, Codex) or via an in-memory messages array (Direct).
   */
  send(userMessage: string): AsyncIterable<EngineEvent>;

  /**
   * Tear down the underlying SDK session, MCP bridge subprocess, etc.
   * Idempotent. Called by the framework when ending a Praxis session OR
   * when swapping engines mid-session.
   */
  close(): Promise<void>;
}

export interface Engine {
  /** Identifier for diagnostics and selection. e.g. "claude-code", "codex", "direct.anthropic". */
  readonly id: string;

  /**
   * Engine category. Affects how the framework constrains options.
   * - "looped": engine runs its own internal loop until done per `send`.
   * - "single-shot": engine answers per model call; framework orchestrates the loop within `send`.
   */
  readonly kind: "looped" | "single-shot";

  /**
   * Open a multi-turn session. Async because adapters may need to spawn
   * subprocesses (MCP tool bridge), open SDK conversations, or perform other
   * setup that can fail. Throws on failure — the caller (SessionServiceImpl)
   * surfaces the error to the user before any send is attempted.
   */
  open(opts: EngineOpenOptions): Promise<EngineSession>;

  /** Health check / capability probe. Used at session start. */
  health(): Promise<HealthStatus>;
}

// Existing interfaces below — UNCHANGED from Phase 2:

export interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  dispatch(name: string, args: unknown): Promise<ToolResult>;
}

export interface ToolDefinitionSummary {
  name: string;
  description: string;
  inputSchemaJson: unknown;
  inputSchemaNative?: unknown;
  tier: "deterministic" | "grounded" | "model-derived";
}

export type ToolResult =
  | { ok: true; value: unknown; tier: "deterministic" | "grounded" | "model-derived" }
  | { ok: false; error: { code: string; message: string; recoverable: boolean } };

export type EngineEvent =
  | { type: "user_message"; content: string }    // NEW in Phase 3 — framework-emitted, never adapter-emitted
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
  capabilities: {
    vision: boolean;
    streaming: boolean;
    nativeMCP: boolean;
    contextWindow: number;
  };
}
```

> **Removed from Phase 2 contract**: the `Engine.run(brief, tools)` method. `Brief` becomes a curriculum-side composition concern (system prompt + user message); the engine no longer accepts the full Brief. This is a **breaking change** to Phase 2's contract — Phase 2 ships without UI, so the only consumers are the Phase 2 conformance suite, the `scripts/run-session.ts` script, and Phase 2's per-adapter unit tests. Unit 4 below provides a `runOneShot(engine, ...)` convenience wrapper that lets these continue testing single-turn behavior without per-test ceremony.

```typescript
// packages/core/src/types/index.ts (modified)
export type * from "./conversation.js";  // NEW
// existing re-exports unchanged
```

```typescript
// packages/core/src/types/client.ts — modified subset

import type { Timestamp } from "./common.js";
import type { CourseId, GateId, SessionId } from "./ids.js";
import type { EngineEvent } from "./engine.js";

export interface SessionService {
  // courseId is optional in Phase 3 (no courses yet).
  start(opts: { courseId?: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId;  // optional per above
  modeId: string;
  startedAt: Timestamp;
}

export interface SessionSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

/**
 * Snapshot view of EngineConfig for the client surface. Mirrors EngineConfig
 * in @praxis/core/config without forcing client.ts to reach into other core
 * subfolders for a Zod-derived type. SessionServiceImpl validates against
 * EngineConfigSchema before persisting.
 */
export interface EngineConfigSnapshot {
  engineId: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
  // Phase 3 additions:
  engineConfig(): Promise<EngineConfigSnapshot>;
  setEngineConfig(config: EngineConfigSnapshot): Promise<void>;
}

// PraxisClient, ArtifactsService, AuthoringService, MemoryService — unchanged
```

**Implementation Notes**:

- The `Engine.open` signature is async because spawning the MCP bridge subprocess and opening the SDK conversation are async; failures (bad config, missing CLI binary, bad API key) surface as a thrown error at open time, not silently at first send.
- `EngineEvent.user_message` is **emitted only by the framework** (specifically `SessionServiceImpl.send`), never by an engine. Documented on the type. It exists so the immutable transcript captures both sides of the conversation in episodic.
- `ConversationTurn` is text-only by design. When rebuilding a session from episodic on engine swap, we serialize the prior assistant turns as their final textual content. Tool-call replay would change behavior (re-running tools is wrong) and is unnecessary for rebuilds.
- `SessionHandle.courseId` becoming optional is additive; the `sessions.courseId` column is already nullable.
- Update `docs/CONTRACT.md` `## Engine adapter contract` section to reflect the lifecycle (Engine.open + EngineSession). Remove the `Brief` type entirely from the contract section — it's a curriculum implementation detail now.

**Acceptance Criteria**:
- [ ] `Engine.open(opts): Promise<EngineSession>` is the new contract.
- [ ] `EngineSession.send(userMessage): AsyncIterable<EngineEvent>` and `EngineSession.close(): Promise<void>` are defined.
- [ ] `EngineEvent` discriminated union includes `user_message` variant; existing usages still typecheck unchanged.
- [ ] `SessionService.start({ modeId: "teach" })` typechecks with no `courseId`.
- [ ] `ConfigService` includes both legacy methods and `engineConfig` / `setEngineConfig`.
- [ ] `docs/CONTRACT.md` is rewritten to describe the lifecycle.

---

### Unit 2: `composeBrief` simplification + `composeSystemPrompt` factor-out

**File**: `packages/curriculum/src/brief/compose.ts` (modified)

The lifecycle moves history into engine session state, so `Brief.priorTurns` (in v1 of this design) is gone. `composeBrief` produces a per-turn brief; `composeSystemPrompt` produces just the system prompt for session-open use.

```typescript
import type { BriefContext, GenerationParams, Mode, PromptFragment } from "@praxis/core/types";

export interface ComposedBrief {
  systemPrompt: string;
  userMessage: string;
  context: BriefContext;
  generation?: GenerationParams;
  maxSteps?: number;
}

export interface ComposeBriefInput {
  mode: Mode;
  userMessage: string;
  context?: Partial<BriefContext>;
  overrides?: ReadonlyMap<string, string>;
  generation?: GenerationParams;
  maxSteps?: number;
}

export interface ComposeSystemPromptInput {
  mode: Mode;
  overrides?: ReadonlyMap<string, string>;
}

const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble",
  "role",
  "principles",
  "tools",
  "context",
  "constraints",
  "postamble",
];

/** Build only the system prompt — used by SessionServiceImpl.open(). */
export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue;
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const sorted = [...input.mode.promptFragments].sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  return sorted.map((f) => overrides.get(f.id) ?? f.template).join("\n\n");
}

/**
 * Build a complete one-shot brief: system prompt + user message + context.
 * Used by `runOneShot` and any future single-turn paths. The lifecycle path
 * (SessionServiceImpl) uses `composeSystemPrompt` directly.
 */
export function composeBrief(input: ComposeBriefInput): ComposedBrief {
  const systemPrompt = composeSystemPrompt({
    mode: input.mode,
    ...(input.overrides !== undefined && { overrides: input.overrides }),
  });
  return {
    systemPrompt,
    userMessage: input.userMessage,
    context: {
      retrievedChunks: input.context?.retrievedChunks ?? [],
      ...(input.context?.studentSummary !== undefined && { studentSummary: input.context.studentSummary }),
      artifactRefs: input.context?.artifactRefs ?? [],
    },
    ...(input.generation !== undefined && { generation: input.generation }),
    ...(input.maxSteps !== undefined && { maxSteps: input.maxSteps }),
  };
}
```

> Note: Phase 2's `Brief` type from `@praxis/core/types/engine.ts` is removed in Unit 1. The `ComposedBrief` interface here is curriculum-local (not part of the cross-package type contract). Its shape is identical to the old `Brief` minus `priorTurns`.

**Implementation Notes**:
- `composeSystemPrompt` is the primary surface for the lifecycle path. `composeBrief` wraps it for legacy single-turn use cases.
- `Brief` is no longer a cross-package type; it's a curriculum implementation detail. Engine adapters take `EngineOpenOptions` (system prompt) and a user message string — they don't need the whole brief.

**Acceptance Criteria**:
- [ ] `composeSystemPrompt({ mode: teachMode })` returns the joined fragment templates in order.
- [ ] Override of a non-customizable fragment throws.
- [ ] `composeBrief({ mode, userMessage: "hi" })` returns `{ systemPrompt, userMessage, context }` with empty context arrays.
- [ ] `composeBrief` and `composeSystemPrompt` produce the same `systemPrompt` value for the same mode + overrides.

---

### Unit 3: Conversation history helpers in `@praxis/core/session`

**Files** (unchanged from v1):
- `packages/core/src/session/history.ts` (new)
- `packages/core/src/session/episodic.ts` (modified — add `nextTurnIndex`, `recordUserMessage`)
- `packages/core/src/session/index.ts` (re-export)
- `packages/core/src/__tests__/history.test.ts` (new)

**`packages/core/src/session/episodic.ts` additions**:

```typescript
import { eq, max } from "drizzle-orm";

/**
 * Next turn index for a session — `max(turnIndex) + 1`, or 0 if no events yet.
 */
export function nextTurnIndex(db: PraxisDb, sessionId: string): number {
  const row = db
    .select({ maxTurn: max(episodicEvents.turnIndex) })
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, sessionId))
    .get();
  const current = row?.maxTurn ?? null;
  return current === null ? 0 : current + 1;
}

export interface RecordUserMessageInput {
  db: PraxisDb;
  sessionId: string;
  studentId: string;
  engineId: string;
  modeId: string;
  turnIndex: number;
  content: string;
  ts?: Date;
}

/**
 * Append a user_message episodic event. The user's input is part of the
 * immutable transcript — recorded BEFORE handing off to the engine session.
 */
export function recordUserMessage(input: RecordUserMessageInput): string {
  return appendEpisodic({
    db: input.db,
    sessionId: input.sessionId,
    studentId: input.studentId,
    engineId: input.engineId,
    modeId: input.modeId,
    turnIndex: input.turnIndex,
    event: { type: "user_message", content: input.content },
    ...(input.ts !== undefined && { ts: input.ts }),
  });
}
```

**`packages/core/src/session/history.ts`** (new):

```typescript
import { asc, eq } from "drizzle-orm";
import { episodicEvents } from "@praxis/memory/schema";
import type { PraxisDb } from "../db/index.js";
import type { ConversationTurn, EngineEvent } from "../types/index.js";

export interface LoadConversationHistoryInput {
  db: PraxisDb;
  sessionId: string;
}

/**
 * Read all (non-redacted) episodic events for a session and project to
 * ConversationTurn[]. Each turnIndex contributes one user turn (from its
 * user_message event) followed by one assistant turn (from concatenated
 * non-partial model_message contents) if assistant output exists.
 *
 * Used by SessionServiceImpl when opening (or re-opening) an EngineSession
 * with prior context — engine swap, process restart.
 */
export function loadConversationHistory(input: LoadConversationHistoryInput): ConversationTurn[] {
  const rows = input.db
    .select()
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, input.sessionId))
    .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
    .all();

  const byTurn = new Map<number, EngineEvent[]>();
  for (const row of rows) {
    if (row.redactedAt) continue;
    const evt = row.eventJson as EngineEvent;
    const list = byTurn.get(row.turnIndex);
    if (list) list.push(evt);
    else byTurn.set(row.turnIndex, [evt]);
  }

  const turns: ConversationTurn[] = [];
  for (const turnIdx of [...byTurn.keys()].sort((a, b) => a - b)) {
    const events = byTurn.get(turnIdx);
    if (!events) continue;

    const userEvent = events.find(
      (e): e is Extract<EngineEvent, { type: "user_message" }> => e.type === "user_message",
    );
    if (userEvent) turns.push({ role: "user", content: userEvent.content });

    const assistantParts = events
      .filter(
        (e): e is Extract<EngineEvent, { type: "model_message" }> =>
          e.type === "model_message" && e.partial !== true,
      )
      .map((e) => e.content);
    if (assistantParts.length > 0) {
      turns.push({ role: "assistant", content: assistantParts.join("\n") });
    }
  }

  return turns;
}
```

**Implementation Notes**: same as v1 — sort by `(turnIndex ASC, ts ASC)`, skip redacted, concat non-partial model_message events for assistant turns.

**Acceptance Criteria**:
- [ ] `nextTurnIndex` returns 0 on a session with no events; returns `max+1` after events exist.
- [ ] `recordUserMessage` writes an episodic row with `eventJson.type === "user_message"`.
- [ ] `loadConversationHistory` projects single-turn (user + final model_message) to a 2-element ConversationTurn array.
- [ ] Multi-step turn with multiple non-partial model_messages concatenates with `"\n"`.
- [ ] Turns containing only an error event yield only the user turn (no orphan assistant).
- [ ] Redacted events are skipped.

---

### Unit 4: Engine adapter rewrites — lifecycle implementations

**Files**:
- `packages/engines/src/types.ts` (modified — re-export EngineSession types, add `runOneShot` helper)
- `packages/engines/src/util/transcript.ts` (new — for Claude Code / Codex priorTurns seeding)
- `packages/engines/src/direct/adapter.ts` (rewritten — `DirectEngine` + `DirectEngineSession`)
- `packages/engines/src/direct/events.ts` (minor change — extract assistant content for messages array)
- `packages/engines/src/claude-code/adapter.ts` (rewritten — `ClaudeCodeEngine` + `ClaudeCodeEngineSession`)
- `packages/engines/src/codex/adapter.ts` (rewritten — `CodexEngine` + `CodexEngineSession`)
- `packages/engines/src/__tests__/{direct,claude-code,codex}.test.ts` (rewritten for lifecycle)
- `packages/engines/src/__tests__/transcript.test.ts` (new)
- `tests/engine-conformance.test.ts` (updated — uses `runOneShot`)
- `tests/helpers/{mock-cc-stream,mock-codex-stream,mock-vercel-stream}.ts` (unchanged — they mock the SDKs not the adapter shape)

**`packages/engines/src/types.ts`**:

```typescript
import type { Engine, EngineEvent, EngineOpenOptions, Logger, ToolRegistry } from "@praxis/core/types";

export interface EngineDeps {
  log: Logger;
}

/**
 * Convenience wrapper for single-turn use cases (test scripts, conformance
 * suite). Opens an engine session, sends one message, drains the stream,
 * closes the session. Equivalent to old Phase 2 `engine.run(brief, tools)`.
 */
export async function* runOneShot(
  engine: Engine,
  opts: EngineOpenOptions,
  userMessage: string,
): AsyncGenerator<EngineEvent, void, void> {
  const session = await engine.open(opts);
  try {
    yield* session.send(userMessage);
  } finally {
    await session.close();
  }
}
```

**`packages/engines/src/util/transcript.ts`** (new):

```typescript
import type { ConversationTurn } from "@praxis/core/types";

/**
 * Serialize prior conversation turns into a plain-text transcript for adapters
 * whose SDK doesn't accept structured history when opening a fresh session.
 * Used by ClaudeCodeEngineSession and CodexEngineSession only when seeding
 * with priorTurns (engine swap, process restart). Subsequent turns benefit
 * from the SDK's native multi-turn — the transcript prefix appears only on
 * the first send after open.
 */
export function buildTranscriptPreface(priorTurns: ReadonlyArray<ConversationTurn>): string {
  if (priorTurns.length === 0) return "";
  const lines = ["[Continuing this conversation from earlier:]", ""];
  for (const turn of priorTurns) {
    const label = turn.role === "user" ? "User" : "Tutor";
    lines.push(`${label}: ${turn.content}`);
  }
  lines.push("", "[Now continuing — please respond to the next user message.]", "");
  return lines.join("\n");
}
```

**`packages/engines/src/direct/adapter.ts`** (rewritten):

```typescript
import { streamText, stepCountIs, type ModelMessage } from "ai";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  ToolRegistry,
} from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { resolveModel, type DirectProvider } from "./providers.js";
import { toVercelTools } from "./tool-conversion.js";
import { mapVercelPart } from "./events.js";
import { v7 as uuidv7 } from "uuid";

export interface DirectEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
  provider: DirectProvider;
}

export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;
  private readonly opts: DirectEngineOptions;

  constructor(opts: DirectEngineOptions) {
    this.opts = opts;
    this.id = `direct.${opts.provider}`;
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    return new DirectEngineSession({
      id: uuidv7(),
      provider: this.opts.provider,
      config: this.opts.config,
      systemPrompt: openOpts.systemPrompt,
      tools: openOpts.tools,
      priorTurns: openOpts.priorTurns ?? [],
      ...(openOpts.maxSteps !== undefined && { maxSteps: openOpts.maxSteps }),
      ...(openOpts.generation !== undefined && { generation: openOpts.generation }),
    });
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: false, contextWindow: 200_000 },
    };
  }
}

interface DirectSessionInit {
  id: string;
  provider: DirectProvider;
  config: EngineConfig;
  systemPrompt: string;
  tools: ToolRegistry;
  priorTurns: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  maxSteps?: number;
  generation?: { temperature?: number; maxTokens?: number };
}

class DirectEngineSession implements EngineSession {
  readonly id: string;
  private readonly provider: DirectProvider;
  private readonly config: EngineConfig;
  private readonly systemPrompt: string;
  private readonly tools: ToolRegistry;
  private readonly maxSteps: number;
  private readonly generation?: DirectSessionInit["generation"];
  private messages: ModelMessage[];

  constructor(init: DirectSessionInit) {
    this.id = init.id;
    this.provider = init.provider;
    this.config = init.config;
    this.systemPrompt = init.systemPrompt;
    this.tools = init.tools;
    this.maxSteps = init.maxSteps ?? 8;
    if (init.generation) this.generation = init.generation;
    this.messages = init.priorTurns.map((t) => ({ role: t.role, content: t.content }));
  }

  async *send(userMessage: string): AsyncIterable<EngineEvent> {
    this.messages.push({ role: "user", content: userMessage });
    const model = resolveModel(this.provider, this.config);
    const result = streamText({
      model,
      system: this.systemPrompt,
      messages: this.messages,
      tools: toVercelTools(this.tools),
      stopWhen: stepCountIs(this.maxSteps),
      ...(this.generation?.temperature !== undefined && { temperature: this.generation.temperature }),
      ...(this.generation?.maxTokens !== undefined && { maxTokens: this.generation.maxTokens }),
    });

    const state = { textBuf: "" };
    let assistantContent = "";
    for await (const part of result.fullStream) {
      const event = mapVercelPart(part, state);
      if (!event) continue;
      if (event.type === "model_message" && event.partial !== true) {
        assistantContent += event.content;
      }
      yield event;
    }

    if (assistantContent.length > 0) {
      this.messages.push({ role: "assistant", content: assistantContent });
    }
  }

  async close(): Promise<void> {
    // Nothing to tear down — the underlying SDK is stateless.
    this.messages = [];
  }
}
```

**`packages/engines/src/claude-code/adapter.ts`** (rewritten):

```typescript
import { createConversation, type Conversation } from "@nklisch/claude-cli-sdk";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  ToolRegistry,
} from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { startToolBridge, type ToolBridgeHandle } from "../mcp/tool-bridge.js";
import { mapClaudeCodeEvent } from "./events.js";
import { buildTranscriptPreface } from "../util/transcript.js";

export interface ClaudeCodeEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;
  private readonly opts: ClaudeCodeEngineOptions;

  constructor(opts: ClaudeCodeEngineOptions) {
    this.opts = opts;
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    const bridge =
      openOpts.tools.list().length > 0 ? await startToolBridge({ registry: openOpts.tools }) : null;
    let conv: Conversation;
    try {
      conv = createConversation({
        ...(this.modelHint() !== undefined && { model: this.modelHint() }),
        ...(openOpts.maxSteps !== undefined && { maxTurns: openOpts.maxSteps }),
        systemPrompt: openOpts.systemPrompt,
        mcpServers: bridge
          ? {
              [bridge.serverName]: {
                type: "stdio",
                command: bridge.command,
                args: bridge.args,
                env: bridge.env,
              },
            }
          : {},
      });
    } catch (err) {
      if (bridge) await bridge.close().catch(() => {});
      throw err;
    }

    const sessionId = await conv.sessionId.catch(() => `claude-code-${Date.now()}`);
    const seedPreface = buildTranscriptPreface(openOpts.priorTurns ?? []);

    return new ClaudeCodeEngineSession({
      id: sessionId,
      conv,
      bridge,
      seedPreface,
      serverName: bridge?.serverName ?? "praxis",
    });
  }

  private modelHint(): "haiku" | "sonnet" | "opus" | undefined {
    const m = this.opts.config.model;
    if (!m) return undefined;
    if (m.includes("haiku")) return "haiku";
    if (m.includes("opus")) return "opus";
    if (m.includes("sonnet")) return "sonnet";
    return undefined;
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: true, contextWindow: 200_000 },
    };
  }
}

interface ClaudeCodeSessionInit {
  id: string;
  conv: Conversation;
  bridge: ToolBridgeHandle | null;
  /** Transcript prefix applied to the FIRST send only (when seeded with priorTurns). */
  seedPreface: string;
  serverName: string;
}

class ClaudeCodeEngineSession implements EngineSession {
  readonly id: string;
  private readonly conv: Conversation;
  private readonly bridge: ToolBridgeHandle | null;
  private readonly serverName: string;
  private seedPreface: string;
  private closed = false;

  constructor(init: ClaudeCodeSessionInit) {
    this.id = init.id;
    this.conv = init.conv;
    this.bridge = init.bridge;
    this.serverName = init.serverName;
    this.seedPreface = init.seedPreface;
  }

  async *send(userMessage: string): AsyncIterable<EngineEvent> {
    if (this.closed) {
      yield {
        type: "error",
        error: { code: "session.closed", message: "EngineSession is closed", recoverable: false },
      };
      return;
    }
    // Apply seed preface only on the first send after a priorTurns-seeded open.
    const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
    this.seedPreface = "";

    const turn = this.conv.send(message);
    for await (const event of turn) {
      const mapped = mapClaudeCodeEvent(event, { serverName: this.serverName });
      if (mapped) yield mapped;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.conv.close().catch(() => {});
    if (this.bridge) await this.bridge.close().catch(() => {});
  }
}
```

**`packages/engines/src/codex/adapter.ts`** (rewritten):

```typescript
import { Codex, type Thread } from "@openai/codex-sdk";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
} from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { startToolBridge, type ToolBridgeHandle } from "../mcp/tool-bridge.js";
import { mapCodexEvent, newMapState } from "./events.js";
import { buildTranscriptPreface } from "../util/transcript.js";

export interface CodexEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class CodexEngine implements Engine {
  readonly id = "codex";
  readonly kind = "looped" as const;
  private readonly opts: CodexEngineOptions;

  constructor(opts: CodexEngineOptions) {
    this.opts = opts;
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    const bridge =
      openOpts.tools.list().length > 0 ? await startToolBridge({ registry: openOpts.tools }) : null;
    let thread: Thread;
    let codex: Codex;
    try {
      codex = new Codex({
        ...(this.opts.config.apiKey !== undefined && { apiKey: this.opts.config.apiKey }),
        ...(this.opts.config.baseUrl !== undefined && { baseUrl: this.opts.config.baseUrl }),
        config: bridge
          ? {
              mcp_servers: {
                [bridge.serverName]: {
                  command: bridge.command,
                  args: bridge.args,
                  env: bridge.env,
                },
              },
            }
          : undefined,
      });
      thread = codex.startThread({
        ...(this.opts.config.model !== undefined && { model: this.opts.config.model }),
        ...(this.opts.config.effort !== undefined && { modelReasoningEffort: this.opts.config.effort }),
        approvalPolicy: "never",
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
      });
    } catch (err) {
      if (bridge) await bridge.close().catch(() => {});
      throw err;
    }

    // Codex has no separate system slot — fold it into the seed preface for the first send.
    const seedPreface = `${openOpts.systemPrompt}\n\n---\n\n${buildTranscriptPreface(openOpts.priorTurns ?? [])}`;

    return new CodexEngineSession({
      id: thread.id ?? `codex-${Date.now()}`,
      thread,
      bridge,
      seedPreface,
      serverName: bridge?.serverName ?? "praxis",
    });
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: true, nativeMCP: true, contextWindow: 128_000 },
    };
  }
}

interface CodexSessionInit {
  id: string;
  thread: Thread;
  bridge: ToolBridgeHandle | null;
  seedPreface: string;
  serverName: string;
}

class CodexEngineSession implements EngineSession {
  readonly id: string;
  private readonly thread: Thread;
  private readonly bridge: ToolBridgeHandle | null;
  private readonly serverName: string;
  private seedPreface: string;
  private closed = false;

  constructor(init: CodexSessionInit) {
    this.id = init.id;
    this.thread = init.thread;
    this.bridge = init.bridge;
    this.serverName = init.serverName;
    this.seedPreface = init.seedPreface;
  }

  async *send(userMessage: string): AsyncIterable<EngineEvent> {
    if (this.closed) {
      yield {
        type: "error",
        error: { code: "session.closed", message: "EngineSession is closed", recoverable: false },
      };
      return;
    }
    const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
    this.seedPreface = "";

    const { events } = await this.thread.runStreamed(message);
    const state = newMapState();
    const itemIndex = { value: 0 };
    for await (const event of events) {
      const mapped = mapCodexEvent(event, { serverName: this.serverName }, state, itemIndex);
      for (const m of mapped) yield m;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Codex Thread has no close API — the CLI subprocess persists thread state on disk.
    // Drop our reference. Bridge subprocess gets torn down.
    if (this.bridge) await this.bridge.close().catch(() => {});
  }
}
```

**Implementation Notes**:

- `seedPreface` is applied ONLY to the first send after open. After that, `seedPreface = ""` and subsequent sends benefit from the SDK's native multi-turn — full prompt cache, full tool fidelity.
- All three sessions handle the `closed` flag defensively.
- `Codex.Thread` has no formal close API — its state is owned by the CLI subprocess. Closing the session is just dropping the reference + tearing down the MCP bridge. The thread persists on disk and could in theory be resumed via `codex.resumeThread(id)` — but for Phase 3 we don't expose that path.
- The Direct adapter holds `messages: ModelMessage[]` as instance state. After each `send()`, the assistant's final text is pushed onto the array so the next send sees the full history. This is the Vercel AI SDK's native multi-turn pattern.
- **Per-engine session isolation**: each `engine.open()` returns a fresh session with its own MCP bridge subprocess. Multiple Praxis sessions = multiple bridges. This is fine for Phase 3 (one student, usually one active session); a future optimization could share a bridge across sessions, but not now.
- **Error handling at open time**: if `createConversation` / `startThread` / etc. throws, the bridge is torn down before re-throwing. The caller (`SessionServiceImpl.start`) surfaces the error to the UI.

**Acceptance Criteria**:
- [ ] `runOneShot(engine, opts, "hello")` opens, sends, closes — equivalent to old `engine.run(brief, tools)`.
- [ ] `engine.open({ systemPrompt, tools })` returns an `EngineSession` whose `id` is non-empty.
- [ ] Two consecutive `session.send()` calls on the same EngineSession reuse the underlying SDK conversation (asserted via spy: `createConversation` called exactly once for two sends).
- [ ] `engine.open({ ..., priorTurns: [{role:"user",content:"a"},{role:"assistant",content:"b"}] })` followed by `session.send("c")` causes the SDK to receive a message containing the transcript prefix on the first send only; the second `send("d")` does NOT include the prefix.
- [ ] Direct adapter: messages array grows by 2 per send (user + assistant). Closing the session clears the array.
- [ ] Claude Code adapter: `conv.close()` called on `session.close()`. Bridge closed. Idempotent on re-call.
- [ ] Codex adapter: bridge closed on `session.close()`. No errors on second close.
- [ ] Engine conformance suite (`tests/engine-conformance.test.ts`) updated to use `runOneShot` and continues to assert equivalent normalized event shapes across all three adapters.

---

### Unit 5: `SessionServiceImpl` with active-session tracking + `ConfigServiceImpl`

**Files**:
- `packages/core/src/services/session-service.ts` (new)
- `packages/core/src/services/config-service.ts` (new)
- `packages/core/src/services/student.ts` (new — default-student singleton)
- `packages/core/src/services/types.ts` (new — ServiceDeps with optional engineFactory)
- `packages/core/src/services/index.ts` (new)
- `packages/core/package.json` (modified — add `./services` export, add @praxis/engines + @praxis/tools deps)
- `packages/core/src/__tests__/{session-service,config-service,student}.test.ts` (new)

**`packages/core/src/services/types.ts`**:

```typescript
import type { z } from "zod";
import type { Engine, Logger, Mode, ToolDefinition } from "../types/index.js";
import type { PraxisDb } from "../db/index.js";
import type { EngineConfig } from "../config/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Factory for constructing an Engine from a config. Optional — when omitted,
   * defaults to `createEngine` from @praxis/engines. Tests inject fakes here.
   */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
```

**`packages/core/src/services/student.ts`** (unchanged from v1):

```typescript
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { configKv } from "../schema.js";
import type { PraxisDb } from "../db/index.js";
import { brandId, type StudentId } from "../types/index.js";

const KEY = "default_student_id";

export function getOrCreateDefaultStudentId(db: PraxisDb): StudentId {
  const row = db.select().from(configKv).where(eq(configKv.key, KEY)).get();
  if (row) return brandId<"StudentId">(row.valueJson as string);
  const id = uuidv7();
  db.insert(configKv).values({ key: KEY, valueJson: id, updatedAt: new Date() }).run();
  return brandId<"StudentId">(id);
}
```

**`packages/core/src/services/session-service.ts`** (rewritten for lifecycle):

```typescript
import { v7 as uuidv7 } from "uuid";
import { and, desc, eq, isNull } from "drizzle-orm";
import { sessions } from "@praxis/memory/schema";
import { composeSystemPrompt } from "@praxis/curriculum/brief";
import { createEngine } from "@praxis/engines";
import { InProcessToolRegistry } from "@praxis/tools";
import { readEngineConfig } from "../config/index.js";
import { appendEpisodic, nextTurnIndex, recordUserMessage } from "../session/episodic.js";
import { loadConversationHistory } from "../session/history.js";
import { getOrCreateDefaultStudentId } from "./student.js";
import type {
  ConversationTurn,
  CourseId,
  Engine,
  EngineEvent,
  EngineSession,
  Mode,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
  Timestamp,
  ToolContext,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { ServiceDeps } from "./types.js";

interface ActiveEntry {
  /** The Praxis session this entry belongs to. */
  sessionId: string;
  /** EngineId currently powering the session — used to detect engine swap. */
  engineId: string;
  /** Mode the session was started with — fixed for the session's lifetime. */
  mode: Mode;
  /** Open EngineSession; receives every send for this Praxis session. */
  handle: EngineSession;
  /** Engine instance — held for diagnostics; reusable for additional sessions if we choose. */
  engine: Engine;
}

export class SessionServiceImpl implements SessionService {
  private readonly active = new Map<string, ActiveEntry>();

  constructor(private readonly deps: ServiceDeps) {}

  async start(opts: { courseId?: CourseId; modeId: string }): Promise<SessionHandle> {
    const mode = this.requireMode(opts.modeId);
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const engineConfig = readEngineConfig(this.deps.db);
    const sessionId = uuidv7();
    const startedAt = new Date();

    this.deps.db
      .insert(sessions)
      .values({
        id: sessionId,
        studentId,
        modeId: mode.id,
        engineId: engineConfig.engineId,
        startedAt,
        ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      })
      .run();

    // Eagerly open the engine session — surfaces config errors at start time.
    await this.openActive({
      sessionId,
      engineId: engineConfig.engineId,
      mode,
      studentId,
      priorTurns: [], // brand new session
    });

    return {
      sessionId: brandId<"SessionId">(sessionId),
      modeId: mode.id,
      startedAt: startedAt.getTime() as Timestamp,
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    };
  }

  async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
    const sessionRow = this.deps.db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!sessionRow) {
      yield { type: "error", error: { code: "session.not_found", message: `Unknown session: ${sessionId}`, recoverable: false } };
      return;
    }
    if (sessionRow.endedAt) {
      yield { type: "error", error: { code: "session.ended", message: "Cannot send to an ended session", recoverable: false } };
      return;
    }

    const mode = this.requireMode(sessionRow.modeId);
    const studentId = brandId<"StudentId">(sessionRow.studentId);
    const currentEngineId = readEngineConfig(this.deps.db).engineId;

    // Engine swap detection + reopen.
    let entry = this.active.get(sessionId);
    if (entry && entry.engineId !== currentEngineId) {
      this.deps.log.info("engine swap detected; closing active session", { sessionId, from: entry.engineId, to: currentEngineId });
      await entry.handle.close().catch(() => {});
      this.active.delete(sessionId);
      entry = undefined;
    }
    // Re-open if missing (process restart, swap above, or never opened).
    if (!entry) {
      const priorTurns = loadConversationHistory({ db: this.deps.db, sessionId });
      entry = await this.openActive({ sessionId, engineId: currentEngineId, mode, studentId, priorTurns });
    }

    const turnIndex = nextTurnIndex(this.deps.db, sessionId);

    // 1. Record + echo user message.
    recordUserMessage({
      db: this.deps.db,
      sessionId,
      studentId,
      engineId: entry.engineId,
      modeId: mode.id,
      turnIndex,
      content: message,
    });
    yield { type: "user_message", content: message };

    // 2. Drive the engine session for this turn; persist every event.
    try {
      for await (const event of entry.handle.send(message)) {
        try {
          appendEpisodic({
            db: this.deps.db,
            sessionId,
            studentId,
            engineId: entry.engineId,
            modeId: mode.id,
            turnIndex,
            event,
          });
        } catch (cause) {
          yield {
            type: "error",
            error: {
              code: "episodic.write_failed",
              message: cause instanceof Error ? cause.message : String(cause),
              recoverable: false,
              cause,
            },
          };
        }
        yield event;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: { code: "engine.send_failed", message, recoverable: false, cause } };
    }
  }

  async end(sessionId: SessionId): Promise<SessionSummary> {
    const entry = this.active.get(sessionId);
    if (entry) {
      await entry.handle.close().catch(() => {});
      this.active.delete(sessionId);
    }
    const endedAt = new Date();
    this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
    return {
      sessionId,
      endedAt: endedAt.getTime() as Timestamp,
      unlockedGates: [],
      newMisconceptions: 0,
    };
  }

  async active(): Promise<SessionHandle | null> {
    const studentId = getOrCreateDefaultStudentId(this.deps.db);
    const row = this.deps.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.studentId, studentId), isNull(sessions.endedAt)))
      .orderBy(desc(sessions.startedAt))
      .get();
    if (!row) return null;
    return {
      sessionId: brandId<"SessionId">(row.id),
      modeId: row.modeId,
      startedAt: row.startedAt.getTime() as Timestamp,
      ...(row.courseId !== null && { courseId: brandId<"CourseId">(row.courseId) }),
    };
  }

  /** Tear down all active engine sessions. Called on host shutdown. */
  async shutdown(): Promise<void> {
    const entries = [...this.active.values()];
    this.active.clear();
    await Promise.all(entries.map((e) => e.handle.close().catch(() => {})));
  }

  private async openActive(args: {
    sessionId: string;
    engineId: string;
    mode: Mode;
    studentId: string;
    priorTurns: ConversationTurn[];
  }): Promise<ActiveEntry> {
    const engineConfig = readEngineConfig(this.deps.db);
    const factory = this.deps.engineFactory ?? ((c, d) => createEngine({ config: c, deps: d }));
    const engine = factory(engineConfig, { log: this.deps.log });

    const systemPrompt = composeSystemPrompt({ mode: args.mode });

    const toolContext: ToolContext = {
      studentId: args.studentId as ToolContext["studentId"],
      sessionId: args.sessionId as ToolContext["sessionId"],
      services: {
        memory: null,
        artifacts: null,
        vectorStore: null,
        sandbox: null,
        sympy: null,
        pedagogyPack: null,
      },
      log: this.deps.log,
    };
    const tools = new InProcessToolRegistry({
      tools: this.deps.toolDefinitions,
      context: toolContext,
    });

    const handle = await engine.open({
      systemPrompt,
      tools,
      ...(args.priorTurns.length > 0 && { priorTurns: args.priorTurns }),
    });

    const entry: ActiveEntry = {
      sessionId: args.sessionId,
      engineId: args.engineId,
      mode: args.mode,
      handle,
      engine,
    };
    this.active.set(args.sessionId, entry);
    return entry;
  }

  private requireMode(modeId: string): Mode {
    const mode = this.deps.modes.get(modeId);
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);
    return mode;
  }
}
```

**`packages/core/src/services/config-service.ts`** (unchanged from v1):

```typescript
import {
  EngineConfigSchema,
  readEngineConfig,
  writeEngineConfig,
  type EngineConfig,
} from "../config/index.js";
import type { ConfigService, EngineConfigSnapshot } from "../types/index.js";
import type { ServiceDeps } from "./types.js";

export class ConfigServiceImpl implements ConfigService {
  constructor(private readonly deps: ServiceDeps) {}

  async isLocked(): Promise<boolean> { return false; }
  async setLockCode(_code: string): Promise<void> { throw new Error("Lock code not implemented in Phase 3"); }
  async unlock(_code: string): Promise<{ ok: boolean }> { return { ok: true }; }

  async selectedEngine(): Promise<string> {
    return readEngineConfig(this.deps.db).engineId;
  }
  async setSelectedEngine(engineId: string): Promise<void> {
    const current = readEngineConfig(this.deps.db);
    const next = EngineConfigSchema.parse({ ...current, engineId });
    writeEngineConfig(this.deps.db, next);
  }
  async engineConfig(): Promise<EngineConfigSnapshot> {
    return toSnapshot(readEngineConfig(this.deps.db));
  }
  async setEngineConfig(snapshot: EngineConfigSnapshot): Promise<void> {
    const validated = EngineConfigSchema.parse(snapshot);
    writeEngineConfig(this.deps.db, validated);
  }
}

function toSnapshot(cfg: EngineConfig): EngineConfigSnapshot {
  return {
    engineId: cfg.engineId,
    ...(cfg.model !== undefined && { model: cfg.model }),
    ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
    ...(cfg.baseUrl !== undefined && { baseUrl: cfg.baseUrl }),
    ...(cfg.effort !== undefined && { effort: cfg.effort }),
  };
}
```

**`packages/core/src/services/index.ts`**:

```typescript
export { SessionServiceImpl } from "./session-service.js";
export { ConfigServiceImpl } from "./config-service.js";
export { getOrCreateDefaultStudentId } from "./student.js";
export type { ServiceDeps } from "./types.js";
```

**`packages/core/package.json`** — add `./services` export and runtime deps on engines + tools:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./db": "./src/db/index.ts",
    "./db/show": "./src/db/show.ts",
    "./db/migrate": "./src/db/migrate.ts",
    "./schema": "./src/schema.ts",
    "./config": "./src/config/index.ts",
    "./session": "./src/session/index.ts",
    "./services": "./src/services/index.ts"
  },
  "dependencies": {
    "@praxis/artifacts": "workspace:*",
    "@praxis/curriculum": "workspace:*",
    "@praxis/engines": "workspace:*",
    "@praxis/memory": "workspace:*",
    "@praxis/tools": "workspace:*",
    "better-sqlite3": "^12.0.0",
    "drizzle-orm": "^0.36.0",
    "uuid": "^10.0.0",
    "zod": "^4.0.0"
  }
}
```

> **CLAUDE.md update required**: `@praxis/core/services` imports `@praxis/engines` and `@praxis/tools` at runtime. Document this Phase 3 exception alongside the existing dependency-direction rules.

**Implementation Notes**:

- **Eager open in `start`**: catches config errors (bad API key, missing CLI, etc.) at session-start time. The UI's chat route shows a clear error before the user types anything.
- **Engine swap detection**: on every `send`, compare `readEngineConfig().engineId` against the active entry's stored `engineId`. Mismatch → close + reopen with `priorTurns` from episodic.
- **Process restart**: `this.active` is in-memory and lost on restart. Next `send()` after restart finds no active entry, calls `openActive` with `priorTurns` from episodic, and continues. The new EngineSession's seed preface includes the prior conversation; subsequent turns resume native multi-turn.
- **Per-turn engine instance vs per-session**: in v2 we hold the engine + EngineSession for the lifetime of the Praxis session. The MCP bridge subprocess stays alive across turns — much cheaper than the v1 per-turn open/close.
- **`shutdown()`** is called by `@praxis/desktop`'s main process on `before-quit` to gracefully close all active sessions.
- **Error handling in `send`**: an error iterating the engine's stream becomes a normalized `error` event yielded to the UI. The active entry is NOT torn down on error — the user can retry on the same session. (If the underlying SDK truly broke, the next send will fail again and surface the same error; the user can `New chat` to force a fresh open.)

**Acceptance Criteria**:
- [ ] `start({ modeId: "teach" })` inserts a session row AND opens an active EngineSession (verified by spying on `engine.open`).
- [ ] `send()` second call reuses the EngineSession from the first call (only one `engine.open` for two sends; assert via spy).
- [ ] After `setEngineConfig({ engineId: "different" })` and a subsequent `send()`, the active EngineSession is closed and a new one opened.
- [ ] After `end(sessionId)`, the active entry is removed and `EngineSession.close()` was called.
- [ ] `send()` to an unknown sessionId yields a `session.not_found` error and stops.
- [ ] `send()` to an ended session yields `session.ended` and stops.
- [ ] After `shutdown()`, all active EngineSessions are closed.
- [ ] Process-restart simulation: insert events for a session, clear the in-memory active map, call `send()` — engine.open is called with `priorTurns` from episodic.
- [ ] `ConfigServiceImpl.engineConfig()` round-trips through `setEngineConfig`.
- [ ] `setEngineConfig({ engineId: "garbage" })` throws Zod validation error.

---

### Unit 6: `@praxis/client` — typed RPC + transports

**Files** (largely unchanged from v1):
- `packages/client/package.json` — same deps
- `packages/client/src/index.ts` — exports
- `packages/client/src/transport/{types,ipc,websocket}.ts` — same shape
- `packages/client/src/services/{session,config,artifacts,authoring,memory}-client.ts` — same wire format
- `packages/client/src/client.ts` — `createPraxisClient`

The transport layer (Unit 6 in v1) is unchanged. The wire format for `praxis.session.send` is still a streamed channel that pushes EngineEvents — including the new `user_message` variant. Clients consume the AsyncIterable; the discrimination on `event.type` includes `user_message` cleanly.

See v1 of this design for full Unit 6 spec — code is identical.

**Acceptance Criteria**: same as v1.

---

### Unit 7: `@praxis/desktop` — Electron host + IPC server + shutdown hook

**Files** (mostly unchanged from v1, with one addition):
- All electron-vite scaffolding, main, preload, renderer, IPC server — same as v1
- **NEW**: `packages/desktop/electron/main/index.ts` registers a `before-quit` hook that calls `services.session.shutdown()` to close all active EngineSessions cleanly

```typescript
// packages/desktop/electron/main/index.ts — addition

app.on("before-quit", async (event) => {
  if (!services) return;
  event.preventDefault();
  try {
    await services.session.shutdown();
  } finally {
    app.exit(0);
  }
});
```

The IPC server (`registerIpcHandlers`) is unchanged from v1 — channels and routing are identical. The fact that engine sessions persist across IPC calls is a service-layer concern; the IPC layer just forwards `send` calls.

**Acceptance Criteria**:
- [ ] All v1 acceptance criteria for IPC handler registration, dispatch, stream cancel, etc.
- [ ] **NEW**: `before-quit` hook invokes `services.session.shutdown()` and waits for it before exiting.

---

### Unit 8: `@praxis/ui` — React shell + chat + settings

Unchanged from v1. The UI doesn't care that engine sessions persist on the backend — it just calls `client.session.send()` and iterates events. The chat route, composer, settings route, hooks, components, styles — all identical.

The `useStreamedSend` hook handles `user_message` events naturally: when iterating the stream, the first event from the backend is now a `user_message`, but the hook already treats the user bubble as appearing immediately on submit (before any event arrives) — so it can simply ignore the inbound `user_message` event (or use it as confirmation that the backend received the message). For Phase 3, **ignore** `user_message` in the hook; the user bubble already exists in local state.

```typescript
// useStreamedSend handler (refinement vs v1):
for await (const event of client.session.send(sessionId, message)) {
  if (event.type === "user_message") continue; // already in local state
  // ... existing handling for model_message / tool_call / etc.
}
```

**Acceptance Criteria**: same as v1, plus:
- [ ] Hook ignores incoming `user_message` events (no duplicate user bubbles).

---

### Unit 9: Root scripts + dev orchestration

Unchanged from v1.

```json
{
  "scripts": {
    "dev": "pnpm --filter @praxis/desktop dev",
    "desktop:build": "pnpm --filter @praxis/desktop build",
    "desktop:start": "pnpm --filter @praxis/desktop start"
  }
}
```

> Also: update `scripts/run-session.ts` to use the lifecycle. The script becomes:
>
> ```typescript
> // ... arg parsing, config loading, tool registry construction unchanged ...
>
> const engine = createEngine({ config, deps: { log: consoleLogger } });
> const systemPrompt = composeSystemPrompt({ mode: teachMode });
> const session = await engine.open({ systemPrompt, tools });
> try {
>   for await (const event of session.send(userMessage)) {
>     renderEvent(event);
>   }
> } finally {
>   await session.close();
> }
> ```

The script remains single-turn (one CLI invocation = one user message). Multi-turn from the CLI would require a REPL; out of scope.

---

### Unit 10: Tests for multi-turn end-to-end

**Files**:
- `tests/multi-turn.test.ts` (new)
- `packages/engines/src/__tests__/multi-turn.test.ts` (new — adapter session reuse)
- `tests/engine-conformance.test.ts` (UPDATED — uses `runOneShot` wrapper)

**`tests/multi-turn.test.ts`**:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { SessionServiceImpl, type ServiceDeps } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { echoTool } from "@praxis/tools/test-tools";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  Logger,
  Mode,
} from "@praxis/core/types";

class RecordingFakeSession implements EngineSession {
  readonly id = `fake-session-${Math.random()}`;
  public sentMessages: string[] = [];
  public closeCount = 0;
  constructor(public readonly priorTurnsAtOpen: ReadonlyArray<{ role: "user" | "assistant"; content: string }>) {}
  async *send(message: string): AsyncIterable<EngineEvent> {
    this.sentMessages.push(message);
    const reply = `Reply ${this.sentMessages.length}`;
    yield { type: "model_message", content: reply, partial: false };
    yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } };
  }
  async close() { this.closeCount++; }
}

class RecordingFakeEngine implements Engine {
  readonly id = "fake.recording";
  readonly kind = "single-shot" as const;
  public openCount = 0;
  public lastSession: RecordingFakeSession | null = null;
  async open(opts: EngineOpenOptions): Promise<EngineSession> {
    this.openCount++;
    this.lastSession = new RecordingFakeSession(opts.priorTurns ?? []);
    return this.lastSession;
  }
  async health() {
    return { ok: true, capabilities: { vision: false, streaming: true, nativeMCP: false, contextWindow: 100_000 } };
  }
}

let tmpDir: string, dbPath: string;
const log: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-multiturn-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
  runMigrations({ path: dbPath });
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of stream) out.push(x);
  return out;
}

describe("multi-turn lifecycle through SessionServiceImpl", () => {
  it("opens engine session once for multiple sends", async () => {
    const { db } = openDb({ path: dbPath });
    const engine = new RecordingFakeEngine();
    const deps: ServiceDeps = {
      db, log,
      modes: new Map<string, Mode>([[teachMode.id, teachMode]]),
      toolDefinitions: [echoTool],
      engineFactory: () => engine,
    };
    const svc = new SessionServiceImpl(deps);
    const handle = await svc.start({ modeId: "teach" });
    expect(engine.openCount).toBe(1);
    expect(engine.lastSession?.priorTurnsAtOpen).toEqual([]);

    await drain(svc.send(handle.sessionId, "first"));
    await drain(svc.send(handle.sessionId, "second"));
    await drain(svc.send(handle.sessionId, "third"));

    expect(engine.openCount).toBe(1); // session reused
    expect(engine.lastSession?.sentMessages).toEqual(["first", "second", "third"]);
  });

  it("reopens with priorTurns after end and re-start (process restart simulation)", async () => {
    const { db } = openDb({ path: dbPath });
    const engine = new RecordingFakeEngine();
    const deps: ServiceDeps = { db, log, modes: new Map([[teachMode.id, teachMode]]), toolDefinitions: [], engineFactory: () => engine };
    const svc = new SessionServiceImpl(deps);
    const handle = await svc.start({ modeId: "teach" });
    await drain(svc.send(handle.sessionId, "hello"));
    await svc.shutdown(); // simulates process exit

    // New service instance — same DB.
    const svc2 = new SessionServiceImpl(deps);
    await drain(svc2.send(handle.sessionId, "still there?"));

    // Engine reopened with priorTurns from episodic
    expect(engine.openCount).toBe(2);
    expect(engine.lastSession?.priorTurnsAtOpen).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Reply 1" },
    ]);
  });

  it("reopens on engine swap mid-session", async () => {
    const { db } = openDb({ path: dbPath });
    const engineA = new RecordingFakeEngine();
    const engineB = new RecordingFakeEngine();
    let useEngineB = false;
    const deps: ServiceDeps = {
      db, log,
      modes: new Map([[teachMode.id, teachMode]]),
      toolDefinitions: [],
      engineFactory: () => (useEngineB ? engineB : engineA),
    };
    // ... stub readEngineConfig via writing config; set initial engineId; send; change engineId; send again
    // Assert: engineA opened once, closed once. engineB opened once with priorTurns.
  });
});
```

**`packages/engines/src/__tests__/multi-turn.test.ts`** — per-adapter session reuse:

For each adapter, assert that two consecutive `session.send()` calls invoke the underlying SDK's continuation API (e.g., `conv.send` called twice on the same `Conversation` instance — `createConversation` only called once).

**`tests/engine-conformance.test.ts`** — updated to use `runOneShot`:

```typescript
import { runOneShot } from "@praxis/engines";

// ... existing scenario setup ...

it("Direct adapter produces normalized turn", async () => {
  mockVercelForScenario();
  const engine = new DirectEngine({ config: { engineId: "direct.anthropic" }, deps: { log: noopLogger }, provider: "anthropic" });
  const turn = await collect(runOneShot(engine, { systemPrompt: "...", tools: registry }, SCENARIO_USER_MESSAGE));
  // ... existing assertions unchanged ...
});
```

**Acceptance Criteria**:
- [ ] `multi-turn.test.ts`: engine.open called once for three sends.
- [ ] Process-restart simulation: second SessionServiceImpl instance reopens engine with priorTurns from episodic.
- [ ] Engine swap test: old engine.close called, new engine.open called with priorTurns.
- [ ] Adapter session-reuse tests: each adapter's underlying SDK conversation is reused across sends.
- [ ] Engine conformance suite (Phase 2) continues to pass with `runOneShot`.

---

## Implementation Order

1. **Unit 1** — Engine lifecycle contract (foundation; everything downstream depends on this).
2. **Unit 2** — `composeBrief` + `composeSystemPrompt`.
3. **Unit 3** — `@praxis/core/session` history helpers.
4. **Unit 4** — Engine adapter rewrites for lifecycle (sequential within adapters; can parallelize the three after the shared `runOneShot` + `transcript.ts` land). Update Phase 2 conformance tests in this unit.
5. **Unit 5** — `@praxis/core/services` (depends on Units 2, 3, 4).
6. **Unit 6** — `@praxis/client` (depends on Unit 1's contract; can parallelize with Unit 5).
7. **Unit 7** — `@praxis/desktop` (depends on Units 5, 6).
8. **Unit 8** — `@praxis/ui` (depends on Unit 6; can parallelize with Unit 7).
9. **Unit 9** — Root scripts + run-session.ts update (depends on Unit 7 for `pnpm dev`, Unit 4 for runOneShot).
10. **Unit 10** — Multi-turn integration tests (depends on Unit 5; FakeEngine implements the lifecycle).

Units 1–5 are sequential. Units 6/7/8 can be split as 6 first then 7+8 in parallel. Unit 9 and 10 close.

---

## Testing

### Per-package tests

| Test file | What it tests |
|---|---|
| `packages/core/src/__tests__/history.test.ts` | `loadConversationHistory` projection: single turn, multi-step turn, error-only turn, redacted skip, ordering. |
| `packages/core/src/__tests__/episodic.test.ts` (extended) | `nextTurnIndex`, `recordUserMessage`. |
| `packages/core/src/__tests__/session-service.test.ts` | start/send/end/active flows; session reuse across sends; engine swap reopens; process-restart simulation; error paths. |
| `packages/core/src/__tests__/config-service.test.ts` | engineConfig round-trip; setSelectedEngine; validation rejection. |
| `packages/core/src/__tests__/student.test.ts` | `getOrCreateDefaultStudentId` is idempotent. |
| `packages/curriculum/src/__tests__/compose.test.ts` (extended) | `composeBrief` + `composeSystemPrompt`; override of non-customizable throws. |
| `packages/engines/src/__tests__/{direct,claude-code,codex}.test.ts` (rewritten) | Lifecycle: open returns a session; two sends reuse SDK conversation; close cleans up bridge + SDK session. |
| `packages/engines/src/__tests__/transcript.test.ts` | `buildTranscriptPreface` formatting. |
| `packages/client/src/__tests__/client.test.ts` | createPraxisClient routes calls to transport invoke/stream. |
| `packages/client/src/__tests__/ipc-transport.test.ts` | streamAsAsyncIterable: events, done, error, cancel-on-break. |
| `packages/desktop/src/__tests__/ipc-server.test.ts` | handler registration, dispatch routing, stream cancel, unregister teardown, before-quit shutdown. |
| `packages/ui/src/__tests__/chat-route.test.tsx` | renders, calls start on mount, send updates bubbles, ignores echoed user_message. |
| `packages/ui/src/__tests__/settings-route.test.tsx` | loads config on mount, save calls setEngineConfig. |
| `packages/ui/src/__tests__/use-streamed-send.test.tsx` | partial deltas accumulate; non-partial overwrites; user_message ignored; error sets lastError. |

### Integration tests (root `tests/`)

| Test file | What it tests |
|---|---|
| `tests/multi-turn.test.ts` | SessionServiceImpl × FakeEngine: session reuse, process-restart rebuild, engine swap. |
| `tests/engine-conformance.test.ts` (updated) | All three real adapters via `runOneShot` produce equivalent normalized event shapes. |

### Manual M1 walkthrough

1. `pnpm dev` opens Electron.
2. Type "Tell me about photosynthesis briefly." → assistant streams a response.
3. Type "Now explain it as if I'm 8 years old." → assistant references the prior explanation (proves multi-turn with native cache).
4. Open Settings → switch to `direct.anthropic` → enter `ANTHROPIC_API_KEY` → save.
5. Send another message → goes through Direct adapter, with conversation history from the Claude Code session preserved (engine swap path).
6. `pnpm db:episodic` shows the session, both engine ids, and all events ordered chronologically.

---

## Verification Checklist

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test                # 90 existing + ~40 new
pnpm desktop:build
pnpm dev                 # manual M1 test
```

---

## Out of scope (defer)

- WebSocket transport implementation (Phase 15+).
- Lock-code UI (Phase 11).
- Course / lesson context (Phase 6).
- Authoring / memory inspector (Phase 11).
- Per-tool-call rendering in chat.
- Conversation summarization for long histories.
- Mid-session UI affordance for explicit session resume.
- Native installer (Phase 15).
- Codex `resumeThread` after process restart — Phase 3 always opens a fresh thread on restart and seeds with priorTurns; preserving thread ids across restarts is a Phase 7 polish.

## Notes for the implementer

- **`@praxis/core/services` runtime imports `@praxis/engines` and `@praxis/tools`.** Update CLAUDE.md to document this targeted exception (only `core/services/`, not the rest of `core/`).
- **Phase 2 conformance suite + `scripts/run-session.ts` MUST be updated** as part of Unit 4. They use `engine.run()` today; they need to call `runOneShot` (single-turn wrapper) instead. The mock helpers (`mock-cc-stream.ts`, etc.) don't change.
- **`createConversation` `systemPrompt` option**: Phase 2 already uses this successfully. If the SDK shape ever changes, fall back to prepending the system prompt to the seed preface (same pattern as Codex).
- **Codex thread persistence**: Codex threads persist on disk in the CLI subprocess. We don't expose `resumeThread` in Phase 3 — every `engine.open` calls `startThread` fresh and seeds with priorTurns. A future optimization could save the thread id in episodic and resume across process restarts.
- **electron-vite cache**: `out/` and `.vite/` go in `.gitignore`.
- **`drizzle/` location**: from `pnpm dev`, `process.cwd()` is `packages/desktop`. Use `path.resolve(__dirname, "../../../../drizzle")` from `out/main/index.js` to find the repo-root drizzle folder.
- **Conventions**: ESM, `import type`, `.js` extensions, kebab-case files, CSS Modules colocated, `*.test.ts` / `*.test.tsx` in `src/__tests__/`.
- **React 19**: `createRoot` + `<StrictMode>`. No legacy `forwardRef` for new components.
