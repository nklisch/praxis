---
id: refactor-useresource-adoption-sweep-step-1-memory-tab
kind: story
stage: done
tags: [refactor, ui]
parent: refactor-useresource-adoption-sweep
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: memory-tab — convert 4 single-fetch loaders to useResource

## Brief

`packages/ui/src/routes/configure/memory-tab.tsx` contains 5 inline load
blocks (mastery, misconceptions, procedural, affective, episodic-events).
Four are textbook single-fetch shape and convert cleanly to `useResource`.
The fifth (`loadEpisodic`) is streaming with an AbortController — it stays
inline.

## Files

- `packages/ui/src/routes/configure/memory-tab.tsx` only

## Hook signature (reference)

`packages/ui/src/hooks/use-resource.ts`:

```ts
export function useResource<T>(loader: () => Promise<T>): UseResourceResult<T>;

export interface UseResourceResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}
```

The hook calls `loader` on mount and whenever its identity changes.

## Per-loader conversions

### 1. mastery (lines ~40-56)

**Before**:
```ts
const [mastery, setMastery] = useState<Array<[ConceptId, ConceptMastery]>>([]);
const [masteryLoading, setMasteryLoading] = useState(false);
const [masteryError, setMasteryError] = useState<string | null>(null);

const loadMastery = useCallback(async () => {
  setMasteryLoading(true);
  setMasteryError(null);
  try {
    const model = await client.memory.studentModel();
    setMastery(Array.from(model.conceptMastery.entries()));
  } catch (err) {
    setMasteryError(err instanceof Error ? err.message : String(err));
  } finally {
    setMasteryLoading(false);
  }
}, [client]);
```

**After**:
```ts
const loadMastery = useCallback(
  async () => {
    const model = await client.memory.studentModel();
    return Array.from(model.conceptMastery.entries());
  },
  [client],
);
const {
  data: mastery = [],
  loading: masteryLoading,
  error: masteryError,
  refresh: refreshMastery,
  setData: setMastery,
} = useResource<Array<[ConceptId, ConceptMastery]>>(loadMastery);
```

### 2. misconceptions (lines ~58-75)

Same shape — `client.memory.misconceptions()` returns `Misconception[]`.

### 3. procedural (lines ~77-93)

Same shape — `client.memory.procedural()` returns `ProceduralModel | null`.
The default value on destructure: `data` is `ProceduralModel | null | undefined` — handle the `undefined` (pre-load) case in render OR default to `null`:

```ts
const { data: procedural = null, ... } = useResource(loadProcedural);
```

### 4. affective (lines ~95-111)

Same shape — `client.memory.affective()` returns `AffectiveModel | null`.

## Stay inline (DO NOT convert)

### 5. loadEpisodic (lines ~113-150 area)

Streaming with AbortController. Uses `for await (const evt of client.memory.episodic({}))`. `useResource` doesn't cover this shape — it's single-promise only. Leave the entire `loadEpisodic` block intact, including:
- `const [episodicEvents, setEpisodicEvents] = useState<EpisodicEvent[]>([])`
- `const [episodicLoading, setEpisodicLoading] = useState(false)`
- `const [episodicError, setEpisodicError] = useState<string | null>(null)`
- `const episodicAbortRef = useRef<AbortController | null>(null)`
- The `loadEpisodic` useCallback body

## Callers of `loadMastery` / `loadMisconceptions` / etc.

These callbacks are invoked from buttons / tab-switch handlers / etc. The
new `refresh` returned from useResource is the equivalent — rename the
caller's invocation OR keep the name `loadMastery` referring to `refresh`:

```ts
// If caller does: <button onClick={loadMastery}>Refresh</button>
// Either: alias the destructure: refresh: loadMastery
// Or: change the JSX to: <button onClick={refreshMastery}>
```

Recommend aliasing in the destructure (`refresh: loadMastery`) so JSX
doesn't need to change.

## Optimistic updates

If any of the original code does an optimistic update via `setMastery` /
`setMisconceptions` / etc. (e.g., remove a deleted concept from the list
without a refresh), preserve that via `useResource`'s `setData` callback —
already in the destructure example above.

## Implementation notes

