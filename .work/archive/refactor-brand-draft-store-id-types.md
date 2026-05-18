---
id: refactor-brand-draft-store-id-types
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.3
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

## Implementation notes

**Port methods tightened (5):**
- `DraftStore.load(draftId: DraftId)` — interface + impl
- `DraftStore.touch(draftId: DraftId)` — interface + impl
- `DraftStore.markConfirmedTx(tx, draftId: DraftId, courseId: CourseId)` — interface + impl
- `DraftStore.markDiscarded(draftId: DraftId)` — interface + impl
- `DraftStore.sweepStale(cutoff): readonly DraftId[]` — interface + impl; inner `ids` array now branded via `brandId<"DraftId">(r.id) as DraftId`

**Type file updated (1):**
- `packages/core/src/types/draft-stream.ts`: `finalized` and `discarded` variants now use `DraftId`/`CourseId`; added imports from `./recommendation.js` and `./ids.js`.

**Caller sites updated in `packages/core/src/services/course-create-service.ts`:**
- Added `DraftId` to the `import type` block (line ~24)
- 13× `this.store.load(input.draftId)` → branded (replace_all)
- 4× `this.store.load(draftId)` → branded (replace_all)
- 1× `this.store.touch(draftId)` → branded (line ~513)
- 1× `this.store.markConfirmedTx(tx, input.draftId, r.courseId)` → `draftId` branded; `r.courseId` was already `CourseId` (line ~561)
- 1× `this.store.markDiscarded(draftId)` → branded (line ~614)
- 1× `this.emit({ kind: "finalized", draftId: input.draftId, ... })` → `draftId` branded (line ~603)
- 1× `this.emit({ kind: "discarded", draftId, ... })` → branded (line ~616)
- Sweep loop `for (const id of sweptIds)` at line ~890: `id` already `DraftId` from the tightened return type — no cast needed

**Tests updated (6 files, 31 call sites):**
- `packages/core/src/__tests__/draft-store.test.ts` — added `CourseId, DraftId` imports; branded all raw-string `load`/`touch`/`markConfirmedTx`/`markDiscarded` calls (14 sites)
- `packages/core/src/__tests__/course-create-service-durability.test.ts` — added `DraftId` import; branded 2 `store.load(id)` and 1 `store.load(d1)` calls
- `packages/core/src/services/__tests__/course-create-service.draft-stream.test.ts` — added `DraftId` import; branded `store.markDiscarded(draftId)` and `store.load(id)` (2 sites)
- `packages/core/src/services/__tests__/course-create-service.persist-units.test.ts` — added `DraftId` import; branded 1 `store.load(draftId)` call
- `packages/core/src/services/__tests__/course-create-service.units.test.ts` — added `DraftId` import; branded 3 `store.load(draftId)` calls

**Baseline confirmed:** typecheck passes (0 new errors beyond pre-existing 3 UI-file errors); 52/52 tests pass across 5 affected test files; biome lint clean on all changed files; `grep 'draftId: string\|courseId: string'` returns 0 results in target files.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The per-site `brandId<"DraftId">(input.draftId) as DraftId` cast at every `store.load()` call could be tidied by branding once at the top of each method that uses `input.draftId` more than once. The current per-site pattern matches the existing codebase convention (`flashcards-service.ts:66`) — acceptable as-is; left as a style preference for a future cleanup if the cast verbosity becomes noisy.

**Notes**: Type safety improved at the port boundary (`DraftStore` interface + `SqliteDraftStore` impl + `draft-stream.ts` discriminated union). Callers in `course-create-service.ts` reapply the brand at each call (string → DraftId at the trust boundary), which is the established pattern when methods receive raw-string inputs from IPC. 5 test files updated to brand literal-string test ids. 52/52 tests pass; typecheck clean (no new errors beyond pre-existing UI baseline). The tightened port surface will catch real type drift in any future caller that forgets to brand a draft id — that's the value.
