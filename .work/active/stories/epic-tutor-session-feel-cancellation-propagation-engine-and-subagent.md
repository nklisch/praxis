---
id: epic-tutor-session-feel-cancellation-propagation-engine-and-subagent
kind: story
stage: implementing
tags: [engines, tools, core]
parent: epic-tutor-session-feel-cancellation-propagation
depends_on: [epic-tutor-session-feel-cancellation-propagation-core-plumbing]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Story 2: Engine + sub-agent propagation

## Scope

Make every engine adapter supply the per-turn `signal` to
`registry.dispatch`. Thread the signal through every sub-agent entry
(`runConceptExplorer`, `grade_with_rubric`, any other). Wire
`SubAgentRegistry.interruptAllForSession` so in-flight sub-agent items
visibly transition to `interrupted` on parent abort. After this story,
clicking Stop actually stops sub-agents end-to-end.

## Units

- Unit 3 (three engine adapters thread signal into their dispatch
  sites; instance-field-or-closure pattern depending on adapter shape):
  - `packages/engines/src/claude-code/` (MCP bridge or tool-call
    handler)
  - `packages/engines/src/codex/adapter.ts`
  - `packages/engines/src/direct/adapter.ts`
- Unit 4 (`runConceptExplorer` accepts and propagates signal; adds
  `"interrupted"` to `reason`).
- Unit 5 (`course.start_exploration` handler passes `ctx.signal` to
  `runConceptExplorer`).
- Unit 6 (`grade_with_rubric` and other sub-agent tools threading
  signal — find via `grep -r "runConceptExplorer\|engine\.open" packages/tools/`).
- Unit 7 (`SubAgentRegistry.interruptAllForSession` method +
  `SessionServiceImpl.send` calls it at the existing
  `signal?.aborted` short-circuit).
- Unit 8 remainder (engine + explorer + sub-agent abort tests).

## Acceptance Criteria

- [ ] All three engine adapters supply `signal` to `registry.dispatch`
      when invoking a tool during a streaming turn.
- [ ] Aborting a turn that's mid-`course.start_exploration` causes
      `runConceptExplorer` to return `{ ok: false, reason:
      "interrupted" }`.
- [ ] On parent abort, `SubAgentRegistry` items for that session
      transition from `running` → `interrupted` and emit a final
      event to listeners.
- [ ] Manual smoke: click Stop during a bootstrap exploration. The
      sub-agent stops within ~1s (no further tool calls observed in
      the rail / chat).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope

- Per-tool eager-bail polish (handlers that check `signal.aborted`
  inside long loops). Best-effort; not blocking.
