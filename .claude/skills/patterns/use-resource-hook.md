# Pattern: `useResource` Hook for Async Loads

`useResource<T>(loader)` is the canonical React hook for "load on mount, expose `{ data, loading, error, refresh, setData }`" in the Praxis UI. Every list/detail hook layers mutations on top of it — never inline the `setLoading/setError/try/catch/finally + useEffect` block.

## Rationale

Eight hooks (`useNotes`, `useFlashcards`, `useDocuments`, `useCourses`, `usePacks`, `useCourseDetail`, `useCourseGates`, `useDueCards`) all repeated the same six-line state machine: three pieces of `useState`, a `useCallback` `refresh` with try/catch/finally, and a mount `useEffect`. Extracting it eliminates ~80 lines of boilerplate, makes future hooks correct-by-default, and centralizes the error-message normalization (`err instanceof Error ? err.message : String(err)`).

## Examples

### Example 1: Simple list hook — `packages/ui/src/hooks/use-notes.ts`

```typescript
import { useCallback } from "react";
import { useResource } from "./use-resource.js";
import { usePraxisClient } from "../context/client-context.js";

export function useNotes(opts: UseNotesOptions = {}): UseNotesResult {
  const client = usePraxisClient();

  const loader = useCallback(
    () => client.notes.list({
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      ...(opts.format !== undefined && { format: opts.format }),
    }),
    [client, opts.courseId, opts.format],
  );

  const { data: notes = [], loading, error, refresh, setData } = useResource(loader);

  const deleteNote = useCallback(
    async (noteId: NoteId): Promise<void> => {
      await client.notes.delete(noteId);
      setData((prev) => (prev ?? []).filter((n) => n.id !== noteId));  // optimistic
    },
    [client, setData],
  );

  return { notes, loading, error, refresh, deleteNote };
}
```

### Example 2: Multi-read loader — `packages/ui/src/hooks/use-due-cards.ts`

When a hook needs `Promise.all([...])`, pack the result into a single object and let `useResource` handle one shape:

```typescript
const loader = useCallback(
  async () => {
    const [count, list] = await Promise.all([
      client.flashcards.dueCount(),
      client.flashcards.list({ due: true }),
    ]);
    return { count, list };
  },
  [client],
);

const { data, loading, error, refresh, setData } = useResource(loader);
const { count = 0, list = [] } = data ?? {};
```

### Example 3: `useResource` interface — `packages/ui/src/hooks/use-resource.ts`

```typescript
export interface UseResourceResult<T> {
  /** Latest loaded value. `undefined` until the first successful load. */
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

export function useResource<T>(loader: () => Promise<T>): UseResourceResult<T>;
// loads on mount; re-runs when loader identity changes (caller controls via useCallback deps)
// catches loader errors and surfaces err.message; clears error on each new load
```

## When to Use

- Any hook that fetches data from `usePraxisClient()` on mount and exposes a list, detail, or aggregate to the consumer
- When you want optimistic mutation updates — use the returned `setData` (supports both direct values and updater functions)
- When mutation errors should also surface as `error` — wrap mutations in try/catch and call `setData` with prior state on failure (or use a separate local state + merge — see `use-packs.ts` for the latter)

## When NOT to Use

- Hooks that don't load on mount (e.g., a hook that only exposes a mutation, no read)
- Hooks that need event-stream subscriptions (`use-streamed-send.ts` is async-iterator-driven; doesn't fit the `Promise<T>` shape)
- Hooks with non-trivial cancellation semantics — `useResource` doesn't currently support `AbortSignal`; if you need it, extend the helper, don't re-roll the boilerplate

## Common Violations

- **Inline `setLoading(true); setError(null); try { ... } catch { ... } finally { setLoading(false); }`** — every such pattern is a candidate for `useResource`. New hooks must not re-introduce the inline form.
- **Stale loader closures** — the loader passed to `useResource` is invoked when its identity changes. Wrap in `useCallback` with the right deps; missed deps cause stale data.
- **Bypassing `setData` for optimistic updates** — don't reach for a separate `useState` to "remove from local list"; the returned `setData` is exactly that, and using it keeps the data path single-sourced.
- **Calling `refresh()` inside the loader** — recursive infinite loop. The loader is the body; `refresh` re-runs it from outside.
