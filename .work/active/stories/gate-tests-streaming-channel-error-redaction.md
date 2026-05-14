---
id: gate-tests-streaming-channel-error-redaction
kind: story
stage: implementing
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
