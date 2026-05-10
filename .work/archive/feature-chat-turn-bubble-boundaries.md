---
id: feature-chat-turn-bubble-boundaries
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: [feature-chat-tool-call-visibility]
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Chat: split assistant text into one bubble per model turn

## Brief

`useStreamedSend` opens a single assistant bubble per `send(...)` call and
funnels every `model_message` event into it (see
`packages/ui/src/hooks/use-streamed-send.ts:81-115`: one
`assistantMsgId = nextId()`, then `setMessages(... id === assistantMsgId)` for
the lifetime of the turn). When the agent runs multiple model turns inside a
single user send — common during a tool-using exchange — all of the model's
prose collapses into one growing bubble that visually concatenates distinct
moments of thinking.

This feature splits the bubble. Each new model turn should open its own
bubble; tool calls (handled by `feature-chat-tool-call-visibility`) sit
between bubbles as ambient interstitials.

The split must be driven off engine events, not heuristics on text content.
Inspect the `EngineEvent` stream coming from `client.session.send(...)` and
identify the right boundary — likely the first `model_message` after a
`tool_result` (i.e., the turn after the tool round-trip), or a dedicated
`assistant_turn_start` / `assistant_turn_end` signal if one exists or needs
to exist. The design phase verifies what the engine adapters actually emit
(`packages/engines/src/{claude-code,codex,direct}/events.ts`) and decides
whether to add a normalized boundary event or infer it from the existing
stream.

The split must also reflect correctly when replaying persisted history via
`episodicToMessages` (`packages/ui/src/hooks/episodic-to-messages.ts`) so a
re-opened tab shows the same bubble structure as the live stream produced.
Otherwise the live and replayed views diverge on the same conversation.

Out of scope: visual styling beyond what's necessary to make distinct bubbles
read as distinct (vertical rhythm, label repetition rules). Editorial
constraints from `docs/VISION.md` apply — no avatars, no aggressive
separators.

## Source

Promoted from `idea-chat-turn-formatting-between-turns` (parked 2026-05-09).
The original parking note suggested an `assistant_message_start` /
`_delta` / `_complete` event pattern; the design phase should treat that
as one option to evaluate against what the engine adapters already emit, not
as a fixed contract.

---

## Design decisions

- **Boundary signal**: derive from the existing event stream — no new
  `assistant_turn_start` / `_end` engine event. The current adapters already
  expose enough structure: a non-partial `model_message` seals one assistant
  message, a `tool_call` fires at message boundaries, and `final` /
  `error` close the turn. Inferring boundaries from these events keeps the
  engine contract stable and avoids changing all three adapters + their
  conformance tests for a UI-only fix.
- **Boundary rule**: a bubble closes on (a) a non-partial `model_message`
  AFTER the content is appended, (b) a `tool_call`, (c) a `system_note`,
  (d) an `error`, or (e) `final`. Any subsequent `model_message` opens a
  fresh bubble. This rule works identically for live streaming and replay,
  which is the cross-cutting invariant the brief requires.
- **Coordination with sibling feature**: this feature `depends_on:
  [feature-chat-tool-call-visibility]`. Tool-call-visibility introduces the
  `ChatStreamItem` discriminated union and renames `messages → items`.
  Building on top of that surface lets bubble-splitting push multiple
  `kind: "message"` items per `send(...)` call without re-deriving the
  union here. Implementing both in parallel would force duplicated type
  invention or coordination overhead.
- **Streaming bubble identity**: when a turn produces `[partials..., final
  non-partial, tool_call, partials..., final non-partial]`, the items
  array gains TWO `kind: "message"` items: the first sealed at the first
  non-partial, the second filled by the second batch of partials. The
  second bubble is created lazily on the first `model_message` after the
  boundary — not pre-created — because some turns end on a tool call with
  no subsequent assistant text (the model called a tool and the engine
  cut to `final` on `max_turns`). Pre-creating leaves an empty bubble in
  that case.
