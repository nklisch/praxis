# Design: Phase 3 — UI Shell + IPC Transport + Chat (Multi-Turn)

## Overview

Phase 3 closes the loop: a real Electron app where a student opens the desktop window, types into a chat, and watches a streamed tutor response — multi-turn, with the agent fully aware of the conversation so far. The same vertical slice runs against any of the three Phase 2 engines, selected from a settings UI.

This phase lands four things:

1. **Real multi-turn conversation.** The agent sees the full prior conversation on every turn. Brief composition reads conversation history from episodic, threads it through to each engine adapter via `Brief.priorTurns`, and each adapter translates to its native conversation format. The framework owns history; engines stay stateless across `run()` calls per the contract.
2. **`@praxis/client`** — typed PraxisClient surface plus an `IpcTransport` for Electron and a typed-stub `WebSocketTransport` (Phase 15 will fill in the latter).
3. **`@praxis/desktop`** — Electron main + preload + IPC server. Routes IPC channels to service implementations in `@praxis/core`. Loads the `@praxis/ui` renderer in a BrowserWindow.
4. **`@praxis/ui`** — Vite + React 19 + TanStack Router shell. Two routes: `/` (chat) and `/settings` (engine selection + per-engine config). CSS Modules for styling. Streamed assistant messages render token-by-token.

After Phase 3, `pnpm dev` opens an Electron window. The user types; the assistant streams back; the conversation continues across turns with full memory; the engine can be switched in settings without restarting; the entire transcript persists to SQLite as immutable episodic events. **Integration milestone M1** is reached: UI → IPC → core → engine → response → episodic → display, working across all three adapters.

**What ships:**

- Type contract additions: `EngineEvent.user_message` variant, `Brief.priorTurns?`, `ConversationTurn` type
- `@praxis/core/session` additions: `recordUserMessage`, `loadConversationHistory`, `nextTurnIndex`, `SessionServiceImpl`, `ConfigServiceImpl`
- `@praxis/curriculum/brief`: `composeBrief` accepts `priorTurns`
- `@praxis/engines/{direct,claude-code,codex}/adapter.ts`: each consumes `brief.priorTurns` and threads to its native API
- `@praxis/client`: types, `ClientTransport` interface, `IpcTransport`, `WebSocketTransport` (stub), `createPraxisClient(transport)`
- `@praxis/desktop`: Electron main, preload, BrowserWindow management, IPC server, app lifecycle, `pnpm dev` orchestration via electron-vite
- `@praxis/ui`: React 19 + TanStack Router (code-based) shell, `ChatRoute`, `SettingsRoute`, `RootLayout`, `mountPraxisApp(el, { client })` bootstrap
- Root `pnpm dev` script

**What does not ship (later phases):**

- Multi-student install (one student-of-record stored in `config_kv`)
- Lock-code gating (Phase 11)
- Course / lesson context loading (Phase 6)
- Authoring UI (Phase 11)
- Memory inspector (Phase 11)
- Real conversation summarization for very-long contexts (the priorTurns array goes to the model verbatim; truncation is a Phase 7 concern)
- Native installer / packaging (Phase 15)

## Scope and assumptions

- **Multi-turn is non-negotiable.** Every `client.session.send()` reads conversation history from episodic, packages it as `priorTurns`, and the engine sees it. An agent that forgets between turns of the same session would be a fundamental product break for a tutor — this design rules it out.
- **Engines remain stateless across `run()` calls** per CONTRACT.md. We do **not** rely on Claude Code SDK's internal session persistence or Codex's `resumeThread`; instead, every adapter rebuilds the conversation from the `Brief.priorTurns` we hand it. This preserves the productization invariant and keeps the framework as the single source of truth for memory.
- **History fidelity = text turns.** `ConversationTurn` for Phase 3 is `{ role: "user" | "assistant", content: string }`. The assistant content for a multi-step turn is the concatenation of all final (non-partial) `model_message` events from that turn, joined with `"\n"`. Tool calls within a turn are not separately re-injected into the history (the agent sees the textual outcome, which is normally enough). Tool-call replay is a Phase 7 refinement.
- **Default-student singleton.** Phase 3 has one student per install. The studentId is stored under `config_kv` key `"default_student_id"` — generated on first launch as a UUIDv7, never rotated. Multi-student selection is much later.
- **Default course = none.** Phase 3 sessions have no `courseId`. The `SessionService.start({ modeId: "teach" })` signature drops the required `courseId` (an additive contract change — `courseId` becomes optional). All Phase 1 / Phase 2 code that looks at `courseId` already treats it as optional at the storage layer.
- **Active-session resume**: the desktop window always starts with no active session. `client.session.active()` returns `null` on launch. A "New chat" button (or the chat opening fresh) creates a session via `client.session.start()`. Mid-session window restart loses the in-memory current session pointer; the episodic is intact and could be resumed via a UI affordance later, but Phase 3 keeps it simple.
- **Settings scope**: engine selection (`engineId`) plus per-engine fields (`model`, `apiKey`, `baseUrl`). Save writes through `ConfigService.setEngineConfig()` which calls `writeEngineConfig()` from Phase 2. Changes take effect on the next `session.start()`.
- **Electron security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer never sees `ipcRenderer`; it sees only `window.praxis`, a thin object exposed via `contextBridge.exposeInMainWorld()` from preload.
- **Build tool**: `electron-vite` (5.x). Single config bundles main + preload + renderer; HMR for the renderer; works downstream with `electron-builder` (Phase 15) without changes.
- **React 19** + **TanStack Router 1.x** (code-based routes; no file-based generator). React 19 is current; TanStack Router code-based avoids the file-based generator's build step which doesn't add value at 2 routes.
- **Styling**: CSS Modules. Co-located `<Component>.module.css` files. No utility framework; explicit, scoped, vite-native.
- **No Playwright / E2E in Phase 3**. The test checkpoint is "open the app and type" — a manual verification. Automated tests cover the IPC server, conversation history, multi-turn engine behavior, and the React components in isolation.

## Dependency direction (Phase 3 confirms and respects)

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

@praxis/core                             (Phase 3 additions: services, session history, user-msg)
  ├─ existing: @praxis/artifacts, @praxis/memory, @praxis/curriculum
  └─ Phase 3 NEW exports: ./services (SessionServiceImpl, ConfigServiceImpl)

@praxis/engines                          (Phase 3 additions: priorTurns plumbing per adapter)
  └─ unchanged direction; each adapter reads brief.priorTurns
```

The renderer never imports `@praxis/core` at runtime. The IPC bridge is the only crossing point. Both deployment shapes (local Electron, future hosted) reuse the same `@praxis/client` surface — only the transport implementation changes.

---

## Implementation Units

### Unit 1: Type contract additions for multi-turn

**File**: `packages/core/src/types/engine.ts`, `packages/core/src/types/conversation.ts` (new)

Three additive changes (no breaking renames or removals):

```typescript
// packages/core/src/types/conversation.ts (NEW)

/**
 * One side of a conversation turn, in chronological order. The framework
 * projects these from episodic events and threads them through Brief.priorTurns
 * on every engine.run(). Engines remain stateless across runs — they consume
 * priorTurns to reconstruct context per call.
 *
 * Phase 3: text-only fidelity. Assistant content for a multi-step turn is the
 * concatenation of all final model_message contents in that turn, joined with
 * "\n". Tool calls and results within a turn are not re-injected into history;
 * the agent sees the assistant's final textual response. Phase 7 may upgrade
 * fidelity (replaying tool exchanges) when needed.
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}
```

```typescript
// packages/core/src/types/engine.ts — modified

import type { ConversationTurn } from "./conversation.js";  // NEW import

export interface Brief {
  systemPrompt: string;
  userMessage: string;
  context: BriefContext;
  /**
   * Conversation turns from earlier in the session, in chronological order
   * (oldest first). Does NOT include the current turn — `userMessage` is the
   * current turn's user input. Engine adapters thread this through to native
   * conversation APIs.
   */
  priorTurns?: ConversationTurn[];  // NEW
  maxSteps?: number;
  generation?: GenerationParams;
}

export type EngineEvent =
  | { type: "user_message"; content: string }                        // NEW
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };
```

```typescript
// packages/core/src/types/index.ts — modified to re-export
export type * from "./conversation.js";
```

```typescript
// packages/core/src/types/client.ts — modified

export interface SessionService {
  // courseId becomes optional for Phase 3 (no courses yet).
  start(opts: { courseId?: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId;  // NEW: optional in Phase 3
  modeId: string;
  startedAt: Timestamp;
}

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
  // Phase 3 additions:
  engineConfig(): Promise<EngineConfig>;
  setEngineConfig(config: EngineConfig): Promise<void>;
}
```

`EngineConfig` is imported from `@praxis/core/config` — NOT from `@praxis/core/types`. The `ConfigService` interface in `client.ts` will need an import of the type. Since `client.ts` is in `core/types/` and `config/schema.ts` lives in `core/config/`, we either inline the type or accept the cross-folder import. **Choose inline**: redeclare the relevant subset as `EngineConfigSnapshot` to keep `client.ts` free of reaching into other core subfolders.

Final shape:

```typescript
// In client.ts:
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
  engineConfig(): Promise<EngineConfigSnapshot>;
  setEngineConfig(config: EngineConfigSnapshot): Promise<void>;
}
```

The `SessionServiceImpl` (Unit 4) cross-validates the snapshot against `EngineConfigSchema` from `@praxis/core/config` before persisting.

**Implementation Notes**:

- `EngineEvent.user_message` is **emitted only by the framework**, never by an engine. Engine adapters never produce it. Document this in a JSDoc comment on the variant.
- `Brief.priorTurns` is optional. When undefined or empty, adapters behave exactly as in Phase 2 (single-turn).
- `SessionHandle.courseId` becoming optional is additive; existing Phase 2 code already treated it as optional at the DB layer (the `sessions.courseId` column is nullable).
- Update `docs/CONTRACT.md` `## Engine adapter contract` and `## Client RPC contract` sections to reflect the new fields.

**Acceptance Criteria**:
- [ ] `Brief.priorTurns` typechecks as `ConversationTurn[] | undefined`.
- [ ] `EngineEvent` discriminated union includes `user_message` variant; existing usages of `EngineEvent` still typecheck unchanged (no narrowing breaks because the new variant is appended).
- [ ] `SessionService.start({ modeId: "teach" })` typechecks with no `courseId`.
- [ ] `ConfigService` includes both legacy methods and `engineConfig` / `setEngineConfig`.
- [ ] Existing Phase 1/2 tests still pass; the `ToolDefinitionSummary.test-d.ts` file (if present) is unchanged.
- [ ] `docs/CONTRACT.md` is updated with the new fields.

