---
id: feature-refactor-use-streamed-send-hook-decomposition
kind: feature
stage: drafting
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Decompose `useStreamedSend` hook into focused sub-hooks

## Brief
`packages/ui/src/hooks/use-streamed-send.ts` is 725 lines built around one 534-line
hook function. Inside, it owns multiple distinct state machines:
- Pending message queue (lines ~202–241)
- Bubble lifecycle / splitting
- Tool call tracking + interstitial settle timers (with `MIN_INTERSTITIAL_VISIBLE_MS`)
- Reasoning block accumulation
- Citation / draft / note / card draining
- 80+ line `finally` block doing abort + timeout flush + pending replay (4–5 levels of nesting)

This concentration of responsibilities makes the hook hard to reason about, hard to test
in isolation, and a likely host of latent state-machine bugs in the finally block.

## Refactor target
Extract focused sub-hooks composed by a thinned `useStreamedSend`:
- `usePendingQueue(...)` — queue state + flush primitives
- `useStreamedBubbles(...)` — bubble open/close/split lifecycle
- `useInterstitialLifecycle(...)` — tool call → interstitial settle timers, MIN_INTERSTITIAL_VISIBLE_MS
- `useReasoningBlocks(...)` — reasoning accumulation + close behavior
- (Optionally) a `useStreamedSendCleanup(...)` that owns the finally-block concerns

The remaining `useStreamedSend` becomes the orchestrator that composes these and exposes
the public hook return shape unchanged.

## Constraints
- The hook's external API must stay identical — every consumer keeps working without edits.
- The streaming behavior — bubble splitting, tool interstitial settling, abort semantics —
  must be preserved bit-for-bit; this is a perception-sensitive surface.
- Per the `tab-body-isolation` pattern, inactive `<ChatTabBody>` instances are hidden via
  `display:none` (not unmounted), so any in-flight streams in dormant tabs must keep
  working under the new structure.

## Discovery evidence
- File length: 725 lines (verified)
- `useStreamedSend()` body: ~534 lines
- Finally block: nesting depth 4–5 (lines ~297–370)
- Multiple distinct state machines bundled

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-use-streamed-send-hook-decomposition`
to enumerate sub-hook signatures, extraction sequence, and per-hook tests.