- **First-bubble timing change**: today the assistant bubble is pushed
  eagerly at `send(...)` start (current `use-streamed-send.ts:81-85`)
  before any `model_message` arrives, giving an immediately-visible empty
  bubble while the model thinks. Bubble-splitting moves the push to the
  first `model_message` of the turn instead. The "tutor is starting"
  signal moves to a streaming indicator on the input row (already provided
  by `isStreaming`), or — better — to an in-flight tool interstitial when
  the very first thing the model does is call a tool. This is more honest:
  an empty bubble that may stay empty for ~5s of tool work reads as
  "broken" today; deferring the bubble removes that artifact.
- **Bubble label repetition**: every assistant bubble repeats the "Tutor"
  label the same way (no "continuing…" suffix, no first-only suppression).
  Repetition is the editorial signal that this is a new utterance, not a
  continuation. Mirrors how a literary review attributes consecutive
  paragraphs to the same author — clarity over cleverness.
- **Vertical rhythm**: consecutive assistant bubbles use the same
  `gap` the message column already provides. No new separator lines, no
  divider rules, no avatar columns. The only visual delta is: the second
  bubble is a separate `<div>` with its own background, so the two
  utterances read as distinct shapes.
- **`thinking` events**: continue to be silently dropped (current
  behaviour). They are not bubble boundaries and they are not user-facing
  surfaces in this feature.
- **`system_note` handling**: closes the current bubble (acts as a
  boundary), but rendering `system_note` as its own UI item remains out of
  scope. Today neither hook handles `system_note` at all; this feature
  preserves that behaviour with the addition that it now also flushes the
  current bubble. Surfacing system notes is a follow-up idea.

## Architectural choice

