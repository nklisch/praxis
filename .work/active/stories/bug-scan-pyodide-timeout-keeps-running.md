---
id: bug-scan-pyodide-timeout-keeps-running
kind: story
stage: review
tags: [bug, async, critical]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: critical
bug_domain: async
bug_location: packages/tools/src/runtime/pyodide-host.ts:72
---

# Python sandbox timeout reports timeout without stopping Pyodide execution

**Location**: `packages/tools/src/runtime/pyodide-host.ts:72` · **Severity**: critical · **Pattern**: Promise.race leaving losers running

`Promise.race` returns a timeout result while the Python execution can keep running in the same Pyodide host, so later sandbox calls can be affected by stale execution and a CPU-bound snippet may not be interrupted. Replace the timeout with real Pyodide interruption or disposable worker/process termination, and clear timeout handles in cleanup.

```ts
await Promise.race([
  py.runPythonAsync(opts.code),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new PyodideTimeoutError(`Python execution exceeded ${opts.timeoutMs}ms`)), opts.timeoutMs),
  ),
]);
```

## Implementation notes

- Changed `packages/tools/src/runtime/pyodide-host.ts` so `runPython` serializes calls through a reusable Node worker by default; timeout terminates the isolated worker, clears timeout/listeners, and recreates a fresh worker for later calls. Kept an in-process path using Pyodide's interrupt buffer for low-level unit coverage.
- Added fast unit coverage in `packages/tools/src/runtime/__tests__/pyodide-host.test.ts` for timeout interrupt signaling and waiting for the stale run to settle in the in-process path.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/tools/src/runtime/__tests__/pyodide-host.test.ts` passed. Slow real-Pyodide tests remain gated behind `PRAXIS_RUN_SLOW_TESTS=1` and were skipped.
