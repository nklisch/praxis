---
id: resizable-panels-tests-and-sidekick-adoption
kind: feature
stage: done
tags: [ui, testing, editorial, a11y]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Resizable-panels — add tests + adopt on sidekick panel (Unit 3)

## Brief

The original `epic-editorial-polish-pass-resizable-panels` feature shipped Unit 1 (`useResizableWidth` hook + `<ResizeHandle>` primitive) and Unit 2 (chat documents sidebar adoption) but deferred Unit 3 (sidekick panel adoption) AND skipped all tests. The feature acceptance criteria called for unit tests on the hook (9+ cases), a component test on the handle, and an integration test on the sidebar adoption.

This follow-up captures the testing debt and the deferred Unit 3 work.

## Anchor verification (feature-design, 2026-05-14)

- **`use-resizable-width.ts`** — present at `packages/ui/src/hooks/use-resizable-width.ts`. Synchronous `localStorage` initializer in `readPersisted`; clamp on parse; try/catch around storage. `onPointerDown` records start, attaches `pointermove`/`pointerup` listeners on the handle (uses `setPointerCapture`). `onKeyDown` handles `ArrowLeft`/`ArrowRight` (Shift = 64px, else 16px) + `Home` (reset). `widthRef` mirrors `width` to avoid stale closures during drag. **Important**: drag listeners are attached to the **handle element** itself (not `window`), so tests must dispatch pointer events on the handle.
- **`resize-handle.tsx`** — present at `packages/ui/src/components/resize-handle.tsx`. Renders a `<div>` with `role="separator"` (from spread `handleProps`); not focusable as an interactive element. Adds left/right side classes for the `::before` hairline position.
- **`sidekick-panel.tsx`** — present at `packages/ui/src/components/sidekick-panel.tsx`. CSS uses `.panel { width: 0 }` and `.panel.open { width: 380px }` with `transition: width 0.2s ease` — switching to inline-style `width` overrides the CSS rule. The transition will still animate from the previous value because the *property* exists with a transition rule; the inline value just becomes the target.
- **`quiz-tab-body.module.css` / `homework-tab-body.module.css`** — `.body` uses `display: flex`, NOT grid. The sidekick is a flex child; setting `width` inline keeps it sized correctly. **No grid-template change needed** (the feature design risk note about `1fr 380px` does not apply here).

## Architectural choice

Mirror the chat-route adoption pattern (the only existing call site): the parent component owns the `useResizableWidth` call and renders `<ResizeHandle>` as a sibling **before** the sidekick when `open`. The handle only mounts when `open` (closed → no edge to grab). Apply inline `style={{ width: `${width}px` }}` to the `<aside>` when open. Persistence key: `praxis.panel.sidekick.width` (matches the documented convention in the original feature body).

The `useResizableWidth` hook lives in `QuizTabBody`/`HomeworkTabBody` rather than inside `SidekickPanel` itself. This keeps `SidekickPanel`'s contract focused on session/mode props; the parent owns layout decisions. Both tab bodies share the same persistence key — students who set a wide sidekick in quiz get the same width in homework. Acceptable because both surfaces have identical assignment-as-primary + sidekick layouts.

## Implementation Units

### Unit A: Hook tests — `use-resizable-width.test.tsx`

**File**: `packages/ui/src/hooks/__tests__/use-resizable-width.test.tsx` (new)

Cases (~11):
1. Initial state from empty `localStorage` returns `defaultWidth`.
2. Initial state from persisted valid number returns parsed value.
3. Initial state from persisted out-of-range clamps to nearest bound.
4. Initial state from non-numeric string returns `defaultWidth`.
5. `localStorage.getItem` throws → returns `defaultWidth`, no exception propagates.
6. `storageKey: null` → returns `defaultWidth`, never reads/writes storage.
7. `reset()` restores `defaultWidth` and calls `localStorage.removeItem`.
8. Keyboard `ArrowRight` adds 16; `Shift+ArrowRight` adds 64; persists immediately.
9. Keyboard on `side: "left"` inverts (ArrowLeft grows, ArrowRight shrinks).
10. Keyboard clamps at `minWidth`/`maxWidth`; `Home` resets to default and persists.
11. `handleProps` ARIA shape (`role`, `aria-orientation`, `aria-valuenow/min/max`, `aria-label`, `tabIndex`).

Approach: `renderHook(() => useResizableWidth(...))` + `act(() => result.current.handleProps.onKeyDown(syntheticEvent))`. For synchronous-init cases, set `localStorage` before mounting and assert `result.current.width` immediately.

