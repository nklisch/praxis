---
id: story-refactor-episodic-to-messages-extract-helpers
kind: story
stage: done
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract helpers from `episodicToItems()` god function

## Brief
`packages/ui/src/hooks/episodic-to-messages.ts` is 391 lines, dominated by the
`episodicToItems()` function (lines 59 onward, ~332 lines). It reconstructs chat items
from episodic events and manages several state machines inline:
- Bubble pointer / split state
- Tool interstitial lifecycle
- Pending renderables (drafts, notes, cards, citations)
- Turn tracking
- Multiple nested switches for tool state transitions (depth 3–4)

Several inline helpers are defined mid-function (`drainPendingInto`, `closeBubble`,
`openAssistantBubble`, etc.) — already named, just trapped inside the closure.

## Target
Extract the inline helpers as module-scope pure functions (or a small builder class):
- `openAssistantBubble(state, ...)`
- `closeBubble(state, ...)`
- `drainPendingInto(state, target)`
- Plus any others that clearly own a discrete concern

After extraction, `episodicToItems()` reads as a top-level for-loop that delegates each
event-kind case to a small handler. Target shrink: from ~332 lines to <150 lines for the
main function.

## Constraints
- The rendering output must be byte-identical for the same episodic input (existing
  snapshot/expectation tests must pass unchanged).
- The pattern of "fold episodic events into UI items in one pass" stays — don't add
  re-entrancy or multi-pass logic.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- `episodicToItems()` measurably shorter; helpers callable
- Snapshot tests for episodic-to-message reconstruction pass unchanged

## Risk: Low–Medium
Pure-function extraction in a tested code path; the test suite for this hook is
substantial enough to catch regressions.

## Review

**Verdict: approved / done**

Reviewed 2026-05-23. Clean extraction — all 10 helpers are at module scope, each takes `state: ReplayState` as its first parameter, and every helper owns a single discrete concern. Notable call-outs:

- `closeReasoningBlock` is a genuine DRY win: three identical backward-scan loops collapsed into one.
- `applyModelMessage` correctly calls `closeReasoningBlock` even though the old inline code had a separate loop; the loop was there before, just duplicated.
- `settleToolEntry` and `pushToolCallItem` are well-sized — neither too thin nor over-grown.
- `harvestToolResult` carries inline type assertions (necessary given the untyped `ToolResultValue` union) but the comments are clear.
- No unexpected state capture; every helper works purely through the `state` parameter.

17/17 episodic-to-messages tests pass unchanged. `episodicToItems` is 118 lines (from 332). No findings.

## Implementation notes

### Helpers extracted (all module-scope, take `state: ReplayState` as first param)

- **`ReplayState` interface** — captures all mutable loop state: `items`, `counter`, `currentAssistantId`, `lastAssistantId`, `activeBubbleContent`, `pendingByCallId`, and the four pending-renderable arrays.
- **`nextId(state, kind)`** — id generator, increments `state.counter`.
- **`openBubble(state)`** — opens a new assistant bubble, pre-attaches any pending renderables (Unit 3 rule), zeroes the pending arrays.
- **`closeBubble(state)`** — seals the current bubble (no-op if none open).
- **`drainPendingInto(state, targetId)`** — fallback drain of pending renderables into an already-pushed bubble, used at end-of-stream.
- **`closeReasoningBlock(state)`** — walks backward to seal any open `thinking` item, stopping at a user-message boundary; deduplicates three identical inline loops.
- **`harvestToolResult(state, toolName, value)`** — extracts renderable results (citations, drafts, notes, due-cards) from a successful `tool_result` value into the pending arrays.
- **`pushToolCallItem(state, toolName, callId, args)`** — emits the appropriate item for a `tool_call` event (sub-agent block, tool-entry, or nothing for hidden tools).
- **`settleToolEntry(state, callId, result)`** — mutates the matching `tool-entry` or `sub-agent` item in-place after a `tool_result` arrives.
- **`applyModelMessage(state, content, partial)`** — handles `model_message`: lazy bubble open, partial accumulation vs. full replace, bubble sealing, reasoning-block close.

### Line count
- Before: `episodicToItems` was ~332 lines (lines 59–391 of the 391-line file).
- After: `episodicToItems` is 118 lines (lines 300–418 of the 418-line file). The extra lines in the file are the extracted module-scope helpers.

### Verification
- 17 episodic-to-messages tests: all pass unchanged.
- 1705 total UI tests: all pass.
- `pnpm typecheck`: clean.
- `pnpm biome check packages/ui/src/hooks/episodic-to-messages.ts`: no issues.
