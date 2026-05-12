---
id: feature-agent-transparency-ux
kind: feature
stage: done
tags: [ui, chat]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Agent transparency UX

## Brief

The tutor is an agent looping over tools. Today its inner work — thinking
blocks, tool calls, and sub-agent activity — flashes by too fast to read, gets
silently dropped, or hides behind developer-facing names. This feature makes the
agent legible: the user can see what it's doing, why, and at a pace they can
follow. Three concerns share one surface (the chat thread) and one root cause
(streaming UX that prioritizes throughput over comprehension), so they're
designed together.

**Concern 1 — Stream pacing for thinking and tool calls.** Two contributing
factors:

1. `packages/ui/src/hooks/use-streamed-send.ts` has no handler for
   `event.type === "thinking"`. Thinking content arrives off the engine stream
   and is silently dropped — only the `thinking` boolean (toggled at stream
   start and around `tool_result`) drives `<ThinkingIndicator />`. The model's
   actual reasoning text never renders.
2. `<ToolInterstitial>` (`packages/ui/src/components/tool-interstitial.tsx`)
   transitions `in_flight → settled` instantly. A fast tool can flash in and
   out before the user reads it. No minimum display time, no easing, and the
   auto-scroll on `messageCount` change races past the interstitial.

**Concern 2 — Sub-agent activity as a first-class UX concept.** The bootstrap
explorer runs in an isolated `EngineSession` (`runConceptExplorer` in
`packages/curriculum/src/bootstrap/explorer.ts`). Its tool calls do not flow
into the parent session's episodic log — deliberately, because the explorer's
internal dialogue isn't part of the tutor↔student transcript (SPEC.md memory
commitments). The only externally visible signals today are: one
`ActivityRegistry` rail line, draft mutations streamed to the bootstrap right
pane, and the final tool_result of `course.start_exploration`. The student
can't see what the sub-agent is actually doing turn-by-turn.

