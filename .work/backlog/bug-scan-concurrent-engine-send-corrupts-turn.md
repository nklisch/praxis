---
id: bug-scan-concurrent-engine-send-corrupts-turn
created: 2026-06-01
tags: [bug, concurrency, high]
bug_origin: scan
bug_severity: high
bug_domain: concurrency
bug_location: packages/core/src/services/session-service.ts:319
---

# Concurrent sends can reuse one EngineSession and corrupt turn routing

**Location**: `packages/core/src/services/session-service.ts:319` · **Severity**: high · **Pattern**: reentrancy and non-atomic shared session state

`turnInFlight` is set but not used to reject or serialize a second send for the same session, so two IPC starts can enter the same `EngineSession` and overwrite per-turn handlers in the Claude conversation. Add a per-session mutex or queue before calling `handle.send()`.

```ts
capturedEntry.turnInFlight = true;
try {
  for await (const event of capturedEntry.handle.send(message, signal)) {
    // ...
  }
} finally {
  capturedEntry.turnInFlight = false;
}
```
