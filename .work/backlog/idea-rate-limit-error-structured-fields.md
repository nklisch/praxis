---
id: idea-rate-limit-error-structured-fields
created: 2026-05-14
tags: [ui, engines]
---

The `engine.rate_limited` error today carries only `{ code, message, recoverable }`. The renderer that wants to show a useful "rate limited — resets at <date>" banner has to regex-parse the message string to extract the timestamp and window type. Surfaced during `story-fix-rate-limit-error-message-format`, which formatted the message text but left the structured-data gap. The fix shape is to extend `EngineErrorEvent` (or add an optional `details` object on it) with `{ rateLimitType, resetsAt, isUsingOverage, overageStatus?, overageResetsAt? }` so the renderer can build the banner from typed fields, drive countdown UI off `resetsAt`, and react differently for `five_hour` vs `seven_day` vs overage states. Touches the engine event type, the Claude Code adapter mapper, and any renderer surface that catches the rate-limit error. Adjacent: tighten the `info.status === "allowed"` check so new informational statuses from the SDK don't accidentally surface as user-facing errors.
