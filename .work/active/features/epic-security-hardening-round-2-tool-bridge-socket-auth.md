---
id: epic-security-hardening-round-2-tool-bridge-socket-auth
kind: feature
stage: review
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

## Pre-design decisions (2026-05-14)

- **Token transport**: env var on subprocess spawn. The tool server
  generates a random per-session token, passes it to the spawned
  Claude CLI via env var (e.g., `PRAXIS_TOOL_BRIDGE_TOKEN`), and
  verifies it on the first frame received over the socket. Connection
  closed if missing/wrong. Bounded to `@praxis/claude-cli-sdk`.
- **Socket permissions**: set explicit `0600` on socket creation
  before the listen call (paired with the token check as
  defense-in-depth — either alone is sufficient against the threat,
  both together cost almost nothing).
- **Scope**: SDK-only change. Praxis is the sole consumer; no
  external SDK clients to coordinate with.

## Architectural choice

Three approaches considered:

1. **Token-only auth, no perm change.** Cheap, but loses defense-in-depth.
   Anyone who can read the env of the worker subprocess (rare on a single-user
   box, but `/proc/<pid>/environ` is 0600 on Linux only if procfs hidepid is
   set — not the default). Rejected: pairing both costs almost nothing.
2. **0600 perms only, no token.** Sufficient against the threat on its own
   (other users blocked, same-user processes blocked because procfs gives
   them the path but the FS denies open). But on macOS Unix socket
   permissions are advisory in some configurations and historically buggy
   — without a token, an adversarial process that finds the path can still
   try. Rejected: token is cheap insurance.
3. **Both (chosen).** Pre-design decision. `0600` umask before `listen`,
   plus a 32-byte hex token generated per server, plumbed via the env that
   already flows to the MCP worker, verified as the first frame on every
   new connection. Worker prepends an auth frame on connect; server holds
   the connection in an "unauthenticated" state and drops it if frame 1
   isn't a valid auth frame.

