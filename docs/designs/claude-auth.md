# Design: Claude CLI Authentication

## Overview

Add a clean auth surface for the `claude-code` engine so first-run users sign in without
hitting cryptic engine errors, and so chat surfaces a recoverable "not signed in" state
instead of a generic "session.start failed" banner.

**Scope (per user decision)**:
- `claude-code` engine only. Direct/Codex engines already have API key fields in Settings.
- Modal triggered from a chat banner; same visual pattern as `UnlockModal`.
- `claude auth login --claudeai` only (subscription flow). Console/SSO/setup-token deferred.
- No mid-session expiry handling — only check at `session.start`. If auth dies mid-stream,
  user re-opens chat and is re-prompted on the next start.

**What this design adds**:
1. An `auth` namespace in `@praxis/claude-cli-sdk` that wraps `claude auth status` and
   `claude auth login` as the canonical surface for the rest of the codebase.
2. A `ClaudeAuthService` in `@praxis/core/services` exposing status (one-shot) and login
   (streamed events) to IPC.
3. A precheck inside `ClaudeCodeEngine.open()` that throws a recognizable error when
   the user isn't signed in — defense-in-depth so any future caller of `session.start`
   gets a clean error instead of a hung `engine.open()` or downstream CLI failure.
4. New IPC channels: `praxis.auth.claude.status`, the streaming
   `praxis.auth.claude.login.*` triple, and a generic `praxis.shell.openExternal`.
5. A `ClaudeAuthModal` component plus a small banner on the chat route that shows the
   modal trigger when `session.start` fails with the auth-required code.

**What this design does NOT add**:
- Logout flow (separate setting; not in chat path).
- Auth status caching beyond a single `session.start` cycle. Each chat mount re-checks.
- Any change to the `SessionService` interface — the auth-required signal flows through
  the Error message channel that already exists.

## Non-goals
- Generalizing across providers (deferred to a future "engine readiness" design).
- Detecting / recovering from auth loss mid-stream.
- Detecting whether the CLI is installed (separate `CLINotFoundError` path the SDK
  already raises; we surface its message verbatim).

---

## Implementation Units

### Unit 1: SDK auth namespace

**File**: `packages/claude-cli-sdk/src/auth.ts`

```typescript
import { spawn, type ChildProcess } from "node:child_process";

/**
 * Output shape of `claude auth status --json`. Forward-compatible with extra
 * fields the CLI may add — we only depend on `loggedIn`.
 */
export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;          // "claude.ai" | "console" | "sso" | string
  apiProvider?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  subscriptionType?: string;
  /** Set when status returned non-zero. The other fields are absent. */
  error?: string;
}

/**
 * Streamed events from `claude auth login`. Producer emits as soon as it can
 * detect each transition; the CLI's exact stdout format is NOT a contract,
 * so the producer is tolerant.
 */
export type ClaudeAuthLoginEvent =
  | { kind: "started" }
  | { kind: "url"; url: string }
  | { kind: "stdout"; line: string }     // raw passthrough for diagnostics
  | { kind: "stderr"; line: string }
  | { kind: "succeeded"; status: ClaudeAuthStatus }
  | { kind: "failed"; message: string };

export interface ClaudeAuthLoginOptions {
  /** Auth flow. v1 only supports "claudeai". */
  method?: "claudeai";
  signal?: AbortSignal;
}

/**
 * Run `claude auth status --json` and parse the JSON output.
 *
 * Resolves with `{ loggedIn: false, error }` on non-zero exit (treat any
 * non-success as "not logged in" — the CLI returns non-zero when no account
 * is configured). Throws only when the CLI binary itself is missing
 * (CLINotFoundError, same as conversation paths).
 */
export function authStatus(): Promise<ClaudeAuthStatus>;

/**
 * Run `claude auth login --claudeai` as a child process and stream events
 * as the CLI progresses.
 *
 * Implementation:
 * - Spawn `claude auth login --claudeai` with piped stdio.
 * - Yield `{ kind: "started" }` on spawn.
 * - For each stdout/stderr line: yield `{ kind: "stdout"|"stderr", line }`.
 * - First time a URL matching `/https:\/\/[^\s]+/` appears in stdout OR
 *   stderr, also yield `{ kind: "url", url }`.
 * - On exit code 0: invoke `authStatus()` and yield `{ kind: "succeeded",
 *   status }`.
 * - On non-zero exit: yield `{ kind: "failed", message }` where message is
 *   the joined stderr (or "claude auth login exited with code <N>" if empty).
 * - On `signal.abort`: SIGTERM the child, yield nothing further (consumer
 *   relies on the iterator returning).
 *
 * Tolerance: the CLI may auto-launch a browser via xdg-open/open. That's
 * fine — we still emit the URL event so the renderer can re-open or display
 * it. Do NOT attempt to suppress the CLI's own browser launch.
 */
export function authLogin(
  opts?: ClaudeAuthLoginOptions,
): AsyncIterable<ClaudeAuthLoginEvent>;
```