**Concern 3 — Rename "bootstrap" and "explore" to student-facing names.**
Developer terminology that leaked into the student UX. UI strings shift; mode
ids, tool names, and package names stay (they're DB keys and code identifiers).

## Design decisions

These resolve the three ambiguities the brief deferred to design.

- **Sub-agent surfacing**: hybrid — a brief inline collapsible block in the
  chat thread (always-on, primary surface) plus an optional collapsible side
  panel inside the bootstrap tab body for the full transcript.
- **Names**: mode UI name → `"course design"`; mode label → `"Design a
  course"`. Sub-agent surface labelled by *what it is doing*, not by an agent
  name — the live inline block reads `"reading your materials"`,
  `"drafting an outline"`, etc., matching the editorial verb-in-italic voice
  used by the other mode meta.
- **Thinking content**: faint summary line by default ("thinking about
  isolating x…"), with click-to-expand chevron that reveals the full reasoning
  text in a faint italic block. No line count metadata (anti-numeric per
  VISION.md).

## Architectural choice

Three concerns, one chat thread, one streaming hook. **Chosen approach**: extend
`ChatStreamItem` (the discriminated union in `use-streamed-send.ts`) with two
new variants — `kind: "thinking"` and `kind: "sub-agent"` — and add a
minimum-display-time pacing control to existing `kind: "interstitial"` items.
Both new variants render alongside `<MessageBubble>` and `<ToolInterstitial>`
in `chat-tab-body.tsx`'s item loop. Strict additive change: existing kinds
unchanged.

For sub-agent surfacing: when the parent tutor calls a sub-agent-spawning tool
(today: `course.start_exploration`), the UI promotes that tool's interstitial
to a `kind: "sub-agent"` item. The sub-agent item subscribes to a new
`client.subAgent.events({ parentCallId })` stream backed by a per-process
`SubAgentRegistry` (mirrors `ActivityRegistry`). The producer is a new
sub-agent handle passed into `runConceptExplorer`; the explorer emits events
on tool_call / tool_result / phase_change boundaries. The `ActivityRegistry`
rail line stays — useful as ambient progress when the user navigates away
from the bootstrap tab.

For pacing: tool interstitials carry `firstSeenAt`. When `tool_result` arrives
before `MIN_VISIBLE_MS` has elapsed, settle is scheduled via `setTimeout`.
Pending settle timers cleared on `interrupted` event and on iterator return.
Auto-scroll switches from "always on item count change" to "scroll only if
user is near bottom" (within 80px).

### Rejected alternatives

- **Sub-agent on the activity rail with an expand popover**. The rail is
  whisper-faint by design (anti-numeric, no progress percentages per VISION).
  Promoting it to a primary surface fights its editorial purpose. The user is
  looking at the chat thread; that's where the work belongs.
- **Hoist explorer events into the parent session's event stream**. Reuses
  `client.session.events()` but mixes the explorer's internal tool dialogue
  into the parent's episodic log. Violates "episodic transcripts are immutable
  source of truth for THIS session" and forces the explorer to share the
  parent's tool registry (today isolated, so the explorer's tool subset stays
  scoped to read-only + draft mutators only).
- **Visible-by-default inline thinking text**. Reasoning from extended-thinking
  models can be many paragraphs; visible-by-default competes with the actual
  response for visual weight. The chosen faint-summary-with-expansion matches
  editorial restraint without losing the transparency.

## Implementation Units

### Unit 1: Tool interstitial pacing + scroll heuristic
**File**: `packages/ui/src/hooks/use-streamed-send.ts`, `packages/ui/src/components/chat-tab-body.tsx`
**Story**: `feature-agent-transparency-ux-stream-pacing`

```typescript
// In use-streamed-send.ts — extend ToolInterstitial:
export interface ToolInterstitial {
  callId: string;
  toolName: string;
  status: "in_flight" | "settled";
  errored?: boolean;
  /** Wall-clock timestamp when this interstitial first appeared. Used to enforce min-visible-ms. */
  firstSeenAt: number;
}

const MIN_INTERSTITIAL_VISIBLE_MS = 800;

// Inside send(), in the tool_result branch:
const pendingSettleTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Replace the immediate setItems(...settled...) with:
const interstitial = /* find the in-flight interstitial with this callId */;
if (interstitial) {
  const elapsed = Date.now() - interstitial.firstSeenAt;
  const settleNow = () => {
    setItems((prev) => prev.map((it) =>
      it.kind === "interstitial" && it.callId === callId
        ? { ...it, status: "settled", ...(event.result.ok === false && { errored: true }) }
        : it,
    ));
    pendingSettleTimers.delete(callId);
  };
  if (elapsed >= MIN_INTERSTITIAL_VISIBLE_MS) {
    settleNow();
  } else {
    const t = setTimeout(settleNow, MIN_INTERSTITIAL_VISIBLE_MS - elapsed);
    pendingSettleTimers.set(callId, t);
  }
}

// On interrupted / error / finally:
for (const t of pendingSettleTimers.values()) clearTimeout(t);
pendingSettleTimers.clear();
```

```typescript
// In chat-tab-body.tsx — replace the scroll effect:
const messagesContainerRef = useRef<HTMLDivElement>(null);
const messageCount = items.length;

useEffect(() => {
  const container = messagesContainerRef.current;
  if (!container) return;
  const NEAR_BOTTOM_THRESHOLD = 80;
  const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
  if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}, [messageCount]);
```

**Implementation Notes**:
- `firstSeenAt` is set when the `tool_call` branch pushes the interstitial — `Date.now()` at that point.
- Use `Date.now()` not `performance.now()` — `firstSeenAt` is wall-clock for `setTimeout` delta math; consistent units matter more than monotonic-clock precision here.
- Min-visible delay applies *only* to the in_flight → settled transition. The interstitial appears immediately; the settle is what gets paced.
- A turn cancel via `cancel()` must drain `pendingSettleTimers`. Wire this in both the `interrupted` event branch and the `finally` clause.
- The scroll attachment moves from `messagesEndRef.scrollIntoView` (existing) to the messages container ref. The end ref still exists as the scroll target; the container ref reads scroll position.
- `chat-tab-body.tsx:122-124` is the existing always-scroll effect; replace it. Same change applies to `bootstrap-tab-body.tsx` if it has an analogous effect (it embeds `<TeachChatTabBody>`, so just the one change in chat-tab-body covers both).

**Acceptance Criteria**:
- [ ] A tool that completes within 50ms still shows its interstitial for at least `MIN_INTERSTITIAL_VISIBLE_MS - 50ms` before settling.
- [ ] A tool that completes after 1500ms settles immediately on tool_result.
- [ ] Cancelling a turn (`cancel()`) does not leave a pending settle timer queued.
- [ ] When the user scrolls up >80px, new incoming items do NOT yank them back to the bottom.
- [ ] When the user is at the bottom, new items continue to auto-scroll into view.
- [ ] No regression: existing message/interstitial rendering unchanged for tools that complete after 800ms (the common case today).

---

### Unit 2: Thinking event handler + reasoning summary block
**Files**: `packages/ui/src/hooks/use-streamed-send.ts`, `packages/ui/src/components/reasoning-block.tsx` (new), `packages/ui/src/components/reasoning-block.module.css` (new), `packages/ui/src/components/chat-tab-body.tsx`
**Story**: `feature-agent-transparency-ux-stream-pacing`

```typescript
// In use-streamed-send.ts — new ChatStreamItem variant:
export interface ReasoningItem {
  id: string;
  /** Cumulative thinking content captured since this block opened. */
  content: string;
  /** True while thinking events for THIS block are still arriving. */
  streaming: boolean;
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "interstitial" } & ToolInterstitial)
  | ({ kind: "thinking" } & ReasoningItem)
  | ({ kind: "cancel-marker" } & CancelMarker);

// In send(), state for the active reasoning block:
let currentReasoningId: string | null = null;

// New branch in the event loop:
if (event.type === "thinking") {
  if (currentReasoningId === null) {
    // Open a new reasoning block.
    const id = nextId();
    currentReasoningId = id;
    setItems((prev) => [...prev, { kind: "thinking", id, content: event.content, streaming: true }]);
  } else {
    // Append to the active reasoning block.
    const id = currentReasoningId;
    setItems((prev) => prev.map((it) =>
      it.kind === "thinking" && it.id === id
        ? { ...it, content: it.content + event.content }
        : it,
    ));
  }
  continue;
}

// Close the reasoning block on bubble boundaries:
//   - tool_call → close (tool work begins after reasoning)
//   - model_message → close (assistant text now begins)
//   - interrupted / error / final → close (handled by closeReasoningBlock in finally)
const closeReasoningBlock = (): void => {
  if (currentReasoningId === null) return;
  const id = currentReasoningId;
  currentReasoningId = null;
  setItems((prev) => prev.map((it) =>
    it.kind === "thinking" && it.id === id ? { ...it, streaming: false } : it,
  ));
};
// Call closeReasoningBlock() at the start of the tool_call and model_message branches,
// and in the finally clause alongside closeAssistantBubble().
```

```tsx
// packages/ui/src/components/reasoning-block.tsx
import { type JSX, useState } from "react";
import styles from "./reasoning-block.module.css";

export interface ReasoningBlockProps {
  content: string;
  /** True while still receiving thinking events; renders a faint live dot. */
  streaming: boolean;
}

export function ReasoningBlock({ content, streaming }: ReasoningBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const summary = summarize(content);

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.chevron} aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className={styles.summaryText}>
          {streaming ? "thinking" : "thought"} {summary && `about ${summary}`}
          {streaming && <span className={styles.live} aria-hidden="true">·</span>}
        </span>
      </button>
      {expanded && (
        <div className={styles.body}>
          <p className={styles.bodyText}>{content}</p>
        </div>
      )}
    </div>
  );
}

/** Reduce thinking text to a short topical hint. Strips markdown, takes the first
 *  meaningful clause, trims to ~60 chars. Returns empty when nothing usable. */
function summarize(content: string): string {
  const cleaned = content
    .replace(/[*_`#>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "";
  const firstSentence = cleaned.split(/[.!?\n]/)[0] ?? cleaned;
  const trimmed = firstSentence.slice(0, 60).trim();
  return trimmed.length < firstSentence.length ? `${trimmed}…` : trimmed;
}
```

**Implementation Notes**:
- The `ThinkingIndicator` (dots) component stays. The new `ReasoningBlock` replaces nothing — they coexist. The dots still appear when `thinking === true` and no content has arrived yet (Codex/Direct adapters emit thinking events with content; Claude Code adapter does not — graceful degradation to current behavior).
- Render in `chat-tab-body.tsx`'s item loop: add a `if (item.kind === "thinking")` branch before the `<MessageBubble>` branch that renders `<ReasoningBlock content={item.content} streaming={item.streaming} />`.
- Summary heuristic is deliberately simple. The user picked "faint summary with expansion" over "line count" — summary text comes from the content's first clause. If the heuristic produces something ugly (rare; thinking output is prose), the user can expand to see the real reasoning.
- CSS: use `composes: editorial from global;` for the body text. Summary line should be ~70% opacity / muted; chevron is real Unicode (▸ ▾).
- The `partial?: boolean` flag from `model_message` events doesn't exist on `thinking` events today — they're whole strings. The implementation accumulates them as if every one is a delta, which is correct for both whole-message and delta forms.

**Acceptance Criteria**:
- [ ] When the engine emits `thinking` events, a `<ReasoningBlock>` appears above the next assistant message.
- [ ] Default-collapsed: only the summary line is visible.
- [ ] Click on the summary line expands to show the full reasoning content.
- [ ] When a `tool_call` or `model_message` arrives, the reasoning block stops streaming (chevron stops showing the live dot).
- [ ] When the engine emits no `thinking` events (Claude Code today), no reasoning block appears.
- [ ] Two non-contiguous reasoning streams in one turn produce two separate reasoning blocks (e.g., model thinks, calls tool, gets result, thinks again).
- [ ] On turn cancel, in-progress reasoning block is closed (streaming → false), not deleted.

---

### Unit 3: SubAgentRegistry + IPC subscription channel
**Files**: `packages/core/src/services/subagent-registry.ts` (new), `packages/core/src/types/subagent.ts` (new), `packages/core/src/types/tool.ts` (extend `ToolContext` + `ToolServices`), `packages/tools/src/registry.ts` (extend `dispatch` signature), `packages/engines/src/mcp/tool-bridge.ts` (pass callId), `packages/engines/src/direct/tool-conversion.ts` (pass callId), `packages/desktop/electron/main/subagent-channel.ts` (new), `packages/client/src/sub-agent.ts` (new), `packages/desktop/electron/main/services.ts` (wire registry)
**Story**: `feature-agent-transparency-ux-subagent-channel`

```typescript
// packages/core/src/types/subagent.ts
import type { SessionId, Timestamp } from "./index.js";

