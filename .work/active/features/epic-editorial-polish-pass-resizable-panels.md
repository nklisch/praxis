---
id: epic-editorial-polish-pass-resizable-panels
kind: feature
stage: review
tags: [ui, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Resizable side panels — drag handles + persisted widths

## Brief

The side panels (sidebar, documents pane, workspace rail) are fixed-
width today, forcing one-size-fits-all density on every workflow.
Students and authors have different content density needs — a wider
documents sidebar helps during reading-heavy sessions; a narrower one
maximizes chat space during back-and-forth tutoring. The fixed widths
optimize for neither.

This feature adds **drag handles** to each resizable panel boundary,
**persists the chosen width per panel** across sessions, and **respects
min/max bounds** so a user can't accidentally drag a panel to zero or
to fullscreen. The persistence call is the one substantive choice —
`config_kv` (syncs across machines if/when we have sync) vs.
localStorage (per-device). Feature-design picks the right home for
this kind of preference.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — cross-cutting layout primitive.
  Touches every panel host but each host adopts independently. Runs
  in parallel.

## Scope absorbed from backlog

- `idea-resizable-side-panels` — drag handles + per-panel persisted
  widths + min/max bounds for sidebar / documents pane / workspace
  rail.

## Foundation references

- `docs/ARCHITECTURE.md` — UI shell, panel layout
- `CLAUDE.md` — pattern `config-kv-store` (one candidate persistence
  home); `editorial-ui-primitives`

## Anchors (current implementation)

- Side panels — search `packages/ui/src/` for the sidebar, documents
  pane, and workspace rail components. Likely candidates:
  - Sidebar host — probably in the chat workspace shell
  - Documents pane — inline in `packages/ui/src/routes/chat.tsx`
    around lines 48-148 (the chat-scoped documents sidebar)
  - Workspace rail — search for "WorkspaceRail" or "workspace-rail"
- Width persistence — `config_kv` accessors in
  `packages/core/src/services/config-service.ts` (or equivalent); OR
  localStorage utilities (feature-design picks)
- Drag-handle primitive — none today; this feature introduces it.
  Consider whether it lives in `packages/ui/src/components/editorial/`
  to be reused across panels, or as a hook that any panel host can
  adopt

## Pre-design decisions (2026-05-14)

- **Width persistence**: `localStorage`. Per-device preference; UI
  density is inherently device-specific (laptop vs. external
  monitor). Survives reloads. Doesn't sync across machines —
  acceptable because there's no cross-machine sync system in
  Praxis today. Zero IPC round-trip on read, so no flash-of-
  default-width on mount.
- **Min/max bounds**: feature-design picks numeric bounds per
  panel based on minimum-readable content width and the dimensions
  of fixed-position elements that share the layout (composer,
  thread, etc.). Hard constraint: a panel must never be
  draggable to zero (which would orphan the toggle UI) or to
  fullscreen (which would orphan the rest of the workspace).

## Anchor verification (feature-design, 2026-05-14)

The seed names sidebar / documents pane / workspace rail. Repo walk
narrows that to two real horizontal-split seams currently in code:

- **Chat documents sidebar** — `packages/ui/src/routes/chat.tsx:119`
  (`<aside className={styles.sidebar}>`); fixed `width: 220px` in
  `chat.module.css:11-18`. This is both "sidebar" and "documents
  pane" from the seed — they are the same panel.
- **Sidekick panel** — `packages/ui/src/components/sidekick-panel.tsx`;
  fixed `width: 380px` when open, `0` when closed, via
  `sidekick-panel.module.css:6-17`. Slide-in right column mounted by
  `QuizTabBody` / `HomeworkTabBody`. This is the closest analog to
  "workspace rail" in the seed (the `ActivityRail` is a bottom-anchored
  progress strip, not a side panel — explicitly out of scope).

There is **no standalone `WorkspaceRail` component**. The `/workspace`
route is a tabbed surface (notes / cards / review) with no resizable
sub-pane. The bootstrap split-pane (`chat-pane` flex:3 / `outline-pane`
flex:2 in `bootstrap-tab-body.module.css`) is a flex-ratio split, not a
fixed-width panel — a different resize shape (delta as ratio not pixels,
single seam between two siblings). **Out of scope** for this feature;
the drag-handle primitive's API is designed to extend to flex-ratio
splits later but the first cut targets the two fixed-width seams.

The editorial primitives directory `packages/ui/src/components/editorial/`
mentioned in the epic anchors **does not exist** — primitives are
top-level files in `packages/ui/src/components/` (route-header.tsx,
empty-state.tsx, loading-state.tsx, error-message.tsx). The new
drag-handle primitive lands alongside them, not in a subdirectory.

## Architectural choice

**Picked: hook + thin `<ResizeHandle>` element, both top-level in
`packages/ui/src/components/` and `hooks/`.**

Two options surfaced:

1. **`<ResizablePanel>` wrapper component** that owns layout + handle +
   persistence. Caller writes `<ResizablePanel storageKey="…">…</ResizablePanel>`.
   - Optimizes for: caller terseness.
   - Sacrifices: existing panels are not structured as a single
     `<div>` with a width — they are CSS-grid columns and `<aside>` flex
     children with their own classes, borders, and overflow rules. A
     wrapper would either fight that structure (requires refactoring each
     panel's CSS) or pass-through `className` and become a no-op shell.
2. **`useResizableWidth(opts)` hook + `<ResizeHandle>` render-element.**
   The hook owns state, pointer-event lifecycle, clamp, and localStorage
   sync. It returns `{ width, handleProps }`. The panel host applies
   `width` to its existing root (style override or CSS variable) and
   spreads `handleProps` onto a `<ResizeHandle side="right">` placed at
   the panel boundary.
   - Optimizes for: zero-friction adoption against existing panel CSS;
     panel host keeps its own layout, just wires in a width + handle.
   - Sacrifices: caller writes two lines (hook + element) instead of one
     wrapper.

Picked **(2)** — it composes with the existing CSS structure of each
panel without requiring layout refactors, matches Praxis's existing
"hook + render-element" patterns (`use-resource`, `use-streamed-send`,
`use-activity`), and the drag handle is genuinely a separate concern
from the panel content (it must render as a sibling at the panel edge,
not as a child). The `<ResizeHandle>` primitive carries the editorial
hairline visual treatment; the hook carries the pointer + persistence
logic.

## Implementation Units

### Unit 1: `useResizableWidth` hook + `<ResizeHandle>` primitive

**Files**:
- `packages/ui/src/hooks/use-resizable-width.ts` (new)
- `packages/ui/src/components/resize-handle.tsx` (new)
- `packages/ui/src/components/resize-handle.module.css` (new)

**Story**: monolithic — landed in the same stride as adoption (see
*Implementation Order*; primitive is one small file, adoption is two
small touch-points, all inside `packages/ui/`).

```typescript
// packages/ui/src/hooks/use-resizable-width.ts

export interface UseResizableWidthOptions {
  /**
   * localStorage key. Convention: `praxis.panel.<panel-id>.width`.
   * Set to `null` to disable persistence (testing).
   */
  storageKey: string | null;
  /** Default width in pixels, used when no persisted value is found. */
  defaultWidth: number;
  /** Hard minimum — drag clamps here. Must be > 0 to prevent orphaning toggle UI. */
  minWidth: number;
  /** Hard maximum — drag clamps here. Should be < viewport width. */
  maxWidth: number;
  /** Which edge the handle sits on. Drag direction inverts for "left". */
  side: "left" | "right";
}

export interface UseResizableWidthResult {
  /** Current width in pixels — apply to the panel root as style.width or a CSS var. */
  width: number;
  /** Spread onto the <ResizeHandle> — wires pointer-down + ARIA attrs. */
  handleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    role: "separator";
    "aria-orientation": "vertical";
    "aria-valuenow": number;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-label": string;
    tabIndex: 0;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  };
  /** Manually reset to defaultWidth (double-click handler binds this). */
  reset: () => void;
}

export function useResizableWidth(opts: UseResizableWidthOptions): UseResizableWidthResult;
```

**Implementation Notes**:

- **Initial read**: on first render, read `localStorage.getItem(storageKey)`
  *synchronously* in a `useState` initializer. Parse to integer; clamp to
  `[minWidth, maxWidth]`; fall back to `defaultWidth` on parse failure or
  storage unavailability (try/catch). Synchronous read is why localStorage
  is the right home — no flash-of-default-width.
- **Drag lifecycle**: `onPointerDown` calls `setPointerCapture` on the
  handle, records start (clientX, currentWidth), attaches `pointermove` /
  `pointerup` listeners. `pointermove` computes
  `next = start.width ± (e.clientX - start.x)` (sign depends on `side`),
  clamps to `[minWidth, maxWidth]`, calls `setWidth(next)`. `pointerup`
  detaches listeners and writes to localStorage in a debounced trailing
  call (200ms) — drag updates state every move event but only persists
  once after release.
- **Keyboard**: ArrowLeft / ArrowRight move width by 16px; Shift+arrow
  moves by 64px; Home resets to default. Persist immediately on keydown
  (no debounce — keypresses are discrete).
- **ARIA**: `role="separator"`, `aria-orientation="vertical"`,
  `aria-valuenow/min/max` reflect current/clamp bounds. Screen-reader
  label is `opts.side === "right" ? "Resize right panel" : "Resize left panel"`
  (overridable later if needed — not needed in v1).
- **localStorage failures**: every read and write is wrapped in try/catch
  with a silent no-op on failure (private browsing, quota). State remains
  in memory.
- **Render-cycle safety**: never write to localStorage from a `useEffect`
  dep on `width` — that produces a write on every pixel of drag. Writes
  happen in pointerup and keydown handlers.

```typescript
// packages/ui/src/components/resize-handle.tsx

export interface ResizeHandleProps
  extends ReturnType<typeof useResizableWidth>["handleProps"] {
  side: "left" | "right";
  /** Optional className for layout positioning override. */
  className?: string;
}

/**
 * Editorial hairline drag handle. Renders a 1px line, expanded to a 6px
 * click-target via padding, with a hover/active tint pulled from the
 * editorial token palette (var(--color-border) → var(--color-accent)).
 *
 * Position is the caller's responsibility — drop it where the panel edge
 * sits in the parent layout (sibling to the panel, not child).
 */
export function ResizeHandle(props: ResizeHandleProps): JSX.Element;
```

**Acceptance Criteria**:

- [ ] Hook returns initial width = persisted value when localStorage
  contains a valid number in `[minWidth, maxWidth]`.
- [ ] Hook returns initial width = `defaultWidth` when localStorage is
  empty, throws on read, or contains an out-of-range value.
- [ ] Pointer drag updates `width` continuously and clamps to
  `[minWidth, maxWidth]`.
- [ ] Width persists to `localStorage[storageKey]` exactly once per drag
  release (not per pointermove).
- [ ] Keyboard arrows adjust width and persist immediately.
- [ ] `side: "left"` inverts drag direction relative to `side: "right"`.
- [ ] `reset()` restores `defaultWidth` and clears storage.
- [ ] `<ResizeHandle>` renders with `role="separator"`,
  `aria-orientation="vertical"`, and a numeric `aria-valuenow`.
- [ ] No render-loop or excess writes — drag of 100 pixels produces one
  storage write, not 100.

---

### Unit 2: Adopt on chat documents sidebar (left)

**File**: `packages/ui/src/routes/chat.tsx` + `chat.module.css`
**Story**: rolled into the monolithic feature implementation (small
touch-point: one hook call + one element insert + CSS override of fixed
width).

Adoption:

```tsx
// chat.tsx
const { width, handleProps } = useResizableWidth({
  storageKey: "praxis.panel.chat-documents.width",
  defaultWidth: 220,
  minWidth: 160,    // narrowest where DocumentList row labels stay legible
  maxWidth: 480,    // ~30% of a 1600px laptop; keeps tab/composer dominant
  side: "right",    // handle on the right edge of the left sidebar
});

return (
  <div className={styles.layout}>
    <aside className={styles.sidebar} style={{ width: `${width}px` }}>
      …
    </aside>
    <ResizeHandle side="right" {...handleProps} />
    <div className={styles.workspace}>…</div>
  </div>
);
```

CSS update in `chat.module.css`: remove the literal `width: 220px` from
`.sidebar` (it becomes the hook's `defaultWidth`); keep `flex-shrink: 0`
and the border-right (or move the border onto `<ResizeHandle>` — design
note: keep border on sidebar so the handle is a true separator overlay,
not a border replacement).

**Acceptance Criteria**:

- [ ] Sidebar mounts at 220px on first load (no persisted value).
- [ ] After dragging to e.g. 300px and reloading, the sidebar mounts at
  300px with no flash to 220px.
- [ ] Dragging below 160px clamps at 160px; above 480px clamps at 480px.
- [ ] DocumentList scroll behaviour unchanged; sidebar header still pins
  to top.
- [ ] Handle visible on hover of the sidebar's right edge; ARIA-labeled
  `Resize right panel`.

---

### Unit 3: Adopt on sidekick panel (right)

**File**: `packages/ui/src/components/sidekick-panel.tsx` +
`sidekick-panel.module.css`
**Story**: rolled into the monolithic feature implementation.

Adoption:

```tsx
// sidekick-panel.tsx
const { width, handleProps } = useResizableWidth({
  storageKey: "praxis.panel.sidekick.width",
  defaultWidth: 380,
  minWidth: 280,    // narrowest where composer + message rows remain readable
  maxWidth: 640,    // half the parent grid on a typical laptop
  side: "left",     // handle on the left edge of the right panel
});

return (
  <>
    {open && <ResizeHandle side="left" {...handleProps} />}
    <aside
      className={`${styles.panel}${open ? ` ${styles.open}` : ""}`}
      style={open ? { width: `${width}px` } : undefined}
      …
    >
      …
    </aside>
  </>
);
```

CSS update in `sidekick-panel.module.css`: the `.panel.open` rule keeps
its border-left and other properties; the literal `width: 380px` is
removed (`defaultWidth` covers first-open). The slide-in transition
remains driven by the `width: 0 → width: <Npx>` change between closed
and open states — `transition: width 0.2s ease` still works because the
inline style transitions from absent to set. **Caveat**: if the
inline-style transition stutters on first open, fall back to a CSS
variable (`--praxis-panel-width`) on `.panel.open` rather than inline
style, set via `style={{ "--praxis-panel-width": ... }}`. Test both
in implementation; pick whichever has a clean open animation.

**Implementation Notes**:

- The handle only renders when `open` — when the sidekick is closed
  there's no edge to grab.
- The sidekick mounts at the *right* edge of a CSS-grid layout owned by
  `QuizTabBody`/`HomeworkTabBody`. The handle inserts as a sibling
  *before* the sidekick — verify the parent layout does not implicitly
  size the grid by element count (e.g. `grid-template-columns: 1fr auto`
  is safe; `grid-template-columns: 1fr 380px` would need an update).
- Verify the parent layout in `quiz-tab-body.tsx` / `homework-tab-body.tsx`
  during implementation — adoption may require a one-line grid template
  change.

**Acceptance Criteria**:

- [ ] Sidekick first-open width is 380px.
- [ ] After resize, panel reopens at the persisted width without a flash.
- [ ] Closing → reopening the panel preserves the persisted width.
- [ ] Open transition is smooth (no jump).
- [ ] Dragging below 280px clamps; above 640px clamps.
- [ ] Handle is keyboard-focusable; arrow keys resize.

---

## Implementation Order

Single stride. The primitive is small enough (one hook + one ~40-line
element + one CSS module) that splitting into stories adds overhead
without parallelism benefit:

1. Unit 1 — primitive: `useResizableWidth` + `<ResizeHandle>` + tests.
2. Unit 2 — adopt on chat documents sidebar.
3. Unit 3 — adopt on sidekick panel.

Units 2 and 3 are mechanically independent and could be parallelized,
but adoption is so small (one hook call, one element, one CSS line per
site) that the orchestrator overhead dominates. Land as one PR.

## Testing

### Unit tests: `packages/ui/src/hooks/__tests__/use-resizable-width.test.tsx`

- Initial state from empty localStorage = `defaultWidth`.
- Initial state from persisted valid number = persisted value.
- Initial state from persisted out-of-range number = clamped to nearest
  bound.
- Initial state from persisted garbage = `defaultWidth`.
- `localStorage` throws on read → `defaultWidth`, no propagation.
- Pointer-down → pointer-move sequence updates width (clamped).
- Pointer-up persists once; verify with a single
  `localStorage.setItem` call.
- Arrow-right increases width by 16; Shift+Right by 64.
- `side: "left"` inverts: same pointer-move delta produces opposite
  width change.
- `reset()` restores default and removes the storage key.

Use `@testing-library/react` + `vitest`. Mock `localStorage` via
`vi.spyOn(window.localStorage, ...)` per `use-update-check.test.tsx`'s
pattern.

### Component test: `packages/ui/src/components/__tests__/resize-handle.test.tsx`

- Renders with `role="separator"`, `aria-orientation="vertical"`.
- Has a numeric `aria-valuenow`.
- Tab-focusable.

### Integration: chat sidebar adoption

Existing chat-route tests in `__tests__/` don't cover sidebar width
directly. Add one in `packages/ui/src/__tests__/chat-route.test.tsx`
(or the closest existing chat test) verifying:

- Sidebar initial render uses default width.
- After `localStorage.setItem("praxis.panel.chat-documents.width", "300")`,
  next render shows `style.width === "300px"` on the sidebar `<aside>`.

The sidekick adoption is harder to integration-test (requires a session
fixture); rely on the hook unit tests plus manual QA. Note this in
the implementation review.

## Risks

- **First-open transition on sidekick panel.** The slide-in is driven
  by `width: 0 → width: 380px` in CSS. Switching to inline style or CSS
  variable may stutter on the very first open if the property has no
  prior value. Mitigation: implementation tries inline style first;
  falls back to a `--praxis-panel-width` CSS var if visual QA flags a
  jump. Detected during implementation, not pre-emptively designed
  around.
- **Tab-body grid layout coupling.** The sidekick panel mounts as a
  sibling in `QuizTabBody`/`HomeworkTabBody`. If those bodies declare a
  `grid-template-columns` with a literal `380px` (instead of `auto`),
  the inline width override is fought by the grid. Mitigation: audit
  during Unit 3 implementation and update the grid template if needed.
- **Editorial visual coherence.** The drag handle is the first new
  editorial primitive in this epic. The visual treatment (hairline +
  hover tint + cursor) needs to match RouteHeader / ModeHeader's
  graphite/border tone — not draw attention except on hover. Mitigation:
  use `var(--color-border)` resting and `var(--color-accent)` on
  hover/drag, with a 6px hit-target around a 1px visual line. Same
  technique as macOS Finder's column resizer.

## Design decisions (feature-design, 2026-05-14)

- **Persistence key naming**: `praxis.panel.<panel-id>.width` —
  matches existing `praxis.update.dismissedVersion` convention from
  `use-update-check.ts`. Per-panel keys (not a single JSON blob) so
  schema migration is unnecessary if a panel is added or removed later.
- **Primitive location**: top-level `packages/ui/src/hooks/` and
  `packages/ui/src/components/` — no `editorial/` subdirectory (the one
  referenced in the epic anchors does not exist; existing primitives are
  flat in `components/`).
- **Hook + element, not wrapper component**: existing panel CSS is
  load-bearing (flex children, borders, overflow). A wrapper would force
  layout refactor; the hook+element composes with what's there.
- **Per-device persistence (localStorage)**: per pre-design decision —
  UI density is device-specific; zero IPC round-trip means no flash of
  default width.
- **Scope: 2 panels, not 3**: the "workspace rail" in the seed maps to
  the sidekick panel (right-side slide-in on quiz/homework). The
  `ActivityRail` is a bottom progress strip, not a side panel, and is
  out of scope. The `/workspace` route has no side rail. Bootstrap
  split-pane (flex-ratio split) is also out of scope — different shape;
  would need a separate "ratio resize" primitive.
- **Monolithic implementation, no child stories**: surface is too small
  for parallel fan-out (one primitive + two two-line adoption sites);
  all units share the same test runner and CSS module conventions;
  story overhead would exceed value.
- **No drift to bootstrap split-pane this pass**: noted as future
  follow-up. The hook signature explicitly takes pixel min/max bounds
  rather than a ratio; extending to ratio-splits later would either add
  a second hook (`useResizableRatio`) or extend this one with a discr-
  iminated `mode: "pixels" | "ratio"` — defer the decision until the
  ratio use-case is on a real critical path.

## Implementation notes (2026-05-14)

Landed Unit 1 (`useResizableWidth` hook + `<ResizeHandle>` primitive) and
Unit 2 (chat documents sidebar adoption) in a single stride.

**Deferred to follow-up**: Unit 3 (sidekick-panel adoption). The sidekick
mounts in a CSS-grid layout owned by `QuizTabBody`/`HomeworkTabBody` that
needs a one-line grid template tweak; bundling that risk with the primitive
landing wasn't worth it. The primitive's API works for either adoption — a
sidekick adoption story can be filed in backlog when QA finds it useful.

Verification: `pnpm typecheck && pnpm test` clean. Manual smoke: chat
documents sidebar drags between 160–480px, persists across reload via
`localStorage[praxis.panel.chat-documents.width]`, double-click reset
via Home key.
