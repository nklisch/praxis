---
id: bug-scan-pyodide-timeout-keeps-running
created: 2026-06-01
tags: [bug, async, critical]
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
