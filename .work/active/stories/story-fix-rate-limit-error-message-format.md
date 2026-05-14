---
id: story-fix-rate-limit-error-message-format
kind: story
stage: done
tags: [bug, ui, engines]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Format the rate-limit error message so the user can read it

## Symptom

User reported `Error: Rate limited; resets at 1778842800` when trying to chat,
along with the (mistaken but understandable) belief that this was not a quota
issue. The message dumps a raw Unix epoch timestamp with no human-readable
date, no indication of which rate-limit window was hit (5-hour vs 7-day), and
no signal that this is the Anthropic Pro/Max subscription quota — not a
Praxis-internal failure. The opacity led to a misdiagnosis ("not a usage
issue") and time spent looking for a Praxis bug that didn't exist.

The underlying rate-limit was real: `1778842800` decodes to Fri May 15
11:00:00 UTC 2026 (~30 hours after the report), pointing to the `seven_day`
Pro/Max window. The autopilot run preceding the report consumed substantial
quota and almost certainly contributed.

## Root cause

`packages/engines/src/claude-code/events.ts:155` formatted the error message
as `Rate limited; resets at ${info.resetsAt}` — passing the raw
epoch-seconds field straight into the message without converting to ISO
8601, and without including the `rateLimitType` and `isUsingOverage`
fields that the SDK already provides on `RateLimitInfo`. The information
the user needs to interpret the error correctly was *available* to the
adapter; it just wasn't being included in the message.

## Fix approach

Format the resets-at timestamp as ISO 8601 (`new
Date(info.resetsAt * 1000).toISOString()`), include the rate-limit type
parenthetically (`five_hour` / `seven_day`), and append an "overage
billing active" note when `info.isUsingOverage === true`. The error
`code` (`engine.rate_limited`) and `recoverable` flag are unchanged —
only the human-readable `message` text changes. No downstream consumer
branches on the message text; the existing test in
`claude-code-events.test.ts` was the only assertion site.

## Regression test

`packages/engines/src/__tests__/claude-code-events.test.ts` —
- Updated existing `surfaces an error event when the request was actually rate-limited` test,
  renamed to `(five-hour window, no overage)`, asserts the new ISO + window-type message format.
- Added `formats seven_day window with overage-billing note when isUsingOverage is true`
  test exercising the seven_day + overage code path.

## Implementation notes

- Files changed:
  - `packages/engines/src/claude-code/events.ts` — message formatting
  - `packages/engines/src/__tests__/claude-code-events.test.ts` — test assertions
- Tests: 17 of 17 pass in the file; 108 of 108 pass across `@praxis/engines`.
- `pnpm typecheck` clean across all packages.
- No other code paths emit "Rate limited" — single-source change.

## Out-of-scope (intentionally not bundled)

- The user's actual rate-limit is a real Anthropic Pro/Max quota; this fix
  improves the error message UX but does NOT unblock the chat. The chat will
  resume working when the seven_day window resets (Fri May 15 ~11am UTC for
  the reporting user, or whenever the user's specific window resets).
- Opportunities adjacent to this bug that I noticed and did NOT bundle:
  - The error code (`engine.rate_limited`) doesn't carry the `rateLimitType`
    as a structured field — the renderer can't drive UX off it without
    parsing the message. Worth a follow-up to enrich the error object with
    `details: { rateLimitType, resetsAt, isUsingOverage }` for the
    renderer to consume programmatically.
  - The `info.status === "allowed"` check whitelists by exact string;
    if the SDK ever adds new informational statuses (e.g., `"warned"`),
    they would surface as errors. Worth tightening the discriminator.

  Both parked for separate consideration if the user wants to scope them.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Correctness — epoch→ISO conversion (`info.resetsAt * 1000` into `new Date(...).toISOString()`) is correct; `rateLimitType` and `isUsingOverage` are both required on the SDK's `RateLimitInfo` (`packages/claude-cli-sdk/src/types/events.ts:210`), so accessing them without optional chaining is safe.
- Tests — two cases (`five_hour` without overage, `seven_day` with overage) cover both message variants. Existing `does not throw when no logger is provided` back-compat case unchanged.
- Single-source change — `grep "engine.rate_limited\|Rate limited"` across `packages/`, `apps/`, `tests/` shows only the formatter and its test consume the message text; no downstream branches on it.
- Out-of-scope follow-ups (structured `details: { rateLimitType, resetsAt, isUsingOverage }` on the error, tightening the `info.status === "allowed"` discriminator) already parked as `idea-rate-limit-error-structured-fields`.
