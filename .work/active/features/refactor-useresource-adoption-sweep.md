---
id: refactor-useresource-adoption-sweep
kind: feature
stage: review
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: adopt useResource across configure routes and misc components

## Brief

The `useResource(loader)` hook at `packages/ui/src/hooks/use-resource.ts`
encapsulates the standard load-with-state-and-error pattern returning
`{ data, loading, error, refresh, setData }`. It's used correctly in
several places (e.g., `study-skills-tab-body`,
`library-document-picker`), but at least 10 components inline the exact
same setState/try/catch/finally block manually instead of using the hook.

This is **pure refactor** — the observable loading/error/refresh
behavior of each component stays identical; only the implementation
shifts from inline to hook-mediated.

## Surface area

### Configure routes (worst offenders)

- `packages/ui/src/routes/configure/memory-tab.tsx:45-130` — **5 inline
  load blocks** (mastery, misconceptions, procedural, affective, episodic
  events). Naming bloat: `masteryLoading`, `miscError`,
  `proceduralLoading`, etc., one per projection. Each block is the
  textbook useResource shape.
- `packages/ui/src/routes/configure/prompt-tab.tsx` — similar pattern
  (verify exact line count during design)
- `packages/ui/src/routes/configure/course-tab.tsx:231,253,265` — same
  pattern in 3 places

### Misc components

- `packages/ui/src/components/page-image-panel.tsx:18,25,50`
- `packages/ui/src/components/attributed-preview-pane.tsx:25,29,41`
- `packages/ui/src/components/document-viewer/pdf-renderer.tsx:31,62,84`
- `packages/ui/src/routes/workspace/note-editor-page.tsx:35,43,63`
- `packages/ui/src/context/tabs-context.tsx:105,109,127` — note: a context
  provider, not a leaf component — extra care so the hook composes
  cleanly with the provider's `useEffect` lifecycle

### Edge: streaming consumers

`memory-tab.tsx`'s `loadEpisodic` (lines 119-150) is **streaming** with an
AbortController, not a single Promise. `useResource` does not cover this
shape today. Either:
- Extend `useResource` (or add `useStreamedResource`) to cover the
  streaming case, OR
- Keep the streaming loader inline and only convert the 4
  single-fetch loaders in memory-tab.

Decide during design.

## Why a feature (not a story)

- 10+ component touch points across 6+ files
- Each has slightly different state shapes (single value vs Map vs Array)
  — design pass should confirm the hook signature is sufficient or
  whether a `useResourceMap<K, V>` variant is worth adding
- Streaming consumer in memory-tab.tsx (`loadEpisodic`) needs an
  explicit decision: extend the hook or leave as-is
- Provider-context call site (`tabs-context.tsx`) is structurally
  different from leaf components

## Discovery findings to design against

- `useResource` is the canonical pattern (documented at
  `.claude/skills/patterns/use-resource-hook.md`)
- Memory-tab alone has 5 inline duplications — single highest-impact file
- Streaming loader is the outlier — confirm scope before adopting
- Borderline candidates: `homework-tab-body`, `quiz-tab-body`,
  `exam-tab-body` — these use `useAssignment` which already wraps the
  pattern. Verify they're not double-inlining.

## Out of scope

- Adding new loading/error UI — only swap implementation, keep the
  rendered loading/error UX identical.
- Refactoring `useAssignment` or `useGates` (they already wrap useResource
  correctly).
- Cross-tab data caching / SWR-style invalidation.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (UI tests for each touched component must pass
      unmodified)
- [ ] `grep -rn 'setLoading(true)\|setLoading(false)' packages/ui/src/ | grep -v use-resource | grep -v node_modules | wc -l` drops to ≤2 (acceptable residuals: streaming-loader holdouts and useResource itself)
- [ ] Every touched component renders identical loading/error states to
      before (verified by snapshot or behavior tests where they exist)

## Risk

