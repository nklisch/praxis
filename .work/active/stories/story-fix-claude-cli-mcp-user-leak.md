---
id: story-fix-claude-cli-mcp-user-leak
kind: story
stage: implementing
tags: [bug, security, engines]
parent: feature-claude-cli-spawn-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Fix: Praxis-spawned claude CLI inherits user-level MCP servers despite explicit tool restrictions

## Symptom
On 2026-05-24, inspecting a dangling Praxis-spawned `claude` CLI subprocess (the course-create drafter, PID 343076), `pstree` showed the user's `krometrail` MCP server running as a child process of the drafter — despite Praxis passing `--tools ""` (empty allowlist) and `--mcp-config /tmp/claude-mcp-<id>/config.json` (our own MCP config with only first-party Praxis tools registered through the MCP bridge). The CLI is silently loading user-level MCP servers from `~/.claude/settings.json` (or equivalent user config path) in addition to our explicit `--mcp-config`.

## Expected behavior
The spawned CLI's tool surface is hard-limited to exactly what Praxis passes via `--mcp-config`. No user-level MCP loading. The user opted into Praxis tools when they ran the app; they did NOT opt into giving Praxis agents access to whatever MCP servers they have configured for their personal Claude Code workflow.

## Diagnosis approach
1. Read the Claude Code CLI's behavior for `--mcp-config` — does it MERGE with user config (current behavior) or REPLACE it? Check the SDK docs / source (the CLI is the binary `claude` from Anthropic; `@praxis/claude-cli-sdk` wraps the subprocess).
2. Look for a "no user config" / "exclusive config" flag — possibilities: `--mcp-config-mode=replace`, `--no-user-config`, `CLAUDE_CONFIG_PATH` env override, `--config-file <ours>`, or similar.
3. If no such flag exists, options:
   - Set `HOME` (or `CLAUDE_CONFIG_HOME`) to a sandboxed dir during spawn so the CLI finds no user MCP config to load.
   - Pre-pend our MCP config in a way that overrides user entries by name.
   - File an upstream feature request.

## Affected files
- `packages/claude-cli-sdk/src/cli/args.ts` (spawn args — same area as `resolvePermissionMode`)
- Wherever Praxis spawns the CLI in `packages/engines/src/claude-code/` (the adapter)
- Possibly the MCP bridge that builds `--mcp-config`

## Entry point
`/agile-workflow:fix` — verifiable bug (reproducible by spawning a Praxis session and inspecting `pstree` of the resulting CLI subprocess), clear desired behavior, scoped to the spawn path.

## Source idea
`idea-claude-cli-mcp-user-leak` (parked 2026-05-24).
