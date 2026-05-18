---
id: refactor-loadorthrow-concept-map-service
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: adopt loadOrThrow in concept-map-service.ts

## Brief

`packages/core/src/services/concept-map-service.ts` has 4+ inline
`throw new Error("... not found after insert/update: ...")` patterns
after `.insert/update/delete().run()` calls. Mirror image of
`refactor-loadorthrow-tabs-service`. Adopt the documented `load-or-throw`
pattern (helper at `packages/core/src/services/_utils/load-or-throw.ts`).

This is **pure refactor** — error message format changes to the helper's
uniform shape.

## Files

- `packages/core/src/services/concept-map-service.ts` only

## Sites to convert

Discovery scan flagged (verify line numbers during implementation):

- `concept-map-service.ts:135` — `ConceptMapService.create: not found after insert: ${id}`
- `concept-map-service.ts:194` — `ConceptMapService.rename: not found after update: ${id}`
- `concept-map-service.ts:220` — `ConceptMapService.updateScene: not found after update: ${input.id}`
- `concept-map-service.ts:340` — `ConceptMapService.setNodeLink: not found after update: ${input.mapId}`

The lookup-precondition throws (e.g., line 292 `map not found`, line 357
`note not found`) are input-validation throws, not load-after-write —
leave them as-is.

## Current State

```ts
const updated = this.get(id);
if (!updated) {
  throw new Error(`ConceptMapService.rename: not found after update: ${id}`);
}
return updated;
```

## Target State

```ts
return loadOrThrow(
  () => this.get(id),
  { entity: "concept_map", op: "update", id, log: this.deps.log },
);
```

## Implementation Notes

- Confirm the exact `loadOrThrow` signature in
  `packages/core/src/services/_utils/load-or-throw.ts` during edit.
- Verify no test asserts on the exact prior error message string before
  changing (grep `"ConceptMapService\." packages/`).
- Match the entity-name convention used by other services that adopted
  this pattern (e.g., snake_case `concept_map` vs camelCase
  `conceptMap`).

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (concept-map-service tests; tests file is at
      `packages/core/src/services/__tests__/concept-map-service.test.ts`,
      648 LoC — good coverage)
- [ ] `grep -n 'throw new Error.*not found after' packages/core/src/services/concept-map-service.ts` returns 0 results

## Risk

**Low** — in-file mechanical refactor with strong test coverage.

## Rollback

`git revert <commit>` — trivially clean.