---

### Unit 2: Conversation history helpers in `@praxis/core/session`

**Files**:
- `packages/core/src/session/history.ts` (new)
- `packages/core/src/session/episodic.ts` (modified — add `nextTurnIndex`, `recordUserMessage`)
- `packages/core/src/session/index.ts` (re-export new helpers)
- `packages/core/src/__tests__/history.test.ts` (new)

**`packages/core/src/session/episodic.ts` additions**:

```typescript
import { eq, max } from "drizzle-orm";

/**
 * Return the next turn index for a session — `max(turnIndex) + 1`, or 0 if
 * the session has no events yet. Used by SessionServiceImpl to assign
 * monotonically-increasing turn numbers as the user sends messages.
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

/**
 * Record a user_message episodic event. Called by SessionServiceImpl before
 * dispatching to the engine — the user's input is part of the immutable
 * transcript, not a side input that vanishes after the turn.
 */
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
 * Read all (non-redacted) episodic events for a session, in chronological
 * order, and project to ConversationTurn[]. Each turn (turnIndex value)
 * yields one user turn (from its user_message event) followed by one
 * assistant turn (from concatenated model_message contents) IF the turn
 * actually produced assistant output. Turns containing only an `error`
 * event yield no assistant turn for that index — the model never spoke.
 *
 * Pure read — does not mutate. Safe to call from any worker.
 */
export function loadConversationHistory(input: LoadConversationHistoryInput): ConversationTurn[] {
  const rows = input.db
    .select()
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, input.sessionId))
    .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
    .all();

  // Group by turnIndex.
  const byTurn = new Map<number, EngineEvent[]>();
  for (const row of rows) {
    if (row.redactedAt) continue; // skip redacted projections
    const evt = row.eventJson as EngineEvent;
    const list = byTurn.get(row.turnIndex);
    if (list) list.push(evt);
    else byTurn.set(row.turnIndex, [evt]);
  }

  const orderedTurnIndices = [...byTurn.keys()].sort((a, b) => a - b);
  const turns: ConversationTurn[] = [];

  for (const turnIdx of orderedTurnIndices) {
    const events = byTurn.get(turnIdx);
    if (!events) continue;

    // User message first.
    const userEvent = events.find((e): e is Extract<EngineEvent, { type: "user_message" }> =>
      e.type === "user_message",
    );
    if (userEvent) {
      turns.push({ role: "user", content: userEvent.content });
    }

    // Assistant message: concat all FINAL (non-partial) model_message contents.
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

/**
 * Look up the most recent (still-open) session for a student, or return
 * undefined if none. "Open" means `endedAt` is null. Used by
 * SessionServiceImpl.active().
 */
export function findActiveSession(db: PraxisDb, studentId: string) {
  // Implementation in `packages/core/src/session/active.ts` — see Unit 4.
}
```

**Implementation Notes**:

- The history loader sorts by `(turnIndex ASC, ts ASC)` — this gives chronological order within and across turns.
- `redactedAt` events are skipped. Phase 3 doesn't redact anything but the helper respects the flag for forward-compat.
- Concatenating non-partial `model_message` contents handles the multi-step case: when an agent responds, optionally calls a tool, responds again, the assistant turn captures the full final text. Partials (streaming deltas) are excluded — they were duplicated into a final non-partial event by the adapter.
- The function is pure and read-only — easy to unit-test against a seeded DB.

**Acceptance Criteria**:
- [ ] `nextTurnIndex` returns 0 on a session with no events; returns `max+1` after events exist.
- [ ] `recordUserMessage` writes an episodic row with `eventJson.type === "user_message"` and the correct content/turnIndex.
- [ ] `loadConversationHistory` on a session with one full turn (user_message + model_message + final) returns `[{role:"user",content:"X"}, {role:"assistant",content:"Y"}]`.
- [ ] Multi-step turn: user_message + 2× model_message (non-partial) + tool_call + tool_result + model_message + final → returns the user turn plus an assistant turn whose content is `"first\nsecond\nthird"` (or whatever was emitted), excluding partials.
- [ ] Turn with only an error event (no model_message) yields just the user turn (no orphan assistant turn).
- [ ] Turns are ordered by `turnIndex ASC` regardless of ts ordering quirks.
- [ ] Redacted events (`redactedAt != null`) are skipped.

---

### Unit 3: Brief composition with `priorTurns`

**File**: `packages/curriculum/src/brief/compose.ts` (modified)

```typescript
export interface ComposeBriefInput {
  mode: Mode;
  userMessage: string;
  context?: Partial<BriefContext>;
  overrides?: ReadonlyMap<string, string>;
  generation?: GenerationParams;
  maxSteps?: number;
  /**
   * Conversation turns from earlier in the session, oldest first. Threaded
   * straight into Brief.priorTurns. Does NOT include the current user turn —
   * that's `userMessage`.
   */
  priorTurns?: ConversationTurn[];  // NEW
}

export function composeBrief(input: ComposeBriefInput): Brief {
  // ... existing fragment ordering / override logic unchanged ...

  return {
    systemPrompt: sections.join("\n\n"),
    userMessage: input.userMessage,
    context: {
      retrievedChunks: input.context?.retrievedChunks ?? [],
      ...(input.context?.studentSummary !== undefined && { studentSummary: input.context.studentSummary }),
      artifactRefs: input.context?.artifactRefs ?? [],
    },
    ...(input.priorTurns !== undefined && input.priorTurns.length > 0 && { priorTurns: input.priorTurns }),
    ...(input.maxSteps !== undefined && { maxSteps: input.maxSteps }),
    ...(input.generation !== undefined && { generation: input.generation }),
  };
}
```

**Implementation Notes**:
- `priorTurns` only appears in the returned `Brief` if non-empty (per `exactOptionalPropertyTypes`).
- No fragment-level handling — fragments don't see priorTurns; engines do. Modes can't customize how priorTurns is presented because each adapter handles it natively.

**Acceptance Criteria**:
- [ ] `composeBrief({ mode, userMessage: "hi", priorTurns: [...] })` returns a Brief whose `priorTurns` matches.
- [ ] `composeBrief({ mode, userMessage: "hi" })` returns a Brief with no `priorTurns` field.
- [ ] `composeBrief({ mode, userMessage: "hi", priorTurns: [] })` returns a Brief with no `priorTurns` field (empty arrays normalized away).

---

### Unit 4: Engine adapter updates for `priorTurns`

**Files**:
- `packages/engines/src/direct/adapter.ts` (modified)
- `packages/engines/src/claude-code/adapter.ts` (modified)
- `packages/engines/src/codex/adapter.ts` (modified)
- `packages/engines/src/util/transcript.ts` (new — shared transcript serializer)
- `packages/engines/src/__tests__/{direct,claude-code,codex}.test.ts` (extend with priorTurns tests)

**`packages/engines/src/util/transcript.ts`** (new):

```typescript
import type { ConversationTurn } from "@praxis/core/types";

/**
 * Serialize prior conversation turns into a plain-text transcript that can be
 * prepended to a single user message. Used by adapters whose underlying SDK
 * does not accept a structured message array (Claude Code via createConversation,
 * Codex via Thread). The Direct adapter does NOT use this — it threads turns
 * natively into the Vercel AI SDK messages array.
 *
 * Format:
 *
 *   Earlier in this conversation:
 *
 *   User: <prior user 1>
 *   Tutor: <prior assistant 1>
 *   User: <prior user 2>
 *   Tutor: <prior assistant 2>
 *
 *   Current message:
 *
 *   <current user message>
 */
export function buildTranscriptPrefix(
  priorTurns: ReadonlyArray<ConversationTurn>,
  currentUserMessage: string,
): string {
  if (priorTurns.length === 0) return currentUserMessage;
  const lines = ["Earlier in this conversation:", ""];
  for (const turn of priorTurns) {
    const label = turn.role === "user" ? "User" : "Tutor";
    lines.push(`${label}: ${turn.content}`);
  }
  lines.push("", "Current message:", "", currentUserMessage);
  return lines.join("\n");
}
```

**`packages/engines/src/direct/adapter.ts`** — modified `run()` to thread priorTurns natively:

```typescript
import type { ModelMessage } from "ai";

async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
  const model = resolveModel(this.opts.provider, this.opts.config);
  const messages: ModelMessage[] = [];
  for (const turn of brief.priorTurns ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: brief.userMessage });

  const result = streamText({
    model,
    system: brief.systemPrompt,
    messages,
    tools: toVercelTools(tools),
    stopWhen: stepCountIs(brief.maxSteps ?? 8),
    ...(brief.generation?.temperature !== undefined && { temperature: brief.generation.temperature }),
    ...(brief.generation?.maxTokens !== undefined && { maxTokens: brief.generation.maxTokens }),
  });
  // ... existing fullStream consumption unchanged ...
}
```

**`packages/engines/src/claude-code/adapter.ts`** — modified `run()` to use the transcript prefix:

```typescript
async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
  const bridge = tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
  try {
    const conv = createConversation({
      ...(this.modelHint() !== undefined && { model: this.modelHint() }),
      ...(brief.maxSteps !== undefined && { maxTurns: brief.maxSteps }),
      systemPrompt: brief.systemPrompt,  // already passes systemPrompt — verify SDK accepts it; if not, prepend to user msg
      mcpServers: bridge ? { [bridge.serverName]: { type: "stdio", command: bridge.command, args: bridge.args, env: bridge.env } } : {},
    });
    try {
      const userMessage = buildTranscriptPrefix(brief.priorTurns ?? [], brief.userMessage);
      const turn = conv.send(userMessage);
      // ... existing event mapping unchanged ...
    } finally {
      await conv.close().catch(() => {});
    }
  } finally {
    if (bridge) await bridge.close().catch(() => {});
  }
}
```

**`packages/engines/src/codex/adapter.ts`** — modified `run()` to include transcript:

```typescript
async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
  const bridge = tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
  try {
    const codex = new Codex({ /* unchanged */ });
    const thread = codex.startThread({ /* unchanged */ });
    const userMessage = `${brief.systemPrompt}\n\n---\n\n${buildTranscriptPrefix(brief.priorTurns ?? [], brief.userMessage)}`;
    const { events } = await thread.runStreamed(userMessage);
    // ... existing event mapping unchanged ...
  } finally {
    if (bridge) await bridge.close().catch(() => {});
  }
}
```

**Implementation Notes**:

