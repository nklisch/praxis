---
id: gate-security-tool-socket-perms-and-token
kind: story
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: security
created: 2026-05-12
updated: 2026-05-17
---

# MCP tool-bridge Unix-domain-socket has no explicit permission set or auth token

## Severity
Low

## Domain
Infrastructure & Deployment

## Location
`packages/claude-cli-sdk/src/tool-server.ts:98-148`

## Evidence
```ts
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-tools-"));
const socketPath = path.join(tempDir, "handler.sock");
// ...
await new Promise<void>((resolve, reject) => {
  server.listen(socketPath, () => resolve());
  server.on("error", reject);
});
```

Any local process running as the same user can connect to this Unix socket
and send `{ id, name, input }` to dispatch a Praxis tool directly, bypassing
prompt safety. `mkdtemp` is documented to create 0700 dirs on POSIX (which
makes the socket reachable only to the owner) and `umask` typically narrows
the socket file. Single-user desktop is the threat model so this is safe in
practice — but the code never asserts the mode, and Windows AF_UNIX semantics
differ (directory ACL is the only barrier).

## Remediation direction
Defense-in-depth — `fs.chmod(tempDir, 0o700)` and `fs.chmod(socketPath, 0o600)`
explicitly after `server.listen` resolves; add a one-line authentication
token in `CLAUDE_SDK_TOOL_SOCKET_TOKEN` env var that the worker echoes on
connect, so even if the socket is reachable, a stray local process can't
invoke tools.

## Implementation notes — Land mode

Work already shipped; orchestrator audit confirmed:

- `packages/claude-cli-sdk/src/tool-server.ts:139` — `crypto.randomBytes(32).toString("hex")` generates a 32-byte auth token per server.
- `packages/claude-cli-sdk/src/tool-server.ts:172` — every connection's first frame must include a `token` field that `timingSafeEqualHex` matches against the generated token.
- `packages/claude-cli-sdk/src/tool-server.ts:213` — explicit `fs.chmod(socketPath, 0o600)` runs after `server.listen` resolves (non-fatal-on-error with debug log).
- `packages/claude-cli-sdk/src/tool-server.ts:228` — token plumbed to the child worker via `TOKEN_ENV` (`CLAUDE_SDK_TOOL_SOCKET_TOKEN`) in the process env.
- Test coverage at `packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts` exercises the auth-token frame contract.

Gate is fully closed — no code change required. Advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. Citations verified — 32-byte random auth token, `timingSafeEqualHex` framing, explicit `fs.chmod(socketPath, 0o600)`, and token plumbing via `CLAUDE_SDK_TOOL_SOCKET_TOKEN` env var are all in place. Both halves of the gate's defense-in-depth direction (chmod + auth token) shipped.
