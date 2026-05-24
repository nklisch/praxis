---
id: feature-refactor-buildservices-decomposition-step-5-memory
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Extract `buildMemoryServices()`

## Brief

Extract `MemoryServiceImpl` construction into
`packages/desktop/electron/main/services/build-memory-services.ts`.

`MemoryServiceImpl` is deliberately isolated here because it is a shared dependency that
must be constructed before both `AssignmentServiceImpl` and `ArtifactsServiceImpl`
(ordering constraint documented on lines 334 and 343 of `services.ts`). Keeping it as its
own tiny factory makes the ordering constraint explicit at the call-site level.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 333–339:

```ts
const memoryService = new MemoryServiceImpl({
  db,
  log,
  decayDaysFor: () => 14,
});
```

## Target state

New file `packages/desktop/electron/main/services/build-memory-services.ts`:

```ts
import { MemoryServiceImpl } from "@praxis/core/services";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { MainLogger } from "../logger.js";

export interface MemoryServices {
  memoryService: MemoryServiceImpl;
}

export function buildMemoryServices(
  db: BetterSQLite3Database,
  log: MainLogger,
): MemoryServices {
  const memoryService = new MemoryServiceImpl({
    db,
    log,
    decayDaysFor: () => 14,
  });
  return { memoryService };
}
```

`buildServices()` calls this after `openDb()` and before `buildArtifactsServices()`.

## Implementation notes

- The `decayDaysFor: () => 14` lambda is hardcoded — in the future this could become a
  config-driven thunk, but that is out of scope for this refactor. Move the lambda as-is.
- The `MemoryServiceImpl` is also exposed on the top-level `Services.memory` field — wire
  through the destructure unchanged.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `MemoryServiceImpl`.
- `buildMemoryServices` is the single construction site.

## Risk

Low — single-constructor extract with no side-effects at construction time.
Rollback: revert the new file and restore the inline block in `buildServices()`.

## Implementation notes

- Used `PraxisDb` (from `@praxis/core/db`) instead of the raw `BetterSQLite3Database` type
  specified in the story's target state — `MemoryServiceImpl` declares its `db` parameter as
  `PraxisDb`, and all other service factories in the codebase use that alias consistently.
- `services.ts` is not modified per the step spec; Step 10 will wire the call-site.
- `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both green (520 tests passed).