export interface SubAgentItem {
  /** Same value as the parent session's tool_call.callId — the UI keys on this. */
  parentCallId: string;
  sessionId: SessionId;
  /** Verb-in-italic phrase, e.g., "reading your materials". */
  label: string;
  status: "running" | "done" | "failed";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  errorMessage?: string;
  /** Ordered list of step records observed so far. Newest last. */
  steps: SubAgentStep[];
}

export interface SubAgentStep {
  /** Sub-agent's internal callId (NOT the parent's). */
  callId: string;
  toolName: string;
  /** Human label resolved from getToolLabel(toolName).present. */
  label: string;
  /** Set when the matching tool_result arrives. */
  ok?: boolean;
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

export type SubAgentEvent =
  | { kind: "snapshot"; items: readonly SubAgentItem[] }
  | { kind: "started"; item: SubAgentItem }
  | { kind: "step_started"; parentCallId: string; step: SubAgentStep }
  | { kind: "step_settled"; parentCallId: string; callId: string; ok: boolean }
  | { kind: "phase_changed"; parentCallId: string; label: string }
  | { kind: "finished"; parentCallId: string; status: "done" | "failed"; errorMessage?: string };

export interface SubAgentStartInput {
  parentCallId: string;
  sessionId: SessionId;
  label: string;
}

export interface SubAgentHandle {
  parentCallId: string;
  stepStarted(input: { callId: string; toolName: string }): void;
  stepSettled(input: { callId: string; ok: boolean }): void;
  setLabel(label: string): void;
  finish(status: "done" | "failed", err?: { message: string }): void;
}

export type SubAgentListener = (event: SubAgentEvent) => void;

export interface SubAgentRegistry {
  start(input: SubAgentStartInput): SubAgentHandle;
  list(): readonly SubAgentItem[];
  subscribe(listener: SubAgentListener, filter?: { parentCallId?: string }): () => void;
}
```

```typescript
// packages/core/src/services/subagent-registry.ts (sketch)
export class SubAgentRegistryImpl implements SubAgentRegistry {
  private readonly items = new Map<string, SubAgentItem>(); // keyed by parentCallId
  private readonly listeners = new Set<{ listener: SubAgentListener; filter?: { parentCallId?: string } }>();
  // ... mirrors ActivityRegistryImpl pattern: start/finish, in-memory map, fan-out on subscribe with initial snapshot
  //
  // Differences from ActivityRegistry:
  //  - Keyed by parentCallId (caller-supplied), not generated uuidv7.
  //  - No quiet-period: sub-agents are intentional, surface immediately.
  //  - Linger: ~30s after `finished` so the user can still see what happened
  //    before the item drops. Configurable; tunes by feel.
  //  - subscribe(listener, { parentCallId }) optionally filters to one item's events.
}
```

```typescript
// packages/core/src/types/tool.ts — extend ToolContext:
export interface ToolContext {
  // ... existing fields ...
  /** When set, identifies the engine-emitted tool_call this handler is responding to.
   *  Populated by InProcessToolRegistry.dispatch(name, args, { callId }). Tools that
   *  spawn sub-agents use this to publish events on the parent's callId so the UI
   *  can subscribe and render. */
  callId?: string;
}

// Extend ToolServices:
export interface ToolServices {
  // ... existing fields ...
  /** Sub-agent transparency registry. Optional so tools and test stubs that
   *  don't spawn sub-agents don't need to wire it. */
  subAgent?: SubAgentRegistry;
}
```

```typescript
// packages/tools/src/registry.ts — extend dispatch:
export interface DispatchMeta {
  /** Engine-side correlation id for this tool invocation. */
  callId?: string;
}

async dispatch(name: string, args: unknown, meta?: DispatchMeta): Promise<ToolResult> {
  // ... validation as today ...
  const callContext: ToolContext = {
    ...this.context,
    ...(meta?.callId !== undefined && { callId: meta.callId }),
  };
  const value = await tool.handler(parsed.data, callContext);
  // ... rest unchanged ...
}
```

```typescript
// packages/engines/src/mcp/tool-bridge.ts — pass MCP request id as callId:
// The @modelcontextprotocol/sdk passes the tool-call request id through the
// `tool()` callback. Confirm the exact API surface during impl (it may be a
// second argument to the callback or part of an enriched context object) and
// thread it as { callId } into dispatch.

// packages/engines/src/direct/tool-conversion.ts — pass Vercel's toolCallId:
// Vercel AI SDK's tool execute callback signature is
// `execute: async (input, { toolCallId, ... }) => ...`. Use that.
return tool({
  parameters: inputSchema,
  execute: async (input, { toolCallId }) => {
    const result = await registry.dispatch(summary.name, input, { callId: toolCallId });
    // ...
  },
});
```

```typescript
// packages/desktop/electron/main/subagent-channel.ts — IPC fanout:
// Mirrors the activity-channel pattern in the same directory. Renderer
// subscribes to `praxis.subAgent.events.<streamId>?parentCallId=<callId>`
// (filtered) or `praxis.subAgent.events.<streamId>` (all, used by debug
// surfaces). Server holds open via AbortController until the client drops.
```

```typescript
// packages/client/src/sub-agent.ts — client API:
export interface SubAgentClient {
  events(input?: { parentCallId?: string }): AsyncIterable<SubAgentEvent>;
  list(): Promise<readonly SubAgentItem[]>;
}
```

**Implementation Notes**:
- The `parentCallId` IS the engine-emitted `tool_call.callId` from the parent session. No extra correlation layer needed.
- `setContextField` already exists on `InProcessToolRegistry` for the same per-call mutation pattern. The new `dispatch(name, args, meta)` form is a parallel slot for engine-provided per-call data; cleaner than `setContextField` because it's scoped to one handler call (not the registry's lifetime).
- **All three engine adapters change their dispatch call**: MCP-bridge (Claude Code + Codex via shared bridge), and direct/tool-conversion. Each must verify how the underlying SDK surfaces the call id — the Vercel SDK's `toolCallId` is documented; the MCP SDK's call id passes through differently, may need a tiny inspection of `tool()`'s callback args during impl.
- The `subAgent?:` service is wired in `services.ts:buildServices` next to `activity` and passed in via the same `ServiceDeps` shape. The engine's session-service constructs the per-session `ToolContext` and includes the registry there.
- IPC channel naming follows the `ipc-channel-convention` pattern (`praxis.subAgent.events.<streamId>`, `.list`).

**Acceptance Criteria**:
- [ ] `ToolContext.callId` populated when a handler is dispatched via the engine pipeline (both MCP-bridge and Direct paths).
- [ ] `SubAgentRegistry.start({ parentCallId, sessionId, label })` returns a handle.
- [ ] `handle.stepStarted({ callId, toolName })` → `step_started` event emitted to all listeners filtered on parentCallId.
- [ ] `handle.stepSettled({ callId, ok })` → `step_settled` event emitted.
- [ ] `handle.finish("done")` → `finished` event emitted; item lingers in `items` for ~30s then is removed.
- [ ] `subscribe(listener, { parentCallId })` receives only events for that parentCallId; subscribing also receives an initial `snapshot` of the matching item if it exists.
- [ ] `client.subAgent.events()` round-trips over IPC.
- [ ] All three engine adapters (Claude Code, Codex, Direct) pass `callId` through to `registry.dispatch`.

---

### Unit 4: Explorer emits sub-agent events
**Files**: `packages/curriculum/src/bootstrap/explorer.ts`, `packages/tools/src/course/start-exploration.ts`
**Story**: `feature-agent-transparency-ux-subagent-channel`

```typescript
// packages/tools/src/course/start-exploration.ts — extend handler:
async handler(args, ctx: ToolContext) {
  // ... existing setup ...

  const subHandle = ctx.callId !== undefined
    ? ctx.services.subAgent?.start({
        parentCallId: ctx.callId,
        sessionId: ctx.sessionId,
        label: args.draftId !== undefined ? "continuing your draft" : "reading your materials",
      })
    : undefined;

  const actHandle = ctx.services.activity?.start({
    label: `${args.draftId !== undefined ? "continuing" : "exploring"} ${args.courseTitle.toLowerCase()}`,
    detail: args.draftId !== undefined ? "reading prior draft" : "reading materials",
  });

  const result = await runConceptExplorer({
    // ... existing args ...
    subAgentHandle: subHandle,
    onProgress: (phase) => {
      const detail = phase === "reading" ? "reading materials" : phase === "shaping" ? "shaping the course" : "finalizing";
      actHandle?.update({ detail });
      const subLabel = phase === "reading" ? "reading your materials" : phase === "shaping" ? "drafting an outline" : "finalizing the draft";
      subHandle?.setLabel(subLabel);
    },
  });

  subHandle?.finish(result.ok ? "done" : "failed",
    result.ok ? undefined : { message: result.reason ?? "explorer error" });
  actHandle?.finish(result.ok ? "done" : "failed", { message: result.ok ? "done" : (result.reason ?? "explorer error") });
  // ... return as today ...
}
```

```typescript
// packages/curriculum/src/bootstrap/explorer.ts — extend RunConceptExplorerInput:
export interface RunConceptExplorerInput {
  // ... existing fields ...
  /** Sub-agent transparency handle; events from this run are streamed to UI via SubAgentRegistry. */
  subAgentHandle?: SubAgentHandle;
}

// Inside the for-await loop:
for await (const ev of session.send(initialMessage)) {
  if (ev.type === "tool_call") {
    stepsUsed++;
    input.subAgentHandle?.stepStarted({ callId: ev.callId, toolName: ev.toolName });
    // ... existing log + phase-transition detection ...
  }
  if (ev.type === "tool_result") {
    input.subAgentHandle?.stepSettled({ callId: ev.callId, ok: ev.result.ok });
    // ... existing log + draftId capture ...
  }
  // ... rest unchanged ...
}
```

**Implementation Notes**:
- Sub-agent events are pure passive observers of the explorer's existing event stream. No behavior change to the explorer's loop or exit policy.
- Label updates align with the existing `onProgress` phase transitions — keeps a single source of phase truth.
- `ctx.callId` is read inside the handler. When it's absent (e.g., direct invocation in tests without an engine), the subHandle is undefined and emissions become no-ops — no test rewiring needed unless the test specifically asserts sub-agent events.

**Acceptance Criteria**:
- [ ] When `course.start_exploration` is dispatched with a `ctx.callId`, a sub-agent item is registered with `parentCallId === ctx.callId`.
- [ ] Each tool the explorer calls produces a matching `step_started` + `step_settled` event on the parent's callId.
- [ ] On phase transitions (`reading` → `shaping` → `finalizing`), the sub-agent's `label` updates accordingly.
- [ ] When the explorer exits successfully, the sub-agent item finishes with status `done`.
- [ ] When the explorer exits with `engine_error` or `no_draft_init`, the sub-agent item finishes with status `failed`.
- [ ] Existing explorer tests pass unchanged (sub-agent emissions are no-ops when no handle).

---

### Unit 5: Inline sub-agent block + bootstrap side panel
**Files**: `packages/ui/src/hooks/use-streamed-send.ts` (extend), `packages/ui/src/hooks/use-sub-agent.ts` (new), `packages/ui/src/components/sub-agent-block.tsx` (new), `packages/ui/src/components/sub-agent-block.module.css` (new), `packages/ui/src/components/sub-agent-panel.tsx` (new), `packages/ui/src/components/sub-agent-panel.module.css` (new), `packages/ui/src/components/chat-tab-body.tsx` (extend item loop), `packages/ui/src/components/bootstrap-tab-body.tsx` (add panel), `packages/tools/src/labels/index.ts` (add `spawnsSubAgent` flag)
**Story**: `feature-agent-transparency-ux-subagent-ui`

```typescript
// packages/tools/src/labels/index.ts — extend ToolLabel:
export interface ToolLabel {
  present: string;
  past?: string;
  hidden?: boolean;
  /** When true, the UI promotes this tool's interstitial to a <SubAgentBlock>
   *  that subscribes to client.subAgent.events({ parentCallId }). */
  spawnsSubAgent?: boolean;
}

// In TOOL_LABELS:
"course.start_exploration": {
  present: "Reading your materials",
  past: "Read your materials",
  spawnsSubAgent: true,
},
```

```typescript
// packages/ui/src/hooks/use-streamed-send.ts — extend ChatStreamItem:
export interface SubAgentSpawn {
  /** Parent session's tool_call.callId — used as the subscription key. */
  callId: string;
  toolName: string;
  status: "in_flight" | "settled";
  errored?: boolean;
}

export type ChatStreamItem =
  | ({ kind: "message" } & ChatMessage)
  | ({ kind: "interstitial" } & ToolInterstitial)
  | ({ kind: "sub-agent" } & SubAgentSpawn)
  | ({ kind: "thinking" } & ReasoningItem)
  | ({ kind: "cancel-marker" } & CancelMarker);

// In send(), tool_call branch:
const label = getToolLabel(toolName);
if (label.spawnsSubAgent === true) {
  setItems((prev) => [...prev, { kind: "sub-agent", callId, toolName, status: "in_flight" }]);
} else if (!label.hidden) {
  setItems((prev) => [...prev, {
    kind: "interstitial", callId, toolName, status: "in_flight", firstSeenAt: Date.now(),
  }]);
}
```

```tsx
// packages/ui/src/components/sub-agent-block.tsx
export interface SubAgentBlockProps {
  /** Parent session's tool_call.callId. */
  parentCallId: string;
  /** Fallback label until the first subscription event arrives. */
  initialLabel: string;
  status: "in_flight" | "settled";
  errored?: boolean;
}

export function SubAgentBlock({ parentCallId, initialLabel, status, errored }: SubAgentBlockProps): JSX.Element {
  const { item, recentSteps } = useSubAgent(parentCallId);
  const [expanded, setExpanded] = useState(false);

  const label = item?.label ?? initialLabel;
  const stepCount = item?.steps.length ?? 0;
  const isLive = status === "in_flight" && item?.status === "running";

  return (
    <div className={styles.block}>
      <button type="button" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className={styles.chevron} aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className={styles.label}>{label}</span>
        {stepCount > 0 && <span className={styles.meta}>· {stepCount} {stepCount === 1 ? "step" : "steps"}</span>}
        {isLive && <span className={styles.live}>· live</span>}
        {errored && <span className={styles.errored}>· couldn't finish</span>}
      </button>
      {expanded && (
        <ul className={styles.steps}>
          {recentSteps.slice(-8).map((step) => (
            <li key={step.callId} className={`${styles.step} ${step.ok === false ? styles.stepFailed : ""}`}>
              <span className={styles.bullet} aria-hidden="true">└</span>
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

```typescript
// packages/ui/src/hooks/use-sub-agent.ts
export interface UseSubAgentResult {
  item: SubAgentItem | null;
  recentSteps: SubAgentStep[];
}

export function useSubAgent(parentCallId: string): UseSubAgentResult {
  const client = usePraxisClient();
  const [item, setItem] = useState<SubAgentItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        for await (const event of client.subAgent.events({ parentCallId })) {
          if (cancelled) break;
          // Fold event into local state mirror — snapshot/started/step_started/step_settled/phase_changed/finished
          // (same shape as use-activity.ts:18–55).
        }
      } catch { /* stream errored — keep last good state */ }
    })();
    return () => { cancelled = true; };
  }, [client, parentCallId]);

  return { item, recentSteps: item?.steps ?? [] };
}
```

```tsx
// packages/ui/src/components/sub-agent-panel.tsx
// Bootstrap tab body's optional side panel — full transcript with timestamps.
// Hidden by default; user toggles via a "show sub-agent transcript" button.
export interface SubAgentPanelProps {
  parentCallId: string | null;  // null when no active exploration
}
export function SubAgentPanel({ parentCallId }: SubAgentPanelProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  if (parentCallId === null) return null;
  // ... toggle button + full <ul> of steps when visible, using useSubAgent ...
}

// packages/ui/src/components/bootstrap-tab-body.tsx — extend right pane:
// Read the most recent live sub-agent's parentCallId from a new hook
// useCurrentSubAgent() that returns the last in-flight sub-agent's
// parentCallId (from client.subAgent.list()).
// Render <SubAgentPanel parentCallId={current} /> beneath the outline.
```

```tsx
// packages/ui/src/components/chat-tab-body.tsx — extend item loop:
{items.map((item) => {
  if (item.kind === "interstitial") return <ToolInterstitial ... />;
  if (item.kind === "sub-agent") {
    return (
      <SubAgentBlock
        key={`sa-${item.callId}`}
        parentCallId={item.callId}
        initialLabel={getToolLabel(item.toolName).present.toLowerCase()}
        status={item.status}
        {...(item.errored !== undefined && { errored: item.errored })}
      />
    );
  }
  if (item.kind === "thinking") return <ReasoningBlock content={item.content} streaming={item.streaming} />;
  if (item.kind === "cancel-marker") return <p>Cancelled</p>;
  return <MessageBubble ... />;
})}
```

**Implementation Notes**:
- The `tool_result` branch in `use-streamed-send` settles BOTH interstitial and sub-agent items by callId — same code path; sub-agent variant updates `status` to `settled` exactly like the interstitial.
- The sub-agent block keeps rendering after the tool settles (transitions to "completed" state) — it's the historical record of what happened, not just an in-flight indicator. The `<MessageBubble>` after it picks up the conversation.
- Default-collapsed: only the summary line is visible. Click expands to show the most recent 8 steps. Older steps are dropped from the inline view (full transcript available in the side panel).
- The side panel is **only** in `BootstrapTabBody` (the right pane already exists). Other modes (teach, quiz, etc.) get just the inline block — they don't spawn sub-agents today, so the panel would always be empty. If future tools spawn sub-agents from other modes, add the panel there too.
- Side panel currentSubAgent resolution: `client.subAgent.list()` returns all items; pick the most-recently-started item that's currently running. If multiple are running (unusual but possible), pick the most recent.
- CSS: subtle indent (1ch), faint label color, real Unicode `└` bullet for step lines. Composes editorial.

**Acceptance Criteria**:
- [ ] When the tutor calls `course.start_exploration`, a `<SubAgentBlock>` renders in the chat thread instead of a regular `<ToolInterstitial>`.
- [ ] The block shows the current sub-agent label, step count, and "live" indicator while the explorer runs.
- [ ] Click on the block expands to show the most recent ≤8 step lines.
- [ ] When the explorer finishes successfully, the block transitions to settled state and the "live" indicator disappears.
- [ ] When the explorer fails, the block shows "couldn't finish" and stays expanded by default (or with the error visible at the summary).
- [ ] In `BootstrapTabBody`, a "show sub-agent transcript" toggle is visible while an exploration runs; clicking it reveals the full step list in a panel below the outline.
- [ ] Tools without `spawnsSubAgent: true` still render as `<ToolInterstitial>` (regression guard).
- [ ] The IPC subscription unsubscribes cleanly on component unmount and on parentCallId change.

---

### Unit 6: Rename "bootstrap" / "explore" to "course design" / "reading your materials"
**Files**: `packages/curriculum/src/modes/bootstrap.ts`, `packages/ui/src/components/mode-meta.ts`, `packages/ui/src/components/new-tab-picker.tsx`, `packages/ui/src/lib/copy.ts`, `packages/ui/src/components/bootstrap-tab-body.tsx`, `packages/tools/src/labels/index.ts`
**Story**: `feature-agent-transparency-ux-rename-course-design`

Concrete changes (find-and-replace scope, no behavior changes):

```typescript
// packages/curriculum/src/modes/bootstrap.ts
export const bootstrapMode: Mode = {
  id: "bootstrap",                    // unchanged — DB key
  label: "Design a course",           // was: "Bootstrap a course"
  description: "Conversational mode for designing a new course from your materials.",
  // ... rest unchanged ...
};
```

```typescript
// packages/ui/src/components/mode-meta.ts — bootstrap entry:
bootstrap: {
  name: "course design",              // was: "bootstrap"
  deck: "shaping a new course together",  // unchanged
  ornament: "¶",                      // unchanged
  tint: "#a3b18a",                    // unchanged
},
```

```typescript
// packages/ui/src/components/new-tab-picker.tsx:101
// Replace raw mode id with the mode-meta name:
<span className={styles.radioText}>{getModeMeta(mode).name}</span>
// Add import: import { getModeMeta } from "./mode-meta.js";
```

```typescript
// packages/ui/src/lib/copy.ts — replace bootstrap/explore references:
empty: {
  // ...
  libraryCoursesEmpty:
    "No courses in progress. Import a pack to begin, or design one from your materials.",
  // was: "...start a bootstrap session."
  // ...
},
onboarding: {
  // ...
  courseFromSyllabusBody:
    "Drop in a syllabus or textbook outline and we'll design a course together from it.",
  // was: "...we'll explore it together to draft a course."
  // ...
},
```

```tsx
// packages/ui/src/components/bootstrap-tab-body.tsx
// Update header comment + aria-label + tooltip:
// - JSDoc comment: replace "explore agent" with "course-design sub-agent"
// - aria-label="Explore agent tool-call budget" → aria-label="Course-design budget"
// - title attribute on the budget input: "Tool-call budget for the course-design sub-agent..."
// - Placeholder copy "the outline will appear here as the tutor builds the course."
//   stays as-is — it's already student-facing voice.
```

```typescript
// packages/tools/src/labels/index.ts — course.start_exploration:
"course.start_exploration": {
  present: "Reading your materials",  // was: "Exploring your sources"
  past: "Read your materials",
  spawnsSubAgent: true,                // added by Unit 5
},
```

**Implementation Notes**:
- Internal identifiers unchanged: `modeId: "bootstrap"`, tool name `course.start_exploration`, package `@praxis/curriculum/bootstrap`, mode-meta key `bootstrap`, hook names (`useBootstrapBudget`), component names (`BootstrapTabBody`). They're DB keys and code identifiers; renaming would force migrations and break tests with no UX win.
- Update the `bootstrap-tab-body.tsx` JSDoc top-comment for accuracy ("explore agent" → "course-design sub-agent") — code-doc drift would otherwise mislead future readers.
- Tests that assert on user-visible strings need updates: search `packages/ui/src/__tests__/` for `"Bootstrap"`, `"bootstrap"` (as a label), `"Exploring"`, `"explore"`. The tests assert against the literal strings; update to the new ones. Tests that use `modeId: "bootstrap"` as a literal mode ID stay unchanged.

**Acceptance Criteria**:
- [ ] Mode picker shows "course design" (not "bootstrap") for the bootstrap mode entry.
- [ ] Mode header in a bootstrap session shows "¶ course design · shaping a new course together".
- [ ] Library empty-state copy no longer mentions "bootstrap session".
- [ ] Onboarding course-from-syllabus body no longer says "explore it together".
- [ ] Tool interstitial label for `course.start_exploration` reads "Reading your materials" (present) / "Read your materials" (past).
- [ ] Bootstrap tab body's budget tooltip and aria-label no longer say "explore agent".
- [ ] `vitest run` passes — UI tests asserting on the changed strings are updated to match.
- [ ] No internal id (`modeId`, tool name, package import path) was renamed.

---

## Implementation order

```
Story 1 (stream-pacing)         ─── independent, can ship alone
Story 2 (subagent-channel)      ─── independent foundation
Story 3 (subagent-ui)            ─── depends on Story 2
Story 4 (rename-course-design)  ─── independent, can ship alone
```

Stories 1, 2, 4 can run in parallel. Story 3 lands after Story 2.

## Testing

### Unit 1 + 2 (Story 1: stream-pacing)
**File**: `packages/ui/src/hooks/__tests__/use-streamed-send.test.tsx`
- Mock the client to emit a sequence: `tool_call` → (50ms later) `tool_result` → assert interstitial stays at `in_flight` until 800ms total, then transitions to `settled`. Use `vi.useFakeTimers()`.
- Mock a long-running tool: `tool_call` → (1500ms later) `tool_result` → settle is immediate.
- Mock `interrupted` mid-pacing: pending settle timer is drained, items collapse appropriately.
- Mock `thinking` events: assert a `kind: "thinking"` item appears in items[]; subsequent thinking events append; `tool_call` closes the block (streaming: false).
- Mock `thinking` then `model_message`: reasoning block closes; message bubble opens.

**File**: `packages/ui/src/components/__tests__/reasoning-block.test.tsx`
- Render with `content: ""` → no body visible, summary text reads "thinking".
- Render with `content: "Let's start with..."` → summary line shows truncated; expand reveals full text.
- Click expand → `aria-expanded` toggles; body visible.

**File**: `packages/ui/src/components/__tests__/chat-tab-body.test.tsx`
- Mock scrollTop / clientHeight / scrollHeight to simulate user 100px up; new item arrives; assert `scrollIntoView` NOT called.
- Same with user at bottom; assert it IS called.

### Unit 3 + 4 (Story 2: subagent-channel)
**File**: `packages/core/src/services/__tests__/subagent-registry.test.ts`
- `start` returns a handle with the supplied `parentCallId`.
- `subscribe` receives initial snapshot.
- `subscribe(listener, { parentCallId })` filters correctly.
- `handle.stepStarted` / `stepSettled` / `setLabel` / `finish` all emit matching events.
- After `finish`, item lingers ~30s then is removed (use fake timers).

**File**: `packages/tools/src/__tests__/registry.test.ts`
- `dispatch(name, args, { callId: "abc" })` populates `ctx.callId === "abc"` in the handler.
- `dispatch(name, args)` without meta → `ctx.callId === undefined`.

**File**: `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts`
- Extend the existing test with a fake `SubAgentHandle` that records calls.
- Run the scripted explorer scenario; assert `stepStarted`/`stepSettled` were called once per scripted tool_call/tool_result.
- Assert `finish("done")` called on successful exit; `finish("failed")` on engine_error.

**File**: `packages/engines/src/__tests__/direct.test.ts` and `mcp-tool-bridge.test.ts`
- Verify each adapter's dispatch path threads the SDK-provided callId through to `registry.dispatch`.

### Unit 5 (Story 3: subagent-ui)
**File**: `packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx`
- Mock client.subAgent.events() to emit a scripted sequence; assert hook state folds correctly.

**File**: `packages/ui/src/components/__tests__/sub-agent-block.test.tsx`
- Render with no events yet → shows initialLabel.
- Snapshot event with 3 steps → shows "3 steps".
- Click expand → shows step list (capped to 8 most recent).
- Live indicator visible while status is in_flight.

**File**: `packages/ui/src/__tests__/bootstrap-tab-body.test.tsx`
- Sub-agent panel toggle button visible when an exploration is running.
- Panel renders full step list when toggled visible.

### Unit 6 (Story 4: rename)
**File**: existing tests in `packages/ui/src/__tests__/` (new-tab-picker, library-route, onboarding-flow, etc.)
- Update string assertions for "bootstrap" → "course design", "Exploring" → "Reading", etc.
- Add a snapshot test asserting `getModeMeta("bootstrap").name === "course design"`.

## Risks

1. **Claude Code adapter does not emit `thinking` events.** Today only Codex and Direct do. **Mitigation**: graceful degradation — Claude Code users see the existing thinking-indicator dots only. When the Claude Code SDK adds extended-thinking output, plug into the existing UI without further changes.
2. **MCP SDK callId surfacing.** The Vercel SDK's `toolCallId` is documented and stable. The MCP SDK's callback wiring may need a small inspection during impl to find where the per-request id is exposed. **Mitigation**: spike check at the start of Story 2; if the MCP callback doesn't expose it, fall back to a synthetic uuid generated at dispatch time and prop-drilled into events on both sides (the parent's tool_call.callId in the engine event vs the registry's synthetic id used for sub-agent subscription). This is a robust fallback — the engine adapter would translate its outbound `tool_call.callId` to match the registry's id.
3. **Sub-agent transcripts can run 100+ steps.** Inline display only ever shows the most recent 8; side panel uses a virtualized list when steps > 50. **Mitigation**: hard cap of 200 steps retained in memory; older steps drop off the head of the array. (200 covers the user's max bootstrap budget setting.)
4. **`MIN_INTERSTITIAL_VISIBLE_MS = 800` is a guess.** Could feel too slow with rapid-fire deterministic tools or too fast for slow-reading users. **Mitigation**: named constant; tune by feel during dev; an Action-line item to make it user-configurable can be parked if feedback warrants.
5. **Auto-scroll threshold (80px) may misbehave on small viewports.** **Mitigation**: 80px is small relative to typical chat-pane heights; on viewports < 600px tall the auto-scroll behavior may need a different heuristic (percentage-of-pane). Park a follow-up if a user reports the issue.
6. **Renaming `course.start_exploration`'s present label from "Exploring your sources" to "Reading your materials" creates terminology consistency.** Since Story 4 lands the rename and Story 3 already references `getToolLabel(item.toolName).present` for the fallback initialLabel on `<SubAgentBlock>`, the rename's effect is automatic — no extra wiring.

<!-- Implementation Notes accumulate here as work progresses. -->

## Children complete (2026-05-12)

All four child stories have landed and are at `stage: review` or `done`:

- `feature-agent-transparency-ux-stream-pacing` — **done** (commit `8fc1d2f`, reviewed and approved `eab5ce8`). Tool-interstitial pacing (`MIN_INTERSTITIAL_VISIBLE_MS = 800`); `kind: "thinking"` ChatStreamItem variant + `<ReasoningBlock>`; near-bottom (80px) scroll heuristic. 36 new tests.
- `feature-agent-transparency-ux-subagent-channel` — **done** (commit `cab64a4` + re-pass `17c1421`, reviewed `a808a1e`). `SubAgentRegistry` + IPC channel + explorer emission; `callId` threaded through tool dispatch via SDK callCounter surfacing.
- `feature-agent-transparency-ux-rename-course-design` — **done** (commit `5b0ccdb`, reviewed and approved `243f806`). Student-facing rename "bootstrap" → "course design", "explore" → "reading your materials". Internal identifiers untouched.
- `feature-agent-transparency-ux-subagent-ui` — **review** (commit `c78e7e9`). Inline `<SubAgentBlock>` + bootstrap-tab side panel `<SubAgentPanel>`; `useSubAgent` and `useCurrentSubAgent` hooks; `spawnsSubAgent` flag on `course.start_exploration`. **Resolves the cross-channel agreement question end-to-end** via an adapter-side translation map in `packages/engines/src/claude-code/events.ts` (`ClaudeCodeEventState.toolIdToCallId`) — Claude's UUID `tool_use_id` is now translated to the bridge's sequential callId before being emitted as `tool_call.callId`, so engine event and registry agree. 4 cross-channel agreement tests.

**Cross-cutting deviation**: the subagent-channel story bounced once during review (MCP-side callId propagation was incomplete in the first pass; re-pass surfaced the SDK's callCounter through the `tool()` callback). The subagent-ui story then surfaced the deeper issue (Claude's `tool_use_id` ≠ worker's `callCounter`) and landed the adapter-side translation map. Both the registry and the chat-stream now agree on a single id for each tool call.

**Verification (workspace-wide)**: `pnpm typecheck` green across all 10 packages (including the root tsconfig gate); `pnpm test` 798+ UI tests pass; 103 engine tests pass with the 4 new cross-channel agreement tests.

**Capability check (end-to-end)**:
- Tutor's thinking content renders as a faint expandable summary (`<ReasoningBlock>`) when the engine emits thinking events.
- Tool interstitials respect a minimum 800ms visible time before settling, so fast tools don't flash.
- Auto-scroll only fires when the user is within 80px of the bottom.
- Sub-agent runs (e.g., `course.start_exploration`) render an inline `<SubAgentBlock>` in the chat with live step count; expandable to show step labels; settled-but-visible after completion.
- Bootstrap tab body's right pane has a "show sub-agent transcript" toggle that reveals the full step list.
- Mode picker / tab labels / tool interstitial labels read "course design" / "Reading your materials" instead of "bootstrap" / "Exploring your sources".

Advancing feature `implementing → review`. The next autopilot review pass will evaluate the realized capability.

Resolves: backlog idea `idea-subagent-callid-end-to-end-verification` (subagent-ui's adapter-side translation map answers that question).

## Review (2026-05-12, feature-level)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Brief satisfied end-to-end across all three concerns (stream pacing, sub-agent transparency, rename). Every acceptance criterion in the children's stories is now at done.
- Decomposition matches design with one acknowledged iteration: subagent-channel bounced once (incomplete MCP propagation) and subagent-ui surfaced the deeper cross-channel question, which was resolved via the adapter-side translation map (`ClaudeCodeEventState`). The state's lifetime bug was caught and fixed inline during subagent-ui review (commit `615f2d9`).
- Capability check works in real flows: thinking → reasoning blocks, interstitial pacing, sub-agent inline + side-panel, student-facing names.
- Foundation-doc alignment: VISION.md's anti-numeric stance honored (no line counts, no progress %); SPEC.md memory commitments respected (sub-agent events use a separate registry, not the parent's episodic log). No drift.
- Breaking changes contained to internal seams: `ToolDefinition.handler` in `@praxis/claude-cli-sdk` gained a second arg (Praxis is the only consumer; updated); `mapClaudeCodeEvent` gained an optional state parameter (backward-compatible — undefined falls through to raw toolId).

Feature delivered as briefed. Advancing to done.
