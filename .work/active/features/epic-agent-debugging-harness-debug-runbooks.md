---
id: epic-agent-debugging-harness-debug-runbooks
kind: feature
stage: drafting
tags: [docs]
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-failure-replay, epic-agent-debugging-harness-student-simulation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Debug Runbooks

## Brief

Make the debugging harness usable by future coding agents and humans through concise runbooks, report formats, and command/workflow entry points. The goal is that a failure can be captured, replayed or inspected, summarized, and converted into a high-quality substrate item without relying on chat history or manual log archaeology.

This feature should document how to diagnose common agent-harness failures: tool-call leaks, tool dispatch errors, sub-agent stalls, IPC stream failures, UI render crashes, cancellation bugs, and synthetic student scenario failures. It should define the agent-facing output shape for "here is what failed, here is the evidence, here is the likely owner, here are the reproduction steps."

This feature does not add new trace capture, replay, or simulation primitives. It depends on those features so the documentation and reports describe the system that actually exists.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: final integration/documentation feature - consumes the bundle/replay and simulation capabilities.

## Foundation references

- `CLAUDE.md` - common commands, test rules, and agent workflow conventions.
- `.agents/rules/agile-workflow.md` - test integrity and bug filing rules.
- `.work/CONVENTIONS.md` - tag taxonomy, release mapping, and item frontmatter rules.
- `docs/ARCHITECTURE.md` - current agent harness and transport architecture.
