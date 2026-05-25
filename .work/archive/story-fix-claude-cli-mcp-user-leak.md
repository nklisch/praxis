---
id: story-fix-claude-cli-mcp-user-leak
kind: story
stage: done
tags: [bug, security, engines]
parent: feature-claude-cli-spawn-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
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

## Implementation discovery (2026-05-25)

**Finding**: The Claude Code CLI (v2.1.150) has `--strict-mcp-config` which does exactly what we need: "Only use MCP servers from --mcp-config, ignoring all other MCP configurations". This is already surfaced in `@praxis/claude-cli-sdk` as the `strictMcpConfig: boolean` option on `OptionsBase`, and `buildCommonArgs` already emits the flag when `strictMcpConfig: true` is passed.

**Fix**: One-line change in `packages/engines/src/claude-code/adapter.ts` — add `strictMcpConfig: true` to the `createConversation()` call. This is emitted alongside our `--mcp-config <tmp-file>` and makes the two flags work together: the config file defines exactly which MCP servers are available, and `--strict-mcp-config` prevents the CLI from merging in user-level servers from `~/.claude/settings.json`.

**Why not HOME sandbox**: The `--strict-mcp-config` approach is cleaner — no env override needed, no risk of side-effects from changing the home directory, and it's the officially documented flag for this exact use case.

## Implementation notes (2026-05-25)

- `packages/engines/src/claude-code/adapter.ts`: Added `strictMcpConfig: true` to the `createConversation()` call (11 lines of comment + 1 line of code). See the comment block explaining the security rationale.
- `packages/engines/src/__tests__/claude-code.test.ts`: Added regression test `"open() passes strictMcpConfig: true to prevent the CLI from loading user-level MCP servers"` which asserts `sdkOpts?.strictMcpConfig === true`.
- `packages/claude-cli-sdk/src/cli/__tests__/spawn-hardening.test.ts`: Added `buildConversationArgs — --strict-mcp-config` describe block with 3 tests covering the emission and non-emission cases.

## Implementation notes + Review (2026-05-25)

Bundled commit `6467e020`. Discovered `strictMcpConfig: true` flag already exists in SDK + CLI 2.1.150+ — clean one-line fix in `packages/engines/src/claude-code/adapter.ts`. Maps to CLI's `--strict-mcp-config` flag which instructs the CLI to use ONLY servers from `--mcp-config`, ignoring user-level `~/.claude/settings.json` MCP entries. No HOME sandboxing or workaround needed.

**Verdict**: Approve — minimal, correct fix using upstream-supported flag.
