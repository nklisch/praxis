---
id: story-fix-quickcheck-toolcontext-wiring
kind: story
stage: done
tags: [bug]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-10
updated: 2026-05-12
---

# Fix: ask_student_question and quick_check.* tools auto-abandon (card never appears)

## Symptom

In bootstrap mode, the tutor calls `ask_student_question` to pose a structured
choice (e.g. "Canonical Algebra 1 pack / Explore your textbook / Both"). The
card never appears in the chat. Instead the tutor immediately observes
`{ abandoned: true }` from the tool result and replays the question as plain
chat text ("Looks like that card got dismissed before you picked anything…").

User-quoted tutor output that surfaced the bug:

> "Looks like that card got dismissed before you picked anything. No problem —
> just tell me which you'd like: Canonical Algebra 1 pack… Explore your
> textbook… Both…"

Same root cause affects all five `quick_check.*` tools (single_choice,
multi_select, short_answer, matching, confidence) registered in teach mode —
they too silently return abandoned/empty results without ever surfacing a card.

## Root cause

`SessionServiceImpl.openActive` (packages/core/src/services/session-service.ts:648-702)
builds the `ToolContext.services` object by **hand-copying** fields from
`ServiceDeps.toolServices`. The Phase 17 wire-up added `quickCheck` to:

- `ServiceDeps.toolServices.quickCheck?: QuickCheckService` (services/types.ts:101)
- `ToolContext.services.quickCheck?: QuickCheckService` (types/tool.ts:190)
- Composition root: `services.ts:526` injects `QuickCheckServiceImpl` into `toolServices`

…but the hand-copy in `openActive` was never updated. So at dispatch time
`ctx.services.quickCheck` is `undefined`. The handler in
`packages/tools/src/dialog/ask-student-question.ts:88-96` does:

```ts
const answer = await ctx.services.quickCheck?.await({ callId, sessionId, item });
if (!answer || answer.kind === "abandoned") {
  return { answers: [], abandoned: true };
}
```

`quickCheck` undefined → optional-chain yields `undefined` → `!answer` true →
immediate `{ answers: [], abandoned: true }` return. No `pending` event ever
emits, so the QuickCheck IPC stream never delivers anything to the renderer
and the card never mounts. From the model's perspective the call appears to
have been instantly dismissed.

The five `quick_check.*` tools in `packages/tools/src/quick-check/` follow the
identical short-circuit pattern, so they fail the same way (they return
sentinel "abandoned" results like `selectedIndex: -1`, `text: ""`, `rating: 0`).

## Fix approach

Add the missing line to the `ToolContext.services` literal in
`session-service.ts:openActive`, following the same conditional-spread pattern
already used for other optional services (`activity`, `indexerOrchestrator`,
`sketches`, `vision`):

```ts
...(this.deps.toolServices.quickCheck !== undefined && {
  quickCheck: this.deps.toolServices.quickCheck,
}),
```

This is the single source of truth — a one-line fix that unblocks the five
quick_check tools plus ask_student_question simultaneously without changing
any public interface.

## Regression test

`tests/quick-check-tool-context-wiring.test.ts` — wires `QuickCheckServiceImpl`
into `toolServices.quickCheck`, drives `ask_student_question` through the
exact `ToolRegistry` instance that `SessionServiceImpl.openActive` constructs
for the engine, subscribes to the QuickCheck event stream, resolves the
pending check the moment a `pending` event fires (mirroring what the renderer
does on submit), and asserts:

1. A `pending` event reached subscribers (renderer would have shown the card)
2. The handler's return is `{ ok: true, answers: [...] }` — not the abandoned
   short-circuit

Fails RED on current main with `expected false to be true` on assertion (1).
Goes GREEN after the one-line wiring fix.

## Out of scope (parked separately)

The user also reported "thinking/toolcall going by very fast in the chat" —
a separate symptom (no handler for `event.type === "thinking"` in
`packages/ui/src/hooks/use-streamed-send.ts`; tool interstitials flip
`in_flight → settled` instantly with no minimum display time). Different root
cause, different surface. Parked at
`.work/backlog/idea-chat-stream-pacing-thinking-toolcalls.md` to keep this
fix minimal.

## Implementation notes

Files changed:
- `packages/core/src/services/session-service.ts` — added conditional spread
  for `quickCheck` to `ToolContext.services` in `openActive` (8 lines, same
  pattern as `activity`, `sketches`, `vision` already nearby).

Test added:
- `tests/quick-check-tool-context-wiring.test.ts` — drives
  `ask_student_question` through the registry `openActive` constructs,
  asserts both the `pending` event and the non-abandoned return.

Verification:
- `pnpm vitest run tests/quick-check-tool-context-wiring.test.ts` — GREEN
- `pnpm test` — all 2548 tests pass (15 skipped slow tests gated as usual)
- `pnpm typecheck` — clean across all packages
- `pnpm biome check` on touched files — clean (one warning suggesting
  `?.` over `!.` on a test-side non-null assertion, kept `!` since the
  preceding `expect(...).not.toBeNull()` already guarantees the value)

Adjacent issue surfaced and parked:
- `idea-chat-stream-pacing-thinking-toolcalls` — the fast-scroll thinking
  and tool-interstitial pacing complaint from the same user report; deliberately
  not bundled because it's a different root cause and a wider UX change.

Adjacent observation (NOT acted on): vitest at the workspace root reads
package imports from each package's `dist/` rather than `src/` — `pnpm test`
requires `pnpm --filter @praxis/core build` after a source edit before the
regression test can see it. The `praxis-source` export condition IS wired in
`packages/ui/vitest.config.ts` but there's no root-level vitest config to
declare it for the integration tests under `tests/`. Worth fixing separately
so root tests track source automatically.

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff verified at commit `c10d9476`: 8-line conditional-spread addition to
  `session-service.ts:700-707`, matching the established pattern used for
  `activity`, `sketches`, `vision` directly above it. Root-cause fix, not a
  symptom patch.
- Regression test at `tests/quick-check-tool-context-wiring.test.ts` drives
  `ask_student_question` through the exact `ToolRegistry` that
  `SessionServiceImpl.openActive` constructs (via a `CapturingEngine` that
  records the registry handed to `engine.open()`), then asserts both the
  `pending` event reaches subscribers AND the handler returns the real
  answer. This is the right shape — it would have caught the bug pre-fix.
- Verified GREEN locally after `pnpm rebuild better-sqlite3 canvas`
  (pre-existing Electron-ABI artifact, unrelated to this change).
- Adjacent observation about root-level vitest missing the `praxis-source`
  condition was correctly parked rather than bundled — captured as
  `idea-root-vitest-praxis-source-condition` in backlog so it isn't lost.
- The story body's "thinking/toolcalls fast" parking note correctly points
  to `idea-chat-stream-pacing-thinking-toolcalls` — separate root cause,
  separate fix. (That backlog item has since been promoted into the active
  `feature-agent-transparency-ux` work, which is good.)

Approved and advancing to done.
