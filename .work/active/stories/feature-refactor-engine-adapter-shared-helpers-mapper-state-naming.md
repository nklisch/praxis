---
id: feature-refactor-engine-adapter-shared-helpers-mapper-state-naming
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-engine-adapter-shared-helpers
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Unify mapper-state naming across Claude Code and Codex event mappers

## Brief
Both adapters need per-session mutable state to translate SDK tool-call identifiers
into Praxis sequential `callId`s. They solve the same problem with different names:
- Claude Code: `ClaudeCodeEventState` type + `createEventState()` factory
  (`packages/engines/src/claude-code/events.ts:42–51`)
- Codex: `MapState` type + `newMapState()` factory
  (`packages/engines/src/codex/events.ts:4–11`)

The naming divergence makes the two adapters look more different than they are and
hides a candidate for sharing.

## Target
Unify under a single name shared by both adapters, e.g.:
- Type: `EventMapperState` (or per-adapter type aliases over a common shape if the
  per-adapter fields differ)
- Factory: `createEventMapperState()`

If the per-adapter state shapes diverge meaningfully, keep two types but use a common
naming scheme (e.g., `ClaudeCodeMapperState` / `CodexMapperState` with matching
`createClaudeCodeMapperState()` / `createCodexMapperState()`).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- Both adapters' mapper-state types and factories follow a single naming convention
- No behavior change to event mapping
- The state shape itself may stay per-adapter (this is a naming-only fix unless the
  shapes are actually compatible)
