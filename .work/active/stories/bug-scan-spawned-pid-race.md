---
id: bug-scan-spawned-pid-race
kind: story
stage: implementing
tags: [bug, concurrency]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: medium
bug_domain: concurrency
bug_location: packages/desktop/electron/main/services.ts:157
---

# Spawned PID registry writes can persist stale PIDs out of order

**Location**: `packages/desktop/electron/main/services.ts:157` · **Severity**: medium · **Pattern**: non-atomic read-modify-write on shared persistent state

PID register and deregister writes are fire-and-forget and not serialized. A fast process exit can let the deregister write finish first and the earlier register write finish later, leaving a stale PID for the next launch sweep. Serialize persistence and write via temp-file plus rename.

```ts
const onProcessSpawned = (pid: number): void => {
  pidRegistry.register(pid).catch(() => {});
};
const onProcessExited = (pid: number): void => {
  pidRegistry.deregister(pid).catch(() => {});
};
```
