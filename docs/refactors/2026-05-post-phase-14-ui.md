# Refactor Plan: Post-Phase-14 UI Consolidation

## Overview

After Phases 13–14 landed, the UI grew quickly: editorial visual system, tabs, Library,
modals for auth/lock/picker. The shape is good; what we accumulated is **duplication that
will only get worse with Phases 15–16**. This plan consolidates that surface area before
sketching and modalities multiply it.

The user explicitly asked about Zustand. I'll answer that first — it's the right place to
calibrate before the rest of the plan lands.

---

## The Zustand question — short answer: skip wholesale, no new dep

I dug into actual state shapes in the UI and the answer is **don't introduce Zustand for
its own sake**. Here's the case:

**Where Zustand would help (real but narrow)**:
- `<ChatTabBody />` shows a per-tab auth banner — signing in via tab A doesn't clear B/C. Genuinely shared cross-tab state. (~1 store.)
- Global "selected install/student" state if/when multi-student lands. (Not v1.)

**Where Zustand would NOT help, and adding it would add noise**:
- `useResource` (8 hooks) already abstracts the load-data-from-server pattern cleanly. Replacing it with Zustand stores duplicates React's render cycle for no gain.
- Per-tab message logs in `useStreamedSend` — explicitly per-instance by design (parallel tabs preserved). A shared store would *break* that isolation.
- `useTabs` is local-to-the-workspace already; one ChatRoute, one hook instance. Zustand wouldn't shorten it.
- Form state (composer value, picker fields) — belongs local.
- `useConfigureState` — already uses React Context, works.

**Recommendation**: solve the cross-tab auth-banner problem with **React Context** (small,
no new dep, fits the codebase) via the `<AuthGate />` extraction below (Step 6). If we
later need a state pattern that Context doesn't serve well — multi-store debugging,
selector-based subscriptions across deeply nested trees — we can add Zustand for that
specific need. Tools should arrive when their pain is real; this codebase's pain is
**duplicated abstractions, not shared state**.

---

## What the explore agents found

| Issue | Sites | Severity |
|---|---|---|
| **5 modals** repeat escape/backdrop/click-outside/ARIA boilerplate | UnlockModal, ClaudeAuthModal, NewTabPicker, ConfirmReasonModal, PickerTierModal | High |
| **310 instances of `{} as PraxisClient["x"]`** in 29 test files | All UI test files | High |
| **`font-family: var(--font-display); font-style: italic`** repeated in 18 CSS modules (19+ rules) | All editorial typography sites | Medium |
| **4 Library sections** with identical loading/empty/list structure | courses/packs/documents/recent-sessions | Medium |
| **5+ routes** inline the same loading/error/empty rendering pattern | courses, packs, workspace tabs, library sections | Medium |
| **`useResource` adoption gap** in `use-lock`, `use-assignment`, `gates-tab` | 3 hooks/components | Medium |
| **Auth banner + modal + retry** flow in chat-tab-body could be shared | ChatTabBody | Medium (gives free fix to multi-tab issue) |
| **`brandId<"StudentId">("") as StudentId` placeholder** | 3 call sites | Low (cosmetic) |
| **Inline `style={{ "--mode-tint": ... }}`** | 4 sites in mode-header + tab-strip | Low (intentional) |
| **PickerTierModal lacks ESC handler, focus trap, error rendering** | 1 file | Low-Medium (latent bug) |

---

## Refactor Steps

Steps are ordered so each is independently shippable + testable. High-value structural
wins land first. Low-value cosmetics last.

### Step 1: `<Modal />` primitive

**Priority**: High
**Risk**: Medium (touches 5 modal files)
**Files**:
- `packages/ui/src/components/modal.tsx` (new)
- `packages/ui/src/components/modal.module.css` (new)
- `packages/ui/src/components/unlock-modal.tsx` + `unlock-modal.module.css` (modify)
- `packages/ui/src/components/claude-auth-modal.tsx` + `claude-auth-modal.module.css` (modify)
- `packages/ui/src/components/new-tab-picker.tsx` + `new-tab-picker.module.css` (modify)
- `packages/ui/src/components/confirm-reason-modal.tsx` + `.module.css` (modify)
- `packages/ui/src/components/picker-tier-modal.tsx` + `.module.css` (modify)

