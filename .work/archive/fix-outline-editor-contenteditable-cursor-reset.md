---
id: fix-outline-editor-contenteditable-cursor-reset
kind: story
stage: done
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix: outline editor cursor resets when typing special characters

## Problem

`note-editor-outline.tsx` uses `dangerouslySetInnerHTML={{ __html: escapeHtml(row.text) }}`
on the `contentEditable` div that renders each row. `handleTextChange` captures
`onInput` text and calls `emit(rows.map(...))` → `setRows` → re-render.

When the re-rendered `escapeHtml(row.text)` differs from the DOM content (i.e.,
the user typed `&`, `<`, `>`, or `"`), React overwrites the DOM node's innerHTML,
resetting the cursor to position 0 mid-typing. The user loses their cursor position
on each such character.

## Root cause

React reconciles `dangerouslySetInnerHTML` every render by comparing the new
`__html` string to the last value React set. For normal ASCII the strings match
(`"hello"` → `"hello"`) so React skips the DOM write and the cursor survives.
But `escapeHtml("&")` produces `"&amp;"`, which differs from the raw `"&"` in the
DOM, causing React to overwrite the node and lose the selection.

## Fix

Remove `dangerouslySetInnerHTML` from the `contentEditable` div. Set the initial
text content via a `ref` callback only on first mount (when the element is not yet
populated). On subsequent renders, React has no `dangerouslySetInnerHTML` prop to
reconcile, so the DOM is not touched. React's existing `suppressContentEditableWarning`
remains; `onInput` continues to sync text state from the DOM into React.

```tsx
// Before
<div
  ...
  // biome-ignore lint/security/noDangerouslySetInnerHtml: safe — text-only, no HTML injection
  dangerouslySetInnerHTML={{ __html: escapeHtml(row.text) }}
/>

// After
<div
  ...
  ref={(el) => {
    if (el) {
      inputRefs.current.set(row.id, el);
      // Set text content only on mount (element is empty).
      if (!el.textContent) el.textContent = row.text;
    } else {
      inputRefs.current.delete(row.id);
    }
  }}
/>
```

Also remove the now-unused `escapeHtml` function.

## Acceptance criteria

- [ ] Typing `&`, `<`, `>`, `"` in a row does not reset the cursor.
- [ ] Initial row text renders correctly on mount.
- [ ] Existing tests pass unchanged (they fire `onInput` via `fireEvent` which
      bypasses the DOM text-setting path — no test changes needed unless a test
      explicitly asserts initial rendered text content).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

Origin: review of `epic-ui-redesign-ground-up-workspace-note-editor-outline`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Root cause analysis is accurate and the fix is minimal and correct. Removing `dangerouslySetInnerHTML` means React has no prop to reconcile, so it never overwrites the DOM node. Using `textContent` (not `innerHTML`) for the mount-time set is the right choice — no HTML interpretation, no XSS vector. The `if (!el.textContent)` guard correctly handles mount (empty element) and leaves existing content untouched on re-render. The 5 regression tests cover all four escape characters plus initial render with special chars. 28/28 tests pass.

## Implementation notes

**Approach**: Extended the existing `ref` callback in `OutlineBulletRow` to set
`el.textContent = row.text` on mount (when `!el.textContent`). This is the
canonical one-line fix: React no longer owns any `innerHTML` prop on the div, so
re-renders triggered by `handleTextChange` never overwrite the DOM node and the
cursor is never disturbed.

**`textContent` vs `innerHTML`**: Used `textContent` (not `innerHTML`) so stored
text containing `<`, `>`, `&`, or `"` is always treated as plain text — no HTML
interpretation, no XSS vector.

**`escapeHtml` removed**: The function existed solely to make
`dangerouslySetInnerHTML` safe. With both removed it became dead code; deleted.

**Regression tests added** (5 new tests in `note-editor-outline.test.tsx`):
- Typing `&`, `<`, `>`, `"` each verify the DOM `textContent` equals the raw
  character after an `onInput` event — confirming React never replaced the node.
- One additional test verifies rows initialised with special characters in their
  text render the raw string (not HTML-escaped entities) via `textContent`.

**Total tests**: 28 (23 pre-existing + 5 new), all green.

**Quality**: `pnpm typecheck` (ui package) and `pnpm lint` (src files) clean;
pre-existing failures in `@praxis/desktop` and `.mockups/` are unrelated.
`pnpm test` 4132/4132 passed.