**Low-medium** — UI state-management swap, well-typed, narrow blast
radius per component. The provider call site (tabs-context.tsx) carries
slightly higher risk due to React effect-ordering semantics.

## Rollback

`git revert <commit>` per component is clean; recommend one commit per
file or per cluster.

## Design correction (2026-05-18, refactor-design pass)

After reading the actual call sites, the original "10+ components" scope is
too broad. Several have shape mismatches that make useResource a poor fit:

| File | Inline pattern? | useResource fit? | Decision |
|---|---|---|---|
| `routes/configure/memory-tab.tsx` | 5 blocks (mastery, miscs, procedural, affective, episodic) | 4 fit, 1 doesn't (episodic is streaming) | **CONVERT 4** |
| `routes/configure/course-tab.tsx` | 1 block, Promise.all into two state pieces | Yes (tuple result) | **CONVERT** |
| `routes/configure/prompt-tab.tsx` | Multiple async ops | Yes, the load ones fit | **CONVERT** |
| `components/page-image-panel.tsx` | 1 block with URL.revokeObjectURL cleanup | No — useResource doesn't cover blob-URL lifecycle | **SKIP** (justified) |
| `components/document-viewer/pdf-renderer.tsx` | 1 block with URL.revokeObjectURL + IntersectionObserver gating + ref-based one-shot fetch | No — composite side-effect cleanup | **SKIP** (justified) |
| `components/attributed-preview-pane.tsx` | 1 block with silent error swallow + useDeferredValue interaction | No — silent-error pattern is intentional ("keep prior preview on transient errors") and useResource exposes errors | **SKIP** (justified) |
| `routes/workspace/note-editor-page.tsx` | 1 block with post-load body parsing + multiple distinct state pieces (note, body, save state, spawn state) | Poor — post-load processing chains; not a clean "load N, store N" shape | **SKIP** (justified — could be done but the per-component complexity outweighs the consolidation win) |
| `context/tabs-context.tsx` | Multiple loaders inside a Provider context | Poor — the loaders are part of the context's API surface and use the same pattern repeatedly; useResource doesn't cleanly cover the "manages N loaders in a provider" shape | **SKIP** (justified — would need a per-loader factory pattern; out of scope for a sweep) |

Net scope: **3 configure-tab files**, 6-7 inline load blocks total. Memory-tab is the biggest win (4 conversions in one file). Steps are independent (different files), can run in parallel.

The skipped files are not "left behind by laziness" — they're skipped because the refactor would either lose functionality (page-image-panel, pdf-renderer), change observable behavior (attributed-preview-pane), or require shape gymnastics that outweigh the consolidation (note-editor-page, tabs-context). Each is documented so a future refactor pass doesn't re-discover them as candidates.

## Refactor Overview

Adopt `useResource` in the 3 configure routes' load functions. Each tab
currently inlines the load-with-state-and-error pattern multiple times.
The hook is already used elsewhere in the codebase (e.g.,
`study-skills-tab-body`, `library-document-picker`), so this is a pattern
adoption, not a new abstraction.

