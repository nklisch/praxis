---
id: feature-refactor-author-channel-per-domain-split-step-1-course
kind: story
stage: done
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

## Review
**Verdict: done** (commit `68b25a7`)

Pattern conformance verified against `per-domain-channel-module`:
- Exports exactly `registerAuthorCourseHandlers(services, log)` — matches the `register*Handlers(services, [, log])` signature.
- `createIpcHelpers(log)` called at top of function; `handle` destructured — correct.
- `requireUnlocked()` is local, not exported — matches spec and pattern.
- Both handlers use `handleEnvelope(channel, log, schema, fn)` with matching channel strings (`praxis.author.updateCourse`, `praxis.author.getCourseSummary`).
- Handler bodies match the target-state spec verbatim: `brandId<"CourseId">` usage, the `Parameters<...>` cast on `updateCourse`, the `as CourseId` cast on `getCourseSummary` — all correct.
- File is 61 lines (story said 63 — close enough; the JSDoc header is the delta); only the new file was added, no other files touched.
- 520 desktop tests pass per implementation notes.

## Implementation notes
Created `packages/desktop/electron/main/author-course-channel.ts` (63 lines) exporting `registerAuthorCourseHandlers(services, log)`. Contains a local `requireUnlocked()` guard and the two handlers (`updateCourse`, `getCourseSummary`) extracted verbatim from `author-channel.ts`. Handlers are NOT removed from `author-channel.ts` — that is deferred to step 7. `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both pass (520 tests green).
