---
id: feature-refactor-author-channel-per-domain-split-step-2-lesson
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Extract author-lesson-channel.ts (3 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-lesson-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.createLesson` (lines 99–122)
- `praxis.author.updateLesson` (lines 124–158)
- `praxis.author.deleteLesson` (lines 160–177)

All three call `requireUnlocked()` and use `handleEnvelope`. `createLesson` and `updateLesson` map conceptIds through `brandId<"ConceptId">`. `updateLesson` builds a typed `patch` object conditionally. `deleteLesson` brands `lessonId`.

## Target state
New file `packages/desktop/electron/main/author-lesson-channel.ts`:

```typescript
import type { ConceptId, LessonId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

export function registerAuthorLessonHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  // createLesson, updateLesson, deleteLesson handlers (verbatim from author-channel.ts)
}
```

`author-channel.ts` removes the three extracted handler blocks.

## Implementation notes
- `requireUnlocked` is local, not exported.
- Both `ConceptId` and `LessonId` branded-type imports are needed because `updateLesson` casts `brandId<"ConceptId">` result to `ConceptId` and `brandId<"LessonId">` result to `LessonId`.
- Handler bodies copy verbatim — no logic changes.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- Channel names `praxis.author.createLesson`, `praxis.author.updateLesson`, `praxis.author.deleteLesson` unchanged.
- The new file exports only `registerAuthorLessonHandlers`.

## Rollback
`git revert` the commit for this step; the three handlers remain in `author-channel.ts`.

## Implementation notes
- Created `packages/desktop/electron/main/author-lesson-channel.ts` (103 lines) exporting only `registerAuthorLessonHandlers(services, log)`.
- Handler bodies copied verbatim from `author-channel.ts` lines 99–177 — no logic changes.
- `requireUnlocked()` is local and not exported, matching the story spec.
- Both `ConceptId` and `LessonId` branded-type imports included as required by `updateLesson` and `deleteLesson`.
- `author-channel.ts` and `ipc-server.ts` left untouched per story instructions (Step 7 handles wiring and deletion).
- `pnpm typecheck` clean; `pnpm --filter @praxis/desktop test` — 520 tests in 34 files, all pass.
