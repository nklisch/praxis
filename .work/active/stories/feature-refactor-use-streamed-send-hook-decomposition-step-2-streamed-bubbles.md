---
id: feature-refactor-use-streamed-send-hook-decomposition-step-2-streamed-bubbles
kind: story
stage: done
tags: [refactor, ui]
parent: feature-refactor-use-streamed-send-hook-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Extract `useStreamedBubbles`

## Goal

Isolate the assistant-bubble open/close/split lifecycle into a focused
`useStreamedBubbles` hook. This machine manages per-turn mutable locals
(`activeBubbleContent`, `currentAssistantId`, `lastAssistantId`) and two
imperative helpers (`openAssistantBubble`, `closeAssistantBubble`). Extracting
it clarifies the bubble-splitting contract and makes the logic independently
testable.

## Current state (in `use-streamed-send.ts`)

Lines 283–357 (inside `send()`):

```ts
let activeBubbleContent = "";
let currentAssistantId: string | null = null;
let lastAssistantId: string | null = null;

const openAssistantBubble = (): string => { ... }  // lines 315–345
const closeAssistantBubble = (): void => { ... }   // lines 347–357
```

`openAssistantBubble` drains pending renderables (citations/drafts/notes/cards)
into the new bubble. This renderable-drain coupling means the bubble hook must
either accept the pending arrays as input or the drain must stay in the caller.

**Design decision**: Keep renderable-drain OUT of `useStreamedBubbles` —
renderables belong to the interstitial/renderable hook (Step 3). Instead,
`openAssistantBubble` accepts an optional `renderables` argument at call time.
This removes the tight coupling to mutable arrays in the outer scope.

## Target state

New file: `packages/ui/src/hooks/use-streamed-bubbles.ts`

```ts
export interface BubbleRenderables {
  citations?: RetrievalCitation[];
  drafts?: ProposedCourse[];
  notes?: Note[];
  dueCards?: ReviewCard[];
}

export interface StreamedBubblesApi {
  /**
   * Open a new assistant bubble. Accepts pre-drained renderables to attach.
   * Returns the new bubble id.
   */
  openAssistantBubble: (renderables?: BubbleRenderables) => string;
  /**
   * Close the current bubble (no-op if none open).
   */
  closeAssistantBubble: () => void;
  /**
   * Append a content delta to the active bubble (increments activeBubbleContent).
   * Does NOT open a bubble — caller must call openAssistantBubble first.
   */
  appendContent: (delta: string) => void;
  /**
   * Replace the active bubble's content with a final snapshot.
   */
  setContent: (content: string) => void;
  /**
   * Current accumulated content for the active bubble (needed for the
   * `activeBubbleContent.length > 0` thinking guard).
   */
  readonly activeBubbleContentLength: number;
  /**
   * Id of the currently open assistant bubble (null if none).
   */
  readonly currentAssistantId: string | null;
  /**
   * Id of the most-recently opened assistant bubble (for finally fallback drain).
   */
  readonly lastAssistantId: string | null;
}

export function useStreamedBubbles(
  setItems: SetItems,
  setThinking: (v: boolean) => void,
): StreamedBubblesApi
```

The hook takes `setItems` and `setThinking` as stable callbacks from the outer
hook's state. These are always-fresh because they come from `useState` setter
refs — React guarantees setter identity is stable.

`useStreamedBubbles` returns an imperative API object (not React state). The
per-turn mutable locals (`activeBubbleContent`, `currentAssistantId`,
`lastAssistantId`) become fields inside the hook, stored in a single `useRef`
so they are per-instance mutable without triggering re-renders.

## Files affected

- `packages/ui/src/hooks/use-streamed-bubbles.ts` — new file
- `packages/ui/src/hooks/use-streamed-send.ts` — replace inline bubble helpers
  with hook; pass `renderables` arg from renderable arrays at open-site

## Implementation notes

- The hook exposes `activeBubbleContentLength` (not the string itself) so the
  thinking guard `if (activeBubbleContent.length > 0) setThinking(false)` works
  without exposing mutable internals.
