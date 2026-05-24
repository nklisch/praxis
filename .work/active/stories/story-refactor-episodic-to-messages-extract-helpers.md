---
id: story-refactor-episodic-to-messages-extract-helpers
kind: story
stage: implementing
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