- The Direct adapter is the only one with native multi-turn support — Vercel AI SDK's `messages` array maps cleanly to `ConversationTurn[]`.
- Claude Code and Codex use the text transcript fallback because each `engine.run()` call creates a fresh conversation (per the stateless contract). The transcript prefix gives the agent the full context as readable prose.
- The transcript format is intentionally simple: `User:` / `Tutor:` line prefixes. The model parses this naturally; no special markup needed.
- Important: when no `priorTurns`, all three adapters behave exactly as Phase 2. No regression.
- For the Claude Code adapter, **verify** at implementation time whether `createConversation` accepts a `systemPrompt` option in the current `@nklisch/claude-cli-sdk`. If not, prepend `brief.systemPrompt` to the user message similar to the Codex pattern. The Phase 2 implementation already had to make this choice — if it worked there, the option exists; if it didn't, the prepend pattern is already in place.

**Acceptance Criteria**:
- [ ] `buildTranscriptPrefix([], "hi")` returns exactly `"hi"`.
- [ ] `buildTranscriptPrefix([{role:"user",content:"a"},{role:"assistant",content:"b"}], "c")` returns the labeled multi-line transcript ending in "c".
- [ ] Direct adapter, with `priorTurns` set, passes a messages array of length `priorTurns.length + 1` to a mocked `streamText` (assert via spy).
- [ ] Claude Code adapter, with `priorTurns` set, calls `conv.send` with a string containing both `"User: "` and `"Tutor: "` markers (assert via spy on a mocked SDK).
- [ ] Codex adapter, with `priorTurns` set, calls `thread.runStreamed` with a string containing the transcript markers.
- [ ] All three adapters with no `priorTurns` produce the same output as Phase 2 (regression check via existing conformance tests).

---

### Unit 5: Service implementations in `@praxis/core`

**Files**:
- `packages/core/src/services/index.ts` (new)
- `packages/core/src/services/session-service.ts` (new)
- `packages/core/src/services/config-service.ts` (new)
- `packages/core/src/services/student.ts` (new — default-student singleton)
- `packages/core/src/services/types.ts` (new — shared service deps)
- `packages/core/package.json` — add `./services` export
- `packages/core/src/__tests__/session-service.test.ts` (new)
- `packages/core/src/__tests__/config-service.test.ts` (new)
- `packages/core/src/__tests__/student.test.ts` (new)

**`packages/core/src/services/types.ts`** (new):

```typescript
import type { Logger, Mode } from "../types/index.js";
import type { PraxisDb } from "../db/index.js";
import type { ToolDefinition } from "../types/index.js";
import type { z } from "zod";

/**
 * Cross-cutting dependencies passed to every service implementation.
 * The desktop host (or any future hosted server) constructs these once
 * and shares them across all service instances.
 */
export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Modes the system knows about; used for SessionServiceImpl to resolve mode by id. */
  modes: ReadonlyMap<string, Mode>;
  /**
   * Tools available to engine sessions. Phase 3 wires the test tools (echo,
   * now); later phases register real tool sets per mode. The engine layer
   * sees these via the InProcessToolRegistry constructed inside SessionService.
   */
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
}
```

**`packages/core/src/services/student.ts`** (new):

```typescript
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { configKv } from "../schema.js";
import type { PraxisDb } from "../db/index.js";
import { brandId, type StudentId } from "../types/index.js";

const KEY = "default_student_id";

/**
 * Read the singleton default-student ID from config_kv, generating and
 * persisting one on first access. Phase 3 has one student per install;
 * this is that student. Multi-student is much later.
 */
export function getOrCreateDefaultStudentId(db: PraxisDb): StudentId {
  const row = db.select().from(configKv).where(eq(configKv.key, KEY)).get();
  if (row) {
    return brandId<"StudentId">(row.valueJson as string);
  }
  const id = uuidv7();
  db.insert(configKv)
    .values({ key: KEY, valueJson: id, updatedAt: new Date() })
    .run();
  return brandId<"StudentId">(id);
}
```

**`packages/core/src/services/session-service.ts`** (new):

```typescript
import { v7 as uuidv7 } from "uuid";
import { eq, and, isNull, desc } from "drizzle-orm";
import { sessions } from "@praxis/memory/schema";
import { composeBrief } from "@praxis/curriculum/brief";
import { createEngine } from "@praxis/engines";
import { InProcessToolRegistry } from "@praxis/tools";
import { readEngineConfig } from "../config/index.js";
import { SessionRunner } from "../session/runner.js";
import { recordUserMessage, nextTurnIndex } from "../session/episodic.js";
import { loadConversationHistory } from "../session/history.js";
import { getOrCreateDefaultStudentId } from "./student.js";
import type {
  CourseId,
  EngineEvent,
  Mode,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
  StudentId,
  Timestamp,
  ToolContext,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { ServiceDeps } from "./types.js";

/**
 * The concrete SessionService used by the desktop IPC host (and the future
 * hosted backend). Wraps the SessionRunner with multi-turn history loading
 * and engine instantiation per turn.
 *
 * Engines are constructed per `send()` call, not per session — this keeps
 * the door open for engine switching mid-session and matches the stateless
 * engine contract.
 */
export class SessionServiceImpl implements SessionService {
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

    return {
      sessionId: brandId<"SessionId">(sessionId),
      modeId: mode.id,
      startedAt: startedAt.getTime() as Timestamp,
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    };
  }

  async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
    const sessionRow = this.deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    if (!sessionRow) {
      yield {
        type: "error",
        error: { code: "session.not_found", message: `Unknown session: ${sessionId}`, recoverable: false },
      };
      return;
    }
    if (sessionRow.endedAt) {
      yield {
        type: "error",
        error: { code: "session.ended", message: "Cannot send to an ended session", recoverable: false },
      };
      return;
    }

    const mode = this.requireMode(sessionRow.modeId);
    const studentId = brandId<"StudentId">(sessionRow.studentId);
    const engineConfig = readEngineConfig(this.deps.db);

    const turnIndex = nextTurnIndex(this.deps.db, sessionId);

    // 1. Record user message (immutable).
    recordUserMessage({
      db: this.deps.db,
      sessionId,
      studentId,
      engineId: engineConfig.engineId,
      modeId: mode.id,
      turnIndex,
      content: message,
    });
    yield { type: "user_message", content: message }; // emit to UI for echo

    // 2. Load history (includes the just-recorded user message? No — we want priors only).
    const allHistory = loadConversationHistory({ db: this.deps.db, sessionId });
    // Strip the trailing user turn we just recorded (it IS the current message).
    const priorTurns =
      allHistory.length > 0 && allHistory[allHistory.length - 1]?.role === "user"
        ? allHistory.slice(0, -1)
        : allHistory;

    // 3. Build brief.
    const brief = composeBrief({
      mode,
      userMessage: message,
      ...(priorTurns.length > 0 && { priorTurns }),
    });

    // 4. Spin up engine + tools for this turn.
    const engine = createEngine({ config: engineConfig, deps: { log: this.deps.log } });
    const toolContext: ToolContext = {
      studentId,
      sessionId,
      services: { memory: null, artifacts: null, vectorStore: null, sandbox: null, sympy: null, pedagogyPack: null },
      log: this.deps.log,
    };
    const tools = new InProcessToolRegistry({
      tools: this.deps.toolDefinitions,
      context: toolContext,
    });

    // 5. Run the turn through SessionRunner.
    const runner = new SessionRunner({ db: this.deps.db, studentId, mode, engine, tools });
    yield* runner.runTurn({ brief, sessionId, turnIndex });
  }

  async end(sessionId: SessionId): Promise<SessionSummary> {
    const endedAt = new Date();
    this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();
    return {
      sessionId,
      endedAt: endedAt.getTime() as Timestamp,
      unlockedGates: [],       // Phase 9 fills in
      newMisconceptions: 0,    // Phase 7 fills in
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

  private requireMode(modeId: string): Mode {
    const mode = this.deps.modes.get(modeId);
    if (!mode) throw new Error(`Unknown mode: ${modeId}`);
    return mode;
  }
}
```