- `appendContent` and `setContent` directly write to `bubbleRef.current`
  and then call `setItems`. The bubble open/close closures (inside the hook)
  capture `bubbleRef` — no stale closure issue.
- The `useRef` pattern: `const bubbleRef = useRef({ content: "", currentId: null, lastId: null })`.
  Reading and writing these inside the hook's closures is safe — they are always
  fresh via the ref.
- `setItems` and `setThinking` passed at hook construction are stable setState
  dispatchers — they don't change across renders, so no re-subscription needed.
- Renderable draining: callers (the `model_message` handler and `openAssistantBubble`
  call sites in Step 3 interstitial hook) pass the current renderable snapshot as
  an argument. The bubble hook never touches the renderable arrays directly.

## Acceptance

- All existing tests in `use-streamed-send.test.tsx` pass unchanged.
- `useStreamedSend` no longer declares `activeBubbleContent`, `currentAssistantId`,
  `lastAssistantId`, `openAssistantBubble`, or `closeAssistantBubble` inline.
- Bubble-splitting tests (Unit 1 section) all green.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

- Created `packages/ui/src/hooks/use-streamed-bubbles.ts` (159 lines).
- Per-turn mutable state (`content`, `currentId`, `lastId`) stored in a single `useRef<BubbleRef>` object — no re-renders on mutation.
- `openAssistantBubble(renderables?)` accepts pre-drained renderables as an argument (pull-based); the hook never touches renderable arrays directly.
- `appendContent` and `setContent` both accept a `setItems` parameter at call time (rather than capturing at construction) to match the caller-passed pattern described in the feature design and avoid stale closure issues in async timer callbacks.
- `setThinking(false)` is called inside `appendContent`/`setContent` when `contentSnapshot.length > 0`, mirroring the thinking-guard from the original inline code.
- `activeBubbleContentLength`, `currentAssistantId`, `lastAssistantId` are exposed as getter properties on the returned object — they read from `bubbleRef.current` live so callers always see the latest values.
- `reset()` zeroes all three ref fields; Step 5 will call it at the top of each `send()` turn.
- Module-level `bubbleCounter` for id generation; ids are session-locally unique.
- `pnpm typecheck` and `pnpm --filter @praxis/ui test` both pass (1711 tests green).

## Risk + Rollback

**Risk: Low-Medium.** The bubble helpers are called from multiple event branches
(`model_message`, `tool_call`, `system_note`, `interrupted`, `error`, finally).
Each call site must be updated. The per-turn mutables moving to a ref is safe but
requires careful snapshot-at-close semantics (same as current code).

**Rollback:** Revert new file and restore inline helpers in `use-streamed-send.ts`.

## Review

**Verdict: done.**

Shape check (commit `0110741`, final state after step-5 fix `4a212d6`):
- `useStreamedBubbles(setItems, setThinking)` exported — correct.
- Per-turn mutable state (`content`, `currentId`, `lastId`) stored in a single `useRef<BubbleRef>` — correct.
- `reset()` present, zeroes all three fields — correct.
- `appendContent` and `setContent` accept `setItems` at call time (not captured at construction) — stale-closure-safe — correct.
- `activeBubbleContentLength`, `currentAssistantId`, `lastAssistantId` exposed as getter properties reading live from `bubbleRef.current` — callers always see current values — correct.
- `openAssistantBubble(renderables?)` uses renderable arrays passed in; hook never touches external renderable state — coupling removed as designed.

**id-collision fix verified:** The original commit `0110741` used prefix `msg-` in `nextBubbleId()`, which collided with the user-message id prefix in `use-streamed-send.ts`. Step 5 commit `4a212d6` changed this to `bubble-`. The live file at `packages/ui/src/hooks/use-streamed-bubbles.ts` line 71 confirms `return \`bubble-${++bubbleCounter}\`` — bug-free in the integrated state. Verdict is done because the issue was caught and fixed during composition before any story was wired into production.
