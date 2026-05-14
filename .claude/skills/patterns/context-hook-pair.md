# Pattern: Context + Hook Pair

Shared state that crosses component boundaries is exposed via a Provider + a named hook.
The hook guards: calling it outside the provider throws immediately rather than silently
returning undefined.

## Rationale

React Context without a typed hook leaves consumers dealing with `T | null` and forgetting
to handle the null case. The guard-throwing pattern converts "this is accidentally null"
from a runtime mystery into an immediate, descriptive error at the call site. Praxis uses
this for the global IPC client (PraxisClientProvider), the shared auth status (AuthProvider),
and the shared open-tabs list (TabsProvider).

## Examples

### Example 1: PraxisClientProvider / usePraxisClient

**File**: `packages/ui/src/context/client-context.tsx`

```typescript
const ClientContext = createContext<PraxisClient | null>(null);

export function PraxisClientProvider({ client, children }: Props) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function usePraxisClient(): PraxisClient {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("usePraxisClient must be used inside <PraxisClientProvider>");
  return ctx;
}
```

Usage:

```tsx
// app.tsx:13
<PraxisClientProvider client={client}>
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
</PraxisClientProvider>

// any hook or component:
const client = usePraxisClient();
const courses = await client.artifacts.courses();
```

### Example 2: AuthProvider / useAuthStatus

**File**: `packages/ui/src/context/auth-context.tsx`

```typescript
interface AuthContextValue {
  needsAuth: boolean;
  flagAuthRequired: () => void;  // call when a Claude auth error is detected
  clearAuthRequired: () => void; // call after successful sign-in
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [needsAuth, setNeedsAuth] = useState(false);
  const flagAuthRequired = useCallback(() => setNeedsAuth(true), []);
  const clearAuthRequired = useCallback(() => setNeedsAuth(false), []);
  return (
    <AuthContext.Provider value={{ needsAuth, flagAuthRequired, clearAuthRequired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthStatus(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthStatus must be used inside <AuthProvider>");
  return ctx;
}
```

Usage:

```tsx
// chat-tab-body.tsx — flags auth when an error is detected
const { flagAuthRequired } = useAuthStatus();
useEffect(() => {
  if (lastError && isClaudeAuthRequiredError(new Error(lastError))) {
    flagAuthRequired();
  }
}, [lastError, flagAuthRequired]);

// auth-gate.tsx — reads shared state to show banner across all tabs
const { needsAuth, clearAuthRequired } = useAuthStatus();
```

### Example 3: TabsProvider / useTabs

**File**: `packages/ui/src/context/tabs-context.tsx`

```typescript
interface UseTabsResult {
  openTabs: ReadonlyArray<TabSummary>;
  activeTabId: TabId | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  openTab(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;
  closeTab(tabId: TabId): Promise<void>;
  switchTo(tabId: TabId): Promise<void>;
  // ... plus openDocumentTab, reopenTab, renameTab
}

const TabsContext = createContext<UseTabsResult | null>(null);

export function TabsProvider({ children }: { children: ReactNode }) {
  const value = useTabsState(); // internal hook that owns the state
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): UseTabsResult {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used within a TabsProvider");
  return ctx;
}
```

`useTabsState()` (internal, never called by consumers) loads `client.tabs.listOpen()` on
mount via a manual `refresh()` callback wired into `useEffect`, then exposes optimistic-update
mutations. The provider is mounted once in `app.tsx` between `<AuthProvider>` and
`<RouterProvider>`, so every consumer — the chat workspace and `useDerivedScope` — reads from
one shared fetch per route navigation.

```tsx
// app.tsx — provider nesting
<PraxisClientProvider client={client}>
  <AuthProvider>
    <TabsProvider>
      <RouterProvider router={router} />
    </TabsProvider>
  </AuthProvider>
</PraxisClientProvider>

// any component or hook:
const { openTabs, activeTabId, openTab } = useTabs();
```

### Example 4: Adding to tests

When a component uses `usePraxisClient()` or `useAuthStatus()`, tests must wrap with the
provider:

```tsx
// Any test rendering ChatRoute:
render(
  <PraxisClientProvider client={makeFakeClient(...)}>
    <AuthProvider>
      <ChatRoute />
    </AuthProvider>
  </PraxisClientProvider>
);
```

## When to Use

- State that multiple sibling or distant-descendant components must share without
  prop-drilling through unrelated intermediaries
- State that should clear or update across multiple independently-mounted component instances

## When NOT to Use

- State that stays within a single component or hook — `useState` is simpler
- Server data (courses, sessions) that lives in the database and is consumed by only one
  component — use `useResource` + `client.*` calls directly; don't put it in context
  unless multiple sibling consumers would otherwise issue duplicate fetches
- Per-tab state (message logs, composer value) — those belong inside `<ChatTabBody>`;
  context here would break tab isolation

## Common Violations

- Calling `useContext(SomeContext)` directly and handling `null` at the call site — use the
  hook-with-guard pattern instead so errors surface at the hook call, not scattered
- Putting the Provider inside the component that also needs the context — the Provider must
  be an ancestor, not a sibling
- Using a context for data that's already accessible via `usePraxisClient()` and the IPC client