**Why over the others**: Defense-in-depth, both fixes are bounded to the
same ~30 lines of code, and the threat model in the brief ("another local
process running as the same user that wandered onto the socket path")
specifically benefits from both: the perm bit prevents the wander, the
token prevents a process that happens to also have read access (e.g., another
Claude SDK consumer or a future Praxis subprocess) from invoking RPCs not
meant for it.

## Trickiest unit first

**Per-connection auth state machine.** Naïve "check the first line" works
on a single-message wire protocol, but newline-delimited JSON streams
multiple messages — and the *first* line in `buffer` might not arrive in
the first `data` event (TCP/Unix socket frames can split or coalesce). So
the connection state machine has to handle:

- Frame 1 arrives partially → buffer, wait, re-check on next chunk.
- Frame 1 arrives intermixed with frame 2 in one chunk → parse frame 1,
  authenticate, then process the rest of the buffer through the normal
  tool-call loop.
- Frame 1 is malformed JSON or has wrong token → write a deny response
  and close the socket.

The design uses a per-connection `authenticated: boolean` flag and gates
the existing readline loop on it. The first parsed frame is treated as
an auth frame `{ type: "auth", token: string }`; subsequent frames go to
`handleToolCall`. On worker side, the very first thing it writes after
`connect` is the auth frame; everything else is unchanged.

## Implementation Units

### Unit 1: Token generation + storage in `ToolServerHandle`
**File**: `packages/claude-cli-sdk/src/tool-server.ts`

```typescript
import * as crypto from "node:crypto";

/** Environment variable name carrying the per-session auth token. */
const TOKEN_ENV = "CLAUDE_SDK_TOOL_TOKEN";

// inside startToolServer(), before server.listen:
const authToken = crypto.randomBytes(32).toString("hex");
// ...
return {
  command: process.execPath,
  args: [workerPath],
  env: {
    CLAUDE_SDK_TOOL_SOCKET: socketPath,
    [TOKEN_ENV]: authToken,
  },
  // ...
};
```

**Implementation Notes**:
- Naming: `CLAUDE_SDK_TOOL_TOKEN` rather than `PRAXIS_TOOL_BRIDGE_TOKEN`
  — the SDK is an in-tree fork but its public surface is still named in
  the `CLAUDE_SDK_*` namespace (`CLAUDE_SDK_TOOL_SOCKET` already exists
  alongside it). Keeping the prefix consistent makes the worker script
  template uniform and matches the existing convention. The pre-design
  decision specifies the *transport* (env var) and *intent* — the exact
  name is implementation detail.
- `crypto.randomBytes(32)` → 256 bits, hex-encoded to 64 chars. Cheap,
  cryptographically strong, no PRNG seeding concerns.
- Token is captured in the `net.createServer` closure so the per-connection
  handler can compare against it without further plumbing.

**Acceptance Criteria**:
- [ ] `handle.env.CLAUDE_SDK_TOOL_TOKEN` is a 64-char hex string.
- [ ] Each call to `startToolServer` produces a distinct token.
- [ ] The token does NOT appear in any log message at any log level.

---

### Unit 2: Socket permission tightening (0600)
**File**: `packages/claude-cli-sdk/src/tool-server.ts`

```typescript
// Apply restrictive umask around the listen call so the socket inode
// is created 0600 regardless of inherited process umask.
const prevUmask = process.umask(0o077);
try {
  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on("error", reject);
  });
} finally {
  process.umask(prevUmask);
}

// Belt-and-suspenders: explicit chmod after listen to handle platforms
// where umask doesn't apply to AF_UNIX inodes (some BSDs).
await fs.chmod(socketPath, 0o600);
```

**Implementation Notes**:
- `process.umask` is a process-global, so wrap it tightly around the
  listen and restore in `finally` even on error. Concurrent
  `startToolServer` calls in the same process could race here, but in
  practice there's at most one active per session and Node's event loop
  guarantees the umask save/restore can't be torn within the awaited
  window — the await is on the listen callback, not on user code.
- `fs.chmod(0o600)` is the actual guarantee. Umask is the additional
  defense for the brief window before chmod runs (anyone calling
  `connect` between `listen` and `chmod` would see the looser perms; in
  practice the worker only spawns after `startToolServer` returns so
  this is moot, but we don't want to assume that forever).
- Skip on Windows (`os.platform() === "win32"`) — chmod on AF_UNIX
  isn't a thing there and the SDK doesn't currently support Windows
  for the tool-bridge anyway. Guard with a platform check so the test
  suite doesn't fail on a future Windows CI.

**Acceptance Criteria**:
- [ ] After `startToolServer` returns, `fs.stat(socketPath).mode & 0o777
      === 0o600` on Linux/macOS.
- [ ] On Windows, the chmod call is skipped without throwing.
- [ ] Concurrent `startToolServer` calls in the same process don't leak
      the restrictive umask to unrelated FS operations.

---

### Unit 3: Per-connection auth gate (server side)
**File**: `packages/claude-cli-sdk/src/tool-server.ts`

```typescript
const server = net.createServer((conn) => {
  let buffer = "";
  let authenticated = false;
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      logger.debug("Tool server auth timeout — closing connection");
      conn.destroy();
    }
  }, 5000);

  conn.on("data", (chunk) => {
    buffer += chunk.toString();
    let newlineIdx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard readline pattern
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.trim()) continue;

      if (!authenticated) {
        // First non-empty frame MUST be the auth frame.
        try {
          const frame = JSON.parse(line) as { type?: string; token?: string };
          if (frame.type === "auth" && typeof frame.token === "string" &&
              timingSafeEqualHex(frame.token, authToken)) {
            authenticated = true;
            clearTimeout(authTimeout);
            continue;
          }
        } catch {
          // fall through to deny
        }
        logger.debug("Tool server auth rejected — closing connection");
        conn.destroy();
        return;
      }
      handleToolCall(conn, handlers, outputSchemas, line);
    }
  });

  conn.on("close", () => clearTimeout(authTimeout));
  conn.on("error", (err) => {
    logger.debug("Tool server connection error", { err: err.message });
  });
});

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
```

**Implementation Notes**:
- `crypto.timingSafeEqual` to avoid the (low-risk but free) timing side
  channel. Wrapping `Buffer.from(_, "hex")` in try/catch because a
  malformed hex string throws.
- 5-second auth timeout — generous (the worker writes the auth frame
  synchronously after `connect`, real latency is sub-millisecond on a
  local socket) but big enough that a slow CI box won't flake.
- `logger.debug` for both auth-success path (implicit, no log) and
  auth-fail path — don't log at `info` because a malicious local probe
  shouldn't be able to flood logs. Never log the token itself.
- The auth frame is consumed without acknowledgement — the worker
  doesn't need a response, it just starts sending tool calls. If the
  server rejects, the worker gets ECONNRESET on its next write and the
  CLI session fails fast. That's the desired behavior: any deviation
  from the protocol kills the bridge.

**Acceptance Criteria**:
- [ ] Connection with valid auth frame proceeds to tool dispatch normally.
- [ ] Connection with missing/wrong/malformed auth frame is closed
      immediately; no tool handler is invoked.
- [ ] Connection that sends no frame within 5s is closed.
- [ ] Auth frames split across chunks (partial-then-complete arrival)
      authenticate correctly.
- [ ] Auth frame coalesced with a subsequent tool call in one chunk —
      both processed correctly (auth then call).

---

### Unit 4: Auth frame on worker connect (client side)
**File**: `packages/claude-cli-sdk/src/tool-server.ts` (the
`generateWorkerScript` template literal)

```javascript
// generated worker — after `await new Promise((resolve, reject) => { conn.on('connect', resolve); ... })`
const TOKEN = process.env.CLAUDE_SDK_TOOL_TOKEN;
if (!TOKEN) {
  process.stderr.write('CLAUDE_SDK_TOOL_TOKEN not set\\n');
  process.exit(1);
}
conn.write(JSON.stringify({ type: 'auth', token: TOKEN }) + '\\n');
```

**Implementation Notes**:
- Mirrors the existing `CLAUDE_SDK_TOOL_SOCKET` fail-fast pattern at the
  top of the worker. If the env var got stripped (someone changes the
  spawn plumbing and forgets to forward it), the worker exits 1 with a
  visible stderr line instead of silently failing auth and producing
  cryptic CLI errors.
- The auth frame is written immediately after connect, *before* any
  MCP request triggers a tool call. Since the MCP server is constructed
  and connected to stdio after this, there's no race.
- The token env var name is duplicated as a string literal in the
  generated worker, mirroring the existing `CLAUDE_SDK_TOOL_SOCKET`
  pattern. Acceptable because the worker is generated from the same
  file that defines the constant — if the constant changes, the
  generator changes in the same edit.

**Acceptance Criteria**:
- [ ] Worker script exits 1 with stderr message if `CLAUDE_SDK_TOOL_TOKEN`
      is unset.
- [ ] Worker writes exactly one auth frame, then nothing else until the
      MCP server triggers a tool call.

---

### Unit 5: Documentation
**File**: `packages/claude-cli-sdk/src/tool-server.ts` (JSDoc on
`ToolServerHandle.env` and `startToolServer`)

Update the comment on `env` to document the new key:

```typescript
/** Environment variables: `CLAUDE_SDK_TOOL_SOCKET` (socket path) and
 *  `CLAUDE_SDK_TOOL_TOKEN` (per-session auth token, 64-char hex). The
 *  worker script reads both and presents the token on its first frame. */
env: Record<string, string>;
```

And in the `startToolServer` jsdoc "Architecture" section, add the auth
step:

```
 * 1. Generates a per-session 256-bit auth token.
 * 2. Creates a 0600 Unix domain socket for tool call dispatch.
 * 3. Writes a temp MCP worker script that the CLI spawns as a stdio MCP server.
 * 4. Worker presents the auth token on its first frame; server validates
 *    constant-time and closes any connection that fails.
 * 5. When the CLI calls a custom tool, the worker sends `{ id, name, input }`
 *    over the (now-authenticated) socket → ...
```

**Acceptance Criteria**:
- [ ] JSDoc accurately reflects the new auth + perm-bit story.
- [ ] No mention of bypass / permissionMode (this feature must not
      touch `resolvePermissionMode` semantics — see CLAUDE.md note).

---

## Implementation Order

1. **Unit 1** (token generation + handle.env exposure) — pure additive.
2. **Unit 2** (0600 perms) — independent of token work; could parallel.
3. **Unit 3** (server auth gate) — requires Unit 1.
4. **Unit 4** (worker auth frame) — requires Unit 1 + Unit 3 to land
   together to avoid a window where the worker can't connect.
5. **Unit 5** (docs) — last; reflects the shipped behavior.

All five units land as one stride. Total surface: one source file
(`packages/claude-cli-sdk/src/tool-server.ts`) and one test file.

## Testing

### Unit Tests: `packages/claude-cli-sdk/src/__tests__/tool-server-auth.test.ts`

Mirrors the structure of `tool-server-output-schema.test.ts` — speak the
socket protocol directly, no real CLI. Use raw `net.createConnection`
and write/read newline-delimited JSON.

**Test cases**:

1. **`emits a token on the handle`** — `handle.env.CLAUDE_SDK_TOOL_TOKEN`
   is a 64-char hex string; two `startToolServer` calls produce different
   tokens.
2. **`socket has 0600 permissions`** — skip on Windows;
   `fs.stat(socketPath).mode & 0o777 === 0o600`.
3. **`auth frame then tool call → succeeds`** — full happy path against
   a trivial echo tool.
4. **`tool call without auth frame → connection closed`** — connect,
   write a tool-call frame, expect socket close with no response.
5. **`auth frame with wrong token → connection closed`** — connect,
   write `{type:"auth",token:"deadbeef".repeat(8)}`, expect close.
6. **`auth frame with malformed JSON → connection closed`** — write
   `not-json\n`, expect close.
7. **`auth frame split across chunks → succeeds`** — write the frame
   in two writes with a small delay; expect normal operation.
8. **`auth frame coalesced with tool call in one chunk → both
   processed`** — write `auth\ncall\n` in one `socket.write`; expect
   the call's response.
9. **`no frame within 5s → connection closed`** — connect, do not
   write; expect close. (Use a shorter timeout via test-only config
   knob or vitest fakeTimers — see note below.)

**Test data**: trivial echo tool — `tool("echo", z.object({s:z.string()}),
async ({s}) => ({success:true, value:s}))`. No fixtures needed.

**Note on timeout test**: option A is to use vitest `vi.useFakeTimers()`
and advance manually; option B is to export `AUTH_TIMEOUT_MS` from
`tool-server.ts` and shadow it in the test. Prefer A — keeps the
production constant private.

### Integration with existing tests

`tool-server-output-schema.test.ts` currently connects directly without
an auth frame. It will fail after Unit 3 ships. **Migration**: update
its `callTool` helper to send the auth frame first, reading
`handle.env.CLAUDE_SDK_TOOL_TOKEN`. One-line change. Not a separate
unit — it's part of Unit 3's landing.

### Permission-mode contract

CLAUDE.md is explicit that `resolvePermissionMode` defaults
`permissionMode` to `"bypassPermissions"` when `mcpServers` is set.
This feature touches NEITHER `resolvePermissionMode` nor the bypass
default. Verified by: (a) no edits to `cli/args.ts` other than the
existing path through `startToolServer`, (b) tests that exercise the
existing `mcpServers` injection still pass unchanged. No new test for
this — the existing test suite is the contract.

## Risks

- **Cross-platform AF_UNIX perm semantics.** On some BSD/macOS configs,
  socket inode perms are advisory rather than enforced. Mitigation:
  the token check is the real guarantee; the perm bit is layered
  defense. If `fs.chmod` throws on a specific platform we'll see it
  in CI; treat it as platform-specific work then.
- **Test flakiness on auth timeout.** Using real timers + 5s waits is
  slow and flaky. Mitigation: fake timers in vitest.
- **Worker generation drift.** The worker script is a template
  literal; if a future edit changes the auth frame shape on the
  server side but forgets the worker template, tests will catch it
  (case 3 — happy path — fails). Low risk but called out.

## Child stories

None. This is a single-file, single-stride change (~120 LoC added to
one source file + ~200 LoC in a new test file). Tight cohesion: every
test exercises both the perm-bit change and the auth gate through the
same handle. No fan-out opportunity for parallel agents — splitting
would just add overhead. Per the feature-design skill's "When stories
are pure overhead" guidance, the work is captured directly under the
feature.

The next agent should run `/agile-workflow:implement
epic-security-hardening-round-2-tool-bridge-socket-auth` for inline
implementation.