**Current State** — every modal repeats this:

```tsx
// useEffect for ESC
useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [onClose]);

// JSX
<div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
  <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
    {/* per-modal content */}
  </div>
</div>
```

Plus its own `.backdrop` and `.modal` CSS rules in each module — **identical** modulo whitespace. Plus an optional `inputRef` pattern for autofocus.

**Target State**:

```tsx
// modal.tsx
export interface ModalProps {
  /** Called when ESC pressed or backdrop clicked. */
  onClose: () => void;
  /** Optional element to focus on mount (e.g. an input ref). */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Optional aria-label for the dialog. Default: "Dialog". */
  ariaLabel?: string;
  children: React.ReactNode;
}

export function Modal({ onClose, initialFocus, ariaLabel, children }: ModalProps): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => { initialFocus?.current?.focus(); }, [initialFocus]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? "Dialog"}
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
```

Each consumer becomes:

```tsx
<Modal onClose={onClose} initialFocus={inputRef} ariaLabel="Unlock configure">
  <h2 className={styles.title}>Unlock Configure</h2>
  {/* ... rest, no backdrop wrapper, no escape handler */}
</Modal>
```

The per-modal CSS modules drop their `.backdrop` and `.modal` rules entirely — they only keep the *content-specific* styles (.title, .form, .actions, etc.).

**Implementation Notes**:
- **Migrate one modal at a time**, each as its own commit. Order: `UnlockModal` first (smallest), then `ClaudeAuthModal`, `NewTabPicker`, `ConfirmReasonModal`, `PickerTierModal` last (it's missing ESC + focus today, so this also fixes a latent bug).
- The `<Modal />` CSS module is the single source of truth for the editorial backdrop styling — copy from `unlock-modal.module.css:1-18` as the canonical version.
- Each modal's existing tests pass intact (the visible behavior doesn't change), but a couple of test files assert on `getByRole("dialog")` — verify those still work.

**Acceptance Criteria**:
- [ ] `<Modal />` exists and is used by all 5 existing modals.
- [ ] Each per-modal CSS module no longer defines `.backdrop` or `.modal` (those move to `modal.module.css`).
- [ ] All 5 modals close on ESC and on backdrop click (PickerTierModal newly does so).
- [ ] All existing modal tests pass.
- [ ] Net diff: deletions outnumber additions in CSS files.

---

### Step 2: Test `makeFakeClient()` helper

**Priority**: High (massive footprint reduction)
**Risk**: Low (tests are insulated from prod)
**Files**:
- `packages/ui/src/__tests__/helpers/fake-client.ts` (new)
- 29 existing test files (modify)

**Current State** — repeated 310 times across 29 files:

```typescript
function makeFakeClient(/* per-file overrides */): PraxisClient {
  return {
    session: { /* per-test stub */ },
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
  };
}
```

When we add a new `PraxisClient` field (Phase 15 sketches, Phase 16 modalities), every one of these gets a TS error.

**Target State**:

```typescript
// __tests__/helpers/fake-client.ts
import type { PraxisClient } from "@praxis/core/types";

/**
 * Build a deeply-stubbed PraxisClient for tests. Every field is an empty
 * object cast to its type — usable when the test doesn't exercise that
 * service. Override specific fields via `overrides`.
 *
 * Single SOT — when PraxisClient gains a new field, only this helper updates,
 * and every test gets it for free.
 */
export function makeFakeClient(overrides?: Partial<PraxisClient>): PraxisClient {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: every empty stub is a deliberate
    // "this test doesn't exercise this service" signal. Tests override what they need.
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

Each test file becomes:

```typescript
import { makeFakeClient } from "./helpers/fake-client.js";

