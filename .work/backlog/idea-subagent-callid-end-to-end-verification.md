---
id: idea-subagent-callid-end-to-end-verification
kind: idea
stage: backlog
tags: [testing, engine, transparency]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Verify SubAgent callId agreement end-to-end (Claude Code adapter)

## Observation

Surfaced during re-review of `feature-agent-transparency-ux-subagent-channel`
(commit `17c1421`):

The bridge fix at `packages/engines/src/mcp/tool-bridge.ts` surfaces the SDK's
`callCounter` value (`"1"`, `"2"`, …) as `meta.callId` and forwards it to
`registry.dispatch`. The cross-channel test in `tool-bridge.test.ts:160-289`
asserts the bridge forwards what it's given, but it does NOT independently
exercise the Claude Code adapter's `tool_use` → `tool_call` event mapping
(`packages/engines/src/claude-code/events.ts:47`) to confirm the same value
reaches both channels for the same call.

In Claude's actual wire protocol, `tool_use` content blocks carry a
Claude-generated UUID (e.g., `"toolu_01..."`), which is what `parser.ts:112`
reads as `event.toolId`. If Claude's `tool_use_id` does not equal the worker's
`callCounter` in production traffic, the UI subscription in the upcoming
`subagent-ui` work will subscribe by `parentCallId = "toolu_01..."` while the
registry stores under `parentCallId = "1"|"2"|...` — subscription delivers
nothing.

## Direction

Either:
1. **Fixture-based end-to-end test**: capture a real Claude Code stream
   showing the `tool_use` event AND the corresponding MCP callback's
   `meta.callId`. Assert they agree. If they don't agree, this idea promotes
   into a story for the adapter-side translation map (option B below).
2. **Adapter-side translation map**: in `packages/engines/src/claude-code/events.ts`'s
   `tool_use` case, maintain a `claudeToolUseId → bridgeWorkerCallId` map
   (populated when the bridge sees the call) and translate `event.toolId`
   before emitting `tool_call`. This requires plumbing between the parent SDK
   process and the worker process to expose the mapping.
3. **Surface Claude's `tool_use_id` to the bridge**: modify the SDK so that
   the worker's `msg.id` carries Claude's `tool_use_id` instead of the local
   `callCounter`. Requires understanding whether MCP's CallToolRequest can
   carry that metadata.

This is implementation-level work — when it's picked up, the implementer
should first do the fixture-based investigation (option 1) to confirm
whether the problem actually exists in production traffic. If it doesn't,
close the idea with a note. If it does, pick between options 2 and 3.

## Out of scope

- The subagent-ui story (depends_on: subagent-channel) is the natural place
  to surface the bug in practice. If it works end-to-end with no extra
  plumbing, this idea closes as resolved.
- The bridge-side fix landed in `17c1421` is a strict improvement over the
  prior random-uuid behavior regardless of this question. Don't undo it.
