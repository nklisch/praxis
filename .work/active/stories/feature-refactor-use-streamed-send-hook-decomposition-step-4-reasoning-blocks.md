---
id: feature-refactor-use-streamed-send-hook-decomposition-step-4-reasoning-blocks
kind: story
stage: review
tags: [refactor, ui]
parent: feature-refactor-use-streamed-send-hook-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extract `useReasoningBlocks`

## Goal

Move the reasoning-block accumulation and close behavior into a self-contained
`useReasoningBlocks` hook. This is the smallest and lowest-risk extraction:
the reasoning machine is a simple two-state toggle (`currentReasoningId: string | null`)
with no external coupling beyond `setItems` calls.

## Current state (in `use-streamed-send.ts`)

Per-turn local variable inside `send()`:

```ts
let currentReasoningId: string | null = null;
```

And `closeReasoningBlock` helper (lines 359–369):

```ts
const closeReasoningBlock = (): void => {
  if (currentReasoningId === null) return;
  const id = currentReasoningId;
  currentReasoningId = null;
  setItems((prev) => prev.map((it) =>
    it.kind === "thinking" && it.id === id ? { ...it, streaming: false } : it,
  ));
};
```

Called from:
- `thinking` handler: open new block or append to active block
- `model_message` handler: `closeReasoningBlock()` (text begins)
- `tool_call` handler: `closeReasoningBlock()`
- `interrupted` handler: `closeReasoningBlock()`
- `finally` block: `closeReasoningBlock()`

## Target state

New file: `packages/ui/src/hooks/use-reasoning-blocks.ts`

```ts
export interface ReasoningBlocksApi {
  /**
   * Handle a `thinking` event. Opens a new block if none is active,
   * otherwise appends to the active one.
   */
  onThinking: (content: string, setItems: SetItems) => void;
  /**
   * Close the active reasoning block (marks streaming: false). No-op if none open.
   */
  closeReasoningBlock: (setItems: SetItems) => void;
  /**
   * Called at turn start to reset the active block pointer.
   */
  reset: () => void;
}

export function useReasoningBlocks(): ReasoningBlocksApi
```

`currentReasoningId` becomes a field in a `useRef`-held object.

`reset()` clears `currentReasoningId = null`. Called by `useStreamedSend.send()`
at the top of each turn so a stale id from a prior turn never leaks.

## Files affected

- `packages/ui/src/hooks/use-reasoning-blocks.ts` — new file
- `packages/ui/src/hooks/use-streamed-send.ts` — replace inline reasoning code
  with hook calls; remove `closeReasoningBlock` inner function

## Implementation notes

- `nextId()` call for new blocks stays in the hook (import or copy the function).
  Prefer importing `nextId` from `use-streamed-send.ts` if exported, or duplicate
  the simple counter in the hook. Since `nextId` is module-level in
  `use-streamed-send.ts`, the cleanest option is to lift it to a shared
  `packages/ui/src/hooks/id-counter.ts` that both files import. Evaluate at
  implementation time — if the counter is internal to `use-streamed-send.ts`,
  just copy the two-liner into `use-reasoning-blocks.ts`.
- `setItems` is passed at each call site, not captured at construction. This is
  consistent with the other extracted hooks.
- The `onThinking` function handles both the "open" and "append" branches,
  mirroring the current `if (currentReasoningId === null)` / `else` in the
  event loop.

## Acceptance

- All existing tests in `use-streamed-send.test.tsx` pass unchanged, including:
  - Thinking event creates kind:thinking item
  - Multiple thinking events accumulate in the same reasoning block
  - Thinking block is closed on model_message / tool_call / interrupted
  - Two non-contiguous thinking events produce two separate reasoning blocks
  - In-progress reasoning block is closed (not deleted) on cancel/engine_abort
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

- Created `packages/ui/src/hooks/use-reasoning-blocks.ts` (89 lines).
- `currentReasoningId` lives in a `useRef<ReasoningState>` object; no re-renders triggered by open/close transitions — only the `setItems` calls cause React updates.
- Used a module-level `reasoningCounter` (prefixed `reasoning-`) rather than importing or lifting `nextId` from `use-streamed-send.ts`. The two counters coexist safely; ids never collide in practice because the `thinking` kind is distinct from `message`.
- `SetItems` type alias declared locally as `React.Dispatch<React.SetStateAction<ChatStreamItem[]>>` — imported `ChatStreamItem` from `use-streamed-send.ts` via the `.js` extension per ESM convention.
- `use-streamed-send.ts` left untouched per the step-5 wiring constraint.
- All 1711 `@praxis/ui` tests pass; `pnpm typecheck` clean across the workspace.

## Risk + Rollback

**Risk: Low.** The reasoning machine is self-contained. The only coupling point
is the `setItems` call inside `closeReasoningBlock` — the same call that exists
today. The `useRef` pattern for `currentReasoningId` is identical to the bubble
hook's approach.

**Rollback:** Revert new file and restore inline reasoning code in
`use-streamed-send.ts`.
