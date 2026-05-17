---
id: feature-rate-limit-error-structured-fields
kind: feature
stage: drafting
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