**Implementation Notes**:
- Reuse `spawnCli` from `cli/spawn.ts` IF its `keepStdinOpen` semantics are right
  — likely simpler to call `spawn('claude', [...])` directly here since this command
  doesn't need stdin.
- The URL regex matches the first https URL in any output line. Strip surrounding
  punctuation (trailing `.`, `,`, `)`).
- Use `readline.createInterface` on stdout and stderr separately so we get
  line-by-line events.
- `authStatus()` runs in a single `spawn` and buffers stdout to ~8KB max (paranoid cap).
- When the SDK is loaded under Electron's `praxis-source` condition, `spawn('claude')`
  inherits PATH from Electron's process env. No extra setup needed.

**Acceptance Criteria**:
- [ ] `authStatus()` returns `{ loggedIn: true, ... }` when the user is authenticated.
- [ ] `authStatus()` returns `{ loggedIn: false, error: <stderr or message> }` on non-zero
      exit; never throws unless the binary is missing.
- [ ] `authLogin()` yields `{ kind: "started" }` synchronously after spawn (first iter step).
- [ ] `authLogin()` yields a `{ kind: "url", url }` event the first time an https URL
      appears in CLI output.
- [ ] `authLogin()` yields a final `{ kind: "succeeded", status }` after exit code 0.
- [ ] `authLogin()` yields a final `{ kind: "failed", message }` on non-zero exit, with
      `message` populated from stderr.
- [ ] Aborting via `signal` SIGTERMs the child within ~1s and the iterator returns
      cleanly with no further events.
- [ ] Existing SDK exports unchanged — auth additions are additive.

**Export from index**: add `export { authStatus, authLogin } from './auth.js';` and
`export type { ClaudeAuthStatus, ClaudeAuthLoginEvent, ClaudeAuthLoginOptions } from './auth.js';`
to `packages/claude-cli-sdk/src/index.ts`.

---

### Unit 2: ClaudeAuthService (core)

**File**: `packages/core/src/services/claude-auth.ts`

```typescript
import {
  authLogin,
  authStatus,
  type ClaudeAuthLoginEvent,
  type ClaudeAuthLoginOptions,
  type ClaudeAuthStatus,
} from "@praxis/claude-cli-sdk";
import type { Logger } from "../types/index.js";

export type { ClaudeAuthStatus, ClaudeAuthLoginEvent, ClaudeAuthLoginOptions };

/**
 * Wraps the SDK's auth surface for desktop IPC. Stateless — every call hits
 * the CLI; we don't cache because the CLI is the source of truth and a stale
 * cache during a login flow would be worse than a 50ms re-spawn.
 */
export interface ClaudeAuthService {
  status(): Promise<ClaudeAuthStatus>;
  login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent>;
}

export class ClaudeAuthServiceImpl implements ClaudeAuthService {
  constructor(private readonly deps: { log: Logger }) {}

  async status(): Promise<ClaudeAuthStatus> {
    const result = await authStatus();
    this.deps.log.debug("claudeAuth.status", { loggedIn: result.loggedIn });
    return result;
  }

  async *login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent> {
    this.deps.log.info("claudeAuth.login.start", { method: opts?.method ?? "claudeai" });
    let last: ClaudeAuthLoginEvent | undefined;
    for await (const event of authLogin(opts)) {
      last = event;
      yield event;
    }
    this.deps.log.info("claudeAuth.login.end", { lastKind: last?.kind });
  }
}
```

**Implementation Notes**:
- Stateless. No DB, no shared state.
- The service is a thin pass-through. Logging exists so the main-process logs show
  auth attempts (useful for support / "did the user even try to sign in?" diagnostics).

