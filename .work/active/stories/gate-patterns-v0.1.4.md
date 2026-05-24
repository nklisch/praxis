---
id: gate-patterns-v0.1.4
kind: story
stage: done
tags: [patterns, documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: patterns
created: 2026-05-23
updated: 2026-05-23
---

# Patterns extracted for v0.1.4

## New patterns codified
- `dynamic-where-predicate` — Drizzle queries with optional filters seed
  a mutable `eq[]` accumulator and finalize with
  `.where(and(...predicates))`; never chain `.where().where()`. 6+ call
  sites including the new `session.list({ excludeModeIds })` and
  `session.active({ modeId })`.
- `use-resource-aggregation-loader` — page-level surfaces with N
  independent reads pass a `useCallback`'d `Promise.all` loader to
  `useResource`; one shared `loading`/`error`/`refresh`. 6+ call sites
  including the bundle's updated `use-library.ts`,
  `library-document-picker.tsx`.
- `ipc-envelope-test-triad` — each `handleEnvelope`-wrapped channel gets
  a per-`describe` block asserting four outcomes (`ok:true`,
  `VALIDATION_FAILED`, `INTERNAL` never-rejects, no host-path leakage).
  9+ test files, ~17 path-leakage assertions; the bundle adds
  `citations-channel-envelope.test.ts` and extends
  `session-channel-envelope.test.ts`.
- `server-resolved-student-id` — IPC handlers resolve `studentId` via
  `getStudentId(services)`; the Zod schema declares no `studentId` field.
  14 handler files, 20+ call sites; reinforced by the bundle's
  `session-channel.ts` IPC-schema layout for `spawnFromPassage` /
  `spawnFromNote`.

## Inconsistencies flagged
- `shared-test-fake-factories` divergence — the bundle's
  `session-channel-envelope.test.ts` inlines a local `makeFakeLogger()`
  instead of importing `makeSpyLogger` from `tests/helpers/mocks.ts`,
  while sibling `citations-channel-envelope.test.ts` uses the shared
  factory. Pre-existing systemic drift (~37 channel-envelope tests
  inline a logger); tracked separately as
  `gate-patterns-inconsistency-shared-test-fakes-logger`.
- `editorial-ui-primitives` divergence — Library route's Workbench
  rebuild builds a custom greeting header instead of `<RouteHeader>`.
  Already tracked as
  `gate-docs-pattern-editorial-ui-primitives-library-routeheader`.

## Pattern files written
- `.claude/skills/patterns/dynamic-where-predicate.md`
- `.claude/skills/patterns/use-resource-aggregation-loader.md`
- `.claude/skills/patterns/ipc-envelope-test-triad.md`
- `.claude/skills/patterns/server-resolved-student-id.md`
- `.claude/rules/patterns.md` (updated index)
- `.claude/skills/patterns/SKILL.md` (updated available-patterns list)