const client = makeFakeClient({
  session: {
    start: vi.fn().mockResolvedValue({ ... }),
    // ...
  },
});
```

**Implementation Notes**:
- Migrate test files in batches of 5–8 (one batch per commit). Order alphabetically — easier to track.
- Some tests (`chat-route.test.tsx`, `settings-route.test.tsx`) have local `makeFakeClient` helpers with logic — those collapse into calls of the shared helper with overrides.
- The shared helper lives under `__tests__/helpers/` so it's clearly test-only.

**Acceptance Criteria**:
- [ ] Single `makeFakeClient` helper exists at `__tests__/helpers/fake-client.ts`.
- [ ] All 29 test files import and use it.
- [ ] No more inline `{} as PraxisClient["x"]` patterns in tests (grep verifies).
- [ ] All tests still pass.
- [ ] Adding a new field to `PraxisClient` requires updating only this helper.

---

### Step 3: Editorial typography utility class

**Priority**: High (tiny effort, big footprint)
**Risk**: Very low (visual parity required)
**Files**:
- `packages/ui/src/styles/global.css` (modify)
- 18 CSS modules across `components/` and `routes/` (modify)

**Current State** — repeated in 19+ rules across 18 modules:

```css
.title {
  font-family: var(--font-display);
  font-style: italic;
  /* ... per-rule font-size, line-height, color, etc. */
}
```

**Target State** — utility class in global.css:

```css
/* global.css */
.editorial {
  font-family: var(--font-display);
  font-style: italic;
}
```

CSS modules drop the two repeated lines from each rule and apply the utility via `composes`:

```css
/* mode-header.module.css */
.name {
  composes: editorial from global;
  font-size: 1.65rem;
  line-height: 1.05;
  /* ... */
}
```

(CSS Modules' `composes` keyword is supported by Vite. If we want to avoid `composes` for stylistic reasons, alternative: wrap the global class with `:global(.editorial)` and add it as a className alongside the module class.)

**Implementation Notes**:
- Verify visual parity by snapshotting before/after — render every modal + route header in a test, screenshot, compare. If pixel-perfect, ship.
- 18 modules is a one-pass sweep; could also be done piecewise.
- The win isn't dramatic per file (saves 2 lines × 19 rules = ~40 lines), but it eliminates the "did we set the font-family on this new rule?" drift risk that compounds as we add Phase 16 modality bodies.

**Acceptance Criteria**:
- [ ] `.editorial` exists in global.css.
- [ ] All 18 CSS modules use `composes: editorial from global` (or equivalent global class) instead of inlining the two declarations.
- [ ] Visual smoke shows no rendering differences across routes.
- [ ] No tests fail.

---

### Step 4: `<EmptyState />` and `<LoadingState />` primitives

**Priority**: Medium (footprint reduction, consistency)
**Risk**: Low
**Files**:
- `packages/ui/src/components/empty-state.tsx` + `.module.css` (new)
- `packages/ui/src/components/loading-state.tsx` + `.module.css` (new)
- `packages/ui/src/components/empty-tabs-state.tsx` (delete — supplanted)
- ~6 routes / library sections (modify)

**Current State** — every route + library section repeats this shape inline:

```tsx
{loading && <p className={styles.loading}>Loading…</p>}
{error && <p className={styles.error}>{error}</p>}
{!loading && !error && items.length === 0 && (
  <p className={styles.empty}>{COPY.empty.foo}</p>
)}
{items.length > 0 && items.map(/* ... */)}
```

**Target State**:

```tsx
// empty-state.tsx
export interface EmptyStateProps {
  /** Editorial copy line. Use COPY.empty.* values. */
  message: string;
  /** Optional ornament glyph. Default: "·" */
  ornament?: string;
  /** Optional CTA button. */
  action?: { label: string; onClick: () => void };
}
export function EmptyState({ message, ornament = "·", action }: EmptyStateProps): JSX.Element;
```

```tsx
// loading-state.tsx
export interface LoadingStateProps {
  /** Italic ellipsis copy. Use COPY.loading.* values. Default: COPY.loading.default */
  message?: string;
}
export function LoadingState({ message = COPY.loading.default }: LoadingStateProps): JSX.Element;
```

Each consumer becomes:

```tsx
{loading ? <LoadingState message={COPY.loading.courses} />
 : error ? <ErrorMessage error={error} />
 : items.length === 0 ? <EmptyState message={COPY.empty.courses} action={...} />
 : items.map(/* ... */)}
