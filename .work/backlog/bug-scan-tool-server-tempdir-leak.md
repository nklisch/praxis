---
id: bug-scan-tool-server-tempdir-leak
created: 2026-06-01
tags: [bug, resource-leak]
bug_origin: scan
bug_severity: low
bug_domain: resource-leak
bug_location: packages/claude-cli-sdk/src/tool-server.ts:124
---

# Tool server setup leaks its temp directory if initialization throws before returning a handle

**Location**: `packages/claude-cli-sdk/src/tool-server.ts:124` · **Severity**: low · **Pattern**: temp directory acquired before risky setup without cleanup

Cleanup is only reachable after the handle is returned. If setup throws after `mkdtemp` but before return, the `claude-sdk-tools-*` directory remains in temp. Wrap setup in `try/catch`, close partial resources, and remove the temp directory before rethrowing.

```ts
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-tools-"));
const socketPath = path.join(tempDir, "handler.sock");
const workerPath = path.join(tempDir, "mcp-worker.mjs");
await fs.writeFile(workerPath, generateWorkerScript(schemas, mcpServerIndexPath, mcpStdioPath, mcpTypesPath), "utf8");
```
