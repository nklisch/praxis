---
id: feature-rate-limit-error-structured-fields
kind: feature
stage: implementing
tags: [ui, engines, errors]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-17
---

# Rate-limit error: structured fields instead of message-string parsing

## Brief

The `engine.rate_limited` error today carries only `{ code, message, recoverable }`. The renderer that wants to show a useful "rate limited — resets at <date>" banner has to regex-parse the message string to extract the timestamp and window type. Surfaced during `story-fix-rate-limit-error-message-format`, which formatted the message text but left the structured-data gap.

The fix shape is to extend `EngineErrorEvent` (or add an optional `details` object on it) with `{ rateLimitType, resetsAt, isUsingOverage, overageStatus?, overageResetsAt? }` so the renderer can build the banner from typed fields, drive countdown UI off `resetsAt`, and react differently for `five_hour` vs `seven_day` vs overage states.

Touches the engine event type, the Claude Code adapter mapper, and any renderer surface that catches the rate-limit error. Adjacent: tighten the `info.status === "allowed"` check so new informational statuses from the SDK don't accidentally surface as user-facing errors (covered by the paired test gate `gate-tests-rate-limit-unknown-status-guard`).

## Scope

- Extend `EngineErrorEvent` (or add `details`) in `packages/core/src/types/` with the structured rate-limit fields.
- Update `packages/engines/src/claude-code/events.ts` mapper to populate the fields from `rate_limit_event`.
- Update Codex and Direct adapter mappers if rate-limit shapes exist there.
- Update the renderer (`packages/ui/src/`) to build the banner from typed fields, with countdown driven by `resetsAt`.
- Update the type SSOT in `docs/CONTRACT.md` if the error shape is documented there.

## Acceptance criteria

- The rate-limit error event surfaces `rateLimitType`, `resetsAt`, and `isUsingOverage` (plus optional overage fields) as typed fields, not embedded in the message.
- The UI banner reads from the fields, not from regex over `message`.
- Unknown SDK statuses (e.g., `"warned"`) do not surface as user-facing errors — this closes the paired test gate.
- Tests pin both the field shape and the unknown-status-guard behavior.

## Anchors

- `EngineErrorEvent` type — `packages/core/src/types/`
- Claude Code mapper — `packages/engines/src/claude-code/events.ts`
- Rate-limit banner UI — `packages/ui/src/components/` (search for `rate_limited`)
- Paired gate — `.work/active/stories/gate-tests-rate-limit-unknown-status-guard.md`
- Prior story — `story-fix-rate-limit-error-message-format` (done)

## Design decisions

- **Scope this feature to backend only** (`EngineError` type extension + adapter mapper). Defer the UI banner to a follow-up backlog item. Rationale: closing the paired gate `gate-tests-rate-limit-unknown-status-guard` only requires adapter-level work; the UI banner is genuinely separable UX work and has no existing surface to extend (codebase grep finds no current consumer of `engine.rate_limited`). Scoping the UI banner properly needs UX discussion (where does it mount? auto-dismiss vs persistent?) that doesn't belong in this feature's gate-closure path.
- **Type shape: `details?: RateLimitErrorDetails` optional field on `EngineError`** rather than a discriminated `kind: "rate_limit"` shape. Backward-compatible (existing consumers ignore the new optional field), smaller diff, and `code: "engine.rate_limited"` is already the discriminator callers use today. A future migration to discriminated `details` per error code can happen separately if more error codes acquire structured detail.
- **Defer Codex/Direct mappers**: neither adapter currently surfaces rate-limit events (grep confirms no `rate_limit` paths in `packages/engines/src/{codex,direct}/`). When/if those adapters gain rate-limit handling, they can populate the same `details` field — no additional type work needed.
- **Single-stride implementation (no child stories)**: Per the "When stories are pure overhead" rule — single session, tight cohesion (every test exercises the type, the mapper, and the unknown-status guard together), and the natural decomposition is just core/engines which is a package boundary, not a story boundary.

## Architectural choice

**Add an optional structured `details` field to `EngineError`, populated by the claude-code adapter from the SDK's already-structured `RateLimitInfo`.**

Alternatives considered:
- **Discriminated union per error code**: cleaner long-term but invasive — every existing `engineError(code, msg, ...)` call site would need a type update. Defer until 2+ codes need structured detail.
- **Inline rate-limit fields directly on `EngineError`**: pollutes the base type with rate-limit-specific fields that 99% of errors don't carry. Reject.
- **Parse the existing message string in the renderer**: that's the current state — the gate exists because regex-parsing a human-readable message is exactly the wrong shape.

## Implementation Units

### Unit 1: `RateLimitErrorDetails` type + `EngineError.details`

**File**: `packages/core/src/types/engine.ts`

```ts
/**
 * Structured payload for `engine.rate_limited` errors. Mirrors the SDK's
 * RateLimitInfo so a renderer can build a banner (with countdown driven by
 * `resetsAt`) without regex-parsing the message string.
 *
 * `kind: "rate_limit"` discriminates this from any future error-detail
 * variants we add (subscriber-fanout, quota, etc.).
 */
export interface RateLimitErrorDetails {
  kind: "rate_limit";
  /** Window scope. Free-form to tolerate future SDK additions. */
  rateLimitType: "five_hour" | "seven_day" | string;
  /** Epoch seconds when the rate-limit window resets. */
  resetsAt: number;
  /** Whether the request is using overage billing. */
  isUsingOverage: boolean;
  overageStatus?: string;
  /** Epoch seconds when overage window resets. */
  overageResetsAt?: number;
}

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
  /**
   * Optional structured payload. Present for errors whose code has a
   * declared `*ErrorDetails` shape. Renderers should switch on
   * `details?.kind` and fall back to `message` when absent.
   */
  details?: RateLimitErrorDetails;
}
```