```

`<EmptyTabsState />` (Phase 14) becomes `<EmptyState message={COPY.empty.tabs} action={{ label: "Open a session", onClick: onNew }} />` — its file deletes.

**Implementation Notes**:
- The existing `<EmptyTabsState />` is a fine reference for the editorial styling — copy its CSS into the primitive.
- An `<ErrorMessage />` primitive is implied but cheap; bundle with this step.
- Migrate library sections first (4 files, identical pattern). Then routes one at a time.

**Acceptance Criteria**:
- [ ] `<EmptyState />`, `<LoadingState />`, `<ErrorMessage />` primitives exist.
- [ ] Library section files use them (no more inline empty/loading paragraphs).
- [ ] `<EmptyTabsState />` is replaced and deleted.
- [ ] All copy still routes through `COPY.*`.

---

### Step 5: `<LibrarySection />` primitive

**Priority**: Medium
**Risk**: Low
**Files**:
- `packages/ui/src/components/library/library-section.tsx` + `.module.css` (new)
- `packages/ui/src/components/library/courses-section.tsx` (modify)
- `packages/ui/src/components/library/packs-section.tsx` (modify)
- `packages/ui/src/components/library/documents-section.tsx` (modify)
- `packages/ui/src/components/library/recent-sessions-section.tsx` (modify)

**Current State** — every section reimplements:

```tsx
<section className={styles.section}>
  <header className={styles.header}>
    <span className={styles.ornament}>{ornament}</span>
    <span className={styles.kicker}>{kicker}</span>
    {addAction && <button>...</button>}
  </header>
  {loading ? <LoadingState /> : items.length === 0 ? <EmptyState ... /> : <ul>...</ul>}
</section>
```

Plus identical CSS for `.section`, `.header`, `.ornament`, `.kicker`.

**Target State**:

```tsx
export interface LibrarySectionProps<T> {
  ornament: string;
  kicker: string;
  /** Optional header-right action — e.g. "+ Add document". */
  headerAction?: { label: string; onClick: () => void };
  loading: boolean;
  items: ReadonlyArray<T> | undefined;
  /** Editorial empty-state message. */
  emptyMessage: string;
  /** Render one row. */
  renderItem: (item: T) => React.ReactNode;
  /** Optional key extractor; defaults to JSON.stringify. */
  itemKey?: (item: T) => string;
}

export function LibrarySection<T>(props: LibrarySectionProps<T>): JSX.Element;
```

Each section becomes ~30 lines instead of ~60-80, focused on its specific item shape.

**Implementation Notes**:
- The 4 sections each have unique row shapes; the polymorphism via `renderItem` keeps that flexibility.
- Section-specific CSS for items (`.itemTitle`, `.itemDeck`, etc.) stays in the section file. Only the section *envelope* CSS is centralized.
- Builds on Step 4's `<EmptyState />` and `<LoadingState />`.

**Acceptance Criteria**:
- [ ] `<LibrarySection />` exists.
- [ ] All 4 library section files use it.
- [ ] Each section's CSS module no longer defines `.section`, `.header`, `.ornament`, or `.kicker` (those move to LibrarySection's module).
- [ ] Library route renders identically to before.

---

### Step 6: `<AuthGate />` shared component (also fixes per-tab auth banner)

**Priority**: Medium
**Risk**: Medium (touches chat-tab-body, which is hot)
**Files**:
- `packages/ui/src/components/auth-gate.tsx` + `.module.css` (new)
- `packages/ui/src/context/auth-context.tsx` (new — small global auth status)
- `packages/ui/src/components/chat-tab-body.tsx` (modify)

**Current State** — chat-tab-body.tsx (~lines 71-225) implements:

```tsx
const [needsAuth, setNeedsAuth] = useState(false);
const [showAuthModal, setShowAuthModal] = useState(false);

