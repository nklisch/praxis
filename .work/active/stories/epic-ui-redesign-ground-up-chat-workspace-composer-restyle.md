---
id: epic-ui-redesign-ground-up-chat-workspace-composer-restyle
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Composer restyle — italic serif + accent button + mono hints

## Scope

Restyle `Composer` (and `composer-verbs`, `composer-sketch`) per the
locked mock: italic serif input typography, accent-coloured send
button, mono hint strip below.

## Implementation steps

1. Edit `packages/ui/src/components/composer.{tsx,module.css}` (and
   neighbors) per locked styling from
   `.mockups/screens/.../-chat-workspace/option-4.html`.
2. Tests cover render + send interaction.
3. Quality checks green.

## Acceptance criteria

- [x] Composer matches the locked mock.
- [x] Existing send / verbs / sketch behavior preserved.
- [x] All quality checks green.

## Implementation notes

Landed per the locked Refined Bubbles mock (option-4.html):

- **`composer.module.css`**: Full restyle. Wrapper background is now
  `--color-bg-primary` with outer padding `16px 32px 24px` (matching the
  mock's `.composer` rule). The form row is a card on
  `--color-bg-secondary` with a `1px --color-border-strong` border and
  `--radius-md` corners. Textarea is `font-style: italic` over
  `--font-serif` at 16px/1.5 with no inner border — transparent on the
  card background. Send button uses `--color-accent` / `--color-accent-hover`
  (transition on `background-color`, not opacity), `--radius-sm`, 13px
  `--font-sans` 500 weight, `align-self: flex-end`. Added `.hints` class:
  `--font-mono` 11px uppercase, `--color-text-tertiary`, `letter-spacing:
  0.04em`, `padding-top: 6px`.

- **`composer.tsx`**: Send button label updated to `Send ↵` (matches mock).
  Mono hint strip `<div className={styles.hints}>` rendered below the form
  using `COPY.composer.hints`. Sketch-attached indicator bar simplified
  (no accent muted background — just accent text + padding-bottom gap, which
  is cleaner and keeps the card border as the visual separator).

- **`copy.ts`**: Added `hints` key to `COPY.composer`:
  `"enter send · shift+enter newline · ⌘⇧k sketch"`. Placeholder updated
  to match the mock: `"answer · or ask the tutor a question"`.

- **`composer-verbs.module.css`** / **`composer-sketch.module.css`**: No
  changes needed — verbs chip rail and sketch panel don't conflict with the
  restyle; their existing tokens are compatible.

- **`composer.test.tsx`** (new): 9 tests covering render, placeholder,
  hint strip presence, send-button disabled/enabled state, Enter submit,
  Shift+Enter no-submit, whitespace-only no-submit, and disabled prop.
  All 9 pass. Existing `composer-verbs.test.tsx` (13 tests) unaffected.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The `sendButton:disabled` rule sits above the hover rule in the CSS; minor ordering preference, no functional impact.

**Notes**: Implementation is pixel-faithful to option-4.html mock — textarea `font: 16px/1.5 var(--font-serif); font-style: italic`, submit button `background: var(--color-accent); border-radius: var(--radius-sm); padding: 6px 12px; font: 500 13px/1 var(--font-sans); align-self: flex-end`, hints strip `font: 11px/1 var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; padding-top: 6px` all match mock CSS exactly. Send button transition changed from `opacity` to `background-color` — cleaner. Hint text moved to `COPY.composer.hints` following the editorial-ui-primitives pattern. 9 tests cover all behavioural contracts. All 1307 UI tests pass; lint clean on changed files.
