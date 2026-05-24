---
id: feature-refactor-engine-adapter-shared-helpers
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract shared helpers across engine adapters (Claude Code / Codex / Direct)

## Brief
The three engine adapters under `packages/engines/src/{claude-code,codex,direct}/`
re-implement the same scaffolding in parallel. Discovery surfaced four discrete
duplications worth lifting into shared helpers. Each is small and surgical on its own;
grouped here as a cluster to track them under one umbrella.

The four duplications, each emitted as a child story:
1. **Vision temp-dir + image-write boilerplate** — `ClaudeCodeVision` and `CodexVision`
   share verbatim setup of a temp dir, ext-mapping, file writes, and `finally` cleanup.
2. **Mutable signal-threading ref** — Claude Code and Codex both maintain a
   `currentSignal` ref + getter closure passed to tool handlers, cleared in `finally`.
3. **`close()` bridge teardown** — Claude Code and Codex both have identical
   error-tolerant bridge close logic.
4. **Mapper-state naming inconsistency** — Claude Code's `ClaudeCodeEventState` /
   `createEventState` and Codex's `MapState` / `newMapState` solve the same problem
   (tool-call UUID → sequential callId tracking) with different names.

None of these alone would justify a feature, but as a cluster they're the same kind of
hygiene work in the same area.

## Constraints
- The engine contract (`Engine`, `EngineSession`, `EngineEvent`) stays unchanged.
- The Claude Code permission-mode invariant (see CLAUDE.md — `resolvePermissionMode`
  default + MCP bridge wiring) must not be disturbed; any shared helper around bridge
  lifecycle must preserve the load-bearing default.
- `@praxis/engines` may not import any other `@praxis/*` package at runtime — the
  shared helpers live inside `packages/engines/src/`.

## Discovery evidence
See the four child stories for verified file:line evidence.

## Children
- `feature-refactor-engine-adapter-shared-helpers-vision-temp-dir`
- `feature-refactor-engine-adapter-shared-helpers-signal-threader`
- `feature-refactor-engine-adapter-shared-helpers-close-bridge`
- `feature-refactor-engine-adapter-shared-helpers-mapper-state-naming`

## Next
Each child story is at `stage: implementing` and can be drained independently — no
intra-cluster `depends_on` chains. Drain via
`/agile-workflow:implement-orchestrator feature-refactor-engine-adapter-shared-helpers`.
