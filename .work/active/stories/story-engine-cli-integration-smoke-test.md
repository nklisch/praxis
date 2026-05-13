---
id: story-engine-cli-integration-smoke-test
kind: story
stage: review
tags: [testing, engine]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-13
---

# Engine CLI integration smoke test (gated)

## Brief

The unit tests for `ClaudeCodeEngine`
(`packages/engines/src/__tests__/claude-code.test.ts`) all mock
`createConversation`, so they verify the SDK-call shape but never exercise the
real `claude` CLI. That gap left `story-fix-block-claude-code-builtins-from-tutor`
shipping on faith that `--tools ""` and `--mcp-config <path>` (the SDK-level
encoding of `tools: "none"` and `mcpServers`, respectively — see
`packages/claude-cli-sdk/src/cli/args.ts:87` and `:196`) remain orthogonal in
every CLI version we run against.

The flags are clearly independent at the SDK layer; the risk is a CLI behavior
change where `--tools ""` is interpreted to also strip MCP tools. That
regression would silently zero out the tutor's entire toolset and is the kind
of failure that's invisible in unit tests but catastrophic in a release.

Add a `PRAXIS_RUN_SLOW_TESTS=1`-gated integration test (mirroring the
slow-test-gating pattern at `.claude/skills/patterns/slow-test-gating.md`) that:

- Opens a real `ClaudeCodeEngine` against the installed `claude` CLI.
- Registers a trivial echo tool through the MCP bridge.
- Sends a turn that should drive the model to call the echo tool.
- Asserts the model successfully invoked the tool and got the expected result.

This catches the specific `--tools ""` × MCP interaction regression and acts as
a tripwire for any future engine-level SDK regression at the right level. The
test is gated because it requires the real `claude` CLI, real auth, and burns
a turn — same tradeoff as the Pyodide-gated tests.

Origin: `.work/backlog/idea-engine-cli-integration-smoke-test.md`.

## Implementation Notes

**File**: `packages/engines/src/__tests__/claude-code-cli-integration.test.ts`

Mirrors the `slow-test-gating` pattern exactly: `describe.skipIf(!runSlowTests)(...)` with `{ timeout: 60_000 }`. The 60 s timeout is more conservative than the Pyodide gate (120 s) — one real model turn with a haiku model typically completes in <15 s.

**Construction approach**: `ClaudeCodeEngine` is constructed directly with a minimal logger and a real `ToolRegistry` (not mocked). `engine.open()` → `session.send()` → assert events. `beforeAll`/`afterAll` open/close the shared session to pay the bridge startup cost once for the suite.

**Echo tool registry**: One tool `test.echo` with a simple JSON Schema; dispatch echoes `input.message` verbatim as `{ echoed: message }`. The system prompt instructs haiku to call the tool without elaboration.

**Assertions**:
1. A `tool_call` event with `toolName === "test.echo"` was emitted — proves `--tools ""` did NOT strip MCP tools.
2. A `tool_result` event with `result.ok === true` and `result.value.echoed === "hello from integration test"` was emitted — proves the MCP bridge routed the call correctly and returned the result.
3. At least one `model_message` or `final` event exists — proves the turn completed normally.

**Lint**: The biome `noNonNullAssertion` rule flagged `session!.send(...)`. Replaced with an explicit guard: `if (!session) throw new Error(...)` followed by `session.send(...)`.

**Pre-existing failures**: `pnpm test` shows one failing test in `@praxis/curriculum` (`import-service.test.ts` — missing `@praxis/core/services/bootstrap-service` specifier). This is unrelated to this story and was failing before these changes. All 108 tests in `@praxis/engines` pass.
