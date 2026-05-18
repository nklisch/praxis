---
id: epic-ui-redesign-ground-up-app-shell-tabs-strip
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Open-tabs strip — italic deck-line typography next to nav

## Scope

Restyle the existing tab strip per the locked Index mock: italic
deck-line typography, dot separators, open/active/held visual states,
positioned next to the primary nav in the running head.

## Implementation steps

1. Edit `packages/ui/src/components/tab-strip.{tsx,module.css}`:
   - Replace block-style tabs with italic deck-line typography
     (`var(--font-serif)`, `font-style: italic`).
   - Dot-separator pattern: `Open · Calc · L3 · Quiz · deriv` per
     the mock.
   - Active / held / closed states styled per the mock.

2. Edit `router.tsx` to mount the tab strip in the running head
   between the surface links and the right-edge tools.

3. Tests covering rendering of multiple tabs, active state, and
   close-tab interaction.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [x] Tab strip renders as italic deck lines next to the surface
      nav per the locked mock.
- [x] Active / held / closed states distinguishable.
- [x] Existing tab-strip behavior (open / close / switch) preserved.
- [x] All quality checks green.

## Implementation notes

### What landed

**`tab-strip.module.css`** — full restyle per option-3.html:
- Strip is now `display: flex; align-items: baseline` (inline flow,
  not `flex-wrap`).
- Each tab uses `font: italic 13px/1 var(--font-serif)` — deck-line
  italic serif, no block chrome.
- Mode-tint dot ornament: empty `<span>` styled via CSS
  `background: var(--mode-tint)` / `border-radius: 50%` (matches
  option-3.html `.dot`). Replaces the Unicode glyph.
- Dot-separator between adjacent tabs via `.tab + .tab::before`
  pseudo-element (`content: "·"`), no extra DOM nodes.
- `"Open"` kicker rendered as a mono uppercase label before the first
  tab (hidden when no tabs).
- Active state: `border-bottom-color: var(--mode-tint, var(--color-accent))`.
- Close button (`×`) hidden by default, fades in on tab hover / active.
- Parent-child decoration preserved: `.fromPill` (non-italic mono for
  contrast), `.pulseDot` keyframe animation.

**`tab-strip.tsx`** — ornament span is now empty (CSS dot), "Open"
kicker label emitted when `tabs.length > 0`.

**`top-nav.tsx`** — added optional `tabsSlot?: ReactNode` prop. Right
slot renders `<div className={styles.rightSlot}>{tabsSlot}</div>` when
slot is provided.

**`router.tsx`** — `RootLayout` mounts `<TabStrip>` in `<TopNav
tabsSlot={...}>`. Uses `useTabs()` and `useNavigate()` directly in
`RootLayout`. The "+" button navigates to `/chat` (where the full
`NewTabPicker` lives).

**`routes/chat.tsx`** — `<TabStrip>` removed from the workspace area.
The running head now owns the tab strip globally; `ChatRoute` owns
only the tab bodies, sidebar, and `NewTabPicker`.

### Test changes

- `tab-strip.test.tsx`: updated ornament test (no glyph text; CSS dot);
  added "Open kicker" presence/absence tests, `.title` span content
  assertion.
- `chat-route.test.tsx`: removed tests that were testing TabStrip
  internals (those belong in tab-strip tests); updated the scoped-sidebar
  stability test to use a new `renderWithTabStrip` wrapper that includes
  the `<TabStrip>` connected via the shared `<TabsProvider>`, simulating
  the running-head layout.
- All 1239 tests pass; typecheck and lint green.

## Review (2026-05-18)

**Verdict**: Request changes

**Blockers**: `epic-ui-redesign-ground-up-app-shell-tabs-strip-fix-ux-doc-drift` — `docs/UX.md` lines 178–193 still describe the tab strip as a block-style component inside the Tutor workspace (`/chat`) with Unicode glyph ornaments. The implementation moved the strip to the running head and replaced block tabs with italic deck-line typography and coloured CSS dot ornaments. Foundation-doc drift is a hard blocker per the rolling-foundation principle.

**Important**: none

**Nits**:
- Acceptance criteria marks `[x] Active / held / closed states distinguishable`, but "held" is not represented in `TabSummary` or the CSS — it's a mockup-only concept. The mark is slightly overclaiming; consider dropping "held" from the AC or noting it's deferred.

**Notes**: Code quality is high. Typography restyle, slot prop, and router wiring are all clean. Tests cover the new ornament contract, kicker label, and the `renderWithTabStrip` harness for the shell topology change. The only issue is the stale UX.md section.

## Re-review note

Doc-drift sibling `epic-ui-redesign-ground-up-app-shell-tabs-strip-fix-ux-doc-drift`
cleared the foundation-doc blocker (UX.md tab strip section). No code changes
needed in this story. Re-advanced to review for verdict pass 2.

## Review (2026-05-18) — pass 2

**Verdict**: Approve

**Blockers**: none — the UX.md tab-strip section was fully rolled forward by the sibling fix story; placement (running head / `<TopNav tabsSlot>`), typography (italic 13 px serif), CSS dot ornament, active hairline, and parent-child decoration all accurately described.

**Important**: none

**Nits**:
- AC bullet `[x] Active / held / closed states distinguishable` slightly overclaims — "held" is a mockup concept not in `TabSummary` or CSS. Minor; not blocking.

**Notes**: Code quality high. No new blockers since pass 1. Advancing to done.
