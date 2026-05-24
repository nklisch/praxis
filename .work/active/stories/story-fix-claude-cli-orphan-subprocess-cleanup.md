---
id: story-fix-claude-cli-orphan-subprocess-cleanup
kind: story
stage: implementing
tags: [bug, engines]
parent: feature-claude-cli-spawn-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
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
