---
id: idea-claude-cli-mcp-user-leak
created: 2026-05-24
tags: [security, engines, bug]
---

The Praxis-spawned Claude Code CLI subprocess (drafter, teach sessions, etc.) inherits the user's user-level MCP servers from `~/.claude/settings.json` (or equivalent) in addition to the Praxis-specific MCP config we pass via `--mcp-config /tmp/claude-mcp-<id>/config.json`. Confirmed on 2026-05-24 by inspecting a dangling drafter subprocess tree (parent dead, child alive after the desktop app exited): the drafter CLI had `krometrail` (the user's Chrome-debugger MCP) running as a child process, despite Praxis only registering its own first-party tools via the MCP bridge and passing `--tools ""`. Ideally the parameters Praxis passes to `claude` should hard-limit the tool surface to exactly what we provide — no user-level MCP, no inherited config. Investigate whether the Claude Code CLI honors a "do not load user config" flag (e.g. `--config-file <ours>` exclusive, or `CLAUDE_CONFIG_PATH` env override) and pin that in `@praxis/claude-cli-sdk`'s spawn. Also: dangling subprocesses survive parent death — orphaned drafter trees keep running, calling tools against an MCP worker connected to nothing. Consider process-group handling (`setsid` + group kill on close) so closing the desktop app actually tears the subprocess tree down.
