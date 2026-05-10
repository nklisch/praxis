---
id: idea-engine-cli-integration-smoke-test
created: 2026-05-10
tags: [testing, engine]
---

The unit tests for `ClaudeCodeEngine` (`packages/engines/src/__tests__/claude-code.test.ts`)
all mock `createConversation`, so they verify the SDK-call shape but never
exercise the real `claude` CLI. That gap left `story-fix-block-claude-code-builtins-from-tutor`
shipping on faith that `--tools ""` and `--mcp-config <path>` (the SDK-level
encoding of `tools: "none"` and `mcpServers`, respectively — see
`packages/claude-cli-sdk/src/cli/args.ts:87` and `:196`) remain orthogonal in
every CLI version we run against. The flags are clearly independent at the SDK
layer; the risk is a CLI behavior change where `--tools ""` is interpreted to
also strip MCP tools. That regression would silently zero out the tutor's
entire toolset and is the kind of failure that's invisible in unit tests but
catastrophic in a release. A `PRAXIS_RUN_SLOW_TESTS=1`-gated integration test
(mirroring the Pyodide gating pattern in
`.claude/skills/patterns/slow-test-gating.md`) that opens a real
`ClaudeCodeEngine`, registers a trivial echo tool through the MCP bridge, and
verifies the model can call it would catch this — and any future engine-level
SDK regression — at the right level.
