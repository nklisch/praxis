# Pattern: Resizable Side-Panel Hook

A side panel that needs drag-to-resize plus per-device persisted width pairs `useResizableWidth({ storageKey, defaultWidth, minWidth, maxWidth, side })` with `<ResizeHandle side="left"|"right" {...handleProps} />`. The hook owns pointer-event lifecycle (capture / clamp / persist-on-release), keyboard nav (arrow keys = 16px / Shift = 64px / Home = reset), and localStorage round-trips. The component is a thin wrapper that spreads `handleProps` onto the visual gutter. `storageKey` is conventionally `praxis.panel.<panel-id>.width`.

## Rationale

Three places need exactly the same behaviour (chat documents sidebar, quiz sidekick pane, homework sidekick pane), and each must persist its width independently of the others. Inlining pointer-event handling per call-site duplicates the clamp logic, the persist-once-on-release logic, and the ARIA wiring (`role="separator"`, `aria-valuenow/min/max`, `aria-orientation`); hooks let one tested implementation back all three. The hook returns `handleProps` instead of an opaque ref because the visible handle is structurally a separator between two columns — it needs to receive the props directly so consumers control where the gutter lives in the DOM.

## Examples

### Example 1: Chat documents sidebar (right-edge handle)

**File**: `packages/ui/src/routes/chat.tsx:121`

```typescript
const { width: sidebarWidth, handleProps: sidebarHandleProps } = useResizableWidth({
  storageKey: "praxis.panel.chat-documents.width",
  defaultWidth: 220,
  minWidth: 160,
  maxWidth: 480,
  side: "right",
});

return (
  <div className={styles.layout}>
    <aside style={{ width: `${sidebarWidth}px` }}>{/* ... */}</aside>
    <ResizeHandle side="right" {...sidebarHandleProps} />
    {/* workspace */}
  </div>
);
```

### Example 2: Quiz tab sidekick (left-edge handle, panel sits on the right)

**File**: `packages/ui/src/components/quiz-tab-body.tsx:41`

```typescript
const { width: sidekickWidth, handleProps: sidekickHandleProps } = useResizableWidth({
  storageKey: "praxis.panel.quiz-sidekick.width",
  defaultWidth: 360,
  minWidth: 280,
  maxWidth: 640,
  side: "left",
});
// ...
{sidekickOpen && <ResizeHandle side="left" {...sidekickHandleProps} />}
```

### Example 3: Homework tab sidekick — identical shape, distinct storage key

**File**: `packages/ui/src/components/homework-tab-body.tsx:39`

```typescript
const { width: sidekickWidth, handleProps: sidekickHandleProps } = useResizableWidth({
  storageKey: "praxis.panel.homework-sidekick.width",
  defaultWidth: 360,
  minWidth: 280,
  maxWidth: 640,
  side: "left",
});
```

## When to Use

- A fixed-width side panel where the user must be able to drag the boundary
- The width must persist across reloads (per-device, not synced — that's why localStorage, not server config)
- Late-joining the same surface should NOT see a flash of default width — synchronous localStorage read makes the initial render correct

## When NOT to Use

- Flexible layouts where the width tracks viewport changes (use CSS grid `fr` units instead)
- A panel that's collapsible only (no continuous resize) — a toggle button is sufficient
- Cross-device width sync — the persisted width is intentionally per-device because monitor sizes vary

## Common Violations

- Reimplementing pointer-event capture / pointermove handling at the call site instead of using the hook — drops keyboard nav and the clamp logic
- Reusing the same `storageKey` for two panels — they overwrite each other on resize
- Forgetting to render `<ResizeHandle>` with `{...handleProps}` and instead trying to wire pointer events to the panel root — `setPointerCapture` requires the handle element specifically, and the visible drag target must be the gutter