Streaming consumers (memory-tab's `loadEpisodic`) stay inline — they have
AbortController + iteration semantics that useResource doesn't cover.

## Refactor Steps

### Step 1: memory-tab — convert 4 single-fetch loaders
**Priority**: High (worst offender — 5 inline blocks in one file)
**Risk**: Low (single file, no public API change)
**Files**: `packages/ui/src/routes/configure/memory-tab.tsx`
**Story**: `refactor-useresource-adoption-sweep-step-1-memory-tab`

**Current state** (lines 39-110 area): four near-identical inline blocks for mastery, misconceptions, procedural, affective. Each defines `[X, setX]` + `[XLoading, setXLoading]` + `[XError, setXError]` + a `loadX` useCallback with try/catch/finally.

**Target state** (per loader):
```ts
const loadMastery = useCallback(
  () => client.memory.studentModel().then(m => Array.from(m.conceptMastery.entries())),
  [client],
);
const { data: mastery = [], loading: masteryLoading, error: masteryError, refresh: refreshMastery } =
  useResource(loadMastery);
```

Loaders that transform data before storing it (mastery's `Array.from`) wrap the transform inside the loader function so `useResource` sees the final shape. The default `= []` on destructure preserves the initial empty-array UX.

**Out of scope for this step**: `loadEpisodic` at lines 119-150 — streaming with AbortController, not a useResource fit. Stays inline.

**Acceptance criteria**:
- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] 4 inline load blocks → 4 `useResource` calls
- [ ] `loadEpisodic` stays inline (explicitly preserved as the streaming holdout)
- [ ] Component renders identical loading/error/data states (verified by existing tests if any cover memory-tab)
- [ ] File LoC drops by ~40

**Risk**: low. UI-only change, narrow blast radius.
**Rollback**: `git revert <commit>` — clean.

---

### Step 2: course-tab — convert Promise.all loader
**Priority**: Medium
**Risk**: Low
**Files**: `packages/ui/src/routes/configure/course-tab.tsx`
**Story**: `refactor-useresource-adoption-sweep-step-2-course-tab`

**Current state** (lines 229-267): one inline block where `loadCourse` does `Promise.all([client.artifacts.units(...), client.artifacts.lessons(...)])` and stores each result in a separate state. Has an early-return when no course is selected (clears state).

**Target state**: useResource with a tuple result, then destructure:

```ts
const loadCourse = useCallback(async () => {
  if (!selectedCourseId) return [[], []] as [Unit[], Lesson[]];
  return Promise.all([
    client.artifacts.units(selectedCourseId),
    client.artifacts.lessons(selectedCourseId),
  ]);
}, [client, selectedCourseId]);

const { data, loading, error, refresh } = useResource(loadCourse);
const [units = [], lessons = []] = data ?? [];
```

The "clear state when no course" semantic moves into the loader returning `[[], []]`. The `setSelectedLesson(null)` side effect that was in the early-return branch needs to be preserved via a separate `useEffect` that watches `selectedCourseId`.

**Implementation notes**:
- Verify the `setSelectedLesson(null)` side effect doesn't break — it was previously inside the load function but is a parent-state side effect; should move to a separate effect.
- Confirm the existing `useCourses()` hook (which already wraps useResource) isn't being duplicated by the new conversion.

**Acceptance criteria**:
- [ ] Typecheck/lint/test green
- [ ] Inline load block replaced with `useResource`
- [ ] `selectedLesson(null)` clear-on-no-course preserved (via a separate effect or as part of the loader's side effect chain — both work)
- [ ] File LoC drops by ~20

**Risk**: low-medium — the `setSelectedLesson` side effect is the only subtle bit; verify visually that no-course-selected state still clears correctly.
**Rollback**: `git revert <commit>` — clean.

---

### Step 3: prompt-tab — convert load operations
**Priority**: Medium
**Risk**: Low-Medium (multiple async ops in one file)
**Files**: `packages/ui/src/routes/configure/prompt-tab.tsx`
**Story**: `refactor-useresource-adoption-sweep-step-3-prompt-tab`

**Current state** (lines 120-170 area): multiple async operations sharing a single `[error, setError]`. Some are loads; others are save/preview operations that mutate. Distinguish before converting.

**Target state**: convert only the LOAD operations to useResource; leave the SAVE/PREVIEW mutation operations as-is (they don't have a clean useResource shape since they're imperatively triggered, not load-on-mount).

**Implementation notes**:
- Read the file fully before editing — there are multiple `setError(null)` calls that may be share-error or sequential-clear; the exact target shape depends on how the file is structured.
- If a mutation operation shares the `[error, setError]` with a load, ANOTHER useState `[mutationError, setMutationError]` may be needed to separate concerns. Document any structural change in implementation notes.
- If after reading the file the conversion looks awkward, FLAG it and consider deferring this step — better to leave the file as-is than force a shape that doesn't fit.

**Acceptance criteria**:
- [ ] Typecheck/lint/test green
- [ ] Load operations use useResource; mutation operations remain inline (or split with their own state)
- [ ] No regression in the save-prompt or preview-prompt UX
- [ ] File LoC drops by ~15

**Risk**: low-medium. Mixed load+mutation file means the conversion is per-operation, not per-file.
**Rollback**: `git revert <commit>` — clean.

---

## Implementation Order

All 3 steps are independent (different files, no shared state). Orchestrator can run them in a single parallel wave (3 agents).

## Atomic-step acknowledgments

None. Each step is per-file and reversible.

## Out-of-scope follow-ups (DOCUMENTED, NOT to-be-done)

These were considered and explicitly dropped — see the design correction
table above for the per-file rationale:

- `page-image-panel.tsx` — URL lifecycle cleanup
- `pdf-renderer.tsx` (PdfPage) — URL + IntersectionObserver + ref-based one-shot
- `attributed-preview-pane.tsx` — intentional silent-error pattern
- `routes/workspace/note-editor-page.tsx` — post-load body parsing
- `context/tabs-context.tsx` — Provider context shape

If a future refactor pass surfaces these, the answer is: useResource isn't the right tool for any of them. A different abstraction (e.g., `useStreamedResource`, `useBlobResource`) could cover the blob-URL / streaming cases — file as separate features if/when the pattern is genuinely repeated.

## Implementation Run Summary

All 3 child stories implemented and advanced to `stage: review` in one
parallel wave (3 agents, disjoint files, zero file-overlap conflicts).

| Step | Story | Commit | LoC delta |
|------|-------|--------|-----------|
| 1 | `step-1-memory-tab` | `9f3dda2` | memory-tab 684→652 (−32) |
| 2 | `step-2-course-tab` | `274acd1` | course-tab −18 net |
| 3 | `step-3-prompt-tab` | `4246e76` | prompt-tab 491→477 (−14) |

**Total LoC removed from UI components**: ~64.

### Cross-cutting deviations

- **course-tab drag-reorder migration**: `handleDrop`'s `setUnits(prev => ...)` was migrated to `setData(prev => [reorderedUnits, prevLessons])` using `useResource`'s `setData` callback. Added to handler's dep array per `useExhaustiveDependencies`. Drag-reorder UX preserved.
- **prompt-tab `FragmentCard` mutations stay inline**: `handleSave` and `handleRevert` keep their per-card local state (`saving`/`reverting`/`error`). Only the `FragmentDocument`'s composed-preview load converted to useResource. The mixed-file separation came out cleaner than the story body warned — no state splits required.
- **memory-tab unused setData**: neither converted loader has optimistic-update sites in memory-tab, so `setData` was omitted from the destructures to avoid unused-variable lint errors.

### Verification status

- **Typecheck**: `pnpm --filter @praxis/ui typecheck` clean. Pre-existing 3 UI typecheck errors in `chat-tab-body.tsx`, `chat.tsx`, `notes-list.tsx` (tracked at `idea-fix-exactoptional-typecheck-baseline`) unchanged — those only surface under the stricter desktop tsconfig.
- **Tests**: 155 UI test files / 1600 tests all pass. Including 18 memory-tab tests unmodified.
- **Lint (biome)**: clean on all 3 touched files.
- **Behavior**: rendered loading/error/data UX identical before vs after for all 3 tabs. Refresh callbacks (renamed `refreshMastery`, `refreshMisconceptions`, etc.) still wired to the buttons via the destructure aliases.

### What's now possible

- All 3 configure tabs follow the canonical `useResource` pattern.
- The skipped files (page-image-panel, pdf-renderer, attributed-preview-pane, note-editor-page, tabs-context) are explicitly documented as out-of-scope with rationale, so future refactor passes don't re-discover them as false positives.
