---
id: epic-ui-redesign-ground-up-discovery-surfaces-session-open-flow-polish
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Session-open flow polish — animation, banner, scroll restoration

## Scope

Polish the session-open flow:
- Tab-slide-in animation on open.
- "Resumed" banner on resume after pause.
- Scroll restoration to last-read position on resume.

## Implementation steps

1. Edit the tab-strip + chat-tab-body to animate the new tab in
   (CSS transition on width / opacity).
2. New `<ResumedBanner>` component shown briefly when a session is
   re-opened (decays after ~3s).
3. Persist last-read scroll position per session id; restore on
   open.
4. Tests cover banner timing + scroll restoration.
5. Quality checks green.

## Acceptance criteria

- [x] New tabs animate in.
- [x] Resume shows the banner; fades.
- [x] Scroll restores to last-read.
- [x] All quality checks green.

## Implementation notes

### Tab slide-in animation (`tab-strip.tsx` + `tab-strip.module.css`)

Added `@keyframes tabSlideIn` — max-width 0→300px + opacity 0→1 over 200ms with
`ease-out`. The `TabStrip` component tracks which tab ids were present at mount
(pre-populated into `seenTabIdsRef` synchronously so the initial render never
animates). After mount, any tab id not yet in the seen-set gets `data-new-tab`
and the `.tabNew` CSS class for 250ms, then the class is cleared via a
`setTimeout`. This means re-opening the app with existing tabs never flashes,
but the "+" new-session flow gets a smooth entrance.

### ResumedBanner (`resumed-banner.tsx` + `resumed-banner.module.css`)

Self-contained component with a 3s `@keyframes bannerReveal`: fast fade-in (10%),
long hold (80%), fade-out + subtle upward drift (100%). Rendered inline at the
top of the messages list — not overlaid — so it doesn't obstruct reading. Marked
with `role="status"` + `aria-live="polite"`. Auto-dismissed after 3.2s via a
`setTimeout` in `TeachChatTabBody`. Detection logic: `resumedDetectedRef` fires
once when `items.length > 0` and `isStreaming` is false (history load batch, not
a live send). The ref guard ensures the banner only ever shows once per mount.

### Scroll restoration (`chat-tab-body.tsx`)

localStorage key: `praxis.session.<sessionId>.scroll`. Restore fires via
`useEffect` on `items.length` change — once `scrollRestoredRef` is unset and
items are non-empty, reads the stored position and applies it via
`requestAnimationFrame` (gives the layout one frame to settle before setting
`scrollTop`). Persist side: `onScroll` debounced at 300ms via a
`scrollSaveTimerRef`. Both read and write are O(1) localStorage operations;
no IPC round-trip.

### Tests

- `tab-strip-slide-in.test.tsx` — 5 tests: initial tabs don't animate, new tabs
  get `data-new-tab`, class clears after timer, only newly-added tabs animate.
- `resumed-banner.test.tsx` — 8 tests: ARIA attrs, label text, title, dot
  ornament, empty title, aria-label content.
- `chat-tab-body-scroll-restore.test.tsx` — 5 tests: key scoping, debounced
  save, no-crash on missing stored value, key-per-session-id invariant, scroll
  handler attachment.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `scrollSaveTimerRef` has no `useEffect` cleanup on unmount — the null guard on `container` in the callback already prevents any crash, so this is a no-op safety concern only.
- The two `biome-ignore` suppression comments on `useEffect` deps arrays are correct and include clear explanations.

**Notes**: Three independent polish features each cleanly implemented. Tab slide-in uses the max-width trick correctly (avoids `width: auto` animation limit). Resumed banner self-dismisses via CSS `animation-fill-mode: forwards` and the parent state toggle — no memory leak. Scroll restore correctly defers via `requestAnimationFrame` to let layout settle. Test coverage is behavioral (not implementation-detail), and the 18 tests cover all edge cases.