// Detect auth error on stream
useEffect(() => {
  if (lastError && isClaudeAuthRequiredError(lastError)) {
    setNeedsAuth(true);
  }
}, [lastError]);

return (
  <>
    {needsAuth && (
      <div className={styles.authBanner}>
        <span>Not signed in to Claude.</span>
        <button onClick={() => setShowAuthModal(true)}>Sign in</button>
        <button onClick={() => navigate({ to: "/settings" })}>Switch engine</button>
      </div>
    )}
    {showAuthModal && (
      <ClaudeAuthModal
        onClose={() => setShowAuthModal(false)}
        onSignedIn={() => { setShowAuthModal(false); setNeedsAuth(false); /* retry */ }}
      />
    )}
    {/* rest of chat */}
  </>
);
```

Each `<ChatTabBody />` instance keeps its own banner state — signing in via tab A doesn't clear B/C.

**Target State**:

```tsx
// auth-context.tsx
interface AuthContext {
  needsAuth: boolean;
  flagAuthRequired: () => void;
  clearAuthRequired: () => void;
}
export const AuthProvider: React.FC<{ children: ReactNode }>;
export function useAuthStatus(): AuthContext;
```

```tsx
// auth-gate.tsx
export interface AuthGateProps {
  /** What renders when authenticated. */
  children: ReactNode;
  /** Called after successful sign-in — used to retry the failed action. */
  onSignedIn?: () => void;
}

/**
 * Wraps a surface that depends on Claude auth. When `useAuthStatus().needsAuth`
 * is true, renders an editorial auth banner + the ClaudeAuthModal trigger and
 * disables children. On successful sign-in, all <AuthGate /> instances clear
 * (shared context), so banners on other tabs/routes vanish too.
 */
export function AuthGate({ children, onSignedIn }: AuthGateProps): JSX.Element;
```

Chat-tab-body wraps:

```tsx
<AuthGate onSignedIn={retry}>
  <Composer onSend={handleSend} disabled={isStreaming || examLockdown} />
</AuthGate>
```

`useStreamedSend` calls `flagAuthRequired()` on detecting an auth-required error; `<AuthGate />` reads from context and renders accordingly.

**Implementation Notes**:
- Wrap `<App />` (or the workspace shell) in `<AuthProvider>`.
- `useStreamedSend` (or its caller) calls `useAuthStatus().flagAuthRequired()` in the auth-error branch instead of setting local state.
- The existing per-tab banner CSS moves into `auth-gate.module.css`.
- This solves the multi-tab auth-banner issue from Phase 14 design notes — sign in once, every tab clears.
- The retry-after-signed-in is per-instance; the context only tracks the SHARED state of "are we authed", not per-tab actions.

**Acceptance Criteria**:
- [ ] `<AuthGate />` exists; `useAuthStatus()` returns the shared state.
- [ ] `<App />` is wrapped in `<AuthProvider>`.
- [ ] `<ChatTabBody />` no longer holds local `needsAuth` / `showAuthModal` state.
- [ ] Manual smoke: open 3 tabs, sign out via terminal (`claude auth logout`), reload, all 3 tabs show banners; sign in via tab A's modal, tabs B and C clear immediately.
- [ ] Existing chat-route auth tests pass (may need to update to assert via context).

---

### Step 7: `useResource` adoption in remaining hooks

**Priority**: Medium
**Risk**: Low (these are isolated hooks)
**Files**:
- `packages/ui/src/hooks/use-lock.ts` (modify)
- `packages/ui/src/hooks/use-assignment.ts` (modify)
- `packages/ui/src/routes/configure/gates-tab.tsx` (modify — extract to a hook)

**Current State** — three hooks/components manually implement the load state machine:

```typescript
const [data, setData] = useState<X | undefined>();
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const refresh = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const result = await client.foo.bar();
    setData(result);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}, [client]);

