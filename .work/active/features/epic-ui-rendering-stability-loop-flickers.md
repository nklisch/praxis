---
id: epic-ui-rendering-stability-loop-flickers
kind: feature
stage: review
tags: [ui, bug]
parent: epic-ui-rendering-stability
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Loop flickers — kill the re-render storms in the documents sidebar and audit log

## Brief

Two visible "flicker" bugs both come from React components re-rendering
more often than the underlying data actually changes. The documents
sidebar (inline in the chat route) flashes between its library view and
a loading state during a session — a `loading` boolean is flipping back
to true on dependency changes that don't represent a real reload, or
the data fetch is being re-triggered on every render. The audit log
sub-tab in the Memory Inspector re-renders continuously — surprising
because that surface is a **one-shot fetch via `useConfiguratorActions`**
(not a stream subscription, contrary to the epic body's initial framing),
so the loop is likely from a `useEffect` dep array containing freshly-
constructed objects or arrays, or from a re-fetch hook keyed on an
unstable identity.

This feature bundles both because the diagnostic pattern is the same —
profile in React DevTools, identify the unstable dependency or
re-fetching path, stabilize identity with `useMemo`/`useCallback` or
hoist the fetch trigger outside the render cycle — and any reusable
helper or pattern-skill that surfaces should apply to both.

## Epic context

- Parent epic: `epic-ui-rendering-stability`
- Position in epic: paired with `…-state-transitions` (the other
  half of the epic). Independent — runs in parallel.

## Scope absorbed from backlog

- `bug-chat-documents-sidebar-flicker` — sidebar in the chat workspace
  flashes between library and loading state; loading boolean likely
  flipping back to true on every dependency change.
- `idea-audit-log-render-flicker` — audit log re-renders in a tight
  loop; classic `useEffect` deps include freshly-constructed
  object/array each render, or a hook is re-keying on every render.

## Foundation references

- `docs/ARCHITECTURE.md` — chat workspace surface, configure-surface
  Memory Inspector
- `CLAUDE.md` — patterns `use-resource-hook`, `context-hook-pair`,
  `editorial-ui-primitives`

## Anchors (current implementation)

- Chat-scoped documents sidebar — inline in
  `packages/ui/src/routes/chat.tsx:48-148`; uses `useDerivedScope()`
  and calls `client.documentScopes.listForScope(scope)` conditionally
- Documents list component — `packages/ui/src/components/DocumentList.tsx`
  (or equivalent) consumed by the sidebar
- Audit log surface —
  `packages/ui/src/components/memory-inspector-tabs.tsx:268-303`
  (AuditTab sub-component within the Memory Inspector)
- Audit log data hook — `useConfiguratorActions()` at
  `packages/ui/src/hooks/use-configurator-actions.ts` (or wherever the
  hook lives) — note this is one-shot fetch, NOT a fanout-stream
- `useResource` hook — for reference; the audit hook may need a
  similar single-fetch-on-mount shape

## Pre-design decisions (2026-05-14)

- **None surfaced at scope-ambiguity sweep.** This is a diagnostic
  feature — feature-design starts by reproducing each flicker with
  React DevTools Profiler, identifies the unstable dependency or
  re-fetching path, then picks the fix. Decisions land at feature-
  design time, not now.

## Diagnosis (2026-05-14)

Both bugs share **one root cause**: a `useEffect`/`useCallback` whose dep
array contains an **identity-unstable value** (fresh object literal each
render). Re-reading the actual code confirms the framing in the brief —
neither bug is a stream subscription churn.

### Bug 1 — Documents sidebar flicker

**Anchor**: `packages/ui/src/routes/chat.tsx:62-70`

```typescript
const scope = useDerivedScope();              // freshly-built object each render
const scopedLoader = useCallback(async () => {
  if (scope.kind === "all") return null;
  return client.documentScopes.listForScope(scope);
}, [client, scope]);                          // <-- scope identity churns
const { data: scopedDocs, loading: scopedLoading, error: scopedError } =
  useResource(scopedLoader);                  // re-fires its useEffect on every parent re-render
```

**Why it flickers**: `useDerivedScope()` returns a brand-new object literal
on every call (e.g. `{ kind: "course", id: rawId as CourseId }` at
`use-derived-scope.ts:60`). Even when the logical scope is identical to the
previous render, the object reference differs → `scopedLoader` identity
changes → `useResource`'s mount-effect (`useEffect(() => refresh(),
[refresh])` at `use-resource.ts:44-46`) re-fires → `setLoading(true)` flips
back, the `DocumentList` displays its loading state → the fetch resolves →
list re-appears. Any parent re-render (tabs hook stream update, ingestion
progress update, etc.) drives the flash.

**Fix shape**: Stabilize the `scope` identity at its source so equal scopes
yield equal references. Either:
- **Memoize the returned object inside `useDerivedScope`** keyed on
  primitives (`kind`, `id`), OR
- **Pass primitives to the loader** — call `useCallback` with
  `[client, scope.kind, "id" in scope ? scope.id : null]` and rebuild
  the scope object inside the loader body (does not leak into the deps).

We choose **memoize at the source**. Reasons: (1) `useDerivedScope` is
the SSOT for scope; any caller benefits, not just this one. (2) The
"pass primitives" shape requires every caller to spell out the union
flattening — error-prone and ugly when reused. (3) Single-pointed fix
mirrors the principle in `use-resource-hook` pattern: stable loader
identity is the caller's job, and the cleanest way is to give every
caller a stable input.

### Bug 2 — Audit log render loop

**Anchor**: `packages/ui/src/hooks/use-configurator-actions.ts:25-40`

```typescript
const refresh = useCallback(async () => {
  /* fetch */ const rows = await client.author.listConfiguratorActions(opts ?? {});
  /* set */
}, [client, opts]);                            // <-- opts identity churns