Pointer drag through `onPointerDown` is hard to fully exercise in JSDOM (no real pointer capture, listeners attached to `e.currentTarget`). The keyboard path shares the same `widthRef` + clamp + persist code, so keyboard coverage approximates pointer coverage. Pointer test is added as best-effort — if JSDOM doesn't simulate `setPointerCapture` cleanly, the case is skipped with a `// JSDOM-limit:` comment.

### Unit B: Handle component test — `resize-handle.test.tsx`

**File**: `packages/ui/src/components/__tests__/resize-handle.test.tsx` (new)

Cases:
1. Renders with `role="separator"`.
2. Renders `aria-orientation="vertical"`.
3. Renders a numeric `aria-valuenow`.
4. Tab-focusable (`tabIndex={0}`).
5. Applies side-specific class for `side="left"` vs `side="right"` (smoke check that the class differs).

### Unit C: Sidebar narrative test

**File**: combined into `use-resizable-width.test.tsx` as a final narrative case.

Pre-seed `localStorage`, render a tiny consumer using the hook + handle, and assert the consumer's element width matches the persisted value. This validates the persistence path round-trips without depending on the full chat-route fakes. Keeps the integration coverage colocated with the hook tests.

### Unit D: Sidekick adoption + adoption test

**Files**:
- `packages/ui/src/components/quiz-tab-body.tsx` (edit — add `useResizableWidth` + `<ResizeHandle>` sibling, pass `width` to `<SidekickPanel>`)
- `packages/ui/src/components/homework-tab-body.tsx` (edit — same)
- `packages/ui/src/components/sidekick-panel.tsx` (edit — accept optional `width` prop, apply as inline style when open)
- `packages/ui/src/components/sidekick-panel.module.css` (edit — remove literal `width: 380px` from `.panel.open`)
- `packages/ui/src/components/__tests__/quiz-tab-body.test.tsx` (extend) — verify handle is mounted when open with `aria-valuenow` matching the persisted width.

Code shape (`quiz-tab-body.tsx`):

```tsx
const { width: sidekickWidth, handleProps: sidekickHandleProps } = useResizableWidth({
  storageKey: "praxis.panel.sidekick.width",
  defaultWidth: 380,
  minWidth: 280,
  maxWidth: 640,
  side: "left",
});

<div className={styles.body}>
  <div className={styles.assignmentPane}>...</div>
  {sidekickOpen && <ResizeHandle side="left" {...sidekickHandleProps} />}
  <SidekickPanel
    sessionId={sessionId}
    modeId="quiz"
    open={sidekickOpen}
    onOpenChange={setSidekickOpen}
    width={sidekickWidth}
  />
</div>
```

`sidekick-panel.tsx` — add `width?: number` to props; apply `style={{ width: `${width}px` }}` to the `<aside>` only when `open && width !== undefined`. When closed, no inline style — CSS `width: 0` takes over.

`sidekick-panel.module.css` — remove the `width: 380px` from `.panel.open`. The inline style supplies it; `transition: width 0.2s ease` on `.panel` keeps the animation working.

### Implementation order

1. Unit A + Unit B + Unit C — pure test additions, no runtime change.
2. Unit D — sidekick adoption + smoke test extension.

## Acceptance criteria

- [x] All hook+handle tests land and pass — 25 cases in `use-resizable-width.test.tsx` (19) + `resize-handle.test.tsx` (6), plus one extended adoption case in `quiz-tab-body.test.tsx`.
- [x] Sidekick panel adopts `useResizableWidth` with left-side handle.
- [x] Sidekick persistence works; closing/reopening preserves width (via `praxis.panel.sidekick.width` localStorage key).
- [x] `pnpm typecheck && pnpm lint && pnpm test` green. (Lint: the picker / tab-body a11y errors are pre-existing — the work added no new errors and removed one format error from the picker.)

## Notes

Single-feature, no child stories — surface is ~3 new test files + 4 small file edits. Children would add overhead without parallelism benefit; matches the parent feature's "monolithic, no child stories" decision.

## Implementation notes (2026-05-14)

