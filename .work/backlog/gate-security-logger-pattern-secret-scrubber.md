---
id: gate-security-logger-pattern-secret-scrubber
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
---

# Logger drains the raw `err` field that has not been pattern-redacted

## Severity
Low

## Domain
Error Handling & Logging / Data Protection

## Location
- `packages/desktop/electron/main/ipc-server.ts:153-159` (and the identical pattern in every streaming channel)
- `packages/core/src/types/errors.ts:13-30`

## Evidence
```ts
} catch (err) {
  streamLog.error("session.send.error", {
    ...
    err: serializeError(err),
  });
  push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
}
```

`serializeError` includes `stack` and `message`. The logger's `REDACT_PATHS`
allowlist covers `apiKey`, `authorization`, `password`, `lockCode` — but only
at known property paths. A thrown `Error` whose `.message` includes
`"apiKey=sk-…"` (e.g. an upstream provider error echoing a bearer header) is
logged verbatim to `<userData>/logs/*.log`.

## Remediation direction
Run thrown messages through a pattern-based scrubber for common secret shapes
(`sk-…`, `Bearer …`, `eyJ…`-style JWTs) before they reach the file transport.
Cheap and one-line; matches the existing logger redact convention.