**Acceptance Criteria**:
- [ ] `status()` delegates to SDK and returns the same shape.
- [ ] `login()` forwards every event from the SDK iterator without modification.
- [ ] Construction takes only `{ log }` — no DB, no other deps. Trivially testable
      with a fake log.

---

### Unit 3: Engine precheck

**File**: `packages/engines/src/claude-code/adapter.ts` (modify existing)

Insert at the top of `ClaudeCodeEngine.open()`, before the tool bridge spawn:

```typescript
async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
  // Precheck auth so the user gets a clean error instead of a downstream
  // CLI failure or hung subprocess. The error message uses a stable prefix
  // the desktop IPC layer recognizes and the renderer matches on.
  const status = await authStatus();
  if (!status.loggedIn) {
    throw new Error(
      `claude.auth.required: ${status.error ?? "claude CLI is not signed in"}`,
    );
  }

  const bridge: ToolBridgeHandle | null = ...
  // ... existing body unchanged ...
}
```

Also add the import:
```typescript
import { authStatus } from "@praxis/claude-cli-sdk";
```

**Implementation Notes**:
- Error MESSAGE format is the contract: `"claude.auth.required: <reason>"`. The
  renderer matches on the `claude.auth.required:` prefix. Custom Error subclasses
  don't survive Electron IPC structured-clone reliably; message strings do.
- The check adds ~50ms (a single `claude auth status --json` spawn). Acceptable for
  the start path — happens once per session, not per turn.
- If the CLI binary is missing entirely, the SDK throws `CLINotFoundError`. We let
  that bubble up unchanged — it has its own message and is a different remediation
  path than auth.

**Acceptance Criteria**:
- [ ] When `authStatus()` returns `{ loggedIn: true, ... }`, `open()` proceeds
      identically to today (existing tests still pass).
- [ ] When `authStatus()` returns `{ loggedIn: false }`, `open()` throws an Error
      whose message starts with `"claude.auth.required:"` and never spawns the
      tool bridge or conversation.
- [ ] When `authStatus()` throws `CLINotFoundError`, `open()` propagates that error
      unchanged.

---

### Unit 4: Wire ClaudeAuthService into Services

**File**: `packages/desktop/electron/main/services.ts` (modify existing)

Changes (all additive):

1. Add import near other service imports:
   ```typescript
   import { ClaudeAuthServiceImpl } from "@praxis/core/services";
   ```

2. Add to `Services` interface (after `lock: LockServiceImpl;`):
   ```typescript
   claudeAuth: ClaudeAuthServiceImpl;
   ```

3. Construct in `buildServices()` (place near `lockService` construction):
   ```typescript
   const claudeAuthService = new ClaudeAuthServiceImpl({ log });
   ```

4. Add to the returned `Services` object:
   ```typescript
   claudeAuth: claudeAuthService,
   ```

**Implementation Notes**:
- Does NOT go into `ServiceDeps.toolServices` — no tool handler needs it.
- Does NOT depend on the database. Construction order doesn't matter relative to
  other services.

**Acceptance Criteria**:
- [ ] `services.claudeAuth.status()` callable in main-process tests after `buildServices`.
- [ ] No other service construction signatures changed.

---

### Unit 5: IPC handlers

**File**: `packages/desktop/electron/main/ipc-server.ts` (modify existing)

Add a new section after the existing `// ── Session ──` block:

```typescript
// ── Claude auth ─────────────────────────────────────────────────────────

handle("praxis.auth.claude.status", async () => {
  return services.claudeAuth.status();
});

// Streaming login flow. Renderer subscribes to events.<streamId> first,
// then invokes start. Cancel via .cancel with the streamId.
handle(
  "praxis.auth.claude.login.start",
  async (_event, streamId: string) => {
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.auth.claude.login.events.${streamId}`;

    const push = (msg: IpcStreamMessage<unknown>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    try {
      const stream = services.claudeAuth.login({ signal: controller.signal });
      for await (const event of stream) {
        if (controller.signal.aborted) break;
        push({ kind: "event", payload: event });
      }
      push({ kind: "done" });
    } catch (err) {
      push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      activeAbortControllers.delete(streamId);
    }
  },
);

ipcMain.on("praxis.auth.claude.login.cancel", (_event, streamId: string) => {
  activeAbortControllers.get(streamId)?.abort();
  activeAbortControllers.delete(streamId);
});

