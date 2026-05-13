---
id: epic-security-hardening-round-2-tool-bridge-socket-auth
kind: feature
stage: drafting
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tool-bridge socket auth — permissions and per-session token

## Brief

The MCP tool-bridge that lets the Claude CLI subprocess call back into
the Praxis main process tools uses a Unix-domain socket in a temp
directory (`os.tmpdir()/claude-sdk-tools-*/handler.sock`). The socket has
**no explicit permission bits set** (relying on whatever the system
default produces, often 0666) and **no auth token** on incoming
connections. Any process running as the same user on the same machine
can connect and invoke the full tool surface — including verification
tools that touch the filesystem and database — without any check that
the caller is the intended Claude CLI subprocess.

This feature adds two defenses: tighten the socket's permission bits to
`0600` (owner-only) at creation time, and require connecting clients to
present a per-session shared secret in their first frame. The secret is
generated when the tool server starts, passed to the spawned Claude CLI
via env var, and verified before the server accepts any RPC. Any other
process on the same machine would need to read the env var of the
subprocess (or the socket itself, which 0600 prevents).

This is a defense-in-depth move. The threat model isn't "remote
attacker" (the socket is filesystem-local); it's "another local process
running as the same user that wandered onto the socket path." Both fixes
are bounded to `@praxis/claude-cli-sdk` and don't touch other engine
adapters.

## Epic context

- Parent epic: `epic-security-hardening-round-2`
- Position in epic: independent — touches `@praxis/claude-cli-sdk` only.
  Runs in parallel with the IPC boundary and image-store features.

## Scope absorbed from backlog

- `gate-security-tool-socket-perms-and-token` — MCP tool-bridge
  Unix-domain socket has neither explicit permission bits nor an auth
  token.

## Foundation references

- `CLAUDE.md` — section on `@praxis/claude-cli-sdk` ownership and the
  MCP-bridge permission story (the `resolvePermissionMode` /
  `bypassPermissions` default explained in detail).
- `docs/ARCHITECTURE.md` — engine adapter boundary; the tool-dispatch
  pipeline that goes through this socket.

## Anchors (current implementation)

- Tool server — `packages/claude-cli-sdk/src/tool-server.ts:98-148`
  (socket creation, listen setup)
- Tool server consumer — `packages/claude-cli-sdk/src/tool-bridge.ts`
  or equivalent (where the client side connects and sends RPC frames)
- CLI subprocess spawn — `packages/claude-cli-sdk/src/cli/` (where the
  child process is launched; env vars get attached here)
- Claude Code adapter — `packages/engines/src/claude-code/adapter.ts`
  (high-level orchestration; should not need changes if SDK contract
  stays the same)