useEffect(() => {
  refresh();
}, [refresh]);
```

**And the consumer call site** at `memory-inspector-tabs.tsx:65`:

```typescript
const { actions: auditActions, loading: auditLoading, error: auditError } =
  useConfiguratorActions({ limit: 100 });      // fresh object literal every render
```

**Why it loops**: The caller passes a freshly-constructed `{ limit: 100 }`
literal each render. Inside the hook, `refresh` lists `opts` in its dep
array — so `refresh` identity changes every render. The `useEffect(() =>
refresh(), [refresh])` then fires on every render, which calls
`setLoading(true)` + `setActions(...)` — both trigger another parent
render → another fresh `opts` → another `refresh` identity → tight loop.

**Fix shape**: Stabilize the dep at the hook boundary by **destructuring
the primitives out of `opts`** so the `useCallback` depends on
`[client, fromTs, limit]` instead of `[client, opts]`. This is the
standard fix for "hooks that accept an options object" — the same shape
used in `use-notes.ts` (see `use-resource-hook` pattern example 1, which
spreads `opts.courseId` / `opts.format` into deps).

Acceptable alternative: require callers to memoize `opts` themselves
(documented contract). Rejected — the hook is the seam where stability
belongs; callers should be allowed to pass literals.

## Architectural choice

**One pattern, two surgical fixes** — not a refactor, not a new helper.
Each bug already has a canonical fix shape in the existing
`use-resource-hook` pattern; both surface the same lesson (deps must be
identity-stable). We do NOT extract a new helper (e.g.
`useStableObject`) — `useMemo` + careful dep arrays cover both cases
with less indirection.

Alternatives considered:
1. **New `useStableValue` hook** — too generic; the React idiom for
   primitives-in-deps is already established. Rejected.
2. **Add a runtime warning in `useResource` when loader identity changes
   N times per second** — useful telemetry but out of scope; the
   `simplify` skill in the patterns gate can suggest later.
3. **Replace `useDerivedScope`'s object return with a discriminated
   primitive tuple** — viable but invasive; touches every consumer.
   Rejected; memoize-at-source is enough.

## Implementation Units

### Unit 1: Stabilize `useDerivedScope` return identity
**File**: `packages/ui/src/hooks/use-derived-scope.ts`
**Story**: `epic-ui-rendering-stability-loop-flickers-sidebar`

Wrap the return value in `useMemo` keyed on the primitives that
determine equality. The logic stays line-for-line identical; only the
identity contract changes.

```typescript
import { useMatches } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTabs } from "./use-tabs.js";

