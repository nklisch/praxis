---
id: feature-release-v0.1.0-security-findings
kind: feature
stage: implementing
tags: [security]
parent: epic-release-v0.1.0-readiness
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# v0.1.0 — security gate drain

## Brief

Container for the 7 findings produced by `/agile-workflow:gate-security`
against the v0.1.0 bundle on 2026-05-10. The findings cluster around two
real shapes: (1) the new update-channel work has weak input validation on
the feed payload, and (2) the API key is treated as less-sensitive than
the lock code — plain text on disk, no IPC lock guard. Both are
appropriate to address before v1.0.0 ships, especially since v1.0.0 is
when the world starts pointing `PRAXIS_UPDATE_FEED_URL` at it.

The audit was clean across the rest of the stack: QuickJS sandbox is
well-isolated, MCP tool bridge does not deserialise untrusted content
unsafely, lock-crypto is textbook scrypt+timing-safe, react-markdown's
safe defaults eliminate the obvious renderer-XSS vector, IPC server has
a load-bearing `requireUnlocked` gate on `praxis.author.*` and a tight
`openExternal` allowlist. No critical findings.

## Children (7)

### Active (4) — block release readiness

- **High** — `gate-security-update-feed-url-scheme-validation`
  (Input Validation; `update-service.ts:9` accepts `javascript:` /
  `data:` / `file:` URLs)
- **Medium** — `gate-security-api-key-cleartext-vs-onboarding-doc`
  (Secrets; doc claims encrypted, code stores plaintext in SQLite)
- **Medium** — `gate-security-engine-config-ipc-lock-gate`
  (Authorization; `praxis.config.engineConfig` returns API key with no
  `requireUnlocked` gate)
- **Medium** — `gate-security-update-feed-integrity-signature`
  (Cryptography; no signature/hash on update feed JSON)

### Backlog (3) — bound to v0.1.0 for traceability

- **Low** — `gate-security-browser-window-navigation-guards`
- **Low** — `gate-security-preload-sandbox-comment-mismatch`
- **Low** — `gate-security-author-export-memory-target-path-validation`

The 3 backlog items have `release_binding: v0.1.0` for attribution but
no `stage:` — they will block readiness as written. To exclude them
from v0.1.0, edit the backlog file's frontmatter to remove the
`release_binding` line (they remain `gate_origin: security` for history).

## Implementation order

1. The High first (URL scheme validation; small, isolated, blocks ship).
2. Then the Mediums in any order — they touch different files
   (`engine-config.ts`, `ipc-server.ts`, `update-service.ts` +
   `UPDATE-CHANNEL.md`).
3. Backlog Lows by user choice (drain or unbind).

## Source

`/agile-workflow:gate-security v0.1.0` audit committed at `3644ab7`.
Full reasoning per finding lives in each child story's body.
