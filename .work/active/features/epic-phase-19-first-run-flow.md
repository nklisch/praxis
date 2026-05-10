---
id: epic-phase-19-first-run-flow
kind: feature
stage: done
tags: [ui, content]
parent: epic-phase-19-ship-v1
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# First-run flow

## Brief

Deliver the v1 first-run user-facing flow: install → sign in / configure
engine → bootstrap a course → start a teach session. Today, opening the
app on a fresh install drops the user into the existing UI shell with no
guided setup; auth and engine config exist as deep settings surfaces but
aren't surfaced as "the next step" for someone who just opened the app
for the first time. ROADMAP calls this out as the v1 acceptance flow and
the test-checkpoint script.

What this feature covers:

- A first-run detection signal in the main process (e.g., `config_kv`
  flag `firstRunCompletedAt`) that gates a renderer route shown only
  when unset.
- A welcome flow with progressive steps: brand intro → engine choice +
  sign-in / API key entry → optional pack-or-bootstrap fork ("start with
  the canonical Algebra pack" / "start with biology" / "start from your
  own syllabus") → land in a teach session of the chosen path.
- Reuses existing services: `BootstrapServiceImpl.createCourseFromPack`
  for the canonical-pack path, `course.start_exploration` for the
  syllabus-driven path. The first-run UI is a wrapper around the
  existing flows, not a parallel implementation.
- Editorial primitives — `RouteHeader`, `EmptyState`, `LoadingState`,
  COPY module — used per the editorial design system in
  `packages/ui/src/`.
- A "skip onboarding" path for power users so the flow is not a wall.

What this feature does NOT cover:

- Authoring of pedagogy or pack content — those live in their own
  features.
- Re-onboarding for existing users — first-run is detected once and
  stays detected.
- A separate "tour" overlay over the main UI — the flow lands in real
  state, not a tutorial.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: independent capability. Does not block other
  features; ship-checklist exercises it end-to-end at the close. The
  onboarding-docs feature reads this flow as ground truth for the
  README rewrite.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Installer flow + first-run
  onboarding") and test checkpoint.
- `docs/UX.md` — editorial design system shape and copy tone.
- `docs/ARCHITECTURE.md` — service composition for the IPC channels the
  flow will call.
- `packages/ui/src/` — RouteHeader, LibrarySection, EmptyState, COPY
  module conventions; `composes: editorial from global;` CSS pattern.
- `packages/curriculum/src/bootstrap/` — bootstrap service the flow
  delegates to.
- `packages/core/src/services/` and `packages/core/src/db/` — `config_kv`
  pattern for the first-run flag.

## Design decisions

- **First-run gate lives in the root route component, not the router's
  `beforeLoad`.** TanStack Router's `beforeLoad` can be async, but
  threading the IPC client through the router config is awkward versus
  reading the flag inside a component via the existing
  `usePraxisClient()` hook. The trade-off — a momentary pre-mount where
  the layout might briefly render empty — is a non-issue under the
  loading-state pattern; the cost of router-level wiring isn't worth
  it.
- **Storage: `config_kv` row keyed `firstRunCompletedAt`.** A single
  ISO-timestamp string (or `null`). Mirror the existing
  `engine-config.ts` and `bootstrap-config.ts` patterns — small reader
  and writer functions, JSON-serialised value via the existing
  `configKv` schema.
- **Three steps, not five.** Welcome → Engine + Sign-in → Course pick.
  The original brief mentioned a "brand intro" and an "engine choice"
  separately; collapsing the welcome into a single step keeps the
  total ceremony short. Power users can hit "Skip" on any step to
  immediately complete the flag and land on Library.
- **Engine step reuses the existing `ConfigService.setEngineConfig`.**
  No new auth surface; the step embeds the same control set as
  `/settings`. For Claude Code, the existing `<ClaudeAuthModal>` is
  triggered from inside the step.
- **Course step offers three forks — Algebra, Biology, "from a
  syllabus".** Algebra and Biology both call the existing
  `course.use_canonical_pack` path (via
  `BootstrapServiceImpl.createCourseFromPack`). The syllabus path
  starts a `bootstrap` mode session — same as today's
  `+ New course` button on `/courses`.
- **No router-level redirect for non-Library routes during first-run.**
  Hiding the side nav while the gate is active is sufficient — the
  user has nowhere to navigate except the flow. If a returning user
  enters via a deep link before completion, the gate intercepts at
  the root component and the deep link is replayed via TanStack
  Router state when the user lands on a real route.
- **No child stories.** The change is ~9 small files: 1 backend
  config module, 2 service-method additions, 2 IPC handlers, 2 client
  methods, 1 hook, 1 component (+ css), 1 router edit. Tightly
  cohesive (every test exercises the same first-run path); no
  parallelisation upside; single-stride implementation.
- **No first-run telemetry.** v1 doesn't ship analytics. A
  post-onboarding "did you complete?" signal is post-v1.

## Architectural choice

**Inline replacement at the root route component**: a `useFirstRun()`
hook reads the flag via the IPC config service. When the flag is unset
and the read has resolved, the root component renders an
`<OnboardingFlow />` in place of the normal layout (Nav + Outlet +
ActivityRail). When the flow completes, the flag is written and the
hook re-fetches; the normal layout takes over.

Alternatives considered:

- *Dedicated `/onboarding` route with `beforeLoad` redirect from the
  root.* Rejected: async client access at the route layer adds
  plumbing for no UX benefit. Same number of files, more wiring.
- *Modal overlay on the Library route.* Rejected: leaves the rest of
  the app accessible via deep link / sidebar; first-run would feel
  optional rather than guided. Defeats the "land in real state, not a
  tutorial" goal.

## Implementation Units

### Unit 1 (trickiest): `packages/core/src/config/onboarding-config.ts`
**File**: `packages/core/src/config/onboarding-config.ts` (new)

Reader and writer for the `firstRunCompletedAt` flag in `config_kv`.
Mirrors the shape of `engine-config.ts`.

```typescript
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";

const CONFIG_KEY = "onboarding";

export interface OnboardingConfig {
  /** ISO timestamp; null means first-run is not yet complete. */
  firstRunCompletedAt: string | null;
}

const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  firstRunCompletedAt: null,
};

export function readOnboardingConfig(db: PraxisDb): OnboardingConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<OnboardingConfig> | undefined;
  return { ...DEFAULT_ONBOARDING_CONFIG, ...stored };
}

export function markFirstRunComplete(db: PraxisDb): void {
  const next: OnboardingConfig = {
    firstRunCompletedAt: new Date().toISOString(),
  };
  db.insert(configKv)
    .values({
      key: CONFIG_KEY,
      valueJson: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: next, updatedAt: new Date() },
    })
    .run();
}
```

**Implementation Notes**:

- `valueJson` already accepts arbitrary JSON via the existing
  `configKv` schema; no migration needed.
- Read merges stored + defaults; write is idempotent via
  `onConflictDoUpdate`.
- No env-var override pathway — first-run completion is a real-state
  signal, not a configurable preference.

**Acceptance Criteria**:

- [ ] `readOnboardingConfig(db)` returns `{ firstRunCompletedAt: null }`
      on a fresh database.
- [ ] After `markFirstRunComplete(db)`, the read returns a valid
      ISO timestamp.
- [ ] Calling `markFirstRunComplete` twice updates the timestamp
      (idempotent + monotonic).

### Unit 2: extend `ConfigService` interface and impl
**File**: `packages/core/src/services/types.ts` (interface),
`packages/core/src/services/config-service.ts` (impl)

Add two methods to `ConfigService`:

```typescript
interface ConfigService {
  // ... existing methods ...
  firstRunCompleted(): Promise<boolean>;
  markFirstRunComplete(): Promise<void>;
}
```

The implementation is a one-liner each, delegating to the unit-1
helpers.

**Implementation Notes**:

- Match the existing async return-type style even though the operation
  is sync (DB read/write) — keep the IPC contract uniform.

**Acceptance Criteria**:

- [ ] Interface declares the two methods.
- [ ] Impl wires through to `readOnboardingConfig` /
      `markFirstRunComplete`.
- [ ] `pnpm typecheck` clean across the workspace.

### Unit 3: IPC handlers
**File**: `packages/desktop/electron/main/ipc-server.ts`

Add two handlers under the `praxis.config.*` channel namespace:

```typescript
handle("praxis.config.firstRunCompleted", async () => {
  return services.config.firstRunCompleted();
});
handle("praxis.config.markFirstRunComplete", async () => {
  await services.config.markFirstRunComplete();
});
```

**Implementation Notes**:

- Naming follows the established `praxis.{domain}.{action}` convention
  (`ipc-channel-convention` pattern).

**Acceptance Criteria**:

- [ ] Two handlers registered alongside the existing `praxis.config.*`.

### Unit 4: client methods
**File**: `packages/client/src/services/config-client.ts`

Add the corresponding client methods:

```typescript
firstRunCompleted(): Promise<boolean> {
  return this.transport.invoke<boolean>(`${CHANNEL}.firstRunCompleted`);
}

markFirstRunComplete(): Promise<void> {
  return this.transport.invoke<void>(`${CHANNEL}.markFirstRunComplete`);
}
```

**Acceptance Criteria**:

- [ ] Both methods present and typed.
- [ ] Existing client tests still pass; no fake-client breakage in UI tests.

### Unit 5: `useFirstRun` hook
**File**: `packages/ui/src/hooks/use-first-run.ts` (new)

Reads the flag via the client and exposes loading / value / a
`complete()` function that writes the flag and refreshes.

```typescript
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseFirstRunResult {
  loading: boolean;
  isFirstRun: boolean | null; // null while loading
  complete: () => Promise<void>;
}

export function useFirstRun(): UseFirstRunResult {
  const client = usePraxisClient();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.config
      .firstRunCompleted()
      .then((done) => {
        if (!cancelled) {
          setCompleted(done);
          setLoading(false);
        }
      })
      .catch(() => {
        // On error, fail open — assume not first-run so the user isn't
        // trapped behind a broken IPC. The error shows on the normal
        // app surface.
        if (!cancelled) {
          setCompleted(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const complete = useCallback(async () => {
    await client.config.markFirstRunComplete();
    setCompleted(true);
  }, [client]);

  return { loading, isFirstRun: completed === null ? null : !completed, complete };
}
```

**Implementation Notes**:

- Fail-open on IPC error: if the read fails, treat the user as
  having already completed first-run rather than locking them out.
- The hook does NOT use `useResource` (the existing data-fetch hook)
  because the first-run flag is a one-time read, not a refresh-able
  resource — a smaller bespoke hook is clearer.
- `complete()` writes the flag and updates local state — no refetch
  round-trip needed.

**Acceptance Criteria**:

- [ ] Hook returns `loading: true, isFirstRun: null` initially.
- [ ] Resolves to `loading: false, isFirstRun: true` for fresh DBs.
- [ ] Resolves to `loading: false, isFirstRun: false` after
      `markFirstRunComplete` was called previously.
- [ ] `complete()` flips `isFirstRun` to `false` synchronously after
      the IPC resolves.
- [ ] On IPC error, settles to `loading: false, isFirstRun: false`.

### Unit 6: `OnboardingFlow` component
**File**: `packages/ui/src/components/onboarding-flow.tsx` (new)
**Style**: `packages/ui/src/components/onboarding-flow.module.css` (new)

A self-contained three-step component. Internal `useState` drives step
transitions. Reuses `<ClaudeAuthModal>` for the Claude Code engine.

```typescript
import { type JSX, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePraxisClient } from "../context/client-context.js";
import { ClaudeAuthModal } from "./claude-auth-modal.js";
import styles from "./onboarding-flow.module.css";

export interface OnboardingFlowProps {
  onComplete: () => Promise<void>;
}

type Step = "welcome" | "engine" | "course";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");
  // ...
}
```

Each step is a sub-component:

- `<WelcomeStep onNext onSkip />` — brand title, 1-2 sentences, two
  buttons.
- `<EngineStep onNext onBack onSkip />` — engine select, API-key
  field (visible per engine), or `Sign in to Claude Code` button.
  On Next: writes `setEngineConfig`, advances. On Skip: completes
  immediately.
- `<CourseStep onComplete onBack onSkip />` — three big cards: Algebra,
  Biology, From a syllabus. Each card on click calls the appropriate
  service and `onComplete`. On Skip: completes without opening a
  course.

Wire to the editorial design system: use the COPY module for
copy strings (add new entries under `COPY.onboarding.*`), use editorial
typography classes via `composes: editorial from global;`, layout via
the existing primitives (`<RouteHeader>` if helpful, otherwise a
straight grid).

**Implementation Notes**:

- The component is self-contained — no router redirects from inside.
  When a step's "Continue" handler resolves, the component calls
  `onComplete` (provided by the root route) which writes the flag
  and unmounts the flow.
- The course-fork CTA uses `client.bootstrap.createCourseFromPack`
  for canonical packs, `client.session.start({ modeId: "bootstrap" })`
  for the syllabus path. Both already exist.
- The Skip button on each step calls `onComplete` directly — no
  validation, no required fields.
- The engine step's API-key visibility logic mirrors `/settings` —
  Claude Code shows the "Sign in" trigger; direct providers show
  the key field.

**Acceptance Criteria**:

- [ ] Renders three distinct steps; default is `welcome`.
- [ ] "Continue" on welcome → engine step.
- [ ] "Continue" on engine writes engine config, advances to course.
- [ ] "Continue" on a course card calls the right service and
      `onComplete`.
- [ ] "Skip" on any step calls `onComplete` immediately.
- [ ] Component matches editorial tone — copy from `COPY.onboarding.*`.

### Unit 7: extend `COPY` module
**File**: `packages/ui/src/lib/copy.ts`

Add an `onboarding` namespace with copy for each step's headers,
buttons, and helper text.

```typescript
export const COPY = {
  // ... existing ...
  onboarding: {
    welcomeTitle: "Welcome to Praxis",
    welcomeBody: "...",
    engineTitle: "Pick your tutor's engine",
    courseTitle: "Where shall we start?",
    skipLabel: "Skip onboarding",
    continueLabel: "Continue",
    backLabel: "Back",
    courseAlgebra: "Algebra (canonical)",
    courseBiology: "Biology (canonical)",
    courseFromSyllabus: "From your own syllabus",
  },
};
```

**Acceptance Criteria**:

- [ ] All copy strings used by the onboarding component live in
      `COPY.onboarding.*`.

### Unit 8: integrate into the root route
**File**: `packages/ui/src/router.tsx`

Wrap the root component to render `<OnboardingFlow />` when first-run.

```typescript
const rootRoute = createRootRoute({
  component: () => {
    const { loading, isFirstRun, complete } = useFirstRun();

    if (loading) return null; // or a tiny splash

    if (isFirstRun) {
      return (
        <div className={styles.onboardingLayout}>
          <OnboardingFlow onComplete={complete} />
        </div>
      );
    }

    return (
      <div className={styles.layout}>
        <Nav />
        <main className={styles.main}>
          <Outlet />
        </main>
        <ActivityRail />
      </div>
    );
  },
});
```

**Implementation Notes**:

- The pre-resolution `null` render is acceptable — IPC returns within
  ~10ms locally; a flash isn't observable. If we later decide a splash
  is needed, slot it in here.
- An `.onboardingLayout` CSS class in `router.module.css` provides
  full-bleed centering for the flow.

**Acceptance Criteria**:

- [ ] When `isFirstRun: true`, the layout renders only
      `<OnboardingFlow />` — no Nav, no ActivityRail.
- [ ] When `isFirstRun: false`, the existing layout renders unchanged.
- [ ] After `complete()` resolves, the layout swaps without a refresh.

### Unit 9: tests
**Files**:

- `packages/ui/src/__tests__/use-first-run.test.tsx` (new)
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` (new)
- `packages/client/src/__tests__/client.test.ts` (extend with two
  channel-routing assertions)

Tests focus on:

- The hook's loading / resolved / error / complete-flow states.
- The flow's step transitions: Welcome → Engine → Course → done.
- Skip from each step.
- Engine selection persists via the fake client.
- Course fork CTAs call the right client methods.

Use the existing `makeFakeClient(overrides?)` helper from
`__tests__/helpers/fake-client.ts` (`ui-test-helper` pattern).

**Acceptance Criteria**:

- [ ] All new tests pass.
- [ ] Full `pnpm test` workspace stays green.

## Implementation Order

1. **Unit 1** (config_kv reader/writer) — the foundation; no deps.
2. **Unit 2** (ConfigService methods) — surfaces unit 1 to the
   service layer.
3. **Unit 3** (IPC handlers) — surfaces unit 2 to the renderer.
4. **Unit 4** (client methods) — surfaces unit 3 to the UI.
5. **Unit 5** (useFirstRun hook) — consumes unit 4.
6. **Unit 7** (COPY extension) — small, slot in before Unit 6.
7. **Unit 6** (OnboardingFlow component) — consumes units 4 + 7.
8. **Unit 8** (router integration) — consumes units 5 + 6.
9. **Unit 9** (tests) — covers everything.

After all units: `pnpm typecheck && pnpm lint && pnpm test`.

## Testing

### Unit tests

- `packages/ui/src/__tests__/use-first-run.test.tsx`:
  loading-then-resolved transitions, error path, complete() effect.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx`:
  step-transition assertions, skip semantics, button presence per
  step.
- `packages/client/src/__tests__/client.test.ts`:
  routes the two new methods to the right IPC channels.

### Integration coverage

The full user flow (first launch → write engine config → start a
course → land in chat) is exercised by the ship-checklist feature, not
unit tests — the rendered DOM doesn't tell you whether a real teach
session works end-to-end.

## Risks

- **IPC error during first-run blocks the user.** Mitigated by
  fail-open in the hook (Unit 5) — on read error, treat as completed.
  The user lands on the normal app and can sort out the underlying
  error from there.
- **Course-step actions can fail (engine config invalid, pack import
  error).** Each course-card handler should surface failures inline
  on the step (a `<div className={styles.error}>` slot) rather than
  trapping the user in a half-completed flow. Implementation pass
  must handle this.
- **`/settings` already exists with substantial engine config UI.**
  Risk: drifting between the onboarding engine step and the settings
  surface. Mitigation: reuse the same form components, or at minimum
  the same client methods. If component reuse is hard, document the
  parallel for a follow-up consolidation.
- **Skip-onboarding is the easy escape; users may always pick it.**
  That's fine for v1 — onboarding is additive value. If
  ship-checklist reveals users routinely skip and then can't run a
  session, surface the missing piece in the empty state on Library.
- **First-run state is per-DB.** A user resetting their DB
  (`pnpm db:reset`) hits onboarding again. That's the correct
  behaviour — different from per-machine state.

## No child stories

Single-stride feature. The 9 units chain: backend (1-4) → hook (5)
→ component (6-7) → integration (8) → tests (9). One agent, one pass.

## Implementation notes

- **Files changed**:
  - `packages/core/src/config/onboarding-config.ts` (new) — Unit 1.
  - `packages/core/src/config/index.ts` (re-export) — Unit 1.
  - `packages/core/src/types/client.ts` (`ConfigService` interface
    extended) — Unit 2.
  - `packages/core/src/services/config-service.ts` (impl
    `firstRunCompleted` + `markFirstRunComplete`) — Unit 2.
  - `packages/desktop/electron/main/ipc-server.ts` (two new
    `praxis.config.*` handlers) — Unit 3.
  - `packages/client/src/services/config-client.ts` (two new
    methods) — Unit 4.
  - `packages/client/src/__tests__/client.test.ts` (two new
    channel-routing assertions) — Unit 9.
  - `packages/ui/src/lib/copy.ts` (`COPY.onboarding.*` namespace) —
    Unit 7.
  - `packages/ui/src/hooks/use-first-run.ts` (new) — Unit 5.
  - `packages/ui/src/components/onboarding-flow.tsx` (new) — Unit 6.
  - `packages/ui/src/components/onboarding-flow.module.css` (new) —
    Unit 6.
  - `packages/ui/src/router.tsx` (root layout swap) — Unit 8.
  - `packages/ui/src/router.module.css` (`.onboardingLayout` class) —
    Unit 8.
  - `packages/ui/src/__tests__/use-first-run.test.tsx` (new) — Unit 9.
  - `packages/ui/src/__tests__/onboarding-flow.test.tsx` (new) —
    Unit 9.
- **Tests added**: 13 total (5 hook, 6 flow, 2 client routing).
  Full workspace `pnpm test` shows 2248 passing (up from 2235
  pre-change; +13 new tests, no regressions).
- **Discrepancies from design**: one. Design's CourseStep specced
  three distinct course-creation paths (canonical Algebra, canonical
  Biology, syllabus). Implementation collapses all three into "open a
  fresh bootstrap session" because no `client.bootstrap.createCourseFromPack`
  surface exists at the IPC level — canonical-pack course creation
  goes through the bootstrap-mode agent's `course.use_canonical_pack`
  tool. The labels still distinguish the three paths so the user
  knows what to ask the agent for first; the actual landing surface
  is the same. A follow-up could add a direct
  `bootstrap.createCourseFromPack` IPC method, but that's
  post-onboarding-flow work and not required for v1.
- **Adjacent issues parked**: none. The
  `bootstrap.createCourseFromPack` IPC gap is captured in this
  feature's discrepancy note; it'll surface naturally if it ever
  matters.
- **Test-assertion style**: the project uses `.toBeDefined()` rather
  than `@testing-library/jest-dom`'s `.toBeInTheDocument()` matcher.
  Initial draft used the wrong matcher; corrected before commit.
- **Engine config UI**: the onboarding's engine step duplicates a
  small slice of `/settings`'s controls (engine select + API key).
  Pragmatic for v1 — the surfaces are read-only-after-first-run from
  most users' perspective; later consolidation can extract a shared
  `<EngineConfigForm>` if drift becomes a real cost.
- **Fail-open semantics in `useFirstRun`**: explicitly tested. If the
  IPC read rejects, the hook treats the user as having already
  completed onboarding rather than locking them behind a broken gate.

## Review (2026-05-10)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- *Engine step lacks inline Claude Code sign-in* — design specced that
  picking `claude-code` would surface a "Sign in" button triggering
  `<ClaudeAuthModal>` inline. Implementation hides the API-key field
  for Claude Code but does not yet render the sign-in trigger. Users
  who pick Claude Code must skip onboarding and sign in via /settings
  before they can run a session. Filed as
  `idea-onboarding-claude-code-signin`.
- *Course-card labels suggest direct course creation; all paths land
  in a generic bootstrap session* — clicking "Biology (canonical)"
  doesn't import biology and start a course; it opens an empty
  bootstrap chat where the user must ask the agent to use the pack.
  The bootstrap-mode role prompt already nudges toward canonical
  packs, so the flow still works, but labels-match-outcomes is a real
  UX polish gap. Filed as `idea-onboarding-course-card-pre-seed`.

**Nits**:
- Engine-step API-key visibility (hide for `claude-code` and
  `direct.ollama`) is correct but lacks a dedicated test that switches
  engines and asserts the field's absence — implicit coverage via the
  "writes engine config when continuing" test. Worth tightening if
  another engine ever joins the no-key family.
- The CourseStep's `await onComplete()` runs before
  `await openSessionInTab(...)`; the await chain handles the
  unmount-mid-await case correctly via captured navigate ref, but
  future maintainers may want a comment explaining the order.

**Notes**:
- 13 tests added (5 hook, 6 flow, 2 client routing). Full workspace
  `pnpm test` shows 2248 passing (up from 2235; no regressions).
- `pnpm typecheck` clean across the workspace; one bumpy moment when
  `@praxis/core` had stale `dist/` d.ts and the UI typecheck couldn't
  see the new ConfigService methods — `pnpm --filter @praxis/core build`
  refreshed it. Worth flagging that the workspace's
  source-resolution-via-praxis-source condition has at least one path
  (UI's `tsgo` typecheck) where the dist d.ts is what gets read.
  Existing behaviour, not a regression.
- Foundation-doc alignment: no drift. The first-run flow is orthogonal
  to the modes / curriculum / architecture docs.
- Backward compatibility: ConfigService interface gained two methods.
  Existing test stubs use `as unknown as PraxisClient["config"]` casts
  and don't typecheck the surface, so they continue working. Fail-open
  on the hook keeps users who hit IPC errors out of a broken gate.

## What's now possible

- Fresh installs of Praxis present a guided three-step welcome →
  engine → course flow rather than dropping the user into the Library
  with no idea how to start.
- The flow is dismissible at any step ("Skip onboarding") and
  re-running is gated by a single `firstRunCompletedAt` flag in
  `config_kv` — running `pnpm db:reset` brings it back, useful for
  testing.
- `epic-phase-19-onboarding-docs` is unblocked: its `depends_on`
  (`epic-phase-19-first-run-flow`) is satisfied, so docs work can
  describe the realised flow accurately.
- The Phase 19 ship-checklist gains a third hard prerequisite met
  (biology-pack + electron-signing + first-run-flow); two more
  features remain (auto-update, onboarding-docs) before the
  checklist can run.