// ── Shell helpers ───────────────────────────────────────────────────────

handle("praxis.shell.openExternal", async (_event, url: string) => {
  // Defensive URL allowlist: only http/https. Refuse file://, mailto:, etc.
  // to prevent the renderer from coaxing the main process into opening
  // arbitrary local handlers.
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("openExternal: only http(s) URLs are allowed");
  }
  const { shell } = await import("electron");
  await shell.openExternal(url);
});
```

**Implementation Notes**:
- The streaming pattern mirrors `praxis.session.send.*` exactly — same `streamId`,
  same `push()` shape, same `activeAbortControllers` map (already in scope).
- The `openExternal` allowlist exists because once the renderer can ask the main
  process to open arbitrary URIs, it can hand off to OS protocol handlers (`vscode://`,
  `file://`, etc.). We constrain to http(s) to keep blast radius minimal.

**Acceptance Criteria**:
- [ ] `praxis.auth.claude.status` invoke returns the live `ClaudeAuthStatus` from
      the CLI.
- [ ] Subscribing to `praxis.auth.claude.login.events.<id>` then invoking
      `praxis.auth.claude.login.start` with that id streams events.
- [ ] Sending `praxis.auth.claude.login.cancel` aborts the in-flight login.
- [ ] `praxis.shell.openExternal` opens https URLs and rejects non-http(s) URLs
      with a clear error message.

---

### Unit 6: Client surface

**File**: `packages/client/src/services/claude-auth-client.ts` (new)

```typescript
import type {
  ClaudeAuthLoginEvent,
  ClaudeAuthLoginOptions,
  ClaudeAuthService,
  ClaudeAuthStatus,
} from "@praxis/core/services";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.auth.claude";

export class ClaudeAuthClient implements ClaudeAuthService {
  constructor(private readonly transport: ClientTransport) {}

  status(): Promise<ClaudeAuthStatus> {
    return this.transport.invoke<ClaudeAuthStatus>(`${CHANNEL}.status`);
  }

  login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent> {
    // opts not currently transmitted — only "claudeai" is supported. When
    // we add console/sso, add an opts arg to the IPC call.
    void opts;
    return this.transport.stream<ClaudeAuthLoginEvent>(`${CHANNEL}.login`);
  }
}
```

**File**: `packages/client/src/services/shell-client.ts` (new)

```typescript
import type { ClientTransport } from "../transport/types.js";

export interface ShellClient {
  openExternal(url: string): Promise<void>;
}

export class ShellClientImpl implements ShellClient {
  constructor(private readonly transport: ClientTransport) {}
  openExternal(url: string): Promise<void> {
    return this.transport.invoke<void>("praxis.shell.openExternal", url);
  }
}
```

**File**: `packages/core/src/types/client.ts` (modify existing)

Add to the `PraxisClient` interface:

```typescript
import type { ClaudeAuthService } from "../services/index.js";

export interface PraxisClient {
  // ... existing fields ...
  claudeAuth: ClaudeAuthService;
  shell: ShellClient;       // see new export below
}

export interface ShellClient {
  openExternal(url: string): Promise<void>;
}
```

**File**: `packages/client/src/client.ts` (modify existing)

Add the new fields to the constructed object:

```typescript
return {
  // ... existing fields ...
  claudeAuth: new ClaudeAuthClient(transport),
  shell: new ShellClientImpl(transport),
};
```

**Implementation Notes**:
- `ClaudeAuthClient implements ClaudeAuthService` — same pattern as
  `LockClientImpl implements LockClient`. The interface lives in core; both the
  service impl and the renderer client implement it.
- `ShellClient` is intentionally tiny and lives in its own file so it can grow
  if we later add `openPath`, `showItemInFolder`, etc.
- Re-exports: `packages/core/src/services/index.ts` must re-export
  `ClaudeAuthService`, `ClaudeAuthStatus`, `ClaudeAuthLoginEvent`,
  `ClaudeAuthLoginOptions` so the client can import them as types.

**Acceptance Criteria**:
- [ ] `client.claudeAuth.status()` round-trips through IPC and returns the same
      shape as `services.claudeAuth.status()`.
- [ ] `for await (const ev of client.claudeAuth.login())` streams events that
      match the main-process emission order.