**`packages/core/src/services/config-service.ts`** (new):

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

  async isLocked(): Promise<boolean> {
    return false; // Phase 11 wires real lock state.
  }
  async setLockCode(_code: string): Promise<void> {
    throw new Error("Lock code not implemented in Phase 3");
  }
  async unlock(_code: string): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async selectedEngine(): Promise<string> {
    return readEngineConfig(this.deps.db).engineId;
  }
  async setSelectedEngine(engineId: string): Promise<void> {
    const current = readEngineConfig(this.deps.db);
    const next = EngineConfigSchema.parse({ ...current, engineId });
    writeEngineConfig(this.deps.db, next);
  }

  async engineConfig(): Promise<EngineConfigSnapshot> {
    const cfg = readEngineConfig(this.deps.db);
    return toSnapshot(cfg);
  }

  async setEngineConfig(snapshot: EngineConfigSnapshot): Promise<void> {
    // Validate against the canonical schema before persisting.
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

**`packages/core/src/services/index.ts`** (new):

```typescript
export { SessionServiceImpl } from "./session-service.js";
export { ConfigServiceImpl } from "./config-service.js";
export { getOrCreateDefaultStudentId } from "./student.js";
export type { ServiceDeps } from "./types.js";
```

**`packages/core/package.json`** — add `./services` to exports:

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

> **NOTE on the new core deps**: `@praxis/core/services` imports from `@praxis/engines` and `@praxis/tools` at runtime. This is a Phase 3 dependency relaxation — the existing CLAUDE.md rule says `@praxis/core` only depends on artifacts/memory/curriculum. Update CLAUDE.md to allow this targeted exception: **`@praxis/core/services` may import `@praxis/engines` and `@praxis/tools` at runtime**, while the rest of `@praxis/core` keeps the prior dependency posture. Document this exception in CLAUDE.md alongside the existing dependency-direction rules.
>
> Rationale: the service layer is the framework's wiring point for engines + tools. The alternative — pushing service implementations into a new `@praxis/services` package — is more code with no benefit. The allowed reverse-dependency is from `core/services/` only; `core/types/`, `core/db/`, `core/config/`, `core/session/` remain free of engines/tools imports.

**Implementation Notes**:

- `SessionServiceImpl.send` is an `async function*` — it yields `EngineEvent`s as they arrive. The IPC server (Unit 7) consumes this AsyncIterable and forwards each event over the IPC stream channel.
- The engine is instantiated **per `send()` call** rather than per session. This is intentional: it lets engine config changes (Settings UI) take effect immediately on the next turn, and matches the stateless engine contract.
- The `user_message` event is yielded to the UI right after recording it, so the UI can render the user's bubble without round-tripping through episodic.
- `loadConversationHistory` is called AFTER `recordUserMessage`, so we strip the just-recorded user turn from the tail before passing as `priorTurns`. This keeps the source-of-truth (episodic) authoritative without double-counting.
- `active()` returns the most-recently-started session with `endedAt = NULL` for the default student. Phase 3 doesn't expose a UI to resume; it's there for `client.session.active()` to return non-null after a session is started, useful for the chat UI to know whether to call `start()`.
- Lock methods are stubs (Phase 11); the ConfigService implements only the engine-config methods meaningfully.

**Acceptance Criteria**:
- [ ] `getOrCreateDefaultStudentId(db)` on a fresh DB writes a UUIDv7 to `config_kv` and returns it; subsequent calls return the same value (no rotation).
- [ ] `SessionServiceImpl.start({ modeId: "teach" })` inserts a row into `sessions` with the correct studentId, modeId, engineId from current config.
- [ ] `SessionServiceImpl.send` against a session that doesn't exist yields an `error` event with code `"session.not_found"` and stops.
- [ ] `SessionServiceImpl.send` against an ended session yields `"session.ended"` and stops.
- [ ] `SessionServiceImpl.send` first yields a `user_message` event, then forwards engine events. The user_message event is also persisted to episodic (assert by reading the table).
- [ ] After two `send()` calls on the same session, the second call's brief includes `priorTurns` of length 2 (the first user + first assistant).
- [ ] `SessionServiceImpl.end(sessionId)` sets `endedAt` and returns a `SessionSummary` with empty unlockedGates / zero misconceptions.
- [ ] `SessionServiceImpl.active()` returns the latest open session for the default student; returns `null` when no open sessions exist.
- [ ] `ConfigServiceImpl.engineConfig()` returns the current `EngineConfigSnapshot`; round-trips through `setEngineConfig` correctly.
- [ ] `ConfigServiceImpl.setEngineConfig({ engineId: "garbage" })` throws a Zod validation error.

---

### Unit 6: `@praxis/client` — typed RPC + transports

**Files**:
- `packages/client/package.json` (modified — add deps)
- `packages/client/src/index.ts` (rewrite — real exports)
- `packages/client/src/types.ts` (new — re-export types from core)
- `packages/client/src/transport/types.ts` (new)
- `packages/client/src/transport/ipc.ts` (new)
- `packages/client/src/transport/websocket.ts` (new — typed stub, throws on use)
- `packages/client/src/client.ts` (new — `createPraxisClient(transport)`)
- `packages/client/src/services/{session,config,artifacts,authoring,memory}-client.ts` (new — typed wrappers)
- `packages/client/src/__tests__/{client,ipc-transport}.test.ts` (new)

**`packages/client/package.json`**:

```json
{
  "name": "@praxis/client",
  "version": "0.3.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./transport": "./src/transport/types.ts",
    "./transport/ipc": "./src/transport/ipc.ts",
    "./transport/websocket": "./src/transport/websocket.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@praxis/core": "workspace:*",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/uuid": "^10.0.0"
  }
}
```

> Note: `@praxis/core` is listed as a dependency, but `@praxis/client` only imports **types** from it (per CLAUDE.md). The `package.json` declares the dep so workspaces resolve it; TypeScript imports use `import type` exclusively. No runtime code crosses.

**`packages/client/src/transport/types.ts`** (new):

```typescript
/**
 * Generic transport interface — two implementations (IPC for Electron,
 * WebSocket for hosted). `@praxis/client` consumes this; the host (desktop
 * or hosted server) provides a concrete instance at boot.
 */
export interface ClientTransport {
  /** Single-shot request/response RPC. */
  invoke<TResp = unknown>(channel: string, args?: unknown): Promise<TResp>;

  /**
   * Streamed RPC. Returns an AsyncIterable of events. The transport handles
   * setup/teardown of whatever per-stream identifier the host needs. When the
   * consumer breaks out of the for-await loop, the transport sends a cancel
   * signal to the host.
   */
  stream<TEvent = unknown>(channel: string, args?: unknown): AsyncIterable<TEvent>;
}
```

**`packages/client/src/transport/ipc.ts`** (new):

```typescript
import { v7 as uuidv7 } from "uuid";
import type { ClientTransport } from "./types.js";

/**
 * The shape preload exposes via contextBridge as `window.praxis`. The IpcTransport
 * accepts this object (any conforming shape works) so tests can mock it cleanly.
 */
export interface PraxisIpcBridge {
  /** Invoke RPC. Returns the host's response. */
  invoke(channel: string, args?: unknown): Promise<unknown>;
  /**
   * Subscribe to per-stream events. The host pushes objects of the form
   * `{ kind: "event", value: T }` or `{ kind: "done" }` or `{ kind: "error", error: { code, message } }`.
   * Returns an unsubscribe function.
   */
  subscribe(channel: string, handler: (msg: IpcStreamMessage) => void): () => void;
}

export type IpcStreamMessage<T = unknown> =
  | { kind: "event"; value: T }
  | { kind: "done" }
  | { kind: "error"; error: { code: string; message: string } };

/**
 * Build a ClientTransport backed by an Electron contextBridge. The bridge is
 * supplied at construction time so tests can inject a fake.
 */
export function createIpcTransport(bridge: PraxisIpcBridge): ClientTransport {
  return {
    invoke: (channel, args) => bridge.invoke(channel, args) as Promise<never>,
    stream: <TEvent>(channel: string, args?: unknown) => streamAsAsyncIterable<TEvent>(bridge, channel, args),
  };
}

async function* streamAsAsyncIterable<TEvent>(
  bridge: PraxisIpcBridge,
  startChannel: string,
  args: unknown,
): AsyncGenerator<TEvent, void, void> {
  const streamId = uuidv7();
  const eventsChannel = `${startChannel}.events.${streamId}`;
  const cancelChannel = `${startChannel}.cancel`;

  // Buffer of arrived events not yet yielded.
  const queue: TEvent[] = [];
  let done = false;
  let errorMsg: { code: string; message: string } | null = null;
  let resolve: (() => void) | null = null;

  const wakeup = () => {
    const r = resolve;
    resolve = null;
    if (r) r();
  };

  const unsubscribe = bridge.subscribe(eventsChannel, (msg) => {
    if (msg.kind === "event") queue.push(msg.value as TEvent);
    else if (msg.kind === "done") done = true;
    else if (msg.kind === "error") {
      errorMsg = msg.error;
      done = true;
    }
    wakeup();
  });

  // Tell host to start streaming on the events channel for this streamId.
  await bridge.invoke(`${startChannel}.start`, { streamId, args });

  try {
    while (true) {
      if (queue.length > 0) {
        const next = queue.shift() as TEvent;
        yield next;
        continue;
      }
      if (done) {
        if (errorMsg) {
          throw new IpcStreamError(errorMsg.code, errorMsg.message);
        }
        return;
      }
      await new Promise<void>((r) => {
        resolve = r;
      });
    }
  } finally {
    unsubscribe();
    if (!done) {
      // Consumer broke out early — tell host to cancel.
      bridge.invoke(cancelChannel, { streamId }).catch(() => {});
    }
  }
}

export class IpcStreamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IpcStreamError";
  }
}
```

**`packages/client/src/transport/websocket.ts`** (new — typed stub):

```typescript
import type { ClientTransport } from "./types.js";

/**
 * Phase 3 ships a typed stub. Real implementation lands when the hosted
 * deployment ships (Phase 15+).
 */
export function createWebSocketTransport(_url: string): ClientTransport {
  return {
    invoke: () => Promise.reject(new Error("WebSocket transport not implemented in v1 (local-first only)")),
    stream: async function* () {
      throw new Error("WebSocket transport not implemented in v1 (local-first only)");
    },
  };
}
```

**`packages/client/src/services/session-client.ts`** (new):

```typescript
import type {
  CourseId,
  EngineEvent,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  start: "praxis.session.start",
  send: "praxis.session.send",   // streamed: .start / .events.<id> / .cancel
  end: "praxis.session.end",
  active: "praxis.session.active",
} as const;

export function createSessionClient(transport: ClientTransport): SessionService {
  return {
    start: (opts) => transport.invoke<SessionHandle>(C.start, opts),
    send: (sessionId: SessionId, message: string) =>
      transport.stream<EngineEvent>(C.send, { sessionId, message }),
    end: (sessionId: SessionId) => transport.invoke<SessionSummary>(C.end, { sessionId }),
    active: () => transport.invoke<SessionHandle | null>(C.active),
  };
}
```

**`packages/client/src/services/config-client.ts`** (new):

```typescript
import type { ConfigService, EngineConfigSnapshot } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  isLocked: "praxis.config.isLocked",
  setLockCode: "praxis.config.setLockCode",
  unlock: "praxis.config.unlock",
  selectedEngine: "praxis.config.selectedEngine",
  setSelectedEngine: "praxis.config.setSelectedEngine",
  engineConfig: "praxis.config.engineConfig",
  setEngineConfig: "praxis.config.setEngineConfig",
} as const;

export function createConfigClient(transport: ClientTransport): ConfigService {
  return {
    isLocked: () => transport.invoke<boolean>(C.isLocked),
    setLockCode: (code) => transport.invoke<void>(C.setLockCode, { code }),
    unlock: (code) => transport.invoke<{ ok: boolean }>(C.unlock, { code }),
    selectedEngine: () => transport.invoke<string>(C.selectedEngine),
    setSelectedEngine: (engineId) => transport.invoke<void>(C.setSelectedEngine, { engineId }),
    engineConfig: () => transport.invoke<EngineConfigSnapshot>(C.engineConfig),
    setEngineConfig: (config) => transport.invoke<void>(C.setEngineConfig, { config }),
  };
}
```

**`packages/client/src/services/{artifacts,authoring,memory}-client.ts`** — Phase 3 stubs that throw `"not implemented in Phase 3"` for every method, with TODO comments indicating the phase that fills them in. Each returns the typed service interface so the PraxisClient surface is complete.

**`packages/client/src/client.ts`** (new):

```typescript
import type { PraxisClient } from "@praxis/core/types";
import type { ClientTransport } from "./transport/types.js";
import { createSessionClient } from "./services/session-client.js";
import { createConfigClient } from "./services/config-client.js";
import { createArtifactsClient } from "./services/artifacts-client.js";
import { createAuthoringClient } from "./services/authoring-client.js";
import { createMemoryClient } from "./services/memory-client.js";

export function createPraxisClient(transport: ClientTransport): PraxisClient {
  return {
    session: createSessionClient(transport),
    config: createConfigClient(transport),
    artifacts: createArtifactsClient(transport),
    author: createAuthoringClient(transport),
    memory: createMemoryClient(transport),
  };
}
```

**`packages/client/src/index.ts`** (rewrite):

```typescript
export { createPraxisClient } from "./client.js";
export { createIpcTransport, IpcStreamError, type PraxisIpcBridge, type IpcStreamMessage } from "./transport/ipc.js";
export { createWebSocketTransport } from "./transport/websocket.js";
export type { ClientTransport } from "./transport/types.js";
export const PACKAGE_NAME = "@praxis/client" as const;
```

**Implementation Notes**:

- `streamAsAsyncIterable` is the heart of the transport — it converts the push-style IPC subscription into a pull-style AsyncGenerator. The queue + wakeup pattern is standard for this conversion.
- Per-stream channel names include a UUID so concurrent streams don't collide.
- On consumer break-out (e.g., React unmount mid-stream), `finally` sends a cancel signal so the host stops the underlying engine work.
- All client services use the canonical `@praxis/core/types` interfaces — they're typed exactly the same as the host-side service implementations. The implementations differ; the contracts match.
- The Phase 3 service stubs (artifacts, author, memory) **throw** rather than returning fake data — that's honest about scope.

**Acceptance Criteria**:
- [ ] `createPraxisClient(transport)` returns an object with `session`, `config`, `artifacts`, `author`, `memory` keys, each implementing the corresponding service interface.
- [ ] `client.session.start({ modeId: "teach" })` calls `transport.invoke("praxis.session.start", { modeId: "teach" })` (verified via spy on a fake transport).
- [ ] `client.session.send(sessionId, "hi")` calls `transport.stream("praxis.session.send", { sessionId, message: "hi" })`.
- [ ] IPC transport: `subscribe` is called before `invoke(.start)` (so events aren't lost on fast-emitting streams).
- [ ] IPC transport: when the host emits `{kind:"event"}` then `{kind:"done"}`, the consumer's for-await receives the event then the loop exits cleanly.
- [ ] IPC transport: when the host emits `{kind:"error"}`, the for-await loop throws an `IpcStreamError` with the right code+message.
- [ ] IPC transport: when the consumer `break`s the for-await mid-stream, the transport invokes the cancel channel.
- [ ] WebSocket transport methods reject / throw with a clear "not implemented" message.
- [ ] Stub clients (artifacts/author/memory) throw on call.

---

### Unit 7: `@praxis/desktop` — Electron host + IPC server

**Files**:
- `packages/desktop/package.json` (rewrite — add electron, electron-vite, deps)
- `packages/desktop/electron.vite.config.ts` (new)
- `packages/desktop/electron/main/index.ts` (new — Electron main entry)
- `packages/desktop/electron/main/window.ts` (new — BrowserWindow factory)
- `packages/desktop/electron/main/ipc-server.ts` (new — registers IPC handlers, routes to services)
- `packages/desktop/electron/main/services.ts` (new — constructs ServiceDeps + service instances)
- `packages/desktop/electron/main/migrations.ts` (new — runs migrations on app startup)
- `packages/desktop/electron/preload/index.ts` (new — exposes window.praxis via contextBridge)
- `packages/desktop/electron/renderer/index.html` (new)
- `packages/desktop/electron/renderer/index.tsx` (new — bootstrap entry)
- `packages/desktop/electron/renderer/global.d.ts` (new — types `window.praxis`)
- `packages/desktop/src/index.ts` (rewrite — package marker + types)
- `packages/desktop/src/__tests__/ipc-server.test.ts` (new — handler dispatch tests)
- `packages/desktop/tsconfig.json` (modified — include `electron/`)
- `packages/desktop/tsconfig.electron.json` (new — separate config for electron/ paths)

**`packages/desktop/package.json`**:

```json
{
  "name": "@praxis/desktop",
  "version": "0.3.0",
  "type": "module",
  "main": "./out/main/index.js",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.electron.json",
    "test": "vitest run",
    "dev": "electron-vite dev",
    "start": "electron-vite preview"
  },
  "dependencies": {
    "@praxis/client": "workspace:*",
    "@praxis/core": "workspace:*",
    "@praxis/curriculum": "workspace:*",
    "@praxis/tools": "workspace:*",
    "@praxis/ui": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "electron": "^41.3.0",
    "electron-vite": "^5.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0"
  }
}
```

**`packages/desktop/electron.vite.config.ts`** (new):

```typescript
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "electron/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "electron/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "electron/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        // Lets renderer imports use absolute paths if needed
      },
    },
  },
});
```

**`packages/desktop/electron/main/services.ts`** (new):

```typescript
import { openDb } from "@praxis/core/db";
import { ConfigServiceImpl, SessionServiceImpl, type ServiceDeps } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { echoTool, nowTool } from "@praxis/tools/test-tools";
import type { Logger, Mode } from "@praxis/core/types";

export interface BuiltServices {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  deps: ServiceDeps;
}

export function buildServices(): BuiltServices {
  const { db } = openDb(); // resolves PRAXIS_DB_PATH or default OS dir

  const log: Logger = {
    debug: (m, f) => console.debug(`[debug] ${m}`, f ?? {}),
    info: (m, f) => console.info(`[info] ${m}`, f ?? {}),
    warn: (m, f) => console.warn(`[warn] ${m}`, f ?? {}),
    error: (m, f) => console.error(`[error] ${m}`, f ?? {}),
  };

  const modes = new Map<string, Mode>([[teachMode.id, teachMode]]);

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions: [echoTool, nowTool],
  };

  return {
    session: new SessionServiceImpl(deps),
    config: new ConfigServiceImpl(deps),
    deps,
  };
}
```

**`packages/desktop/electron/main/migrations.ts`** (new):

```typescript
import { runMigrations } from "@praxis/core/db/migrate";
import { app } from "electron";
import { join } from "node:path";

/** Locate the bundled `drizzle/` directory and apply pending migrations on startup. */
export function applyMigrations(): void {
  // In dev, drizzle/ lives at the repo root. In packaged production, it ships
  // alongside the app's resources.
  const migrationsFolder = app.isPackaged
    ? join(process.resourcesPath, "drizzle")
    : join(process.cwd(), "drizzle");
  runMigrations({ migrationsFolder });
}
```

**`packages/desktop/electron/main/ipc-server.ts`** (new):

```typescript
import { ipcMain, type BrowserWindow } from "electron";
import type { BuiltServices } from "./services.js";

/**
 * Register all IPC handlers. Each handler routes to a method on the built
 * service instances. Streamed methods (only `praxis.session.send` for Phase 3)
 * use a `.start` invoke + per-stream events channel + `.cancel` invoke.
 *
 * The function returns an `unregister` callback for tests/teardown.
 */
export function registerIpcHandlers(opts: {
  services: BuiltServices;
  /** Resolves the active BrowserWindow at handler-call time so we can push events. */
  getWindow: () => BrowserWindow | null;
}): () => void {
  const { services, getWindow } = opts;

  // --- session ---
  ipcMain.handle("praxis.session.start", async (_e, args) => services.session.start(args));
  ipcMain.handle("praxis.session.end", async (_e, args) => services.session.end(args.sessionId));
  ipcMain.handle("praxis.session.active", async () => services.session.active());

  // session.send is streamed.
  const activeStreams = new Map<string, AbortController>();

  ipcMain.handle("praxis.session.send.start", async (_e, args: { streamId: string; args: { sessionId: string; message: string } }) => {
    const { streamId, args: streamArgs } = args;
    const eventsChannel = `praxis.session.send.events.${streamId}`;
    const ctrl = new AbortController();
    activeStreams.set(streamId, ctrl);

    void (async () => {
      try {
        for await (const event of services.session.send(
          streamArgs.sessionId as never,
          streamArgs.message,
        )) {
          if (ctrl.signal.aborted) break;
          getWindow()?.webContents.send(eventsChannel, { kind: "event", value: event });
        }
        getWindow()?.webContents.send(eventsChannel, { kind: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        getWindow()?.webContents.send(eventsChannel, {
          kind: "error",
          error: { code: "session.send.failed", message },
        });
      } finally {
        activeStreams.delete(streamId);
      }
    })();
  });

  ipcMain.handle("praxis.session.send.cancel", async (_e, args: { streamId: string }) => {
    activeStreams.get(args.streamId)?.abort();
    activeStreams.delete(args.streamId);
  });

  // --- config ---
  ipcMain.handle("praxis.config.isLocked", async () => services.config.isLocked());
  ipcMain.handle("praxis.config.setLockCode", async (_e, args) => services.config.setLockCode(args.code));
  ipcMain.handle("praxis.config.unlock", async (_e, args) => services.config.unlock(args.code));
  ipcMain.handle("praxis.config.selectedEngine", async () => services.config.selectedEngine());
  ipcMain.handle("praxis.config.setSelectedEngine", async (_e, args) => services.config.setSelectedEngine(args.engineId));
  ipcMain.handle("praxis.config.engineConfig", async () => services.config.engineConfig());
  ipcMain.handle("praxis.config.setEngineConfig", async (_e, args) => services.config.setEngineConfig(args.config));

  return () => {
    for (const ctrl of activeStreams.values()) ctrl.abort();
    activeStreams.clear();
    for (const channel of [
      "praxis.session.start",
      "praxis.session.end",
      "praxis.session.active",
      "praxis.session.send.start",
      "praxis.session.send.cancel",
      "praxis.config.isLocked",
      "praxis.config.setLockCode",
      "praxis.config.unlock",
      "praxis.config.selectedEngine",
      "praxis.config.setSelectedEngine",
      "praxis.config.engineConfig",
      "praxis.config.setEngineConfig",
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}
```

**`packages/desktop/electron/main/window.ts`** (new):

```typescript
import { BrowserWindow, shell } from "electron";
import { join } from "node:path";

const isDev = !!process.env.ELECTRON_RENDERER_URL;

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}
```

**`packages/desktop/electron/main/index.ts`** (new):

```typescript
import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window.js";
import { applyMigrations } from "./migrations.js";
import { buildServices } from "./services.js";
import { registerIpcHandlers } from "./ipc-server.js";

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  applyMigrations();
  const services = buildServices();
  registerIpcHandlers({ services, getWindow: () => mainWindow });

  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

**`packages/desktop/electron/preload/index.ts`** (new):

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { PraxisIpcBridge, IpcStreamMessage } from "@praxis/client";

const bridge: PraxisIpcBridge = {
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  subscribe: (channel, handler) => {
    const wrapped = (_e: IpcRendererEvent, msg: IpcStreamMessage) => handler(msg);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("praxis", bridge);
```

**`packages/desktop/electron/renderer/index.html`** (new):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" />
    <title>Praxis</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

**`packages/desktop/electron/renderer/global.d.ts`** (new):

```typescript
import type { PraxisIpcBridge } from "@praxis/client";

declare global {
  interface Window {
    praxis: PraxisIpcBridge;
  }
}
```

**`packages/desktop/electron/renderer/index.tsx`** (new):

```typescript
import { createPraxisClient, createIpcTransport } from "@praxis/client";
import { mountPraxisApp } from "@praxis/ui";

const transport = createIpcTransport(window.praxis);
const client = createPraxisClient(transport);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
mountPraxisApp(rootEl, { client });
```

**`packages/desktop/tsconfig.electron.json`** (new):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["electron/**/*.ts", "electron/**/*.tsx", "electron/**/*.d.ts"]
}
```

**`packages/desktop/tsconfig.json`** (modified — keep src/ as composite project, exclude electron/):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["dist", "out", "electron"]
}
```

**`packages/desktop/src/index.ts`** (rewrite):

```typescript
export const PACKAGE_NAME = "@praxis/desktop" as const;
```

**`packages/desktop/src/__tests__/ipc-server.test.ts`** (new) — tests handler dispatch by mocking `electron`'s `ipcMain` at module level. Pattern:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (channel: string, fn: never) => handlers.set(channel, fn as never),
      removeHandler: (channel: string) => handlers.delete(channel),
    },
    BrowserWindow: vi.fn(),
    __handlers: handlers, // test-only escape hatch
  };
});