- Read the file fully before editing. Confirm each loader's exact return type.
- The hook fires its loader on mount via `useEffect(refresh, [refresh])`. The inline blocks already use `useEffect(loadX, [loadX])` separately — those `useEffect` calls should be REMOVED after the conversion (the hook owns the mount effect).
- The hook's `useEffect` runs whenever the loader's identity changes. Make sure your `useCallback` deps are tight — including `client` and any other inputs.
- Verify the `studentId` / "reset" handlers (`resetTarget`, `clearTarget`) still work after deletion — they trigger mutations followed by a refresh; the `refresh` returned from useResource is the right callback.

## Tests to verify

- `pnpm --filter @praxis/ui typecheck`
- `pnpm --filter @praxis/ui test` (especially any test files mentioning `memory-tab` — grep `__tests__/`)
- `pnpm biome check packages/ui/src/routes/configure/memory-tab.tsx`

Pre-existing baseline: 3 typecheck errors in UI files (chat-tab-body, chat, notes-list), ~524 lint errors in `.mockups/**.html`, one flaky `use-fragment-overrides` test. Treat as baseline.

## Acceptance criteria

- [ ] Typecheck/lint/test green (baseline preserved)
- [ ] 4 inline load blocks → 4 `useResource` calls (mastery, misconceptions, procedural, affective)
- [ ] `loadEpisodic` stays inline (explicitly preserved)
- [ ] All renders identical loading/error/data UX before vs after
- [ ] File LoC drops by ~30-40
- [ ] No new typecheck errors beyond baseline

## Risk

**Low** — single-file UI refactor. The pattern is established elsewhere in the codebase. Pre-existing tests cover the rendered behavior.

## Rollback

`git revert <commit>` — clean.

## Implementation notes

**Conversions performed (4 loaders):**

1. **mastery** — `client.memory.studentModel()` → transform to `Array.from(model.conceptMastery.entries())`. Returned `Array<[ConceptId, ConceptMastery]>`. `useResource` destructure uses `refresh: refreshMastery`; handlers updated from `loadMastery()` to `refreshMastery()`.

2. **misconceptions** — `client.memory.misconceptions()` → returns `Misconception[]` directly. `refresh: refreshMisconceptions`; handler updated from `loadMisconceptions()` to `refreshMisconceptions()`.

3. **procedural** — `client.memory.procedural()` → returns `ProceduralModel | null`. Destructure defaults: `data: procedural = null`.

4. **affective** — `client.memory.affective()` → returns `AffectiveModel | null`. Destructure defaults: `data: affective = null`.

**Skipped (intentionally):**

5. **episodic** — streaming `for await` with AbortController. Doesn't fit `useResource` (single-promise only). Left fully intact.

**Manual useEffect blocks removed:** 1 — the combined mount effect that called all 4 loaders:
```ts
useEffect(() => {
  loadMastery(); loadMisconceptions(); loadProcedural(); loadAffective();
}, [loadMastery, loadMisconceptions, loadProcedural, loadAffective]);
```
The 2 remaining useEffects (episodic lazy-load + episodic cleanup on unmount) are unchanged.

**`setData` note:** Neither `mastery` nor `misconceptions` had in-place optimistic updates — mutation handlers called `await refresh()` directly. No `setData` usages were needed, so they were omitted from the destructure to avoid unused-variable lint errors.

**File LoC delta:** 684 → 652 = -32 lines (within the expected 30-40 range).

**Baseline confirmation:**
- `pnpm --filter @praxis/ui typecheck` — passed (no new errors)
- `pnpm biome check packages/ui/src/routes/configure/memory-tab.tsx` — passed
- `pnpm --filter @praxis/ui test` — 18/18 memory-tab tests pass; 155/155 test files pass; 1 pre-existing unhandled error in `configure-course-tab` (`setUnits is not defined` in `course-tab.tsx`) confirmed pre-existing (course-tab.tsx was already modified before this story)

## Review (2026-05-18)

**Verdict**: Approve
**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Clean conversion of 4 single-fetch loaders to useResource. The 5th (loadEpisodic) correctly stayed inline. Manual mount useEffect removed (was firing all 4 loaders); useResource owns the mount. `setData` correctly omitted since memory-tab has no optimistic-update sites. File 684→652 LoC (−32). 18/18 memory-tab tests pass; UI typecheck and biome clean. The two remaining useEffects (episodic lazy-load + cleanup-on-unmount) are unchanged.
