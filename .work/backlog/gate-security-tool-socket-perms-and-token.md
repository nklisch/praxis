---
id: gate-security-tool-socket-perms-and-token
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
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
