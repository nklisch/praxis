---
id: epic-ui-redesign-ground-up-app-shell-tabs-strip-fix-ux-doc-drift
kind: story
stage: review
tags: [docs, ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-app-shell-tabs-strip
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Roll forward UX.md Tab Strip section after deck-line redesign

## Scope

`docs/UX.md` lines 178–193 describe the tab strip as a block-style
component inside the Tutor workspace (route `/chat`) with box-style
tabs and Unicode glyph ornaments. The implementation delivered by
`epic-ui-redesign-ground-up-app-shell-tabs-strip` moved the strip to
the running head (`<TopNav tabsSlot>`) and replaced block tabs with
italic deck-line typography and coloured dot ornaments. The foundation
doc must reflect the system as it is now.

## What to update

In `docs/UX.md`, update the **Student surface — Tutor workspace** section:

1. Line 178 — change "It has a tab strip at the top" to note the tab
   strip lives in the running head, visible on every surface.

2. Lines 180–193 — replace the ASCII box-tab art and description with:
   - Deck-line description: italic serif text next to the nav in the
     running head; coloured dot ornament per mode; middle-dot
     separators; "Open" kicker label.
   - Update ornament glyph description: ornament is now a coloured CSS
     dot (not a Unicode glyph).
   - Keep the behaviour bullets (active underline, `+` picker, close,
     session survival across restarts).

## Acceptance criteria

- [x] UX.md Tab Strip section accurately describes deck-line italic
      typography in the running head (not a block strip inside /chat).
- [x] ASCII art removed or updated to represent the deck-line layout.
- [x] Ornament description updated: coloured dot, not Unicode glyph.
- [x] `pnpm lint` green (docs only change — no typecheck/test impact).

## Implementation notes

### Files changed

- **`docs/UX.md`** — "Student surface — Tutor workspace / Tab strip" section (lines 178–193) replaced in full.

### Wording chosen

The old section described the strip as residing "at the top" of the `/chat` route body, rendered as ASCII box-style tabs with Unicode glyph ornaments (`§`, `¶`, `‡`).

The replacement:

1. **Placement**: states the strip lives in the running head (`<TopNav tabsSlot>`) and is visible on every surface, not just the Tutor workspace.
2. **ASCII art**: replaced the box-tab art with a single-line deck-line sketch matching the actual running-head layout — inline italic text items separated by `·`.
3. **Typography**: documents `font: italic 13px / 1 var(--font-serif)`, middle-dot separators, and the mono `OPEN` kicker label.
4. **Ornament**: documents the CSS dot (`5 × 5 px circle`, `background: var(--mode-tint)`) explicitly — not a Unicode glyph.
5. **Active state**: documents `border-bottom: 1px solid var(--mode-tint, var(--color-accent))`.
6. **Preserved behaviour bullets**: open / close / switch, session survival across restarts.
7. **Added parent-child decoration**: `from {parentMode}` pill and pulse dot on `system_note` — present in the implementation but absent from the old doc section.

`docs/ARCHITECTURE.md` had no claims about tab placement and required no changes.
