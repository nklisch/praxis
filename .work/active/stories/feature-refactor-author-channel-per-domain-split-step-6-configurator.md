---
id: feature-refactor-author-channel-per-domain-split-step-6-configurator
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Extract author-configurator-channel.ts (2 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-configurator-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.listConfiguratorActions` (lines 498–523)
- `praxis.author.restoreAction` (lines 525–535)

Both call `requireUnlocked()` and use `handleEnvelope`. `listConfiguratorActions` uses an optional schema (`z.object({...}).optional()`) with a `Timestamp` import cast inline. `restoreAction` takes a simple `{ actionId: string }` schema.

## Target state
New file `packages/desktop/electron/main/author-configurator-channel.ts`:

```typescript
import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

export function registerAuthorConfiguratorHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  // listConfiguratorActions, restoreAction handlers (verbatim from author-channel.ts)
}
```

`author-channel.ts` removes the two extracted handler blocks.

## Implementation notes
- `requireUnlocked` is local, not exported.
- `listConfiguratorActions` has an inline `import("@praxis/core/types").Timestamp` type cast — preserve it verbatim (it avoids a top-level import of a single type for one cast, which is the original author's intentional choice).
- No `getStudentId` usage in this module.
- Handler bodies copy verbatim — no logic changes.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- Channel names `praxis.author.listConfiguratorActions` and `praxis.author.restoreAction` unchanged.
- The new file exports only `registerAuthorConfiguratorHandlers`.

## Rollback
`git revert` the commit for this step; the two handlers remain in `author-channel.ts`.

## Implementation notes
- Created `/home/nathan/dev/praxis/packages/desktop/electron/main/author-configurator-channel.ts` (64 lines).
- Handler bodies copied verbatim from `author-channel.ts` lines 498–537.
- `requireUnlocked()` is local (not exported), per pattern.
- Inline `import("@praxis/core/types").Timestamp` type cast in `listConfiguratorActions` preserved as-is.
- `author-channel.ts` and `ipc-server.ts` left unmodified (Step 7 handles wiring and deletion).
- `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both pass (520 tests).
