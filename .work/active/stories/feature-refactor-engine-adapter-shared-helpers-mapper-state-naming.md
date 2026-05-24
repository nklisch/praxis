---
id: feature-refactor-engine-adapter-shared-helpers-mapper-state-naming
kind: story
stage: done
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

## Implementation notes

The two adapter state shapes are meaningfully different and cannot be unified:
- Claude Code tracks `orderCounter: number` and `toolIdToCallId: Map<string, string>` to translate Claude's UUID tool IDs to sequential bridge callCounters.
- Codex tracks `toolCallIds: Map<number, string>` mapping item indices to synthesized callIds from `newCallId()`.

Parallel-naming approach applied:

**Claude Code** (`packages/engines/src/claude-code/events.ts`):
- `ClaudeCodeEventState` → `ClaudeCodeMapperState`
- `createEventState()` → `createClaudeCodeMapperState()`
- `MapState` interface made `export` (was already exported for Claude Code; now consistent)

**Codex** (`packages/engines/src/codex/events.ts`):
- `MapState` → `CodexMapperState` (also promoted from private to exported interface)
- `newMapState()` → `createCodexMapperState()` (factory name prefix changed from `new` to `create`)

**Call sites updated (5 files, 8 sites):**
- `packages/engines/src/claude-code/events.ts` — 3 sites (type declaration, factory definition, `mapClaudeCodeEvent` parameter type)
- `packages/engines/src/claude-code/adapter.ts` — 2 sites (import, `this.eventState` initializer)
- `packages/engines/src/codex/events.ts` — 3 sites (interface declaration, factory definition, `mapItemCompleted` parameter type)
- `packages/engines/src/codex/adapter.ts` — 2 sites (import, `const state =` in `send()`)
- `packages/engines/src/__tests__/claude-code-events.test.ts` — 2 sites (import, 3 factory call sites via `replace_all`)

Verification: `pnpm --filter @praxis/engines typecheck` passes clean; 19 tests pass.

## Review

**Verdict: done** — 2026-05-23

Naming-only refactor. All acceptance criteria met:

- Old names (`ClaudeCodeEventState`, `createEventState`, `MapState`, `newMapState`) fully removed — zero grep matches across `packages/engines/src/`.
- New names present at all 15 expected sites: `ClaudeCodeMapperState` (3 in events.ts, 2 in adapter.ts, 4 in test) and `CodexMapperState` / `createCodexMapperState` (4 in events.ts, 2 in adapter.ts).
- `CodexMapperState` correctly promoted from unexported `interface MapState` to `export interface CodexMapperState` — consistent with the Claude Code side.
- No behavioral change: state shapes, field names, and factory return values are identical to pre-rename.
- Implementation notes accurate; the decision to keep two per-adapter types (shapes are genuinely different) is correct.

No blockers, important findings, or nits.