import { registerIpcHandlers } from "../../electron/main/ipc-server.js";

describe("ipc-server", () => {
  it("registers session handlers and routes start to SessionService.start", async () => {
    const fakeServices = {
      session: { start: vi.fn().mockResolvedValue({ sessionId: "s1" } as never) },
      config: {} as never,
      deps: {} as never,
    };
    const unregister = registerIpcHandlers({
      services: fakeServices as never,
      getWindow: () => null,
    });
    const electron = await import("electron");
    const handler = (electron as unknown as { __handlers: Map<string, never> }).__handlers.get("praxis.session.start");
    const result = await (handler as never as (e: unknown, args: unknown) => Promise<unknown>)(null, { modeId: "teach" });
    expect(fakeServices.session.start).toHaveBeenCalledWith({ modeId: "teach" });
    expect(result).toEqual({ sessionId: "s1" });
    unregister();
  });
});
```

**Implementation Notes**:

- The `electron-vite` toolchain handles main + preload + renderer compilation. Output goes to `out/{main,preload,renderer}/`.
- The renderer entry is in `electron/renderer/` (not `src/`) because that's the convention electron-vite expects. The `src/` folder remains the package's TypeScript source for the `@praxis/desktop` library export (just `PACKAGE_NAME` for now).
- Two tsconfigs: `tsconfig.json` for the (essentially empty) library `src/` (composite project for the workspace `tsc -b`), and `tsconfig.electron.json` for the Electron + renderer code (DOM lib, no composite).
- Streaming pattern: client invokes `.start` with a streamId, server kicks off async iteration in the background pushing events on `events.<streamId>`, server invokes `.cancel` if the consumer breaks early.
- `getWindow()` is called per-event so we always push to the current window (handles window recreation on macOS dock-click).
- The migrations folder location is environment-dependent. In dev, drizzle/ is at repo root. In packaged production (Phase 15), it ships in `process.resourcesPath`.

**Acceptance Criteria**:
- [ ] `pnpm --filter @praxis/desktop build` produces `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html`.
- [ ] `pnpm --filter @praxis/desktop typecheck` passes for both tsconfigs.
- [ ] IPC handler unit tests: `praxis.session.start` invokes `services.session.start` with the same args.
- [ ] IPC handler unit test: `praxis.session.send.start` triggers `services.session.send` and pushes events to `webContents.send` (mock `getWindow().webContents.send` and assert calls).
- [ ] IPC handler unit test: `praxis.session.send.cancel` aborts the stream and prevents further events.
- [ ] `unregister()` returned by `registerIpcHandlers` removes all handlers and aborts active streams.
- [ ] Preload's exposed `bridge` matches the `PraxisIpcBridge` type contract.
- [ ] BrowserWindow webPreferences include `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