useEffect(() => { refresh(); }, [refresh]);
```

**Target State**:

```typescript
const loader = useCallback(() => client.foo.bar(), [client]);
const { data, loading, error, refresh } = useResource(loader);
```

For mutations (e.g. `useLock`'s `unlock(code)`), wrap them around `setData` for optimistic updates per the existing pattern (see `use-notes.ts:23-30` for a clean example).

**Implementation Notes**:
- `use-lock` mixes data with mutations (`unlock`, `lock`, `setLockCode`). The `useResource` only handles the load; mutations stay as `useCallback` wrappers around `setData`.
- `use-assignment` has secondary loads (responses) — pattern via `Promise.all` shape (see `use-due-cards.ts` for the model).
- `gates-tab.tsx` mixes load logic with rendering — extract a `useGates(courseId)` hook first, then it's a `useResource` consumer.
- `MemoryInspectorTabs` was flagged but legitimately needs two independent loads — leave as is OR extract `useMastery()` + `useMisconceptions()` per the pattern; could be a follow-up step.

**Acceptance Criteria**:
- [ ] `use-lock`, `use-assignment` use `useResource`.
- [ ] `gates-tab` has its load logic extracted to a `useGates` hook.
- [ ] No new state-machine boilerplate.
- [ ] All existing tests for these hooks pass.

---

### Step 8: Drop `brandId<"StudentId">("")` placeholder

**Priority**: Low (cosmetic)
**Risk**: Low
**Files**:
- `packages/core/src/types/tabs.ts` (modify the TabsService interface)
- `packages/client/src/services/tabs-client.ts` (modify)
- `packages/ui/src/hooks/use-tabs.ts` (clean up call sites)
- `packages/ui/src/lib/open-session-in-tab.ts` (clean up)
- `packages/desktop/electron/main/ipc-server.ts` (no change — already resolves studentId server-side)

**Current State**:

```typescript
// hooks/use-tabs.ts:53, :83 and lib/open-session-in-tab.ts:28
const tabs = await client.tabs.listOpen(brandId<"StudentId">("") as StudentId);
```

The `studentId` param exists because the *server-side* `TabsService` interface requires it,
but the client ignores it (server resolves the active student).

**Target State** — split the client interface from the server interface:

```typescript
// types/tabs.ts
export interface TabsService {
  // Server-side: requires studentId
  listOpen(studentId: StudentId): Promise<TabSummary[]>;
  // ... etc
}