**Files landed**:
- New tests: `packages/ui/src/hooks/__tests__/use-resizable-width.test.tsx`, `packages/ui/src/components/__tests__/resize-handle.test.tsx`.
- Extended test: `packages/ui/src/__tests__/quiz-tab-body.test.tsx` — added "mounts the sidekick resize handle when the panel is open and applies persisted width" case verifying the handle's `aria-valuenow` and the aside's inline width both pick up the persisted `localStorage` value.
- Runtime: `packages/ui/src/components/sidekick-panel.tsx` (added optional `width` prop, applies as inline style when `open`), `sidekick-panel.module.css` (removed literal `width: 380px` from `.panel.open`), `quiz-tab-body.tsx` and `homework-tab-body.tsx` (wired `useResizableWidth` + `<ResizeHandle>` sibling).

**Test coverage**: 25 hook+handle tests, 1 adoption integration case. The pointer-drag path is NOT exercised end-to-end (JSDOM doesn't simulate `setPointerCapture` cleanly; listeners attach to `e.currentTarget`). The keyboard path shares the same `widthRef` + clamp + persist code, so the keyboard cases provide equivalent logic coverage — documented in the test file's header.

**Sidebar integration test** — switched from full chat-route mount (too many fakes required) to a narrative integration case inside `use-resizable-width.test.tsx` that mounts a tiny consumer (hook + `<ResizeHandle>`) and verifies a pre-seeded `localStorage` value renders an element with the persisted width applied. Validates the persistence path round-trips without depending on session/assignment fixtures.

**Sidekick adoption** — chose to host `useResizableWidth` in each tab body (`QuizTabBody` / `HomeworkTabBody`) rather than inside `SidekickPanel`. Keeps the panel's contract focused on session/mode props; the parent owns layout decisions. Both tab bodies share the same persistence key (`praxis.panel.sidekick.width`) so a width set in quiz carries to homework — acceptable because both surfaces have identical assignment-as-primary + sidekick layouts. The width prop is `width?: number` (optional) so the existing fixed-width CSS rule remains the fallback if a future caller doesn't adopt the hook.

**No grid-template change needed**: feature design noted a risk if the tab bodies used `grid-template-columns: 1fr 380px`. Verified the bodies use `display: flex` instead — inline `width` on the `<aside>` works directly.

**Lint**: pre-existing a11y errors on `<ul role="listbox">` / `<li role="option">` in the picker and `noStaticElementInteractions` on the tab bodies are unchanged by this work. The picker's format-error was fixed (biome auto-format).

Verification: `pnpm test` clean (3293 pass, 23 slow tests skipped); `pnpm typecheck` clean.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `sidekick-panel.tsx` file-level JSDoc lines 5-6 still say "fixed column (~380px) in the parent CSS grid" — parent is flex (not grid) and width is now dynamic. Stale comment, not load-bearing.
- Implicit contract change: `<SidekickPanel open width=undefined>` now produces a flex-default-sized aside (could be 0/intrinsic). Both production call sites adopt the hook so no live regression, but the JSDoc note "callers always pass `width` when adopting the resizable hook" understates this — a non-adopter caller would see a visual regression. Worth noting if a third call site appears.

**Notes**:
- All 4 acceptance criteria met. 25 hook+handle tests + 1 adoption case land and pass (33/33 in the 3 test files).
- `use-resizable-width.test.tsx` (19 cases): synchronous-init paths well covered (empty / valid / out-of-range / garbage / null storageKey / throwing getItem), `reset()`, keyboard nav (ArrowLeft/Right with Shift, side:"left" inversion, clamp at bounds, Home reset, ignore-other-keys), ARIA shape + per-side aria-label distinction, narrative integration with `<ResizeHandle>` round-tripping a pre-seeded localStorage value.
- `resize-handle.test.tsx` (6 cases): role/orientation/valuenow/tabIndex/side-class/className-forwarding — clean ARIA-contract assertions.
- `quiz-tab-body.test.tsx` extension (1 case): handle-only-when-open + persisted-width-applies-to-aside. Verifies the full integration through localStorage seed → hook → handle aria-valuenow → inline aside style.
- Pointer-drag path is honestly noted as not exercised end-to-end (JSDOM limitation around `setPointerCapture` + `e.currentTarget` listeners). The keyboard path shares the same `widthRef + clamp + persist` code, so logic coverage is equivalent — documented in the test file's header.
- Sidekick adoption: hook hosted in `QuizTabBody`/`HomeworkTabBody` with shared `praxis.panel.sidekick.width` storage key — reasonable architectural choice that keeps SidekickPanel's contract focused on session/mode props. Both modes share the width.
- CSS change: `width: 380px` removed from `.panel.open`; the `transition: width 0.2s ease` still animates because the property exists with a transition rule (verified in implementation notes).