---

### Unit 8: `@praxis/ui` — React shell + chat + settings

**Files**:
- `packages/ui/package.json` (rewrite — add deps)
- `packages/ui/tsconfig.json` (modified — JSX, DOM lib)
- `packages/ui/src/index.ts` (rewrite — exports)
- `packages/ui/src/mount.tsx` (new — `mountPraxisApp`)
- `packages/ui/src/app.tsx` (new — root layout + router)
- `packages/ui/src/router.tsx` (new — TanStack Router code-based routes)
- `packages/ui/src/context/client-context.tsx` (new — React context exposing PraxisClient)
- `packages/ui/src/routes/chat.tsx` (new — chat surface)
- `packages/ui/src/routes/chat.module.css` (new)
- `packages/ui/src/routes/settings.tsx` (new — settings UI)
- `packages/ui/src/routes/settings.module.css` (new)
- `packages/ui/src/components/{message,composer,nav}.tsx` + `.module.css` (new — chat building blocks)
- `packages/ui/src/hooks/use-streamed-send.ts` (new — chat send hook)
- `packages/ui/src/styles/global.css` (new — reset + design tokens)
- `packages/ui/src/__tests__/{chat-route,settings-route,use-streamed-send}.test.tsx` (new)
- `packages/ui/vitest.config.ts` (new — JSDOM env for component tests)

**`packages/ui/package.json`**:

```json
{
  "name": "@praxis/ui",
  "version": "0.3.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@praxis/client": "workspace:*",
    "@tanstack/react-router": "^1.168.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.0"
  }
}
```

**`packages/ui/tsconfig.json`** (modified):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"],
  "exclude": ["dist"]
}
```

**`packages/ui/vitest.config.ts`** (new):

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: [],
  },
});
```

> Note: this requires adding `@vitejs/plugin-react` and `vite` as devDependencies of `@praxis/ui`. Update package.json accordingly.

**`packages/ui/src/context/client-context.tsx`** (new):

```typescript
import { createContext, useContext, type ReactNode } from "react";
import type { PraxisClient } from "@praxis/core/types";

const PraxisClientContext = createContext<PraxisClient | null>(null);

export function PraxisClientProvider(props: { client: PraxisClient; children: ReactNode }) {
  return <PraxisClientContext.Provider value={props.client}>{props.children}</PraxisClientContext.Provider>;
}

export function usePraxisClient(): PraxisClient {
  const c = useContext(PraxisClientContext);
  if (!c) throw new Error("usePraxisClient called outside PraxisClientProvider");
  return c;
}
```

**`packages/ui/src/router.tsx`** (new):

```typescript
import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { ChatRoute } from "./routes/chat.js";
import { SettingsRoute } from "./routes/settings.js";
import { Nav } from "./components/nav.js";

const rootRoute = createRootRoute({
  component: () => (
    <div data-app-shell>
      <Nav />
      <main>
        <Outlet />
      </main>
    </div>
  ),
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([chatRoute, settingsRoute]);
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

**`packages/ui/src/app.tsx`** (new):

```typescript
import { RouterProvider } from "@tanstack/react-router";
import type { PraxisClient } from "@praxis/core/types";
import { router } from "./router.js";
import { PraxisClientProvider } from "./context/client-context.js";
import "./styles/global.css";

export function PraxisApp(props: { client: PraxisClient }) {
  return (
    <PraxisClientProvider client={props.client}>
      <RouterProvider router={router} />
    </PraxisClientProvider>
  );
}
```

**`packages/ui/src/mount.tsx`** (new):

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { PraxisClient } from "@praxis/core/types";
import { PraxisApp } from "./app.js";

export function mountPraxisApp(container: Element, opts: { client: PraxisClient }): { unmount: () => void } {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <PraxisApp client={opts.client} />
    </StrictMode>,
  );
  return { unmount: () => root.unmount() };
}
```

**`packages/ui/src/hooks/use-streamed-send.ts`** (new):

```typescript
import { useCallback, useRef, useState } from "react";
import type { EngineEvent, SessionId } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";

export interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True while streaming partial deltas; flips false after a non-partial model_message arrives. */
  streaming: boolean;
}

export interface UseStreamedSendResult {
  bubbles: ChatBubble[];
  send: (sessionId: SessionId, message: string) => Promise<void>;
  resetBubbles: () => void;
  inFlight: boolean;
  lastError: string | null;
}

/**
 * Drives one chat session's bubble list. On `send`, appends a user bubble and
 * an empty assistant bubble, then iterates the streamed EngineEvents:
 * - text deltas append to the current assistant bubble
 * - non-partial model_messages overwrite the bubble's content (final form)
 * - tool_call/tool_result events surface as muted system lines (collapsed in v1)
 * - error events flip lastError
 */
export function useStreamedSend(): UseStreamedSendResult {
  const client = usePraxisClient();
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const bubbleIdCounter = useRef(0);

  const newId = () => `b${++bubbleIdCounter.current}`;

  const send = useCallback(
    async (sessionId: SessionId, message: string) => {
      setInFlight(true);
      setLastError(null);
      const userId = newId();
      const assistantId = newId();
      setBubbles((b) => [
        ...b,
        { id: userId, role: "user", content: message, streaming: false },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      try {
        let partialBuffer = "";
        for await (const event of client.session.send(sessionId, message)) {
          handleEvent(event, assistantId, (updater) => setBubbles(updater));
          if (event.type === "model_message" && event.partial === true) {
            partialBuffer += event.content;
            const snapshot = partialBuffer;
            setBubbles((bs) =>
              bs.map((b) => (b.id === assistantId ? { ...b, content: snapshot, streaming: true } : b)),
            );
          } else if (event.type === "model_message" && event.partial !== true) {
            partialBuffer = event.content;
            setBubbles((bs) =>
              bs.map((b) => (b.id === assistantId ? { ...b, content: event.content, streaming: false } : b)),
            );
          } else if (event.type === "error") {
            setLastError(`${event.error.code}: ${event.error.message}`);
          }
          // tool_call / tool_result / thinking / final intentionally unrendered in Phase 3
        }
        setBubbles((bs) =>
          bs.map((b) => (b.id === assistantId ? { ...b, streaming: false } : b)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLastError(message);
        setBubbles((bs) =>
          bs.map((b) => (b.id === assistantId ? { ...b, streaming: false } : b)),
        );
      } finally {
        setInFlight(false);
      }
    },
    [client],
  );

  const resetBubbles = useCallback(() => setBubbles([]), []);

  return { bubbles, send, resetBubbles, inFlight, lastError };
}

function handleEvent(
  event: EngineEvent,
  _assistantId: string,
  _setBubbles: (u: (b: ChatBubble[]) => ChatBubble[]) => void,
): void {
  // Helper hook for future per-event side-effects; intentionally empty in Phase 3.
  void event;
}
```

