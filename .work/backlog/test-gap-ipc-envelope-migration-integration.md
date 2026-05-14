---
id: test-gap-ipc-envelope-migration-integration
created: 2026-05-14
tags: [tests, security]
---

The `url-and-redactor-rollout` story (under
`epic-security-hardening-round-2-ipc-boundary`) declared a new
`packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts`
in its acceptance criteria, but the file was not created.

The shape of the wrapper IS covered at unit level by
`ipc-error-envelope.test.ts` (envelope success/failure, ZodError →
VALIDATION_FAILED, internal throw with no path leakage, redacted log
record), so the migration is not unverified — but a thin integration
test that drives the actual `praxis.shell.openExternal` and one of
the migrated config channels through `ipcMain.handle` (mocked in the
existing test suite) would catch wiring regressions that unit tests
on the helper can't see. Suggested cases (mirrors the original AC):

- Migrated channel success path → envelope shape on the wire.
- `praxis.shell.openExternal("file:///etc/passwd")` →
  `{ ok: false, error: { code: "VALIDATION_FAILED" } }`.
- Migrated channel internal throw → envelope INTERNAL with no
  filesystem path in `message`.
- Non-migrated control channel (`praxis.documents.list`) still
  throws raw — proves the rollout is incremental, not a global
  shape change.

Add as a sibling to `ipc-error-envelope.test.ts` so it lives next to
the helpers it exercises.