export function useDerivedScope(): DerivedScope {
  const matches = useMatches();
  const { openTabs, activeTabId } = useTabs();
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  // Compute the (kind, id) tuple from route + active tab, then memoize
  // the returned object on those primitives.
  const courseMatch = matches.find((m) => {
    const id = m.routeId as string;
    return id === "/courses/$courseId" || id.startsWith("/courses/$courseId/");
  });

  let kind: DerivedScope["kind"] = "all";
  let id: string | null = null;

  if (courseMatch && (activeTab === undefined || activeTab.kind !== "document")) {
    const rawId = (courseMatch.params as Record<string, string | undefined>).courseId;
    if (rawId) {
      kind = "course";
      id = rawId;
    }
  } else if (activeTab && activeTab.kind === "session" && activeTab.modeId === "bootstrap") {
    kind = "session";
    id = activeTab.sessionId;
  }
  // document-tab branch + default fall through to { kind: "all" }

  return useMemo<DerivedScope>(() => {
    if (kind === "course" && id) return { kind: "course", id: id as CourseId };
    if (kind === "session" && id) return { kind: "session", id: id as SessionId };
    return { kind: "all" };
  }, [kind, id]);
}
```

**Implementation Notes**:
- Preserve the JSDoc — decision tree commentary stays. The change is
  identity, not branching.
- The `useMemo` must come AFTER all conditional reads to keep hook order
  stable. The early-return shape (returning inside each branch) is
  replaced by a single `useMemo` return at the bottom.
- `SessionId` import already exists in the file via `DocumentScope`'s
  transitive types; verify with `tsgo` and add explicit import if
  needed.
- Keep the document-tab fallback comment intact — it documents future
  work.

**Acceptance Criteria**:
- [ ] Two consecutive renders with identical route + tabs state return
      the SAME object reference (`Object.is(prev, curr) === true`).
- [ ] Changing `courseId` in the route params produces a new reference
      with the new id.
- [ ] Switching from a non-document tab to a document tab while on a
      course route returns `{ kind: "all" }` (existing behavior).
- [ ] In `chat.tsx`, the documents sidebar no longer flashes when an
      unrelated parent re-render fires (verify via React DevTools
      Profiler: `useResource`'s effect runs once per scope change, not
      once per parent render).
- [ ] `pnpm --filter @praxis/ui test` passes; new test verifies
      reference stability.

---

### Unit 2: Stabilize `useConfiguratorActions` deps
**File**: `packages/ui/src/hooks/use-configurator-actions.ts`
**Story**: `epic-ui-rendering-stability-loop-flickers-audit`

Destructure `opts` and list the primitives in the `useCallback` deps.
Matches the `useNotes` shape from the `use-resource-hook` pattern
(example 1).

```typescript
import type { ConfiguratorActionRow, Timestamp } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseConfiguratorActionsResult {
  actions: ConfiguratorActionRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useConfiguratorActions(opts?: {
  fromTs?: Timestamp;
  limit?: number;
}): UseConfiguratorActionsResult {
  const client = usePraxisClient();
  const fromTs = opts?.fromTs;
  const limit = opts?.limit;
  const [actions, setActions] = useState<ConfiguratorActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await client.author.listConfiguratorActions({
        ...(fromTs !== undefined && { fromTs }),
        ...(limit !== undefined && { limit }),
      });
      setActions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, fromTs, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { actions, loading, error, refresh };
}
```

**Implementation Notes**:
- Spread the optional primitives into the request payload only when
  defined — matches `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
  idiom used in `use-notes.ts`.
- The IPC method `listConfiguratorActions` already accepts `fromTs?` /
  `limit?` so signature is unchanged.
- Consider converting the hook to layer on top of `useResource` to bring
  it under the pattern. Out of scope for this fix — flag it as a
  follow-up refactor item in the simplify gate, do not bundle here.

**Acceptance Criteria**:
- [ ] Mounting `<MemoryInspectorTabs />` calls
      `client.author.listConfiguratorActions` exactly ONCE on initial
      load (verify via a spy in the test).
- [ ] Subsequent unrelated parent re-renders (e.g., changing
      `activeTab` state) do NOT trigger additional calls.
- [ ] Changing the `limit` prop value (50 → 100) DOES trigger a refetch.
- [ ] Audit-log items render once; no DOM thrash visible via React
      DevTools Profiler.
- [ ] `pnpm --filter @praxis/ui test` passes; new test asserts call
      count after re-renders.

---

## Implementation Order

1. **Unit 1** (`…-sidebar`) — `use-derived-scope.ts` memoization
2. **Unit 2** (`…-audit`) — `use-configurator-actions.ts` dep
   destructuring

Independent — no `depends_on` between them. Both can run in parallel
under `/agile-workflow:implement-orchestrator`.

## Testing

### Unit 1 tests: `packages/ui/src/hooks/__tests__/use-derived-scope.test.ts`

- **Reference stability under re-render**: render a component that calls
  `useDerivedScope()`, capture the returned reference, force a parent
  re-render with no input change, capture again, assert `Object.is`.
- **New reference on courseId change**: change route params, assert
  different reference + correct shape.
- **Course → document tab fall-through**: with a course route active
  and a document tab active, returns `{ kind: "all" }`.
- **Bootstrap session branch**: active tab `kind:"session"`,
  `modeId:"bootstrap"` returns `{ kind: "session", id }`.

Use `makeFakeClient` + `<PraxisClientProvider>` per `ui-test-helper`
pattern. Mock `useMatches` and `useTabs` via the `async importOriginal`
form.

### Unit 2 tests: `packages/ui/src/hooks/__tests__/use-configurator-actions.test.ts`

- **Single fetch on mount**: render with `{ limit: 100 }`, assert spy
  called once. Force a parent re-render with the SAME literal `{ limit:
  100 }`, assert spy STILL called once (this is the regression test).
- **Re-fetch on limit change**: render with `{ limit: 100 }`, re-render
  with `{ limit: 50 }`, assert spy called twice.
- **No-opts call**: render with no argument; assert single call with
  empty payload.
- **Error path**: spy rejects → `error` set, `loading` false, `actions`
  unchanged.

Use the `ui-test-helper` pattern (`makeFakeClient` for `client.author`).

## Risks

- **`useTabs` may also return fresh arrays each render** (`openTabs`
  array literal from internal state) — if so, `useDerivedScope`'s
  `openTabs.find(...)` will work, but consumers of `openTabs` as an
  effect dep elsewhere could share this bug shape. **Mitigation**:
  scoped fix here; if the patterns gate later flags more identity
  churn, file separate items.
- **Snapshot of `useMatches`** — TanStack Router may return a fresh
  match array each navigation event but stable on no-op renders. The
  `useMemo` keyed on extracted primitives sidesteps this entirely. No
  action needed.
- **Audit-log hook fix doesn't address the `useResource` layering
  opportunity** — accepted risk; pattern conformance is a separate
  cleanup. Flagged in Implementation Notes for the simplify gate.
- **No production telemetry confirms the loop count** — the bug is
  visually observable and the code path is mechanically certain
  (object-literal-in-deps), so we trust the diagnosis without
  instrumentation.
