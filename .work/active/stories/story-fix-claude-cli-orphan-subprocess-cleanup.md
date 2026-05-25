---
id: story-fix-claude-cli-orphan-subprocess-cleanup
kind: story
stage: review
tags: [bug, engines]
parent: feature-claude-cli-spawn-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Fix: Praxis-spawned CLI subprocess trees survive parent (desktop) death

## Symptom
On 2026-05-24, after wiping local dev state and inspecting running processes, found a Praxis-spawned `claude` CLI (PID 343076) still alive 46 minutes after the desktop app had exited. The CLI's PPID was 1787 (systemd --user) — meaning it had been re-parented to init when the original Praxis main process died. Its child tree included an electron MCP worker (`/tmp/claude-sdk-tools-<id>/mcp-worker.mjs`), ~45 electron zygote/network/renderer descendants, and a `krometrail` MCP server. The drafter was still calling `document.outline` tools against the MCP bridge connected to a dead parent, burning CPU and (compounded with `story-fix-claude-cli-mcp-user-leak`) accessing user MCP tools without the parent app gating them.

## Expected behavior
When the desktop app exits (graceful shutdown OR crash), its spawned CLI subprocess trees terminate too. No orphaned drafters / teach sessions / course-create agents continuing to execute after the user has closed Praxis.

## Fix approach
Process-group handling at the spawn site:
1. **`setsid` on spawn** (or equivalent on Windows) so the CLI subprocess gets its own process group, separable from the desktop's group.
2. **Group-kill on parent shutdown** — register a handler on the desktop main process's `before-quit` / `will-quit` (Electron app lifecycle) and on engine-session close (`EngineSession.close()` per the engine-session-lifecycle pattern) that SIGTERMs the spawned CLI's process group (`kill(-pgid, SIGTERM)`), then SIGKILLs anything still alive after a short grace period.
3. **Crash-survival cleanup** — if the desktop crashes without running shutdown handlers, the children are still orphaned. Mitigations: write the spawned PIDs to a sweep-on-startup file (`.praxis/spawned-pids.json`) so the next desktop launch kills survivors, OR have the CLI subprocess periodically check that its original parent is still alive and self-terminate when not (most robust, no startup sweep needed).

Option 3's "self-terminate when parent dies" is the cleanest fix — the CLI doesn't need to know about Electron lifecycle, just `getppid() === 1` (Linux) / equivalent. Investigate whether the Claude Code CLI exposes a flag for this (`--kill-on-parent-death`?) or whether we need to wrap the spawn in a thin shim that watches PPID.

## Affected files
- `packages/claude-cli-sdk/src/cli/spawn.ts` (or equivalent — the spawn call site)
- Likely a new helper for process-group handling cross-platform
- `packages/engines/src/claude-code/` — engine adapter lifecycle hooks
- `packages/desktop/electron/main/index.ts` (or wherever app lifecycle handlers live) — wire `before-quit` to engine cleanup

## Entry point
`/agile-workflow:fix` — verifiable bug (reproducible by spawning a Praxis session, then killing the desktop process and observing the CLI survives), clear desired behavior, scoped to the spawn lifecycle.

## Source idea
`idea-claude-cli-mcp-user-leak` (parked 2026-05-24) — same source idea as the MCP-leak sibling; split here because the fixes are independent.

## Implementation discovery (2026-05-25)

**Finding**: The Claude Code CLI (v2.1.150) has no `--kill-on-parent-death` flag. The subprocess must be killed explicitly.

**Approach chosen** (all three layers implemented):

1. **New process group on spawn** (`packages/claude-cli-sdk/src/cli/spawn.ts`): Added `detached: true` to `spawn()` options — on POSIX this puts the CLI in a new session/process group. No `proc.unref()` because we actively read stdout/stderr.

2. **Group-kill in `close()`** (`packages/claude-cli-sdk/src/conversation.ts`): The `close()` function now calls `killProcessGroup(pid)` (POSIX) or `proc.kill("SIGTERM")` (Windows) instead of just `proc.kill("SIGTERM")`. `killProcessGroup` sends SIGTERM to `-pgid` (the whole group: CLI + MCP workers + any descendants), then schedules a SIGKILL after 3s for lingerers. Same pattern applied to the abort handler in `ensureProcess()`.

3. **Crash-survival PID registry** (`packages/desktop/electron/main/spawned-pid-registry.ts`): New module that persists spawned PIDs to `<dataDir>/spawned-pids.json`. On next startup, `sweepOrphanedPids()` reads the file, SIGTERMs any still-alive PIDs, and deletes the file. On clean shutdown, `clear()` removes the file.

**Why not PPID-watch shim**: Would require wrapping the spawn in a shim process or injecting code into the CLI subprocess, neither of which is feasible without cooperation from the CLI binary. The PID-file sweep approach achieves the same goal at startup cost (file read + N kill(0) probes) without complicating the spawn path.

**PID registry threading**: The registry callbacks (`onProcessSpawned`, `onProcessExited`) flow through:
- `ConversationOptions.onProcessSpawned / onProcessExited` (new fields in `@praxis/claude-cli-sdk`)
- `ClaudeCodeEngineOptions.onProcessSpawned / onProcessExited` (new fields in engines adapter)
- `CreateEngineInput` (factory updated to pass them through to `ClaudeCodeEngine`)
- `ServiceDeps.onEngineProcessSpawned / onEngineProcessExited` (new fields in core types)
- `EngineSessionManagerDeps` (picks them up from `ServiceDeps`)
- `EngineSessionManager.openActive()` (threads them to the default `createEngine` factory)
- `buildServices()` in `@praxis/desktop` (creates the registry, passes callbacks to `ServiceDeps` and `buildArtifactsServices`)

