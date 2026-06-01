---
id: bug-scan-tool-server-tempdir-leak
kind: story
stage: done
tags: [bug, resource-leak]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
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

## Implementation notes

- Changed `packages/claude-cli-sdk/src/tool-server.ts` to wrap post-`mkdtemp` setup in cleanup-on-failure logic, close a partially-created server, and remove the temp directory before rethrowing.
- Added coverage in `packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts` for a setup failure after temp directory creation.
- Verification: `pnpm --filter @praxis/claude-cli-sdk typecheck`; `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/claude-cli-sdk/src/__tests__/auth.test.ts packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts packages/claude-cli-sdk/src/__tests__/query.test.ts packages/claude-cli-sdk/src/__tests__/conversation-tool-results.test.ts`.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
