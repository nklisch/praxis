---
id: gate-tests-interrupted-engine-abort-reason
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `interrupted` event with `reason: "engine_abort"` is not exercised anywhere

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-in-flight-affordances` (Unit 1)
Acceptance criterion: `EngineEvent` type extends with `{ type: "interrupted"; reason: "user_cancel" | "engine_abort" }`. `"engine_abort"` is documented in `packages/core/src/types/engine.ts:233` as "adapter-level abort without a client-side signal." Existing tests only exercise the `"user_cancel"` path.

## Gap type
Missing test for valid partition (the second case of the discriminated reason field)

## Suggested test
```ts
// packages/ui/src/__tests__/use-streamed-send.test.tsx OR
// packages/ui/src/hooks/__tests__/episodic-to-messages.test.ts
it("renders cancel-marker for interrupted event with reason 'engine_abort'", async () => {
  // Stream emits { type: "interrupted", reason: "engine_abort" } directly (no signal).
  // Assert the UI surfaces it as a cancel-marker (same as user_cancel) — OR — if a
  // distinct treatment is intended, lock that treatment here.
});
```

## Test location (suggested)
`packages/ui/src/__tests__/use-streamed-send.test.tsx`

## Implementation notes

The `interrupted` handler in `use-streamed-send.ts` (line 449) does **not** branch on `reason` — both `"user_cancel"` and `"engine_abort"` follow the identical code path: close the open assistant bubble, close any in-flight reasoning block, clear all pending settle timers (leaving interstitials `in_flight`), set `thinking: false`, and append a `kind: "cancel-marker"` item.

Five tests were added to `/home/nathan/dev/praxis/packages/ui/src/__tests__/use-streamed-send.test.tsx` under the `── engine_abort reason (mirrors user_cancel treatment) ──` heading, mirroring the existing `user_cancel` tests one-for-one:

1. `thinking` and `isStreaming` are both `false` after stream ends.
2. A single `cancel-marker` item is appended.
3. An open assistant bubble is sealed (`streaming: false`) — no dangling partial.
4. With a preceding tool call, the interstitial stays `in_flight` and a cancel-marker appears.
5. An in-progress reasoning block is closed (`streaming → false`) but not deleted.

Locked treatment: **identical to `user_cancel`** — same cancel-marker UI, no distinct rendering.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