**`packages/ui/src/routes/chat.tsx`** (new):

```typescript
import { useEffect, useState, type FormEvent } from "react";
import type { SessionId } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { Message } from "../components/message.js";
import { Composer } from "../components/composer.js";
import styles from "./chat.module.css";

export function ChatRoute() {
  const client = usePraxisClient();
  const [sessionId, setSessionId] = useState<SessionId | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const { bubbles, send, resetBubbles, inFlight, lastError } = useStreamedSend();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const handle = await client.session.start({ modeId: "teach" });
        if (!cancelled) setSessionId(handle.sessionId);
      } catch (err) {
        if (!cancelled) setBootstrapError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleSubmit = async (text: string) => {
    if (!sessionId || inFlight) return;
    await send(sessionId, text);
  };

  const handleNewChat = async () => {
    resetBubbles();
    if (sessionId) {
      void client.session.end(sessionId).catch(() => {});
    }
    setSessionId(null);
    try {
      const handle = await client.session.start({ modeId: "teach" });
      setSessionId(handle.sessionId);
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={styles.chatRoot}>
      <header className={styles.header}>
        <h1>Tutor</h1>
        <button type="button" onClick={handleNewChat} className={styles.newChatBtn}>
          New chat
        </button>
      </header>
      {bootstrapError && (
        <div className={styles.errorBanner} role="alert">
          Could not start session: {bootstrapError}
        </div>
      )}
      <div className={styles.messages}>
        {bubbles.length === 0 && (
          <p className={styles.emptyHint}>
            Ask the tutor anything. Your conversation persists across turns.
          </p>
        )}
        {bubbles.map((b) => (
          <Message key={b.id} role={b.role} content={b.content} streaming={b.streaming} />
        ))}
      </div>
      {lastError && (
        <div className={styles.errorBanner} role="alert">
          {lastError}
        </div>
      )}
      <Composer disabled={!sessionId || inFlight} onSubmit={handleSubmit} />
    </div>
  );
}
```

**`packages/ui/src/components/message.tsx`** (new):

```typescript
import styles from "./message.module.css";

export function Message(props: { role: "user" | "assistant"; content: string; streaming: boolean }) {
  const cls = props.role === "user" ? styles.user : styles.assistant;
  return (
    <div className={`${styles.bubble} ${cls}`} data-role={props.role}>
      <span className={styles.content}>{props.content}</span>
      {props.streaming && <span className={styles.cursor} aria-hidden="true">▋</span>}
    </div>
  );
}
```

**`packages/ui/src/components/composer.tsx`** (new):

```typescript
import { type FormEvent, useState } from "react";
import styles from "./composer.module.css";

export function Composer(props: { disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || props.disabled) return;
    setText("");
    props.onSubmit(trimmed);
  };
  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        rows={3}
        disabled={props.disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
        aria-label="Message"
      />
      <button type="submit" disabled={props.disabled || text.trim().length === 0}>
        Send
      </button>
    </form>
  );
}
```

**`packages/ui/src/components/nav.tsx`** (new):

```typescript
import { Link } from "@tanstack/react-router";
import styles from "./nav.module.css";

export function Nav() {
  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.link} activeProps={{ className: `${styles.link} ${styles.active}` }}>
        Chat
      </Link>
      <Link to="/settings" className={styles.link} activeProps={{ className: `${styles.link} ${styles.active}` }}>
        Settings
      </Link>
    </nav>
  );
}
```

**`packages/ui/src/routes/settings.tsx`** (new):

```typescript
import { useEffect, useState, type FormEvent } from "react";
import { usePraxisClient } from "../context/client-context.js";
import type { EngineConfigSnapshot } from "@praxis/core/types";
import styles from "./settings.module.css";

const ENGINE_OPTIONS = [
  { id: "claude-code", label: "Claude Code (local CLI)" },
  { id: "codex", label: "Codex (local CLI)" },
  { id: "direct.anthropic", label: "Direct — Anthropic" },
  { id: "direct.openai", label: "Direct — OpenAI" },
  { id: "direct.google", label: "Direct — Google" },
  { id: "direct.ollama", label: "Direct — Ollama (local)" },
] as const;

export function SettingsRoute() {
  const client = usePraxisClient();
  const [config, setConfig] = useState<EngineConfigSnapshot | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void client.config.engineConfig().then(setConfig);
  }, [client]);

  if (!config) return <p className={styles.loading}>Loading…</p>;

  const update = <K extends keyof EngineConfigSnapshot>(key: K, value: EngineConfigSnapshot[K]) =>
    setConfig((c) => (c ? { ...c, [key]: value } : c));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingState("saving");
    setErrorMsg(null);
    try {
      // Strip empty-string optional fields so we don't persist "" as a value.
      const payload: EngineConfigSnapshot = {
        engineId: config.engineId,
        ...(config.model && config.model.length > 0 && { model: config.model }),
        ...(config.apiKey && config.apiKey.length > 0 && { apiKey: config.apiKey }),
        ...(config.baseUrl && config.baseUrl.length > 0 && { baseUrl: config.baseUrl }),
        ...(config.effort !== undefined && { effort: config.effort }),
      };
      await client.config.setEngineConfig(payload);
      setSavingState("saved");
      setTimeout(() => setSavingState("idle"), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setSavingState("error");
    }
  };

  return (
    <form className={styles.settings} onSubmit={onSubmit}>
      <h1>Settings</h1>

      <label className={styles.field}>
        <span>Engine</span>
        <select value={config.engineId} onChange={(e) => update("engineId", e.target.value)}>
          {ENGINE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Model (optional)</span>
        <input
          type="text"
          value={config.model ?? ""}
          onChange={(e) => update("model", e.target.value)}
          placeholder="e.g. claude-sonnet-4-5"
        />
      </label>

      <label className={styles.field}>
        <span>API key (optional — read from env if not set)</span>
        <input
          type="password"
          value={config.apiKey ?? ""}
          onChange={(e) => update("apiKey", e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Base URL (optional)</span>
        <input
          type="url"
          value={config.baseUrl ?? ""}
          onChange={(e) => update("baseUrl", e.target.value)}
        />
      </label>

      <div className={styles.actions}>
        <button type="submit" disabled={savingState === "saving"}>
          {savingState === "saving" ? "Saving…" : "Save"}
        </button>
        {savingState === "saved" && <span className={styles.savedHint}>Saved</span>}
        {savingState === "error" && errorMsg && <span className={styles.errorHint}>{errorMsg}</span>}
      </div>
    </form>
  );
}
```

**`packages/ui/src/styles/global.css`** (new) — minimal reset + design tokens:

```css
:root {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-text-muted: #666;
  --color-border: #e5e5e5;
  --color-accent: #2d6cdf;
  --color-error: #b3261e;
  --color-user-bubble: #2d6cdf;
  --color-user-bubble-text: #ffffff;
  --color-assistant-bubble: #ffffff;
  --color-assistant-bubble-text: #1a1a1a;
  --font-system: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --radius: 8px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: var(--font-system); color: var(--color-text); background: var(--color-bg); }
[data-app-shell] { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
main { overflow: auto; }
button { font: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.6; }
input, select, textarea { font: inherit; }
```

**`packages/ui/src/index.ts`** (rewrite):

```typescript
export { mountPraxisApp } from "./mount.js";
export { PraxisApp } from "./app.js";
export const PACKAGE_NAME = "@praxis/ui" as const;
```

**Implementation Notes**:

- The chat route auto-starts a session in `useEffect` on mount. This is the simplest UX for Phase 3 — no "start" button. "New chat" ends the current session and starts a new one.
- `useStreamedSend` handles the partial→full transition: while deltas arrive, the assistant bubble updates with the cumulative partial text. When a non-partial `model_message` arrives, the bubble's content is overwritten with the final form (deltas from the same engine should be a strict prefix of the final, so this is visually a no-op typically, but it's the contract).
- `tool_call` / `tool_result` / `thinking` events are silently dropped in Phase 3 — they don't render in the chat. A devtools-friendly inline "tool was called" badge is a nice-to-have but not required.
- The Settings form persists on save. Engine changes take effect on the next `session.send()` (the session service builds an engine per turn).
- All component tests use `@testing-library/react` with a fake `PraxisClient` injected via context.

**Acceptance Criteria**:
- [ ] `mountPraxisApp(el, { client })` renders the chat route by default and a `<nav>` linking to `/settings`.
- [ ] Chat route auto-calls `client.session.start({ modeId: "teach" })` once on mount.
- [ ] Submitting the composer calls `client.session.send` with the trimmed text; the user bubble + assistant placeholder appear immediately.
- [ ] As `model_message` (partial) events arrive, the assistant bubble's content grows.
- [ ] When a non-partial `model_message` arrives, the assistant bubble's content equals the full event content; the streaming cursor disappears.
- [ ] On `error` event, the error banner shows the code:message.
- [ ] "New chat" calls `client.session.end(currentSessionId)` then `client.session.start(...)` and clears bubbles.
- [ ] Settings route loads `client.config.engineConfig()` on mount and renders fields prefilled.
- [ ] Saving valid config calls `client.config.setEngineConfig(...)` with the payload (empty-string optionals stripped).
- [ ] Component tests pass under `vitest --environment jsdom`.

---

### Unit 9: Root scripts + dev orchestration

**Files**:
- `package.json` (root — add `dev` script that proxies to desktop)
- `pnpm-workspace.yaml` — unchanged

**Root `package.json`** scripts addition:

```json
{
  "scripts": {
    "build": "pnpm -r run build",
    "typecheck": "pnpm -r run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:generate": "drizzle-kit generate",
    "db:show": "tsx scripts/db-show.ts",
    "db:reset": "rm -f .praxis/dev.db && pnpm db:migrate",
    "db:episodic": "tsx scripts/db-episodic.ts",
    "script:run-session": "tsx scripts/run-session.ts",
    "dev": "pnpm --filter @praxis/desktop dev",
    "desktop:build": "pnpm --filter @praxis/desktop build",
    "desktop:start": "pnpm --filter @praxis/desktop start"
  }
}
```

**Implementation Notes**:

- `pnpm dev` is a one-liner that delegates to `electron-vite dev` inside `@praxis/desktop`. electron-vite handles the orchestration: starts the renderer Vite dev server, builds main + preload, launches Electron pointing at the dev server.
- `pnpm desktop:build` produces a production-mode bundle in `packages/desktop/out/`. Phase 15 will wrap this with `electron-builder` for installers.
- Existing scripts (`script:run-session`, `db:episodic`, etc.) continue to work for the CLI path.

