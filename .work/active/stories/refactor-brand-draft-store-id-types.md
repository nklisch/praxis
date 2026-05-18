---
id: refactor-brand-draft-store-id-types
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

# Story: replace `string` with branded ID types in draft-store and draft-stream

## Brief

Two files use unbranded `string` for IDs that are branded everywhere else
in the codebase:

- `packages/core/src/services/draft-store.ts:28` — `markConfirmedTx(tx,
  draftId: string, courseId: string)` — both should be `DraftId` and
  `CourseId`.
- `packages/core/src/services/draft-store.ts:111` — same.
- `packages/core/src/types/draft-stream.ts:25` — `{ kind: "finalized";
  draftId: string; courseId: string }` — both should be branded.

Branded types catch caller mistakes at compile time (passing a
`LessonId` where a `DraftId` is wanted, etc.). The rest of the codebase is
consistently branded; these are outliers.

This is **pure refactor** — runtime behavior unchanged, type safety
strengthened.

## Files

- `packages/core/src/services/draft-store.ts`
- `packages/core/src/types/draft-stream.ts`
- Any caller affected by the tightened parameter types (likely
  `course-create-service.ts` — verify with `grep -rn 'markConfirmedTx\|finalized' packages/core/` during edit)

## Current State

```ts
// packages/core/src/services/draft-store.ts
markConfirmedTx(tx: PraxisDb, draftId: string, courseId: string): void { … }

// packages/core/src/types/draft-stream.ts
| { kind: "finalized"; draftId: string; courseId: string }
```

## Target State

```ts
// packages/core/src/services/draft-store.ts
import type { CourseId, DraftId } from "@praxis/core/types";
markConfirmedTx(tx: PraxisDb, draftId: DraftId, courseId: CourseId): void { … }

// packages/core/src/types/draft-stream.ts
import type { CourseId, DraftId } from "./ids.js"; // or wherever the brands live
| { kind: "finalized"; draftId: DraftId; courseId: CourseId }
```

## Implementation Notes

- Verify the canonical home of `DraftId` and `CourseId` brands during
  implementation (likely `packages/core/src/types/ids.ts` or
  `packages/core/src/types/artifacts.ts`).
- If `DraftId` does not yet exist as a brand, add it (modeled on the
  existing brands).
- Callers passing unbranded `string` to `markConfirmedTx` should brand at
  the call site (typically right after Drizzle returns the inserted row).
- IPC channels validate IDs with `z.string().min(1)` at the trust
  boundary — that's correct and unchanged; the brand is reapplied after
  parse using `brandId<"DraftId">(parsed.draftId) as DraftId`.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `grep -n 'draftId: string\|courseId: string' packages/core/src/services/draft-store.ts packages/core/src/types/draft-stream.ts` returns 0 results

## Risk

**Low** — type-only change; runtime untouched. Possible ripple if a
caller was passing the wrong-typed string (the brand catches it — which
is the point).

## Rollback

`git revert <commit>` — clean.
