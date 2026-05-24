---
id: feature-refactor-author-channel-per-domain-split-step-5-memory
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Extract author-memory-channel.ts (4 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-memory-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.resetConcept` (lines 423–442)
- `praxis.author.clearMisconception` (lines 444–461)
- `praxis.author.exportMemory` (lines 463–475)
- `praxis.author.deleteAllMemory` (lines 477–496)

All four call `requireUnlocked()` and use `handleEnvelope`. Three of the four (`resetConcept`, `exportMemory`, `deleteAllMemory`) call `getStudentId(services)` — server-resolved per the `server-resolved-student-id` pattern. `resetConcept` brands `conceptId`; `clearMisconception` brands `misconceptionId`.

## Target state
New file `packages/desktop/electron/main/author-memory-channel.ts`:

```typescript
import type { ConceptId, Logger, MisconceptionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

export function registerAuthorMemoryHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  // resetConcept, clearMisconception, exportMemory, deleteAllMemory handlers
  // (verbatim from author-channel.ts)
}
```

`author-channel.ts` removes the four extracted handler blocks.

## Implementation notes
- `requireUnlocked` is local, not exported.
- `getStudentId` import is required — three of the four handlers resolve studentId server-side.
- `ConceptId` and `MisconceptionId` branded type imports are needed for casts.
- Handler bodies copy verbatim — no logic changes.
- Note: `deleteAllMemory` uses `z.literal(true)` on `confirm` — copy as-is.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- Channel names `praxis.author.resetConcept`, `praxis.author.clearMisconception`, `praxis.author.exportMemory`, `praxis.author.deleteAllMemory` unchanged.
- The new file exports only `registerAuthorMemoryHandlers`.

## Rollback
`git revert` the commit for this step; the four handlers remain in `author-channel.ts`.

## Implementation notes
- Created `packages/desktop/electron/main/author-memory-channel.ts` (104 lines).
- Handler bodies copied verbatim from `author-channel.ts` lines 423–496.
- All 4 handlers: `resetConcept`, `clearMisconception`, `exportMemory`, `deleteAllMemory`.
- `requireUnlocked` is local (not exported), matching the pattern from other extracted modules.
- `getStudentId` imported for the 3 handlers that resolve studentId server-side (`resetConcept`, `exportMemory`, `deleteAllMemory`).
- `author-channel.ts` and `ipc-server.ts` left unmodified per step instructions (Step 7 handles wiring and deletion).
- `pnpm typecheck` passes (34 test files, 520 tests all green).
