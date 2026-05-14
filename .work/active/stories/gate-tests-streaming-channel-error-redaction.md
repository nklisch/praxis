---
id: gate-tests-streaming-channel-error-redaction
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: [gate-security-streaming-channel-error-push-redactor-gap]
release_binding: v0.1.2
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Pin test for the streaming-channel raw `err.message` leak (paired with the security fix)

## Priority
High

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout`

Adjacent finding: `gate-security-streaming-channel-error-push-redactor-gap`
already tracks the security fix. This test gap exists because the
streaming-error wire path (`ipc-server.ts:163` and the sibling
`activity-channel.ts:59`, `bootstrap-drafts-channel.ts:83`,
`ingest-channel.ts:180`, `quick-check-channel.ts:59`,
`subagent-channel.ts:62`) currently surfaces `err.message` verbatim
without a regression test to catch a future drift.

The security invariant ("no raw error message containing
`sk-ant-` / `Bearer ` / `?key=` substrings crosses to renderer") is
violated on the streaming-channel path; once the security item lands a
redactor, the test below pins the new contract so a future refactor
can't silently re-introduce the leak.

## Gap type
Adversarial-spec-silent / e2e-seam (the wire path that leaks).

## Suggested test
Author this test AFTER the security finding's redactor lands. Before:
the test asserts the current intentional gap (pinning the known leak so
it's a tracked finding rather than a silent risk). After: flip the
assertion to verify redaction.

```typescript
// packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts (new)

it("praxis.session.send streaming error event redacts apiKey-shaped secrets in err.message", async () => {
  // Reproduce: streaming source throws Error("apiKey=sk-ant-leak-value");
  // Subscribe; observe pushed 'error' event; assert the error string does NOT contain "sk-ant-"
});

it("activity-channel error push redacts Bearer-shaped tokens", async () => {});

it("bootstrap-drafts streaming error push redacts URL-embedded ?key=", async () => {});

it("ingest-channel error push redacts apiKey-shaped secrets", async () => {});

it("quick-check-channel error push redacts Bearer-shaped tokens", async () => {});

it("subagent-channel error push redacts secrets", async () => {});
```

## depends_on
`gate-security-streaming-channel-error-push-redactor-gap` — the redactor
must land first so the assertions can verify the contract rather than
pin the gap.

## Implementation

New file: `packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts`

Six tests, one per channel, all in a single `describe("streaming channel error redaction")` block:

| Test | Channel handler | Secret shape | Mock approach |
|---|---|---|---|
| `praxis.session.send.start` | `registerIpcHandlers` | `sk-ant-leak-value` | `session.send` async generator throws immediately |
| `activity-channel` | `registerActivityHandlers` | `Bearer eyJ...` | `activity.subscribe` throws synchronously |
| `bootstrap-drafts-channel` | `registerBootstrapDraftsHandlers` | `?key=topsecret` | `bootstrap.subscribe` throws synchronously |
| `ingest-channel` | `registerIngestHandlers` | `sk-ant-api03-leak-value` | `ingestion.ingest` async generator throws; `getOrCreateDefaultStudentId` mocked at module level via `vi.mock("@praxis/core/services")` to avoid needing a Drizzle DB |
| `quick-check-channel` | `registerQuickCheckHandlers` | `Bearer eyJ...` | `quickCheck.subscribe` throws synchronously |
| `subagent-channel` | `registerSubAgentHandlers` | `?key=super-secret-key` | `subAgent.subscribe` throws synchronously |

The four subscribe-based channels (activity, bootstrap-drafts, quick-check, subagent) use a tighter-scope approach: each registers its channel module directly rather than going through the full `registerIpcHandlers` — this keeps each test independent of the full Services bag.

The ingest test uses a module-level `vi.mock("@praxis/core/services")` to stub `getOrCreateDefaultStudentId` because the real implementation uses Drizzle ORM chained query builders that are impractical to stub without a real DB.

Assertions check that the *raw secret body* (e.g. `"sk-ant-leak-value"`) is absent from the pushed `error` string, and that the redacted placeholder (e.g. `"sk-ant-[REDACTED]"`) is present. Note: `redactSecrets` preserves the provider-key prefix (`sk-ant-`) so the assertion is on the specific raw value, not the prefix alone.

## Review (2026-05-14)

**Verdict: Approved.**

### Assertion strategy vs `redactSecrets` reality

`redactSecrets` in `packages/core/src/types/errors.ts` applies patterns in order. For `sk-ant-` keys: the pattern is `/sk-ant-[A-Za-z0-9_-]+/g` → replacement `"sk-ant-[REDACTED]"`. The test error is `"apiKey=sk-ant-leak-value"`. After redaction that becomes `"apiKey=sk-ant-[REDACTED]"`. The assertion `not.toContain("sk-ant-leak-value")` is correct — the body `leak-value` is gone; the prefix `sk-ant-` survives. The positive assertion `toContain("sk-ant-[REDACTED]")` confirms the placeholder landed.

For Bearer tokens: pattern `/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi` → `"Bearer [REDACTED]"`. The activity test error `"Authorization: Bearer eyJ..."` becomes `"Authorization: Bearer [REDACTED]"`. The assertion `not.toContain("Bearer eyJ")` is correct — both `eyJ` and the rest of the body are gone; `"Bearer "` itself is only preserved as part of `"Bearer [REDACTED]"`. The positive assertion `toContain("Bearer [REDACTED]")` is correct.

For `?key=` params: pattern `([?&](?:key|...))=([^&\s]+)` with capture-group replacement `"$1=[REDACTED]"`. The test URL `"...?key=topsecret"` becomes `"...?key=[REDACTED]"`. Assertion `not.toContain("topsecret")` and `toContain("?key=[REDACTED]")` both correct.

The quick-check test asserts `not.toContain("eyJhbGciOiJSUzI1NiJ9")` — the Bearer pattern fires before the standalone JWT pattern, so the entire token body is replaced by `Bearer [REDACTED]`, and the JWT segment disappears. Correct.

### Regression-pin quality: would these tests fail if the fix is reverted?

Yes. If `redactSecrets(...)` is removed from any push site, `err.message` lands verbatim. The `not.toContain(<secret-body>)` assertion for that channel fails because the raw secret is now present in the pushed event. The `toContain("<prefix>[REDACTED]")` assertion also fails because the placeholder was never inserted. Both halves of each double assertion are independently load-bearing.

Spot-check trace (ipc-server.ts session channel): handler calls `push({ kind: "error", error: redactSecrets(err instanceof Error ? err.message : String(err)) })` at line 163. If that call becomes `push({ kind: "error", error: err.message })`, the pushed string would be `"apiKey=sk-ant-leak-value"`, causing `expect(errMsg?.error).not.toContain("sk-ant-leak-value")` to throw. The test fails. The regression-pin contract holds.

### Per-channel mock approaches

The four subscribe-based channels (activity, bootstrap-drafts, quick-check, subagent) register their module directly rather than going through `registerIpcHandlers`. This is pragmatic — it avoids the full 15-service stub required by the session channel path, and each test exercises exactly the code path that matters. No penalty.

The ingest test's `vi.mock("@praxis/core/services")` to stub `getOrCreateDefaultStudentId` is correct — the real impl uses chained Drizzle query builders that cannot be faked without a real DB. The module-level mock is scoped to this file and does not leak.

### Results

All 6 tests pass: `6 passed (6)` in 40 ms.