**Stateful "current bubble id" pointer in both hooks, driven by the existing
EngineEvent stream.** Chosen over (a) adding `assistant_turn_start` /
`_end` to the engine contract (would change three adapter implementations
plus their conformance tests for what is fundamentally a renderer concern)
and (b) computing boundaries at render time from a single accumulator (would
duplicate state in the items array and fight the live stream's "mutate the
in-flight bubble" model).

The pointer logic is small (~10 LoC each side) and is easiest to
test by asserting that `useStreamedSend` and `episodicToMessages`,
fed the same `EngineEvent` sequence, produce the same `items` shape. That
parity test is the cross-cutting invariant the brief calls out.

## Implementation Units

### Unit 1: Bubble-splitting in `useStreamedSend`

**File**: `packages/ui/src/hooks/use-streamed-send.ts`

Build on the `items: ChatStreamItem[]` surface introduced by
`feature-chat-tool-call-visibility`. Replace the single
`assistantMsgId = nextId()` placeholder with a per-turn pointer that
opens new bubbles lazily.

```typescript
// Inside send(...):
let currentAssistantId: string | null = null;

const openAssistantBubble = (): string => {
  const id = nextId();
  setItems((prev) => [
    ...prev,
    {
      kind: "message",
      id,
      role: "assistant",
      content: "",
      rawContent: "",
      streaming: true,
    },
  ]);
  currentAssistantId = id;
  return id;
};

const closeAssistantBubble = () => {
  if (currentAssistantId === null) return;
  const id = currentAssistantId;
  currentAssistantId = null;
  setItems((prev) =>
    prev.map((it) =>
      it.kind === "message" && it.id === id ? { ...it, streaming: false } : it,
    ),
  );
};

// Per-turn assistant accumulator follows the active bubble id, NOT a single
// turn-wide accumulator. Each new bubble starts with `accumulatedContent = ""`.
let activeBubbleContent = "";

for await (const event of client.session.send(sessionId, message)) {
  if (event.type === "user_message") continue;

  if (event.type === "model_message") {
    if (currentAssistantId === null) {
      activeBubbleContent = "";
      openAssistantBubble();
    }
    if (event.partial === true) {
      activeBubbleContent += event.content;
    } else {
      activeBubbleContent = event.content;
    }
    const id = currentAssistantId; // stable for the closure
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "message" && it.id === id
          ? { ...it, content: activeBubbleContent, rawContent: activeBubbleContent, streaming: true }
          : it,
      ),
    );
    if (event.partial !== true) {
      // Non-partial closes the bubble; next model_message opens a new one.
      closeAssistantBubble();
    }
    continue;
  }

  if (event.type === "tool_call") {
    closeAssistantBubble();
    // ... existing tool-call handling from feature-chat-tool-call-visibility:
    //   pendingByCallId.set(callId, toolName), push interstitial if !hidden
    continue;
  }

  if (event.type === "tool_result") {
    // ... existing tool-result handling from feature-chat-tool-call-visibility.
    // Result harvesting still routes citations/drafts/notes/dueCards onto the
    // CURRENT (or most recent) assistant bubble. Per Unit 3 below, we route
    // them onto the most-recent assistant message item that already has the
    // matching tool's renderable shape, OR onto the next assistant bubble if
    // none exists yet — see "Renderable result placement" below.
    continue;
  }

  if (event.type === "system_note") {
    closeAssistantBubble();
    continue;
  }

  if (event.type === "error") {
    closeAssistantBubble();
    setLastError(event.error.message);
    break;
  }
}

// finally block: ensure any open bubble closes.
closeAssistantBubble();
```

**Implementation Notes**:
- The closures over `setItems` use the React 19 functional-update form
  (`setItems((prev) => ...)`) so ordering between consecutive `setItems`
  calls is preserved without batching pitfalls.
- `activeBubbleContent` is intentionally a closure-local primitive (not
  state) so the partial / non-partial accumulation logic stays
  synchronous; React's setState is the visual broadcast, the local var
  is the source of truth for "what's in this bubble right now."
- The first `model_message` of a turn opens the bubble lazily — the
  empty bubble that today appears before any text is gone. If the model
  opens with a `tool_call`, the user sees the interstitial first and the
  bubble later; that is the desired behaviour.
- `closeAssistantBubble` is idempotent (no-op when no bubble open). All
  boundary handlers may safely call it.
- `clearMessages` (renamed `clearItems` if Unit 6 of tool-call-visibility
  did so) resets `items` to `[]`; no extra cleanup needed here.

**Acceptance Criteria**:
- [ ] A turn with one `model_message(partial=false, content="hello")`
      produces exactly ONE `kind: "message"` assistant item with content
      `"hello"` and `streaming: false`
- [ ] A turn with deltas `["He","llo"]` plus a non-partial `"Hello"`
      produces ONE assistant item with `content: "Hello"`
- [ ] A turn with `[non-partial "A", tool_call, tool_result, non-partial "B"]`
      produces TWO assistant items in items order: first with `"A"`, second
      with `"B"`. The interstitial (from sibling feature) sits between them
- [ ] A turn with `[partials..A, tool_call, partials..B]` (no non-partial
      seal between A and the tool) still splits into two bubbles — the
      `tool_call` closes bubble A regardless
- [ ] A turn with `[non-partial "A", system_note]` closes bubble A; the
      system_note remains UI-invisible (no item pushed)
- [ ] A turn with `[partials..A, error]` closes bubble A in error state
      (no `streaming: true` left dangling) and surfaces `lastError`
- [ ] A turn that ends on `tool_call` with no subsequent `model_message`
      produces ONE bubble (the pre-tool one) and NO trailing empty bubble
- [ ] No assistant item ever has `streaming: true` after the iterator
      completes (verified by the finally-block `closeAssistantBubble`)

---

### Unit 2: Bubble-splitting parity in `episodicToMessages`

**File**: `packages/ui/src/hooks/episodic-to-messages.ts`
(renamed `episodicToItems` per sibling feature Unit 4)

Apply the identical boundary rule on replay. The function walks events in
turn-asc / ts-asc order; the bubble pointer + accumulator pair work the
same as Unit 1 except `streaming` is always `false` in the output (history
is settled).

```typescript
export function episodicToItems(events: readonly EpisodicEvent[]): ChatStreamItem[] {
  const items: ChatStreamItem[] = [];
  let counter = 0;
  const id = (k: "user" | "asst") => `hist-${k}-${++counter}`;

  let currentTurn: number | null = null;
  let currentAssistantId: string | null = null;
  let activeBubbleContent = "";
  const pendingByCallId = new Map<string, string>(); // callId → toolName

  // accumulators for renderable tool results — these still attach to the
  // most-recent assistant bubble (see Unit 3 placement rule).
  let pendingCitations: RetrievalCitation[] = [];
  let pendingDrafts: ProposedCourse[] = [];
  let pendingNotes: Note[] = [];
  let pendingDueCards: ReviewCard[] = [];

  const flushRenderables = (targetAssistantId: string | null) => {
    if (targetAssistantId === null) return;
    if (
      pendingCitations.length === 0 &&
      pendingDrafts.length === 0 &&
      pendingNotes.length === 0 &&
      pendingDueCards.length === 0
    ) {
      return;
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "message" && it.id === targetAssistantId) {
        if (pendingCitations.length > 0) it.citations = [...(it.citations ?? []), ...pendingCitations];
        if (pendingDrafts.length > 0) it.drafts = [...(it.drafts ?? []), ...pendingDrafts];
        if (pendingNotes.length > 0) it.notes = [...(it.notes ?? []), ...pendingNotes];
        if (pendingDueCards.length > 0) it.dueCards = [...(it.dueCards ?? []), ...pendingDueCards];
        break;
      }
    }
    pendingCitations = []; pendingDrafts = []; pendingNotes = []; pendingDueCards = [];
  };

  const openBubble = (): string => {
    const newId = id("asst");
    activeBubbleContent = "";
    items.push({
      kind: "message",
      id: newId,
      role: "assistant",
      content: "",
      rawContent: "",
      streaming: false,
    });
    currentAssistantId = newId;
    return newId;
  };

  const closeBubble = () => {
    if (currentAssistantId === null) return;
    flushRenderables(currentAssistantId);
    currentAssistantId = null;
  };

  for (const ep of events) {
    const turnIndex = ep.source.turnIndex;
    if (currentTurn !== null && turnIndex !== currentTurn) {
      closeBubble();
    }
    currentTurn = turnIndex;
    const event = ep.event;

    switch (event.type) {
      case "user_message":
        closeBubble();
        items.push({
          kind: "message",
          id: id("user"),
          role: "user",
          content: event.content,
          rawContent: event.content,
        });
        break;

      case "model_message": {
        if (currentAssistantId === null) openBubble();
        if (event.partial === true) {
          activeBubbleContent += event.content;
        } else {
          activeBubbleContent = event.content;
        }
        const target = currentAssistantId;
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          if (it.kind === "message" && it.id === target) {
            it.content = activeBubbleContent;
            it.rawContent = activeBubbleContent;
            break;
          }
        }
        if (event.partial !== true) closeBubble();
        break;
      }

      case "tool_call":
        closeBubble();
        pendingByCallId.set(event.callId, event.toolName);
        // ... push interstitial item if !hidden, per sibling feature Unit 4
        break;

      case "tool_result": {
        const toolName = pendingByCallId.get(event.callId);
        pendingByCallId.delete(event.callId);
        // ... mutate matching interstitial to settled, per sibling feature Unit 4
        if (toolName === undefined || !event.result.ok) break;
        // Harvest into pending* arrays per existing logic; flushRenderables
        // attaches them to the next opened (or most recent) assistant bubble.
        // ... existing harvest dispatch by toolName
        break;
      }

      case "final":
      case "error":
      case "system_note":
        closeBubble();
        break;
    }
  }

  closeBubble();
  return items;
}
```

**Implementation Notes**:
- Mutating `items[i]` in place during replay is acceptable (the function
  returns a fresh array, never re-runs over the same items). Live
  streaming uses `setItems` immutable updates because React state demands
  it; replay does not.
- `activeBubbleContent` is reset on every `openBubble()` so the second
  bubble's partial accumulation does NOT inherit content from the first.
  This is the bug the current single-bubble logic has on replay too.
- `pendingByCallId` is per-call function-scoped (not per-turn) — callIds
  are session-unique so there's no risk of cross-turn collision, and a
  tool that started in turn N may resolve in turn N+1 in unusual cases.
- The renderable-result placement rule: harvest results sit in `pending*`
  arrays until the NEXT bubble closes (which is when they attach). If the
  stream ends before another bubble opens, the renderables attach to the
  most recent assistant bubble at end-of-stream. See Unit 3 for the
  shared rule.
- The `final` event closes the current bubble (it terminates the turn);
  it does NOT push any item.

**Acceptance Criteria**:
- [ ] Replay of `[user, model("A"), tool_call, tool_result, model("B"), final]`
      produces `[user, asst("A"), interstitial(settled), asst("B")]`
- [ ] Replay of `[user, model partials..A, model non-partial "A-final", final]`
      produces `[user, asst("A-final")]` (one bubble, content from the
      non-partial)
- [ ] Replay of `[user, model("A"), tool_call, model("B"), final]` (tool
      never resolved) produces `[user, asst("A"), interstitial(in_flight),
      asst("B")]`
- [ ] Replay of two consecutive turns produces 2 user + 2 assistant items
      in correct turn order with their content scoped per bubble
- [ ] Replay of a stream where the assistant bubble would have collected
      `dueCards` from `flashcard.review_next` (hidden tool) attaches the
      cards to the same bubble that follows the tool call, NOT to the
      bubble before
- [ ] Existing tests in `__tests__/episodic-to-messages.test.ts` updated to
      the new shape continue to pass

---

### Unit 3: Renderable-result placement rule

**Files**: `packages/ui/src/hooks/use-streamed-send.ts`,
`packages/ui/src/hooks/episodic-to-messages.ts`

Citations / drafts / notes / dueCards used to attach to the single
turn-wide assistant bubble. With multi-bubble turns, where do they go?

**Rule**: a renderable result attaches to the FIRST assistant bubble that
opens AFTER the tool resolves. Rationale: the model's response to the tool
result is the bubble that should render the source / draft / note that the
tool returned. The "before-tool" bubble is the model's setup; the
"after-tool" bubble is the model's response — the renderable belongs there.

If the stream ends without another bubble opening (e.g., the tool was the
last thing and the engine cut to `final`), the result attaches to the
most recent assistant bubble at end-of-stream. Better than dropping the
renderable; worst case a citation appears below "Let me check the
textbook..." instead of a follow-up message.

**Implementation Notes**:
- Both hooks maintain `pendingCitations`, `pendingDrafts`, `pendingNotes`,
  `pendingDueCards` arrays at function scope.
- On `tool_result.ok`, harvest into the appropriate pending array (logic
  unchanged from current code; only the SINK changes from "the single
  assistant message" to "pending arrays").
- On `openAssistantBubble`, AFTER pushing the new bubble item, drain the
  pending arrays into the freshly-opened bubble. This is the "first
  assistant bubble after the tool" attachment.
- On `final` / iterator end, drain any remaining pending arrays into the
  most recent assistant bubble (use `findLast` over items).

**Acceptance Criteria**:
- [ ] A turn with `[model("A"), tool_call(retrieve), tool_result(citations),
      model("B")]` attaches `citations` to bubble B, NOT bubble A
- [ ] A turn with `[model("A"), tool_call(retrieve), tool_result(citations),
      final]` attaches `citations` to bubble A (no subsequent bubble; falls
      back to the most recent)
- [ ] A turn with two tool round-trips and three assistant bubbles, where
      retrieve fires before bubble 2, attaches citations to bubble 2;
      a second retrieve before bubble 3 attaches its citations to bubble 3
- [ ] Replay parity: identical event sequence produces identical
      attachment in `episodicToItems`

---

### Unit 4: Test scaffolding for live + replay parity

**Files**:
- `packages/ui/src/__tests__/use-streamed-send.test.ts` (extend from sibling
  feature)
- `packages/ui/src/__tests__/episodic-to-messages.test.ts` (extend)
- `packages/ui/src/__tests__/bubble-boundary-parity.test.ts` (new)

The new parity test file feeds the SAME synthetic `EngineEvent[]` to both
hooks (one via a fake `client.session.send` async generator, one via
`episodicToItems` after wrapping each event in an `EpisodicEvent` envelope)
and asserts that the resulting `items` arrays have the same length and the
same per-item shape (id values may differ; `kind`, `role`, `content`,
`citations`/etc. equality is what matters).

```typescript
// bubble-boundary-parity.test.ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamedSend } from "../hooks/use-streamed-send.js";
import { episodicToItems } from "../hooks/episodic-to-messages.js";
import { makeFakeClient } from "./helpers/fake-client.js";

const SCENARIOS = [
  // Each scenario is a labelled EngineEvent[] (excluding user_message
  // which the hooks treat differently between live and replay).
  ["single-turn", [{ type: "model_message", content: "hi", partial: false }, { type: "final", usage: {inputTokens:0, outputTokens:0}}]],
  ["two-bubble-tool", [
    { type: "model_message", content: "Let me check.", partial: false },
    { type: "tool_call", toolName: "retrieve_from_textbook", args: {}, callId: "t1" },
    { type: "tool_result", callId: "t1", result: { ok: true, value: { citations: [] }, tier: "deterministic" } },
    { type: "model_message", content: "Found it.", partial: false },
    { type: "final", usage: {inputTokens:0, outputTokens:0}},
  ]],
  // ... ~6 scenarios total
];

describe.each(SCENARIOS)("bubble parity: %s", (label, events) => {
  it("produces the same items shape live vs replay", async () => {
    const liveItems = await runLive(events);
    const replayItems = runReplay(events);
    expect(stripIds(liveItems)).toEqual(stripIds(replayItems));
  });
});
```

**Implementation Notes**:
- `stripIds` normalizes the shape before equality (drops `id` fields,
  drops `streaming` since live ends with false / replay starts with false).
- `runLive` uses `renderHook` + `act` + a `makeFakeClient` whose
  `session.send` returns a generator yielding the scenario events.
- `runReplay` wraps events in minimal `EpisodicEvent` envelopes
  (turn 0 for everything; ts increments).

**Acceptance Criteria**:
- [ ] Parity test passes for at least 6 representative scenarios
      (single-bubble, two-bubble-tool, three-bubble-double-tool,
      tool-only-no-second-bubble, partials-with-non-partial-seal,
      error-mid-stream)
- [ ] When a scenario fails, the diff clearly shows where live and replay
      diverged
- [ ] Existing tests (use-streamed-send, episodic-to-messages,
      chat-tab-body) continue to pass

---

### Unit 5: Vertical-rhythm CSS confirmation

**File**: `packages/ui/src/components/chat-tab-body.module.css` (verify, not
necessarily edit)

Confirm consecutive assistant bubbles render with the existing column
gap. No new styles unless the visual reads as "one continuous bubble"
when adjacent.

**Implementation Notes**:
- The existing `.messages` flex column on `chat-tab-body.module.css`
  provides a `gap` between children. Two assistant bubbles back-to-back
  inherit this naturally.
- If, in implementation, the bubbles read as connected (no visible gap),
  add `& > * + .${styles.bubble}` rules in
  `packages/ui/src/components/message.module.css` to add a tiny extra
  margin between same-role consecutive bubbles. Decide at implementation
  time after eyeballing.

**Acceptance Criteria**:
- [ ] Two consecutive assistant bubbles are visually distinct (clear
      vertical separation, separate backgrounds, separate "Tutor" labels)
- [ ] Verified manually in `pnpm dev` against a teach session that
      issues a tool call

---

## Implementation Order

1. **Unit 1** — bubble-splitting in `useStreamedSend` (depends on
   sibling feature's `ChatStreamItem` type)
2. **Unit 2** — bubble-splitting parity in `episodicToItems` (mirror of
   Unit 1)
3. **Unit 3** — renderable-result placement rule (touches both hooks;
   easier to land after both have the bubble-splitter scaffolding)
4. **Unit 4** — test scaffolding (extends existing tests + parity suite)
5. **Unit 5** — visual confirmation (last; design-only unit, may be a
   no-op)

Each unit's tests land alongside the unit. Run `pnpm test --filter @praxis/ui`
after each.

## Testing

### Unit Tests

- `packages/ui/src/__tests__/use-streamed-send.test.ts` (extend from
  sibling feature) — cases for two-bubble splits, tool-only-no-second-bubble,
  error mid-stream, system_note boundary, finally-block close.
- `packages/ui/src/__tests__/episodic-to-messages.test.ts` (extend) —
  same coverage on the replay side.
- `packages/ui/src/__tests__/bubble-boundary-parity.test.ts` (new) —
  the live-vs-replay parity sweep described in Unit 4.

### Integration

- `packages/ui/src/__tests__/chat-tab-body.test.tsx` (extend if it
  exists, else add) — render `<TeachChatTabBody>` against a fake stream
  with one tool call between two model messages; assert two distinct
  bubbles and one interstitial in DOM order.

### Test Data

- All synthetic event sequences are constructed inline in the tests; no
  fixtures.

## Risks

1. **Renderable-result placement when the model never speaks again after a
   tool**. The rule says "first bubble after the tool"; if there is none,
   "most recent at end-of-stream". The fallback may put a citation card
   under the wrong bubble (the pre-tool "Let me check..." bubble). This
   is rare (the model usually responds to its own tool result) and
   strictly better than dropping the citation. If it becomes a real
   problem, the future fix is to render orphan citations as their own
   `kind: "renderables"` item — out of scope here.

2. **Lazy-bubble-open changes the perceived "tutor is working" signal**.
   Today the empty bubble appears immediately on send. With the change,
   the bubble appears only when text starts. If the model opens with a
   long tool call the user might think the send was lost. Mitigation:
   the in-flight tool interstitial from sibling feature provides the
   activity signal; if no tool fires, the composer's `disabled +
   isStreaming` state still indicates the system is busy. The empty
   bubble is removed deliberately because it reads as "broken" today
   when tool work delays the first text.

3. **Boundary rule misses a streaming sequence we haven't seen**. The rule
   was derived from reading three adapters; a future engine adapter or
   a bug-fix to an existing adapter could emit `[model partial, tool_use,
   model partial]` within ONE assistant message (where the tool is
   embedded inline). The rule still produces a defensible split (tool
   forces a boundary), so the worst case is "we split a single semantic
   message into two bubbles" — visually distinct but not incorrect. The
   parity test will catch divergence between live and replay.

4. **Multi-bubble streaming flicker**. When the second bubble opens
   mid-turn, React rerenders the items array. The auto-scroll-to-bottom
   effect (currently driven by `messages.length`) needs to fire on
   `items.length`, which Unit 6 of the sibling feature already handles.
   If not, scroll lags one bubble behind. Verify in Unit 5's manual
   eyeballing.

## Implementation notes

### Units landed

All five units landed in a single stride.

- **Unit 1** (`use-streamed-send.ts`): replaced single `assistantMsgId` with
  lazy `currentAssistantId: string | null` pointer. `openAssistantBubble()` and
  `closeAssistantBubble()` are the boundary helpers. The eager placeholder bubble
  pushed at `send()` start is gone; the first `model_message` now opens the first
  bubble. `system_note` handling added as a pure boundary (no item pushed).
  `pendingCitations / pendingDrafts / pendingNotes / pendingDueCards` arrays hold
  harvested renderables until the next `openAssistantBubble` drains them. End-of-
  stream fallback drains any remaining pending renderables into `lastAssistantId`.

- **Unit 2** (`episodic-to-messages.ts`): rewrote from `AssistantAcc`
  accumulator model to the same bubble-pointer model. `openBubble()` drains
  pending renderables immediately. `closeBubble()` is idempotent. The turn-
  boundary flush (turnIndex change) calls `closeBubble()`. End-of-stream calls
  `drainPendingInto(lastAssistantId)` for any orphaned renderables.

- **Unit 3** (renderable placement): renderables now attach to the FIRST bubble
  after the tool resolves (drained in `openAssistantBubble` / `openBubble`).
  If the stream ends without a subsequent bubble, they fall back to `lastAssistantId`.
  This is a behavioural change from Wave 1 (which attached renderables to the
  turn's single `assistantMsgId` immediately on `tool_result`).

- **Unit 4** (tests): extended `use-streamed-send.test.tsx` with 9 new bubble-
  splitting cases; extended `episodic-to-messages.test.ts` with 7 new cases;
  created `bubble-boundary-parity.test.ts` with 8 parity scenarios (single-turn,
  two-bubble-tool, three-bubble-double-tool, tool-only-no-second-bubble,
  partials-with-non-partial-seal, error-mid-stream, citations-on-post-tool-bubble,
  system-note-boundary). All 666 tests pass.

- **Unit 5** (CSS): no change needed. `chat-tab-body.module.css` already has
  `gap: 0.75rem` on the `.messages` flex column; consecutive assistant bubbles
  inherit natural spacing. Manual `pnpm dev` verification is a QA item.

### Deviations from the design

1. **Closure-over-mutable-variable bug caught during implementation**: the design
   sample showed `{ ...it, content: activeBubbleContent }` directly in the
   `setItems` closure. With React's batched functional updates, `activeBubbleContent`
   is captured by reference — by the time React flushes the queued update, the
   variable has already advanced to the next bubble's content. Fixed by snapshotting
   before the closure: `const contentSnapshot = activeBubbleContent; setItems(prev
   => prev.map(... contentSnapshot ...))`. This is the load-bearing correctness fix;
   without it, earlier bubbles get overwritten with later bubbles' content.

2. **`episodicToItems` rewritten rather than refactored**: the design suggested
   an in-place refactor of the existing function. The `AssistantAcc` structure
   was architecturally different enough from the bubble-pointer model that a
   clean rewrite was clearer and produced no functional regressions (all 11
   pre-existing tests still pass unchanged).

3. **`findLastIndex` usage in tests**: ES2023 `Array.prototype.findLastIndex` is
   used in the test assertions for item ordering. The test environment supports it
   (Node ≥ 24 as per CLAUDE.md); no polyfill needed.

4. **`system_note` handling in `episodic-to-messages.ts`**: added the `case
   "system_note": closeBubble(); break;` branch that was entirely missing from
   Wave 1. Live side also adds `else if (event.type === "system_note")` handling.
   Both sides now treat system_note as a boundary-only event with no item pushed.

---

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The `loadHistory` test in `use-streamed-send.test.tsx:281` raced the lazy bubble open after this feature landed (snapshotted `items.length` before the live `model_message` was processed). Fixed inline in commit `6e21bc9` by waiting for the live content to render before snapshotting; the post-loadHistory length comparison is now meaningful again.
- `SYSTEM_NOTE_BOUNDARY` fixture in `bubble-boundary-parity.test.ts:164` originally passed `origin: "parent_session"` (a bare string) which doesn't satisfy `SystemNoteOrigin`. The UI tsconfig excludes `__tests__/` from typecheck so it slipped through; the runtime test still validated the right behaviour because the hooks key on `event.type` not `event.origin`. Fixed inline during review to `{ kind: "system", topic: "parent_session" }` so the fixture matches the discriminated union.

**Notes**:
- The closure-over-mutable-variable bug caught during implementation (and documented in the deviations section) is the load-bearing correctness insight. The fix — snapshot `activeBubbleContent` to a `const` before passing it into the `setItems` updater — is small but absolutely necessary; without it, multi-bubble turns would have shown all bubbles with the last bubble's content. Glad the implementer found it; this is exactly the kind of React batching gotcha that the parity tests would have caught only because they assert per-bubble content equality across live and replay.
- The bubble-boundary parity sweep is the right cross-cutting test. Eight scenarios cover the boundary-rule matrix end-to-end, and `stripIds()` normalization keeps the assertion focused on shape rather than ids/streaming flags. New scenarios (e.g. concurrent fan-out across multiple turns) can be added one entry at a time.
- The `episodicToItems` rewrite (vs in-place refactor) was the right call given how different the bubble-pointer model is from the prior `AssistantAcc` accumulator. All pre-existing tests still pass — the rewrite preserved the contract.
- Renderable placement now follows "first bubble after the tool resolves" with end-of-stream fallback to the most-recent bubble. This is a behavioural change from Wave 1; the implementation notes flag it explicitly. Documented behaviour and tests cover both branches.
- No security surface; no foundation-doc drift.
- Wave 2 produces the visible UX gain Wave 1 set up the surface for: a multi-turn tutor exchange now reads as distinct utterances rather than one growing wall of text. Worth eyeballing in `pnpm dev` once on a teach session that does a couple of `retrieve_from_textbook` round-trips.