- [ ] `client.shell.openExternal("https://example.com")` opens the URL.
- [ ] No existing client method signatures changed.

---

### Unit 7: Auth detection helper for chat route

**File**: `packages/ui/src/lib/auth-error.ts` (new)

```typescript
/**
 * Stable prefix the engine adapter uses when sending an auth-required signal
 * up through SessionService and across IPC. The renderer's chat route matches
 * on this to decide whether to show the auth banner.
 */
const AUTH_REQUIRED_PREFIX = "claude.auth.required:";

export function isClaudeAuthRequiredError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return message.startsWith(AUTH_REQUIRED_PREFIX);
}
```

**Implementation Notes**:
- Tiny pure function. Lives in a `lib/` folder so anything can import it; no React
  dependency.
- We deliberately don't try to instanceof a custom Error class — Electron IPC
  doesn't preserve prototypes reliably across the bridge.

**Acceptance Criteria**:
- [ ] Returns `true` for `new Error("claude.auth.required: ...")`.
- [ ] Returns `true` for the bare string `"claude.auth.required: x"`.
- [ ] Returns `false` for unrelated Error messages, `null`, `undefined`, `{}`.

---

### Unit 8: ClaudeAuthModal component

**File**: `packages/ui/src/components/claude-auth-modal.tsx` (new)

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./claude-auth-modal.module.css";

export interface ClaudeAuthModalProps {
  /** Called when the user closes the modal without successful sign-in. */
  onClose: () => void;
  /**
   * Called once after a successful sign-in. The chat route uses this to
   * retry session.start.
   */
  onSignedIn: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "awaiting_url" }
  | { kind: "url"; url: string }
  | { kind: "succeeded" }
  | { kind: "failed"; message: string }
  | { kind: "canceled" };

