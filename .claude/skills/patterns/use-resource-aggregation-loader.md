# useResource + Promise.all Aggregation Loader

When a single UI surface needs N independent backend reads, wrap them in a
`useCallback`'d loader that runs `Promise.all` and returns a single
aggregated object; hand the loader to `useResource` so loading/error/refresh
apply atomically to the whole page.

## Rationale

The Library route needs courses + packs + documents + recent sessions; the
Course detail route needs course + lessons; the Library document picker
needs library + attached set. All four are page-level reads where there's
no value in showing one half before the other — partial render thrash is a
worse UX than a single brief loading state. The `Promise.all` inside one
`useResource` loader gives a single `loading` flag, a single `error` (the
first rejection bubbles up), and a single `refresh()` that re-fans-out,
while each sub-call still runs in parallel. The pattern composes with
optimistic updates via `setData` on the aggregated object.

## Examples

### Example 1: Library route — 4 sources

**File**: `packages/ui/src/hooks/use-library.ts:36`

```typescript
const loader = useCallback(async (): Promise<LibraryData> => {
  const [courses, packs, documents, recentSessions] = await Promise.all([
    client.artifacts.courses(),
    client.packs.listAvailable(),
    client.documents.list(),
    client.session.list({ limit: 10, includeEnded: true, excludeModeIds: ["configure"] }),
  ]);
  return { courses, packs, documents, recentSessions };
}, [client]);

const { data, loading, error, refresh } = useResource(loader);
```

### Example 2: Course detail — 2 sources keyed on `courseId`

**File**: `packages/ui/src/hooks/use-course-detail.ts:22`

```typescript
const loader = useCallback(async () => {
  if (!courseId) return { course: null, lessons: [] };
  const [course, lessons] = await Promise.all([
    client.artifacts.course(courseId),
    client.artifacts.lessons(courseId),
  ]);
  return { course, lessons };
}, [client, courseId]);

const { data, loading, error, refresh } = useResource(loader);
```

### Example 3: Library document picker — paired list + attached set, with optimistic `setData`

**File**: `packages/ui/src/components/library-document-picker.tsx:36`

```typescript
const loader = useCallback(async () => {
  const [library, attached] = await Promise.all([
    client.documents.list(),
    client.documentScopes.listForScope(scope),
  ]);
  const attachedIds = new Set(attached.map((d) => d.documentId));
  return { library, attachedIds };
}, [client, scope]);

const { data, loading, error, setData, refresh } = useResource(loader);
```

Also: `packages/ui/src/hooks/use-due-cards.ts:32`,
`use-course-gates.ts:65`, `use-gates.ts:26`, `use-assignment.ts:59`,
`use-lock.ts:30`.

## When to Use

- A UI surface needs ≥2 backend reads and there's no benefit to
  streaming results into the DOM as they arrive.
- The reads are independent (no second call depends on the first).
- The page should refresh as a unit (one `refresh()` button / one
  revalidation event).

## When NOT to Use

- The reads are dependent — chain `await` sequentially inside the
  loader.
- One read is cheap and instant, the other slow — surface them with
  separate hooks so the fast section paints first.
- Different parts of the page must show different loading/error states
  — use separate `useResource` hooks per slice.

## Common Violations

- Calling `useState` + `useEffect` + `setLoading`/`try`/`catch`/`finally`
  manually instead of `useResource`.
- Running reads sequentially with multiple `await` instead of
  `Promise.all` (waterfall latency).
- Building bespoke loading flags per slice when the page already loads
  as a unit.
