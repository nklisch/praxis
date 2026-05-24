---
id: feature-refactor-buildservices-decomposition-step-1-infra
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

# Step 1: Extract `buildInfraServices()`

## Brief

Extract the three ambient-registry primitives constructed at the top of `buildServices()` into a
dedicated `buildInfraServices()` factory in a new file
`packages/desktop/electron/main/services/build-infra-services.ts`.

These services share one property: they are constructed first (no domain service dependencies)
and passed down to every other factory as ambient infrastructure.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 203–215:

```ts
const activityRegistry = new ActivityRegistryImpl({ log });
const subAgentRegistry = new SubAgentRegistryImpl({
  log,
  resolveLabel: (toolName) => getToolLabel(toolName).present,
});
const quickCheckService = new QuickCheckServiceImpl(
  log.child({ component: "quick-check-service" }),
);
```

## Target state

New file `packages/desktop/electron/main/services/build-infra-services.ts`:

```ts
import { ActivityRegistryImpl, QuickCheckServiceImpl, SubAgentRegistryImpl } from "@praxis/core/services";
import { getToolLabel } from "@praxis/tools/labels";
import type { MainLogger } from "../logger.js";

export interface InfraServices {
  activityRegistry: ActivityRegistryImpl;
  subAgentRegistry: SubAgentRegistryImpl;
  quickCheckService: QuickCheckServiceImpl;
}

export function buildInfraServices(log: MainLogger): InfraServices {
  const activityRegistry = new ActivityRegistryImpl({ log });
  const subAgentRegistry = new SubAgentRegistryImpl({
    log,
    resolveLabel: (toolName) => getToolLabel(toolName).present,
  });
  const quickCheckService = new QuickCheckServiceImpl(
    log.child({ component: "quick-check-service" }),
  );
  return { activityRegistry, subAgentRegistry, quickCheckService };
}
```

`buildServices()` calls `buildInfraServices(log)` and spreads / destructures the result.

## Implementation notes

- Create the `packages/desktop/electron/main/services/` subdirectory (new).
- Import the factory from `./services/build-infra-services.js` in `services.ts`.
- Remove the three inline construction blocks from `buildServices()`.
- No behavior change — construction arguments are identical.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly constructs `ActivityRegistryImpl`, `SubAgentRegistryImpl`,
  or `QuickCheckServiceImpl`.
- `buildInfraServices` is the only place those three constructors are called.

## Risk

Low — these three services have no initialization side-effects and no inter-dependencies.
Rollback: revert the file addition and restore the three inline blocks in `buildServices()`.

## Implementation notes

Created `packages/desktop/electron/main/services/build-infra-services.ts` (new subdirectory
`services/` also created). The file exports `InfraServices` interface and `buildInfraServices(log)`
factory exactly matching the target state spec. Inline comments from the original `buildServices()`
blocks were preserved. `services.ts` is not yet modified — wiring deferred to Step 10 per the
workflow instructions.

Verified: `pnpm typecheck` clean (all 10 packages pass), `pnpm --filter @praxis/desktop test`
520/520 tests pass. The new file typechecks correctly even though it is not yet imported.