**Re-export**: `packages/core/src/types/index.ts` exports `RateLimitErrorDetails` alongside `EngineError`.

**Implementation Notes**:
- The `details` field is optional on every `EngineError`. Existing call sites need no change.
- `kind: "rate_limit"` is the discriminator inside `details`. If a second variant is added later (e.g., `{ kind: "quota"; ... }`), `details` becomes a discriminated union; the renderer's `switch (details?.kind)` still works.
- `rateLimitType` uses `... | string` to forward-compat with future SDK window types (the unknown-status branch in the mapper is the runtime guard).

**Acceptance Criteria**:
- [ ] `RateLimitErrorDetails` is exported from `@praxis/core/types`.
- [ ] `EngineError.details` is typed as `RateLimitErrorDetails | undefined`.
- [ ] Type test (`engine.test-d.ts` or similar) asserts the shape compiles.

### Unit 2: Claude Code adapter populates `details` + drops unknown statuses

**File**: `packages/engines/src/claude-code/events.ts:137-160` (the `rate_limit_event` case in `mapClaudeCodeEvent`).

Current shape returns `{ type: "error", error: { code, message, recoverable } }`. New shape adds the `details` field for `rate_limited` status, and tightens the status guard:

```ts
case "rate_limit_event": {
  const info = event.rateLimitInfo;
  // Status "allowed" is informational; status "rate_limited" surfaces as an
  // error event. Any other value is forward-compatible noise from a future
  // SDK release — log a warning and drop, do NOT surface as a user-facing
  // error.
  if (info.status === "allowed") {
    ctx.log?.warn("engine.claude-code.rate_limit_info", { ... });
    return null;
  }
  if (info.status !== "rate_limited") {
    ctx.log?.warn("engine.claude-code.rate_limit_unknown_status", {
      status: info.status,
      rateLimitType: info.rateLimitType,
      resetsAt: info.resetsAt,
    });
    return null;
  }
  const resetIso = new Date(info.resetsAt * 1000).toISOString();
  const overage = info.isUsingOverage ? ", overage billing active" : "";
  return {
    type: "error",
    error: {
      code: "engine.rate_limited",
      message: `Rate limited (${info.rateLimitType} window${overage}); resets at ${resetIso}`,
      recoverable: true,
      details: {
        kind: "rate_limit",
        rateLimitType: info.rateLimitType,
        resetsAt: info.resetsAt,
        isUsingOverage: info.isUsingOverage,
        ...(info.overageStatus !== undefined && { overageStatus: info.overageStatus }),
        ...(info.overageResetsAt !== undefined && { overageResetsAt: info.overageResetsAt }),
      },
    },
  };
}
```

**Implementation Notes**:
- The new `if (info.status !== "rate_limited")` branch is the unknown-status guard the paired test gate exercises. Today's `info.status === "allowed"` check is permissive — any unknown status falls through to the error path. The new shape is strict: only `"rate_limited"` produces an error; everything else logs and drops.
- Message text is preserved verbatim from the prior implementation so existing UI / log consumers aren't surprised. The new structured `details` is purely additive.
- Optional fields (`overageStatus`, `overageResetsAt`) use `exactOptionalPropertyTypes`-compatible conditional spreads.

**Acceptance Criteria**:
- [ ] Existing two tests (`five_hour`, `seven_day with overage`) still pass; their expected objects extend to include `details`.
- [ ] New test pins unknown-status drop: `info.status: "warned"` returns `null` and does not throw (closes `gate-tests-rate-limit-unknown-status-guard`).
- [ ] New test pins `details` shape for the `rate_limited` happy path.
- [ ] `pnpm typecheck` clean.

## Implementation Order

1. **Unit 1** lands first — type extension is the foundation.
2. **Unit 2** lands second — depends on Unit 1's type.

Both units are in this feature's single implementation stride; the order is enforced by file ordering in the agent's worklist, not by separate substrate items.

## Testing

### Unit Tests: `packages/engines/src/__tests__/claude-code-events.test.ts`

Three additions/changes:
1. **Extend existing**: update the two passing rate-limit tests' expected objects to include `details: { kind: "rate_limit", ... }`.
2. **New unknown-status test** (closes paired gate): `info.status: "warned"` → mapper returns `null`; `ctx.log?.warn` called once with `engine.claude-code.rate_limit_unknown_status`.
3. **New details-shape test**: assert the `details` field is populated correctly when `isUsingOverage: true` with both optional `overageStatus` and `overageResetsAt` present.

### Type Test: `packages/core/src/types/__tests__/engine.test-d.ts` (or in-line)

If the project uses `.test-d.ts` for type-level assertions, add one:
- `RateLimitErrorDetails` is exported.
- `EngineError["details"]` is `RateLimitErrorDetails | undefined`.

## Risks

- **Risk**: A future SDK status enum value (e.g., `"warned"`) might carry actionable information the user should see. The strict-drop approach above silences it.
  - **Mitigation**: `ctx.log?.warn` is called on every unknown status — telemetry will surface it. The first observation triggers a follow-up to either explicitly route the new status or expand the allowlist.
- **Risk**: A renderer that switches on `details.kind` may forget to handle the no-details case (older error events).
  - **Mitigation**: `details?.kind` (optional chaining) is the documented pattern. Reviewer should flag any consumer that asserts non-null.

## Follow-up backlog

A separate backlog item should be parked for the UI banner work (mount surface, dismiss policy, countdown UX, accessibility). That's UX design territory, not a backend gate-closure task. Park as `idea-rate-limit-banner-ux` if not already present.