**Manual verification recipe**: To verify orphan cleanup works:
1. Start the Praxis desktop app and open a teach session.
2. Note the CLI PID via `pgrep -a claude` while it's running.
3. Kill the desktop process with `kill -9 <electron-pid>`.
4. On the next launch, check `~/.config/Praxis/spawned-pids.json` was swept (file absent or empty) and `pgrep claude` shows no surviving CLI processes from step 2.

**Windows note**: `detached: true` on Windows creates a new console group (not a POSIX session). Group-kill via `kill(-pgid, SIGTERM)` is gated on `os.platform() !== "win32"`. Windows falls back to `proc.kill("SIGTERM")` for the direct process only. The PID registry sweep is also a no-op on Windows. Full Windows support is a follow-up.

## Implementation notes (2026-05-25)

- `packages/claude-cli-sdk/src/cli/spawn.ts`: Added `detached: true` to spawn options; exported `killProcessGroup(pgid, graceMs)` helper.
- `packages/claude-cli-sdk/src/cli/index.ts`: Exported `killProcessGroup`.
- `packages/claude-cli-sdk/src/conversation.ts`: Imported `os` and `killProcessGroup`; updated `close()` and the abort handler in `ensureProcess()` to group-kill on POSIX; fires `onProcessExited` callback from `proc.on("close", ...)`.
- `packages/claude-cli-sdk/src/types/options.ts`: Added `onProcessSpawned?: (pid: number) => void` and `onProcessExited?: (pid: number) => void` to `ConversationOptions`.
- `packages/engines/src/claude-code/adapter.ts`: Added `onProcessSpawned?` and `onProcessExited?` to `ClaudeCodeEngineOptions`; threads them to `createConversation()`.
- `packages/engines/src/factory.ts`: Added optional `onProcessSpawned` / `onProcessExited` to `CreateEngineInput`; passes them to `ClaudeCodeEngine` constructor.
- `packages/core/src/services/types.ts`: Added `onEngineProcessSpawned?` / `onEngineProcessExited?` to `ServiceDeps`.
- `packages/core/src/services/session/engine-session-manager.ts`: Picked up the two new fields from `ServiceDeps`; threads them into the default `createEngine` factory call.
- `packages/core/src/services/session-service.ts`: Passes `onEngineProcessSpawned` / `onEngineProcessExited` through to `EngineSessionManager`.
- `packages/desktop/electron/main/spawned-pid-registry.ts`: New file — `sweepOrphanedPids()` (startup sweep) + `createSpawnedPidRegistry()` (runtime register/deregister).
- `packages/desktop/electron/main/services.ts`: Creates `pidRegistry`; derives `dataDir = dirname(dbPath)`; passes PID callbacks to `buildArtifactsServices` and `ServiceDeps`. Exposes `pidRegistry` on `Services`.
- `packages/desktop/electron/main/services/build-artifacts-services.ts`: Added `onProcessSpawned?` / `onProcessExited?` to `ArtifactsServiceDeps`; threads them into engine resolvers.
- `packages/desktop/electron/main/index.ts`: Calls `sweepOrphanedPids()` in `bootstrap()` before `buildServices()`; calls `services.pidRegistry.clear()` in the `before-quit` handler after sessions are closed.
- `packages/claude-cli-sdk/src/cli/__tests__/spawn-hardening.test.ts`: New test file — 7 tests covering `detached:true`, `killProcessGroup` (POSIX SIGTERM+SIGKILL, ESRCH swallow, Windows no-op), and `--strict-mcp-config` flag emission.
- `packages/engines/src/__tests__/claude-code.test.ts`: Added 2 regression tests — `strictMcpConfig: true` assertion and PID callback threading assertion.

## Implementation notes + Review (2026-05-25)

Bundled commit `6467e020`. Three-layer defense:
1. **Detached spawn** in `spawn.ts` — CLI subprocess becomes its own process-group leader (POSIX); new `killProcessGroup(pgid, graceMs)` helper sends SIGTERM to `-pgid` then SIGKILL after 3s
2. **Group-kill on close/abort** in `conversation.ts` — `Conversation.close()` + abort handler use `killProcessGroup(pid)` so MCP workers + electron descendants die with the CLI root
3. **Crash-survival PID registry** (NEW `spawned-pid-registry.ts`) — persists PIDs to `<dataDir>/spawned-pids.json`; `sweepOrphanedPids()` runs at desktop startup to SIGTERM survivors from prior crashes; `pidRegistry.clear()` on `before-quit`

Onspawn/onexit PID callbacks threaded through full stack: `ConversationOptions` → `ClaudeCodeEngineOptions` → `CreateEngineInput` → `ServiceDeps` → `EngineSessionManager.openActive()` → all 3 desktop resolver paths.

7 new spawn-hardening tests + 2 regression tests. 5375 total tests pass.

**Verdict**: Approve — robust three-layer defense matches the design's "graceful + crash-survival" intent.
