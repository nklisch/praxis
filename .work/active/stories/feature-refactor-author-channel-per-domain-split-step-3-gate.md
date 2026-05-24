---
id: feature-refactor-author-channel-per-domain-split-step-3-gate
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Extract author-gate-channel.ts (4 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-gate-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.createGate` (lines 179–200)
- `praxis.author.updateGate` (lines 202–236)
- `praxis.author.deleteGate` (lines 238–255)
- `praxis.author.overrideGate` (lines 257–274)

All four call `requireUnlocked()` and use `handleEnvelope`. `createGate` casts `guards` and `successCriteria` via `z.unknown()` (trust boundary). `updateGate` builds a conditional `patch` object branding prerequisite ids and casting `successCriteria`. Both `deleteGate` and `overrideGate` brand `gateId`.

## Target state
New file `packages/desktop/electron/main/author-gate-channel.ts`:

```typescript
import type { CourseId, GateId, GateTarget, Logger, SuccessCriteria } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

export function registerAuthorGateHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  // createGate, updateGate, deleteGate, overrideGate handlers (verbatim from author-channel.ts)
}
```

`author-channel.ts` removes the four extracted handler blocks.

## Implementation notes
- `requireUnlocked` is local, not exported.
- Imports needed: `CourseId`, `GateId`, `GateTarget`, `SuccessCriteria` (all used in handler bodies for casts).
- Handler bodies copy verbatim — no logic changes, no schema changes.
- `z.unknown()` on `guards` and `successCriteria` in `createGate` is intentional — copy as-is.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- Channel names `praxis.author.createGate`, `praxis.author.updateGate`, `praxis.author.deleteGate`, `praxis.author.overrideGate` unchanged.
- The new file exports only `registerAuthorGateHandlers`.

## Rollback
`git revert` the commit for this step; the four handlers remain in `author-channel.ts`.
