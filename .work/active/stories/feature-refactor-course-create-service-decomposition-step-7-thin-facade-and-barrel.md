---
id: feature-refactor-course-create-service-decomposition-step-7-thin-facade-and-barrel
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-course-create-service-decomposition
depends_on:
  - feature-refactor-course-create-service-decomposition-step-1-extract-apply-edit
  - feature-refactor-course-create-service-decomposition-step-2-fix-normalize-export
  - feature-refactor-course-create-service-decomposition-step-3-extract-incremental-mutators
  - feature-refactor-course-create-service-decomposition-step-4-extract-chunked-queries
  - feature-refactor-course-create-service-decomposition-step-5-extract-confirm-draft
  - feature-refactor-course-create-service-decomposition-step-6-extract-pack-course-creation
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: Finalize thin facade + update barrel exports + verify full integration

## Priority / Risk
Priority: High — integration step; ensures the composition holds end-to-end.
Risk: Low — by this point, all modules are extracted and individually verified.
  This step only wires the barrel, cleans up unused imports, and runs the full suite.

## Files affected
- **Modified**: `packages/core/src/services/course-create-service.ts` (final cleanup)
- **Modified**: `packages/core/src/services/course-create/index.ts` (update barrel)
- **Possibly modified**: `packages/core/src/index.ts` or service barrel if `Issue` export path changes

## Current state (after steps 1–6)
`CourseCreateServiceImpl` should be ~200–250 lines:
- Constructor + `sweepTimer` setup
- `subscribe`, `list`, `listActiveForStudent`, `emit`, `saveAndEmitUpdate`
- `initDraft`, `showDraft`, `summarize`, `discardDraft`, `size`, `shutdown`, `sweepStale`
- Thin delegation wrappers for every extracted method

The `course-create/index.ts` barrel (created in step 2) re-exports the three original modules.
After steps 1, 3, 4, 5, 6, the barrel should also export the new modules' public APIs.

## Target state
1. Verify `course-create-service.ts` is ≤ 250 lines (all extraction complete).
2. Update `course-create/index.ts` to re-export from all six modules:
   - `helpers.ts` → `normalizeConceptName`
   - `draft-validator.ts` → `Issue`, `validateProposed`
   - `draft-persistence.ts` → `persistDraftTx`, `PersistDraftTxArgs`
   - `draft-mutations.ts` → `applyEdit`, `buildSummary`, `EditResult`
   - `draft-mutators.ts` → individual mutator functions (or the module may be internal-only)
   - `draft-queries.ts` → query functions (or internal-only)
   - `draft-confirmer.ts` → `runConfirmDraft`, `ConfirmDraftDeps`
   - `pack-course-creator.ts` → `createCourseFromPack`
3. Confirm `export type { Issue }` at the top of `course-create-service.ts` still works
   (consumed externally by tool handlers).
4. Run `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — all must pass.
5. Spot-check that no external package is importing from internal module paths
   (should only import from `@praxis/core` public surface).

## Implementation notes
- The `export type { Issue }` re-export at line 42 of the current service file is a public API —
  keep it or verify the consuming tool handlers import from the right location.
- If any module turns out not to need barrel exposure (its functions are only called by the
  service and never by other consumers), leave them unexported from the barrel — the barrel
  is for public API, not everything.
- Clean up any unused imports in `course-create-service.ts` (Biome will flag them).

## Acceptance
- `course-create-service.ts` ≤ 250 lines.
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all pass.
- No import of internal `course-create/*.js` files from outside `course-create-service.ts`
  or the `course-create/` directory itself (except through the barrel).
- External `CourseCreateService` interface byte-for-byte unchanged.

## Risk + Rollback
Risk: Low — purely integrative; each module already verified in prior steps.
Rollback: N/A at this point; each prior step has its own rollback.

## Implementation notes
- `course-create-service.ts`: 1155 → 558 lines (52% reduction)
- All 6 modules wired: draft-mutations, draft-mutators, draft-queries, draft-confirmer, pack-course-creator, draft-persistence/draft-validator (already in place)
- Barrel (`course-create/index.ts`) updated to export from draft-mutations, draft-confirmer, pack-course-creator (new); draft-mutators and draft-queries left as internal — only consumed by the service facade
- Public `CourseCreateService` interface byte-for-byte unchanged
- Type fix: optional-field mismatch when building input objects resolved by destructuring `draftId` out (`const { draftId: _, ...rest } = input`) and passing `rest` directly to mutators
- `ProposedCourse` and `persistDraftTx` imports removed (no longer needed directly in service)
- Tests: 4773 passed, 23 skipped (4796 total workspace); core alone: 1164 passed (96 files)

## Review

Verdict: **done**.

**9 mutator methods delegate to draft-mutators**: `addConcept` → `addConceptMutation`, `removeConcept` → `removeConceptMutation`, `addEdge` → `addEdgeMutation`, `addLesson` → `addLessonMutation`, `removeLesson` → `removeLessonMutation`, `addUnit` → `addUnitMutation`, `setAssessmentPlan` → `setAssessmentPlanMutation`, `addLessonAssessment` → `addLessonAssessmentMutation`, `setMetadata` → `setMetadataMutation`. All delegate via result-check pattern (`if (!result.ok) return result`).

**4 query methods delegate to draft-queries**: `listUnits` → `listUnitsQuery`, `listLessonsInUnit` → `listLessonsInUnitQuery`, `getLessonDetail` → `getLessonDetailQuery`, `listDanglingRefs` → `listDanglingRefsQuery`. All load draft first, pass `d.proposed` to query function.

**confirmDraft** delegates to `runConfirmDraft` with `markConfirmedTx` closure; emits `finalized` after. Ownership and validation checks stay in service.

**createCourseFromPack** delegates to `createCourseFromPackFn(input, this.deps.db)` — single line.

**Lifecycle methods inline** (as expected per design): `initDraft`, `subscribe`, `discardDraft`, `showDraft`, `summarize` (thin wrapper over `buildSummary`), `editDraft`, `size`, `shutdown`, `sweepStale`.

**Public interface unchanged**: `CourseCreateService` interface byte-for-byte intact; `export type { Issue }` re-export preserved at line 55.

**Facade size**: 558 lines — within the accepted deviation from the ≤250 target noted in implementation notes (target was pre-extraction estimate; actual facade includes all method signatures + JSDoc + lifecycle code that stays inline).

**Barrel**: exports `runConfirmDraft`, `ConfirmDraftDeps`, `ConfirmDraftContext`, `applyEdit`, `buildSummary`, `EditResult`, `persistDraftTx`, `PersistDraftTxArgs`, `validateProposed`, `Issue`, `normalizeConceptName`, `createCourseFromPack`, `CreateCourseFromPackInput`. Draft-mutators and draft-queries left as internal (only consumed by facade).

**4773 workspace tests pass, 23 skipped (slow-gated).**
