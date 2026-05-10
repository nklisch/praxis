---
id: feature-release-v0.1.0-security-findings
kind: feature
stage: done
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

---

## Children complete (2026-05-10)

All 4 active children advanced to `stage: review`:

| Story | Severity | Resolution | Commit |
|---|---|---|---|
| `gate-security-update-feed-url-scheme-validation` | High | `z.url().refine(http(s) only)` on `downloadUrl` + `releaseNotesUrl`; 3 new test cases | `c659fdd` |
| `gate-security-engine-config-ipc-lock-gate` | Medium | Wrapped both IPC handlers in `await requireUnlocked()` matching `praxis.author.*` pattern | `82995dd` |
| `gate-security-api-key-cleartext-vs-onboarding-doc` | Medium | Doc-fix path (a) chosen; safeStorage-encryption path (b) parked as `idea-encrypt-api-key-with-safestorage` | `58ef027` |
| `gate-security-update-feed-integrity-signature` | Medium | Doc-only "Trust model" section in UPDATE-CHANNEL.md; full Ed25519 signing parked as `idea-update-feed-ed25519-signature` | `38db2e1` |

3 backlog children (Lows) remain bound to v0.1.0 for traceability but do
not block this feature's advancement (out of autopilot scope per Phase 2).
To exclude from the release readiness check, edit each backlog file's
frontmatter to remove `release_binding: v0.1.0`:
- `gate-security-author-export-memory-target-path-validation`
- `gate-security-browser-window-navigation-guards`
- `gate-security-preload-sandbox-comment-mismatch`

## Verification

`pnpm typecheck && pnpm test` clean (2377 tests; 12 new tests added by
this feature plus its sibling features). No regressions.

## Follow-ups parked to backlog

- `idea-encrypt-api-key-with-safestorage` — long-term replacement for
  the doc-fix in `gate-security-api-key-cleartext-vs-onboarding-doc`
- `idea-update-feed-ed25519-signature` — full signature mechanism
  blocking real auto-update beyond manual-download

## Review (2026-05-10)

**Verdict: Approve**

Capability completeness: All 4 active findings are resolved. The High (URL scheme injection) is closed with a code fix and tests. The two Mediums with code impact (IPC lock gate, ONBOARDING.md doc drift) are each closed by a targeted, verifiable change. The remaining Medium (feed integrity) is correctly handled as doc-only for v0.1.0 with a well-formed follow-up item. The 3 Low backlog items are documented as out-of-autopilot-scope; they carry `gate_origin: security` for traceability.

Cross-cutting review: No regressions introduced across the batch. The four changes touch distinct files (`update-service.ts` / `ipc-server.ts` / `ONBOARDING.md` / `UPDATE-CHANNEL.md`) with no interaction surface between them. The follow-up backlog items (`idea-encrypt-api-key-with-safestorage`, `idea-update-feed-ed25519-signature`) are genuine engineering work with design considerations fully captured — they will not be lost.

Foundation-doc alignment: ONBOARDING.md and UPDATE-CHANNEL.md are now accurate. No "previously" prose, no legacy notation introduced anywhere in the batch.