**Acceptance Criteria**:
- [ ] `pnpm dev` opens an Electron window in dev mode (manual verification — not tested in CI).
- [ ] `pnpm desktop:build` produces `packages/desktop/out/{main,preload,renderer}/`.
- [ ] All existing root scripts still work.

---

### Unit 10: Tests for multi-turn behavior end-to-end

**Files**:
- `tests/multi-turn.test.ts` (new — full SessionService integration test)
- `packages/engines/src/__tests__/multi-turn.test.ts` (new — adapter-level priorTurns smoke)
- `packages/core/src/__tests__/session-service.test.ts` (covered in Unit 5; this expands it)

**`tests/multi-turn.test.ts`** (new):

End-to-end test using a hand-written FakeEngine (NOT mocking SDKs — the engine itself is fake). Asserts:

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
import type { Brief, Engine, EngineEvent, Logger, Mode, ToolRegistry } from "@praxis/core/types";

class RecordingFakeEngine implements Engine {
  readonly id = "fake.recording";
  readonly kind = "single-shot" as const;
  public lastBrief: Brief | null = null;

  async *run(brief: Brief, _tools: ToolRegistry): AsyncIterable<EngineEvent> {
    this.lastBrief = brief;
    const reply = brief.priorTurns?.length
      ? `Reply ${brief.priorTurns.length + 1}: heard "${brief.userMessage}"`
      : `Reply 1: heard "${brief.userMessage}"`;
    yield { type: "model_message", content: reply, partial: false };
    yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } };
  }
  async health() {
    return {
      ok: true,
      capabilities: { vision: false, streaming: true, nativeMCP: false, contextWindow: 100_000 },
    };
  }
}

// ... beforeEach/afterEach setup with temp DB + migrations ...

describe("multi-turn through SessionServiceImpl", () => {
  it("threads prior turns into Brief on the second send", async () => {
    // ... setup db, services with a custom engine factory (need to inject FakeEngine) ...
    // Note: SessionServiceImpl uses createEngine() internally. To inject a fake,
    // either: (a) extract engine factory as a ServiceDeps field, or
    // (b) write the test against a SessionServiceImpl variant that takes an engine override.
    //
    // RECOMMENDED: extend ServiceDeps with optional `engineFactory?: (config) => Engine`.
    // SessionServiceImpl uses it when present, falls back to createEngine() otherwise.
    // This is a minor design refinement worth making for testability.
  });
});
```

> **Design refinement**: `ServiceDeps` should accept an optional `engineFactory?: (config: EngineConfig) => Engine` to enable injecting fakes in tests. When omitted, `SessionServiceImpl` falls back to `createEngine` from `@praxis/engines`. This is the seam for both testing AND for future engine-customization scenarios. Update Unit 5 to add this field.

**`packages/engines/src/__tests__/multi-turn.test.ts`** (new):

Tests each adapter's priorTurns handling against mocked SDKs:

- **Direct**: assert `streamText` is called with a `messages` array of length `priorTurns.length + 1`, with the right roles and content.
- **Claude Code**: assert `conv.send` is called with a string containing `User: ` and `Tutor: ` markers from prior turns.
- **Codex**: assert `thread.runStreamed` is called with the transcript string.

**Acceptance Criteria**:
- [ ] `multi-turn.test.ts` (root): three sequential `client.session.send()` calls produce a third turn whose Brief includes `priorTurns` of length 4 (turn1 user + turn1 assistant + turn2 user + turn2 assistant).
- [ ] Adapter-level multi-turn tests pass for all three adapters.
- [ ] Existing Phase 2 conformance tests (without priorTurns) continue to pass.

---

## Implementation Order

1. **Unit 1** — Type contract additions (foundation for everything below).
2. **Unit 2** — `@praxis/core/session` history helpers.
3. **Unit 3** — `composeBrief` priorTurns (depends on Unit 1's `Brief.priorTurns`).
4. **Unit 4** — Engine adapter updates (depends on Unit 1, Unit 3).
5. **Unit 5** — `@praxis/core/services` (depends on Units 2, 3, 4).
6. **Unit 6** — `@praxis/client` (depends on Unit 1's contract; can parallelize with Unit 5).
7. **Unit 7** — `@praxis/desktop` (depends on Units 5, 6).
8. **Unit 8** — `@praxis/ui` (depends on Unit 6; can parallelize with Unit 7).
9. **Unit 9** — Root scripts (depends on Unit 7).
10. **Unit 10** — End-to-end multi-turn tests (depends on Unit 5; can be written in parallel with Unit 5 once `engineFactory` injection seam is in place).

Units 1–5 are sequential. Units 6, 7, 8 form an independent batch (6 first, then 7+8 in parallel). Unit 9 closes.

---

## Testing

### Per-package tests

| Test file | What it tests |
|---|---|
| `packages/core/src/__tests__/history.test.ts` | `loadConversationHistory` projection: single turn, multi-step turn, error-only turn, redacted skip, ordering. |
| `packages/core/src/__tests__/episodic.test.ts` (extended) | `nextTurnIndex`, `recordUserMessage`. |
| `packages/core/src/__tests__/session-service.test.ts` | start/send/end/active flows; second send includes priorTurns; error paths (unknown session, ended session). |
| `packages/core/src/__tests__/config-service.test.ts` | engineConfig round-trip; setSelectedEngine; validation rejection. |
| `packages/core/src/__tests__/student.test.ts` | getOrCreateDefaultStudentId is idempotent. |
| `packages/curriculum/src/__tests__/compose.test.ts` (extended) | priorTurns threading; empty-array normalization. |
| `packages/engines/src/__tests__/{direct,claude-code,codex}.test.ts` (extended) | priorTurns translation per adapter (mocked SDKs). |
| `packages/engines/src/__tests__/transcript.test.ts` | `buildTranscriptPrefix` formatting. |
| `packages/client/src/__tests__/client.test.ts` | createPraxisClient routes calls to transport invoke/stream. |
| `packages/client/src/__tests__/ipc-transport.test.ts` | streamAsAsyncIterable: events, done, error, cancel-on-break. |
| `packages/desktop/src/__tests__/ipc-server.test.ts` | handler registration, dispatch routing, stream cancel, unregister teardown. |
| `packages/ui/src/__tests__/chat-route.test.tsx` | renders, calls start on mount, send updates bubbles. Uses fake client. |
| `packages/ui/src/__tests__/settings-route.test.tsx` | loads config on mount, save calls setEngineConfig. |
| `packages/ui/src/__tests__/use-streamed-send.test.tsx` | partial deltas accumulate; non-partial overwrites; error sets lastError. |

### Integration tests (root `tests/`)

| Test file | What it tests |
|---|---|
| `tests/multi-turn.test.ts` | Full SessionServiceImpl × FakeEngine: 3-turn conversation; turn 3's Brief includes priorTurns of length 4. |

### Manual verification (test checkpoint)

- `pnpm dev` opens Electron.
- Default engine is Claude Code (no API key prompt — uses local CLI).
- Type "Hello" → see streamed assistant response.
- Type "What did I just say?" → see assistant correctly recall "Hello" from prior turn.
- Switch to settings → change engine to `direct.anthropic` → save → next message goes through Direct adapter.
- `pnpm db:episodic` from terminal shows the session and its events ordered chronologically (user_message + model_messages + final).

---

## Verification Checklist

After all units land:

```bash
# Existing gates still green (Phase 1 + Phase 2)
pnpm install
pnpm typecheck         # all 9 packages + desktop electron tsconfig
pnpm lint
pnpm test              # 90+ existing + ~30 new tests

# Phase 3 specific
pnpm desktop:build     # produces out/{main,preload,renderer}/
pnpm dev               # opens Electron in dev mode (manual test)
```

Manual M1 walkthrough:

1. Launch `pnpm dev`.
2. Wait for window to open.
3. Type "Tell me about photosynthesis briefly." → assistant streams a response.
4. Type "Now explain it as if I'm 8 years old." → assistant builds on the prior turn (proves multi-turn).
5. Open Settings → switch engine to `direct.anthropic` → enter `ANTHROPIC_API_KEY` → save.
6. Back to Chat → "What's 7 × 8?" → response comes from Direct adapter (verify in `pnpm db:episodic` output that the latest session row has `engine_id = direct.anthropic`).
7. Switch to `codex` → repeat. M1 achieved across all three adapters.

---

## Out of scope (defer)

- WebSocket transport implementation (Phase 15+ hosted).
- Lock-code UI gating (Phase 11).
- Course / lesson context (Phase 6).
- Authoring UI (Phase 11).
- Memory inspector UI (Phase 11).
- Per-tool-call UI rendering in chat (currently silent in Phase 3).
- Conversation summarization for long histories — `priorTurns` goes to the model verbatim. Phase 7's semantic summary will provide a compressed alternative when history exceeds context window.
- Session resume across UI restarts (active session DB row exists; UI doesn't surface a resume affordance).
- Full Playwright E2E. The desktop window is verified manually in Phase 3; automated E2E lands when the surface stabilizes.
- Native installers (electron-builder is Phase 15).

## Notes for the implementer

- **`@praxis/core/services` runtime imports `@praxis/engines` and `@praxis/tools`.** This is a Phase 3 dependency-rule update — please update CLAUDE.md to allow this targeted reverse-direction import for `core/services/` only, with the same rationale documented above.
- **`createConversation` system prompt**: Phase 2 already passes `systemPrompt` to `createConversation`. If the SDK rejects this option in current versions, Phase 2's adapter would have failed — so it's confirmed working. If something has shifted, fall back to the prepend pattern used in the Codex adapter.
- **electron-vite cache**: dev mode caches in `packages/desktop/out/` and `packages/desktop/.vite/`. Add both to `.gitignore`.
- **`drizzle/` location**: the migration runner looks at `process.cwd()/drizzle` in dev. From `pnpm dev` (which runs in `packages/desktop`), `process.cwd()` will be that package — so we need `applyMigrations` to walk up to find the repo root drizzle/ folder, OR set `migrationsFolder` explicitly using a known path (e.g., `path.resolve(__dirname, "../../../../drizzle")` from `out/main/index.js`). Pick the explicit path approach — it survives packaging.
- **Conventions**: per CLAUDE.md, ESM only, `import type` for type-only, `.js` extension in import specifiers, kebab-case files, CSS Modules co-located with components, `*.test.ts` / `*.test.tsx` colocated in `src/__tests__/`.
- **React 19 specifics**: use `createRoot` (not the legacy `ReactDOM.render`); `<StrictMode>` in mount. No `forwardRef` needed for new components (React 19 passes ref as a regular prop).