export interface TabsClientApi {
  // Renderer-side: no studentId; server resolves
  listOpen(): Promise<TabSummary[]>;
  list(opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]>;
  get(tabId: TabId): Promise<TabSummary | null>;
  open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;
  reopen(tabId: TabId): Promise<TabSummary>;
  close(tabId: TabId): Promise<void>;
  touch(tabId: TabId): Promise<void>;
  rename(tabId: TabId, title: string): Promise<TabSummary>;
}
```

`TabsClient implements TabsClientApi`. `PraxisClient.tabs: TabsClientApi`.

Call sites become clean:

```typescript
const tabs = await client.tabs.listOpen();
const tab = await client.tabs.open({ sessionId: handle.sessionId, courseTitle: "..." });
```

**Implementation Notes**:
- The server-side `TabsService` interface stays untouched — backend code is unaffected.
- Only the client + the 3 call sites change.
- Update `useTabs` hook's openTab/etc. signatures to drop `studentId`.

**Acceptance Criteria**:
- [ ] No call sites use `brandId<"StudentId">("")`.
- [ ] `TabsClientApi` exists separately from `TabsService`.
- [ ] All tests pass.

---

### Step 9: Use `useEasedStream` for ingestion progress (or extract `useAsyncIteratorReducer`)

**Priority**: Low
**Risk**: Low
**Files**:
- `packages/ui/src/hooks/use-async-iterator-reducer.ts` (new — optional)
- `packages/ui/src/hooks/use-ingestion.ts` (modify)
- `packages/ui/src/hooks/use-streamed-send.ts` (modify — optional)

**Current State** — both `useStreamedSend` and `useIngestion` consume async iterators with their own `for await` loops + setState calls. The shape is similar but the state machines differ enough that I'd recommend a **small** abstraction or none at all.

**Target State** — defer to either:
- (a) Just leave them. The duplication is moderate and the shapes are different enough that an abstraction might be over-engineered.
- (b) Extract a `useAsyncIteratorReducer<Event, State>(iterator, reducer, initialState)` that lets each consumer define its own reducer.

**Implementation Notes**:
- This is the lowest-priority step in the plan. **Skip unless** Phase 16's modality bodies introduce a third async-iterator consumer; at three, the abstraction earns its weight.

**Acceptance Criteria**:
- [ ] If implemented: both `useStreamedSend` and `useIngestion` use the new reducer hook.
- [ ] If skipped: noted as "defer to Phase 16 evaluation."

---

## Implementation Order

Steps grouped into shippable batches. Each batch is a single PR or sequence of small commits.

**Batch A — Foundation primitives (high-value, low-risk)**:
1. **Step 2: `makeFakeClient` test helper** — pure win, no prod risk.
2. **Step 3: Editorial typography utility** — visual parity required, test by render.
3. **Step 1: `<Modal />` primitive + 5 modal migrations** — touch one modal at a time.

**Batch B — Component primitives**:
4. **Step 4: `<EmptyState />`, `<LoadingState />`, `<ErrorMessage />`** — small, used everywhere.
5. **Step 5: `<LibrarySection />`** — depends on Step 4.

**Batch C — Behavior consolidation**:
6. **Step 6: `<AuthGate />` + `AuthProvider`** — biggest behavior change; lands a fix (cross-tab banner) too.
7. **Step 7: `useResource` adoption sweep** — independent of others.

**Batch D — Cosmetic**:
8. **Step 8: Drop `brandId` placeholder** — type-only change.
9. **Step 9: `useAsyncIteratorReducer`** — defer unless Phase 16 needs it.

---

## What this DOESN'T do (intentionally)

- **No Zustand introduction** — see top section. Context + the existing hook pattern fits the actual pain.
- **No PickerTierModal redesign** — Step 1 fixes its missing ESC/focus-trap as a side effect; the component otherwise stays.
- **No useStreamedSend / useIngestion unification** — Step 9 defers; reasonable to leave unless Phase 16 introduces a third iterator consumer.
- **No global modal stack management** — modals are short-lived overlays; a `<Modal />` primitive is enough for now. Revisit if multi-modal stacking becomes a pattern.
- **No sketching/canvas refactors** — Phase 15 introduces tldraw which will have its own state shape; design then.

---

## Verification (after each step)

```bash
cd /home/nathan/dev/praxis
pnpm --filter @praxis/ui test
pnpm --filter @praxis/ui typecheck
npx biome check $(git diff --name-only HEAD~1 HEAD packages/ui/src/)
```

Manual smoke after Batch C:
1. Open 3 tabs of different modes.
2. `claude auth logout` in another terminal.
3. Reload the app — all 3 tabs show the auth banner.
4. Click "Sign in" in tab A → modal opens → complete OAuth.
5. Tabs B and C should clear their banners *automatically* (this is the cross-tab fix Step 6 ships).

---

## Estimated payoff

| Step | Lines saved | Risk | Time est |
|---|---|---|---|
| 1 — Modal | ~150 | Medium | 2h |
| 2 — Test helper | ~280 (across tests) | Low | 1.5h |
| 3 — Editorial CSS | ~40 | Very low | 30m |
| 4 — Empty/Loading/Error | ~80 | Low | 1h |
| 5 — LibrarySection | ~120 | Low | 1.5h |
| 6 — AuthGate | ~60 + a bug fix | Medium | 2h |
| 7 — useResource sweep | ~70 | Low | 1.5h |
| 8 — brandId cleanup | ~10 | Low | 30m |
| 9 — Iterator reducer | varies (skip for now) | Low | — |

Total: roughly a **day of focused work** for ~800 lines of cleanup + a real cross-tab bug fix + one foundational pattern (Modal) that every future modal will use.
