# Pattern: UI Test Helper

UI tests in `@praxis/ui` follow three shared conventions: a `makeFakeClient(overrides)`
helper that stubs the full PraxisClient from a single source, a standard render wrapper
with `<PraxisClientProvider>`, and a consistent TanStack Router mock for route-dependent
components.

## Rationale

`PraxisClient` grows with each new phase (Phase 13 added `claudeAuth`, `shell`; Phase 14
added `tabs`). Before a shared helper existed, 29 test files each built an inline
`{ session: {...}, artifacts: {} as PraxisClient["artifacts"], ... }` literal — 310 inline
casts. Every new field broke all 29 files. The single `makeFakeClient` helper means adding
a new PraxisClient field requires updating one file, not twenty-nine.

## Examples

### Example 1: The helper — `__tests__/helpers/fake-client.ts`

```typescript
// packages/ui/src/__tests__/helpers/fake-client.ts
export function makeFakeClient(overrides?: Partial<PraxisClient>): PraxisClient {
  return {
    session: {} as PraxisClient["session"],
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
    tabs: {} as PraxisClient["tabs"],
    ...overrides,
  };
}
```

### Example 2: Minimal test — calling with empty overrides

**File**: `packages/ui/src/__tests__/courses-route.test.tsx`

```typescript
import { makeFakeClient } from "./helpers/fake-client.js";

const client = makeFakeClient({
  artifacts: {
    courses: vi.fn().mockResolvedValue([]),
    // ...only mock what this test exercises
  } as PraxisClient["artifacts"],
});
```

### Example 3: Full route test with auth + tab overrides

**File**: `packages/ui/src/__tests__/chat-route.test.tsx`

```typescript
function makeTestClient(sessionOverrides?: Partial<PraxisClient["session"]>): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({ sessionId: brandId("s1"), modeId: "teach", ... }),
      end: vi.fn().mockResolvedValue({ ... }),
      send: vi.fn(async function* () {}) as unknown as ...,
      list: vi.fn().mockResolvedValue([]),
      ...sessionOverrides,
    },
    tabs: {
      listOpen: vi.fn().mockResolvedValue([]) as any,
      open: vi.fn().mockResolvedValue(TAB_RESULT),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      // ...etc
    },
  });
}
```

### Example 4: PraxisClientProvider render wrapper

**File**: `packages/ui/src/__tests__/chat-route.test.tsx:113-118`

```tsx
function renderWithClient(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>    {/* required for components that useAuthStatus() */}
        <ChatRoute />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}
```

### Example 5: TanStack Router mock

**File**: `packages/ui/src/__tests__/chat-route.test.tsx:31-39`

```typescript
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,                        // keep Link, etc. real
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
  };
});
```

For routes that use `useNavigate` + `useSearch` + `useParams`, always mock all three.
The `async importOriginal` form preserves non-hook exports (Link, redirect, etc.).

### Example 6: Streaming mock

**File**: `packages/ui/src/__tests__/use-streamed-send.test.tsx`

```typescript
send: vi.fn(async function* () {
  for (const event of events) yield event;
}) as unknown as PraxisClient["session"]["send"],
```

The `as unknown as ...` cast is needed because vitest's `vi.fn()` wrapper around an
async generator doesn't satisfy the exact TS type — it's only safe because we've verified
the generator yields correctly typed events.

## Standard setup and teardown

```typescript
afterEach(() => cleanup());   // prevent cross-test DOM leakage — every test file
```

No global setup file adds `afterEach`. Each test file includes it explicitly.

## When to Use

- Any new UI test that renders a route or component that calls `usePraxisClient()` →
  use `makeFakeClient` + `PraxisClientProvider`
- Any route component that uses TanStack Router hooks (`useNavigate`, `useSearch`,
  `useParams`) → add the `vi.mock("@tanstack/react-router", ...)` block
- Any component that uses `useAuthStatus()` → wrap in `<AuthProvider>`

## When NOT to Use

- Pure utility / hook tests that don't render React components — no providers needed
- `@praxis/client` tests — those test channel routing, not component rendering, and have
  their own `makeTransport()` helper

## Common Violations

- Defining a local `makeFakeClient` in a test file instead of importing the shared helper
  — breaks when `PraxisClient` gains a new field
- Forgetting `afterEach(() => cleanup())` — causes DOM state from one test to leak into
  the next, producing cryptic "element not found" failures
- Mocking `@tanstack/react-router` with the plain factory `vi.mock("...", () => ({...}))` form
  (no `importOriginal`) — loses real exports like `Link`, `redirect`, `createRoute`; use
  the `async (importOriginal)` form to spread actuals before overriding
