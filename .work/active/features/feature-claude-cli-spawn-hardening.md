---
id: feature-claude-cli-spawn-hardening
kind: feature
stage: implementing
tags: [security, engines, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Claude CLI spawn hardening: MCP scope leak + orphan subprocess cleanup

## Brief
Two bugs surfaced from forensics on a dangling Praxis-spawned `claude` CLI subprocess tree (2026-05-24, after a desktop-app shutdown): the drafter CLI was still alive 46 minutes after its parent died, AND it had `krometrail` (a user-level MCP server from `~/.claude/settings.json`) running as a child despite Praxis only registering its own first-party tools via `--mcp-config` and passing `--tools ""`. Two distinct fixes on the same spawn site (`@praxis/claude-cli-sdk` + the Claude Code engine adapter), best worked together.

## Children (both kind:story, tags:[bug], /agile-workflow:fix entry point)
1. **`story-fix-claude-cli-mcp-user-leak`** — MCP scope leak. The spawned CLI inherits user-level MCP servers from the user's `~/.claude/` config instead of being hard-limited to the `--mcp-config` we pass. Investigate whether the CLI honors a "no user config" flag (`--config-file <ours>` exclusive, `CLAUDE_CONFIG_PATH` env override, or similar) and pin it in `@praxis/claude-cli-sdk`'s spawn. Security concern: user MCP tools accessible to Praxis agents wasn't part of the user's opt-in when they ran the app.
2. **`story-fix-claude-cli-orphan-subprocess-cleanup`** — orphan subprocess cleanup. Subprocess trees survive parent (desktop) death — orphaned drafter trees keep running, calling tools against an MCP worker connected to nothing, burning resources and (with the MCP leak above) accessing tools without the parent app to gate them. Use process-group handling (`setsid` on spawn + group-kill on parent shutdown / engine session close) so closing the desktop tears the subprocess tree down cleanly.

Children are independent and can be worked in either order, but landing them together is sensible since they share the spawn site.

## Source idea
`idea-claude-cli-mcp-user-leak` (parked 2026-05-24).
