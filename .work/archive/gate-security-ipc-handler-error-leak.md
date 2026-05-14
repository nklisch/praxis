---
id: gate-security-ipc-handler-error-leak
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

# IPC handlers re-throw raw error objects so internal stack messages reach the renderer

## Severity
Low

## Domain
Error Handling & Logging

## Location
`packages/desktop/electron/main/ipc-helpers.ts:36-52`

## Evidence
```ts
ipcMain.handle(channel, async (event, ...args) => {
  try {
    const result = await fn(event, ...args);
    return result;
  } catch (err) {
    channelLog.error("ipc.handle.error", { durationMs, err: serializeError(err) });
    throw err;  // full Error including message rethrown across IPC
  }
});
```

Error messages crossing IPC may surface filesystem paths (e.g. `ENOENT` from
ingestion), internal class names, or Zod validation messages containing
user/data content. In the current single-user desktop model this is mostly
cosmetic, but it widens what a compromised renderer can learn about host
filesystem layout.

## Remediation direction
Map known internal errors to user-safe messages at the IPC boundary (or
sanitize via an allowlist of error codes — `EngineError` / `SecretStorageError`
already carry stable `code` discriminators). Reserve raw `.message` for
`log.error` only.
