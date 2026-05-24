---
id: feature-refactor-author-channel-per-domain-split-step-1-course
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-author-channel-per-domain-split
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Extract author-course-channel.ts (2 handlers)

## Risk
Low

## Priority
High

## Files affected
- `packages/desktop/electron/main/author-course-channel.ts` (new)
- `packages/desktop/electron/main/author-channel.ts` (remove extracted handlers)
- `packages/desktop/electron/main/ipc-server.ts` (not yet — done in step 7)

## Current state
`author-channel.ts` registers these handlers inside `registerAuthorHandlers()`:
- `praxis.author.updateCourse` (lines 74–97)
- `praxis.author.getCourseSummary` (lines 276–287)

Both use `handleEnvelope` with `requireUnlocked()`. `updateCourse` brands `courseId`. `getCourseSummary` takes a raw `z.string()` courseId and brands it.

## Target state
New file `packages/desktop/electron/main/author-course-channel.ts`:

```typescript
import type { CourseId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

export function registerAuthorCourseHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  handle(
    "praxis.author.updateCourse",
    handleEnvelope(
      "praxis.author.updateCourse",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        patch: z.object({
          title: z.string().optional(),
          subject: z.string().optional(),
          gradeLevel: z.string().optional(),
        }),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.updateCourse({
          courseId: brandId<"CourseId">(input.courseId),
          patch: input.patch as Parameters<typeof services.authoring.updateCourse>[0]["patch"],
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.getCourseSummary",
    handleEnvelope(
      "praxis.author.getCourseSummary",
      log,
      z.string().min(1, "courseId"),
      async (courseId) => {
        await requireUnlocked();
        return services.authoring.getCourseSummary(brandId<"CourseId">(courseId) as CourseId);
      },
    ),
  );
}
```

`author-channel.ts` removes the two extracted handler blocks.

## Implementation notes
- `requireUnlocked` is local to each new module (not exported — it's an internal guard).
- The `CourseId` branded type import is needed because `getCourseSummary` casts to it. `updateCourse` uses `brandId<"CourseId">` without a cast, matching the original.
- No `getStudentId` usage in this module.

## Acceptance criteria
- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- Channel names `praxis.author.updateCourse` and `praxis.author.getCourseSummary` unchanged on the wire.
- The new file exports only `registerAuthorCourseHandlers`.

## Rollback
`git revert` the commit for this step; the two handlers remain in `author-channel.ts`.
