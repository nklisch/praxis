# Pattern: Modal Primitive

`<Modal onClose={fn}>` provides the visual envelope (backdrop, card, ESC handler, click-outside,
ARIA) for every dialog in the UI. Consumers render their own content inside it and never
re-implement these mechanics.

## Rationale

Before this primitive existed, five modals each duplicated the `document.addEventListener`
ESC handler, the backdrop + stopPropagation click pattern, and the ARIA `role="dialog"
aria-modal="true"`. Extracting it ensures future modals are correct-by-default and that
accessibility attributes are never forgotten.

## Examples

### Example 1: Minimal modal — UnlockModal

**File**: `packages/ui/src/components/unlock-modal.tsx`

```tsx
import { Modal } from "./modal.js";

export function UnlockModal({ onClose, onUnlocked }: UnlockModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal onClose={onClose} initialFocus={inputRef} ariaLabel="Unlock configure">
      <span className={styles.ornament}>⁂</span>
      <span className={styles.kicker}>UNLOCK</span>
      <h2 className={styles.title}>unlock configure</h2>
      {/* form content */}
    </Modal>
  );
}
```

### Example 2: Wider modal with maxWidth override — NewTabPicker

**File**: `packages/ui/src/components/new-tab-picker.tsx`

```tsx
return (
  <Modal onClose={onClose} ariaLabel="Open new session" maxWidth="480px">
    <span className={styles.ornament}>+</span>
    <span className={styles.kicker}>NEW SESSION</span>
    <h2 className={styles.title}>open a session</h2>
    {/* mode radio group + course dropdown */}
  </Modal>
);
```

`maxWidth` sets `--modal-max-width` CSS variable, overriding the shared `.modal` rule's
default 400px. Consumers don't reach into `modal.module.css` directly.

### Example 3: State-machine modal — ClaudeAuthModal

**File**: `packages/ui/src/components/claude-auth-modal.tsx`

```tsx
return (
  <Modal onClose={onClose} ariaLabel="Sign in to Claude" maxWidth="480px">
    <span className={styles.ornament}>§</span>
    <span className={styles.kicker}>SIGN IN</span>
    <h2 className={styles.title}>Sign in to Claude</h2>
    {/* phase-based state machine content */}
  </Modal>
);
```

## Props

```typescript
export interface ModalProps {
  onClose: () => void;            // fires on ESC and backdrop click
  initialFocus?: RefObject<...>;  // element to focus on mount
  ariaLabel?: string;             // default "Dialog"
  maxWidth?: string;              // CSS value, default 400px; sets --modal-max-width
  children: ReactNode;
}
```

## When to Use

- Any dialog that renders over the main content
- Whenever you need backdrop + ESC + click-outside as a package deal

## When NOT to Use

- Inline drawers / side panels that don't darken the background (use a plain overlay div)
- Full-screen flows (e.g. exam proctored mode) — those compose differently

## Common Violations

- Duplicating `document.addEventListener("keydown", handler)` for ESC in a component
  that could wrap itself in `<Modal>` — don't; add the `Modal` wrapper instead
- Setting `role="dialog"` and `aria-modal="true"` manually when `<Modal>` already
  provides them — double-wrapping causes nested dialog issues
- Reaching into `modal.module.css` to override `.modal { max-width }` — use the
  `maxWidth` prop which sets `--modal-max-width` via inline style