export function ClaudeAuthModal({ onClose, onSignedIn }: ClaudeAuthModalProps) {
  const client = usePraxisClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);

  // Esc closes the modal (and cancels in-flight login).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelRef.current?.();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Ensure any active login is canceled if the component unmounts.
  useEffect(() => () => cancelRef.current?.(), []);

  const startLogin = useCallback(async () => {
    setPhase({ kind: "starting" });
    const stream = client.claudeAuth.login();
    let openedExternal = false;
    let canceled = false;
    cancelRef.current = () => {
      canceled = true;
      // The transport's AsyncIterable will receive a return() when we break;
      // the IPC layer translates that to a cancel message.
    };
    try {
      for await (const event of stream) {
        if (canceled) break;
        switch (event.kind) {
          case "started":
            setPhase({ kind: "awaiting_url" });
            break;
          case "url":
            setPhase({ kind: "url", url: event.url });
            if (!openedExternal) {
              openedExternal = true;
              client.shell.openExternal(event.url).catch(() => {
                // Non-fatal — user can click the URL in the modal.
              });
            }
            break;
          case "succeeded":
            setPhase({ kind: "succeeded" });
            onSignedIn();
            return;
          case "failed":
            setPhase({ kind: "failed", message: event.message });
            return;
          case "stdout":
          case "stderr":
            // Diagnostics only; ignore in UI.
            break;
        }
      }
      if (canceled) setPhase({ kind: "canceled" });
    } catch (err) {
      setPhase({
        kind: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cancelRef.current = null;
    }
  }, [client, onSignedIn]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Sign in to Claude</h2>

        {phase.kind === "idle" && (
          <>
            <p className={styles.body}>
              Praxis uses the <code>claude</code> CLI for the Claude Code engine.
              Sign in with your Claude.ai subscription to continue.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Cancel
              </button>
              <button type="button" onClick={startLogin} className={styles.primary}>
                Sign in with Claude.ai
              </button>
            </div>
          </>
        )}

        {(phase.kind === "starting" || phase.kind === "awaiting_url") && (
          <p className={styles.body}>Starting sign-in flow…</p>
        )}

        {phase.kind === "url" && (
          <>
            <p className={styles.body}>
              Browser opened. Complete sign-in there, then return to this window.
            </p>
            <p className={styles.urlNote}>
              If your browser didn't open, copy this URL:
            </p>
            <textarea
              className={styles.url}
              readOnly
              value={phase.url}
              onClick={(e) => e.currentTarget.select()}
            />
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase.kind === "succeeded" && (
          <p className={styles.body}>Signed in. Starting chat…</p>
        )}

        {phase.kind === "failed" && (
          <>
            <p className={styles.error}>Sign-in failed: {phase.message}</p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Close
              </button>
              <button type="button" onClick={startLogin} className={styles.primary}>
                Try again
              </button>
            </div>
          </>
        )}

        {phase.kind === "canceled" && (
          <>
            <p className={styles.body}>Sign-in canceled.</p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**File**: `packages/ui/src/components/claude-auth-modal.module.css` (new)

Mirror the structure of `unlock-modal.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  padding: 2rem;
  width: min(480px, 90vw);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}
.title {
  margin: 0 0 1rem;
  font-size: 1.15rem;
}
.body {
  margin: 0 0 1rem;
  color: var(--color-text, #1a1a1a);
}
.urlNote {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-muted, #666);
}
.url {
  width: 100%;
  min-height: 4rem;
  padding: 0.5rem;
  font-family: monospace;
  font-size: 0.8rem;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 4px;
  resize: vertical;
}
.error {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  background: rgba(220, 50, 50, 0.12);
  color: #b91c1c;
  border-radius: 4px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
.primary,
.secondary {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.primary {
  background: var(--color-primary, #2563eb);
  color: #fff;
  border-color: var(--color-primary, #2563eb);
}
.secondary {
  background: transparent;
  color: var(--color-text, #1a1a1a);
  border-color: var(--color-border, #e0e0e0);
}
```

**Implementation Notes**:
- The modal owns the login lifecycle. The chat route just opens/closes it and
  responds to `onSignedIn`.
- `cancelRef` exists because the AsyncIterable from `client.claudeAuth.login()`
  is consumed inside an `async` function the modal can't easily abort. The IPC
  transport's stream cancels when the `for await` loop breaks early. The
  `canceled` flag handles "user closed the modal mid-flow."
- We catch `client.shell.openExternal` errors silently — if `xdg-open` isn't
  available the user still has the URL to copy.

**Acceptance Criteria**:
- [ ] Initial render shows the idle phase with a "Sign in with Claude.ai" button.
- [ ] Clicking sign-in transitions through `starting → awaiting_url → url`.
- [ ] When a `url` event arrives, `client.shell.openExternal` is called once with
      that URL.
- [ ] On `succeeded`, `onSignedIn` is invoked and the modal shows the success
      message briefly before the chat route closes it.
- [ ] On `failed`, the error message is shown with a "Try again" button that
      restarts the flow.
- [ ] Pressing Escape or clicking the backdrop closes the modal AND cancels any
      in-flight login.

---

### Unit 9: Chat route auth banner integration

**File**: `packages/ui/src/routes/chat.tsx` (modify existing)

The chat route currently catches errors from `client.session.start` into a
`startError` string and renders an error banner. We extend this:

1. Detect the auth-required prefix and split it out into a separate state:
   ```typescript
   import { isClaudeAuthRequiredError } from "../lib/auth-error.js";

   const [needsAuth, setNeedsAuth] = useState(false);
   const [showAuthModal, setShowAuthModal] = useState(false);
   ```

2. In the existing session-start error handler:
   ```typescript
   } catch (err) {
     if (isClaudeAuthRequiredError(err)) {
       setNeedsAuth(true);
       setStartError(null);
     } else {
       setStartError(err instanceof Error ? err.message : String(err));
     }
   }
   ```

3. Render the auth banner when `needsAuth` is true (in place of, or alongside, the
   existing error banner):
   ```tsx
   {needsAuth && (
     <div className={styles.authBanner}>
       <span>Not signed in to Claude.</span>
       <button
         type="button"
         className={styles.authBannerButton}
         onClick={() => setShowAuthModal(true)}
       >
         Sign in
       </button>
       <button
         type="button"
         className={styles.authBannerButtonSecondary}
         onClick={() => navigate({ to: "/settings" })}
       >
         Switch engine
       </button>
     </div>
   )}
   ```

4. Render the modal when triggered:
   ```tsx
   {showAuthModal && (
     <ClaudeAuthModal
       onClose={() => setShowAuthModal(false)}
       onSignedIn={() => {
         setShowAuthModal(false);
         setNeedsAuth(false);
         retrySessionStart();   // re-runs the same start flow
       }}
     />
   )}
   ```

5. Disable the chat input area while `needsAuth` is true (matches the wireframe —
   "(chat disabled)").

**File**: `packages/ui/src/routes/chat.module.css` — append:

```css
.authBanner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  background: rgba(255, 200, 50, 0.15);
  border-top: 1px solid rgba(255, 200, 50, 0.35);
  color: var(--color-text, #1a1a1a);
  font-size: 0.9rem;
  flex-shrink: 0;
}
.authBannerButton {
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--color-primary, #2563eb);
  background: var(--color-primary, #2563eb);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
}
.authBannerButtonSecondary {
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e0e0e0);
  background: transparent;
  color: var(--color-text, #1a1a1a);
  cursor: pointer;
  font-size: 0.85rem;
}
```

**Implementation Notes**:
- `retrySessionStart` is whatever the existing component uses to call
  `client.session.start` — refactor the start logic into a `useCallback` if it
  isn't one already. Don't add new effects; reuse existing flow.
- The "Switch engine" link goes to `/settings` where the existing engine config
  form lets the user pick `direct.anthropic` or another provider.
- We keep the existing `startError` banner for non-auth errors. Both can render;
  in practice only one will be set at a time.

**Acceptance Criteria**:
- [ ] When `client.session.start` rejects with the auth-required message, the chat
      shows the auth banner, NOT the generic error banner.
- [ ] Clicking "Sign in" opens the modal; the rest of the chat is non-interactive
      while the banner is up.
- [ ] After a successful sign-in (modal `onSignedIn`), the session-start retry
      runs and the chat becomes usable without a page reload.
- [ ] Clicking "Switch engine" navigates to `/settings`.
- [ ] Existing non-auth start errors continue to render in the existing banner.

---

## Implementation Order

Resolves dependencies bottom-up:

1. **Unit 1** — SDK auth namespace (`packages/claude-cli-sdk/src/auth.ts`).
   Foundation for everything else; no other changes touch the SDK.
2. **Unit 2** — `ClaudeAuthService` + impl in core. Imports Unit 1.
3. **Unit 3** — Engine precheck in claude-code adapter. Imports Unit 1; this
   already gives any caller of `session.start` a clean error.
4. **Unit 4** — Wire `ClaudeAuthServiceImpl` into `Services` / `buildServices`.
5. **Unit 5** — IPC handlers (status + login + shell.openExternal).
6. **Unit 6** — Client classes + `PraxisClient` interface additions.
7. **Unit 7** — `isClaudeAuthRequiredError` helper.
8. **Unit 8** — `ClaudeAuthModal` component + CSS.
9. **Unit 9** — Chat route banner integration.

Stop points where a partial implementation is still useful:
- After **Unit 3**: `session.start` shows a clean "auth.required" error in the
  generic banner, even without any UI work.
- After **Unit 6**: client API exists; could be exercised by a Settings-page
  button before chat integration lands.

---

## Testing

### Unit 1 (SDK auth) — `packages/claude-cli-sdk/src/__tests__/auth.test.ts`

Tests use `child_process.spawn` mocking via the existing `cli/spawn.ts` test helper
(or use a tiny fake binary on PATH for integration coverage). Cover:

- `authStatus()` parses `{ "loggedIn": true, ... }` from stdout.
- `authStatus()` returns `{ loggedIn: false, error }` on non-zero exit, never throws
  (except `CLINotFoundError`).
- `authLogin()` yields `started → url → succeeded` for a happy-path fake child.
- `authLogin()` yields `failed` with stderr message on non-zero exit.
- `authLogin()` SIGTERMs and stops yielding when the AbortSignal fires.
- URL extraction matches the first https URL in stdout.

### Unit 2 (ClaudeAuthService) — `packages/core/src/services/__tests__/claude-auth.test.ts`

- `status()` returns the SDK's value verbatim.
- `login()` forwards every event without modification.
- Logger is called with `claudeAuth.status` and `claudeAuth.login.*` codes.

Inject a fake SDK via module mocking (vitest `vi.mock`) since the service has no
DI seam for the SDK functions.

### Unit 3 (Engine precheck) — extend `packages/engines/src/__tests__/claude-code.test.ts`

- When `authStatus` mock returns `loggedIn: true`, `open()` proceeds and constructs
  the session as today. (Existing tests should still pass once they mock auth.)
- When `authStatus` mock returns `loggedIn: false`, `open()` rejects with an Error
  whose message starts with `claude.auth.required:` and the tool bridge is never
  spawned (verify by spy on `startToolBridge`).
- When `authStatus` mock throws `CLINotFoundError`, `open()` rejects with that
  same error.

### Unit 5 (IPC handlers) — `packages/desktop/electron/__tests__/ipc-server-auth.test.ts`

- Stub `services.claudeAuth` with a fake; verify the three new handlers call into
  it correctly and translate streaming events through `IpcStreamMessage`.
- `praxis.shell.openExternal` rejects `file:///etc/passwd` and accepts `https://x`.
  Mock the `electron` module's `shell.openExternal`.

### Unit 6 (Client) — `packages/client/src/__tests__/claude-auth-client.test.ts`

- `client.claudeAuth.status()` invokes `praxis.auth.claude.status`.
- `client.claudeAuth.login()` calls `transport.stream("praxis.auth.claude.login")`.
- `client.shell.openExternal(url)` invokes `praxis.shell.openExternal` with the URL.

Reuse the existing `recordingTransport` helper (visible in `client.test.ts`).

### Unit 7 (auth-error helper) — `packages/ui/src/__tests__/auth-error.test.ts`

- True/false matrix for the prefix detector.

### Unit 8 (ClaudeAuthModal) — `packages/ui/src/__tests__/claude-auth-modal.test.tsx`

Use React Testing Library and a fake client.

- Renders idle phase initially.
- "Sign in" button triggers `client.claudeAuth.login()` and steps through phases.
- `client.shell.openExternal` is called exactly once with the URL from the first
  `url` event.
- `succeeded` event → `onSignedIn` is called.
- `failed` event → error UI with retry button; clicking retry restarts the flow.
- Escape key calls `onClose` and the iterator's `return()` (verify via fake
  iterator instrumentation).

### Unit 9 (Chat route) — extend `packages/ui/src/__tests__/chat-route.test.tsx`

- When `client.session.start` rejects with `Error("claude.auth.required: x")`, the
  auth banner renders (not the generic error banner).
- Clicking "Sign in" mounts the modal.
- After the modal calls `onSignedIn`, `client.session.start` is called again.

---

## Verification Checklist

Run from repo root:

```bash
pnpm --filter @praxis/claude-cli-sdk test
pnpm --filter @praxis/core test
pnpm --filter @praxis/engines test
pnpm --filter @praxis/client test
pnpm --filter @praxis/ui test
pnpm --filter @praxis/desktop test
pnpm typecheck
pnpm lint
```

Manual smoke (after Unit 9):

1. With a logged-in CLI: `pnpm dev` → open chat → session starts as before.
2. `claude auth logout` in another terminal → reload chat → auth banner appears.
3. Click "Sign in" → modal shows → URL appears → browser opens to claude.ai.
4. Complete sign-in in browser → modal shows "Signed in" → chat becomes usable.
5. `claude auth logout` again → reload chat → banner appears → click "Switch
   engine" → settings route opens.
6. Cancel mid-login (close modal during URL phase) → no orphaned `claude` process
   (`pgrep claude` should be empty after a few seconds).

---

## Risks and Open Questions

1. **CLI output format drift**: `claude auth login` stdout is not a stability
   contract. URL regex is tolerant (any https URL); if Anthropic changes the prompt,
   we still emit `stdout`/`stderr` events that surface in logs. Modal degrades to
   "click here to copy URL" if the URL parser fails — but the user might not see a
   URL at all if the CLI changes radically. Mitigation: log raw stdout/stderr at
   debug level so support can diagnose.

2. **Browser auto-launch from CLI**: `claude auth login` likely already invokes
   `xdg-open`/`open`. Calling `shell.openExternal` again means two browser tabs.
   Acceptable for v1 — the second tab is annoying but harmless. If user reports
   complain, add an opt-out: parse stderr for "Opening browser..." and skip our
   own `openExternal`.

3. **`shell.openExternal` allowlist**: We allow only http(s). If a future CLI
   version emits a `claude://` callback URL, we'd block it. Worth revisiting if
   that happens; for now restrictive is safer.

4. **Concurrency**: If the user clicks "Sign in" twice, two streams start. The
   modal's `cancelRef` only tracks the latest. Acceptable — both streams race the
   same CLI lock; whichever completes first wins. Not worth designing around.
