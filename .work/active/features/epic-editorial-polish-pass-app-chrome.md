---
id: epic-editorial-polish-pass-app-chrome
kind: feature
stage: done
tags: [ui, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# App chrome refresh — top nav rename, wordmark, editorial alignment

## Brief

The top navigation bar — the static shell mounted once at the router
root above `<Outlet />` — has three inconsistencies with the rest of
the app. The "Chat" nav link is a literal string, semantically wrong
(the tutor surface is not a generic chatbot) and disconnected from the
`epic-tutor-session-feel-tutor-tab-rename` work which moved tab titles
to `Mode.displayName` SSOT. The Praxis wordmark renders in default
text styling instead of the stylised brand treatment used elsewhere.
And the bar overall diverges from the editorial design system
(spacing, typography, border, background) that the rest of the app
adopted in v0.1.1.

This feature renames the "Chat" link to "Tutor," applies the brand
wordmark treatment, and brings the bar into the editorial system —
RouteHeader-style typography, consistent border/background tokens,
proper brand mark. Bounded to `nav.tsx` and the editorial primitives
it should compose with.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — different surface from the other
  three features. Runs in parallel.

## Scope absorbed from backlog

- `idea-top-menu-bar-styling` — three issues in one (rename, brand
  mark, editorial alignment).

## Foundation references

- `docs/UX.md` — editorial design tokens / system
- `CLAUDE.md` — pattern `editorial-ui-primitives`

## Anchors (current implementation)

- Top nav — `packages/ui/src/components/nav.tsx` (static; "Chat" is a
  literal string in the `<Link>` at line ~56; not dynamic against the
  active route)
- Nav mount point — `packages/ui/src/router.tsx:42`
- Editorial primitives — `packages/ui/src/components/editorial/`
  (RouteHeader and the `composes: editorial from global;` CSS module
  utility)
- Wordmark / brand mark — search for "Praxis" wordmark component or
  SVG asset in `packages/ui/src/components/` and `packages/ui/public/`
- Prior tab-rename work for reference — `Mode.displayName` SSOT
  introduced in `epic-tutor-session-feel-tutor-tab-rename`. Top nav
  rename is a separate surface from the tab strip; this feature only
  changes the route-link label, not the tab title flow.

## Pre-design decisions (2026-05-14)

- **None surfaced at scope-ambiguity sweep.** The rename target is
  "Tutor" per the original idea body. The wordmark treatment and
  editorial alignment are visual decisions that feature-design picks
  alongside the editorial-primitives reference. No design forks that
  require pre-decision now.

## Design decisions (feature-design, 2026-05-14)

- **Wordmark: CSS-only typographic mark, no asset.** Repo-wide audit
  surfaced zero SVG / PNG / logo files in `packages/ui/` (or anywhere
  outside `node_modules`). Adding a bitmap/asset wordmark would also
  fight the project's "no bundled font assets, no remote fetch"
  posture (`docs/UX.md` Editorial language). The right move is to
  render "Praxis" as a typographic wordmark using `var(--font-display)`
  italic + `composes: editorial from global;`, with stylistic OpenType
  features (`"ss01", "ss02"`) and a leading ornament glyph (`§`) to
  match the RouteHeader ornament vocabulary. This matches the prior-
  art treatment in `route-header.module.css` (the ornament+title
  pairing) without re-using `<RouteHeader>` literally (which is
  reserved for in-route headers).

- **Editorial alignment ≠ wrapping in `<RouteHeader>`.** RouteHeaders
  are mounted inside each route, below the static nav. Putting the
  nav itself into a RouteHeader would invert the chrome/content
  relationship. Instead, the nav adopts the editorial **token
  vocabulary**: mono uppercase nav-link labels with the same
  letter-spacing as RouteHeader kickers, editorial italic for the
  wordmark, and the same `--color-surface` / `--color-border` /
  `--color-text-muted` palette already present. Nav becomes a
  typographic *masthead* — a sibling motif to RouteHeader, not a
  consumer of it.

- **No child stories.** Single file pair (`nav.tsx` + `nav.module.css`),
  one snapshot test to update, ~80 LoC of changes. All three sub-moves
  (rename, wordmark, editorial alignment) touch the same DOM tree and
  cannot be tested or deployed independently. Per agile-workflow
  story-spawn rubric: single-stride + tight cohesion + the only
  "decomposition" available is artificial chunking inside one file.
  Feature itself is the implementation unit.

- **Decoupling from the tab-strip rename.** The prior
  `epic-tutor-session-feel-tutor-tab-rename` feature moved per-tab
  titles to `Mode.displayName` SSOT (mode-meta.ts). The top-nav
  "Chat" link is a route label, not a mode label — there is no Mode
  whose `displayName` is `"Tutor"`. The mapping nav-link → route is
  a separate SSOT (`route-meta.ts` for in-route headers; the nav
  link list lives inline in `nav.tsx`). Leave the link label as an
  inline literal `"Tutor"` here — no premature lifting to a registry
  while there are only five static links. If/when nav links
  proliferate, lift into a `NAV_META` table next to `ROUTE_META`.

## Architectural choice

Three approaches were considered for the editorial alignment:

1. **Wrap nav in `<RouteHeader>`** — wrong layer (RouteHeader is a
   *route* header, not chrome); would shadow per-route RouteHeaders.
2. **Build a `<TopNav>` editorial primitive** in
   `packages/ui/src/components/` — over-engineered for one consumer
   (the nav is mounted once at router root). Introduce when a second
   consumer surfaces.
3. **Update `nav.tsx` + `nav.module.css` in place, adopting the
   editorial token vocabulary directly** — minimal, single-file
   change, consistent with how every other editorial surface in the
   app uses `composes: editorial from global;` rather than a
   wrapper component. **Chosen.**

Rationale: the editorial system in Praxis is a *typographic vocabulary
plus tokens*, not a component library. RouteHeader exists because
route headers are repeated across ~10 routes; the nav is mounted
once. Single-use primitives are project anti-pattern.

## Implementation units

### Unit 1: Rename the "Chat" nav link to "Tutor"

**File**: `packages/ui/src/components/nav.tsx` (line 53–58)

```tsx
<li>
  <Link
    to="/chat"
    activeOptions={{ exact: false }}
    activeProps={{ className: styles.active }}
  >
    Tutor
  </Link>
</li>
```

**Implementation notes**:
- Route path stays `/chat` (route id is a load-bearing key; renaming
  the route would require redirects + breaks deep-link URLs in user
  notes / external bookmarks). Only the visible label changes.
- Update the JSDoc block above `Nav()` (lines 33–39): nav IA comment
  now reads `Library (/) · Tutor (/chat) · Workspace · Configure · Settings`.
- Update `packages/ui/src/__tests__/theme-tokens.test.tsx:184` from
  `expect(screen.getByText("Chat"))` → `expect(screen.getByText("Tutor"))`.

**Acceptance criteria**:
- [ ] Top-nav link rendering at `/chat` reads "Tutor".
- [ ] Clicking "Tutor" navigates to `/chat`; active-state class still
      applies (`activeOptions={{ exact: false }}` unchanged).
- [ ] Theme-tokens snapshot test asserts "Tutor", not "Chat", and passes.

### Unit 2: Praxis wordmark — editorial typographic treatment

**File**: `packages/ui/src/components/nav.tsx` (line 43)
**File**: `packages/ui/src/components/nav.module.css` (`.logo` rules)

```tsx
<div className={styles.wordmark}>
  <span className={styles.wordmarkOrnament} aria-hidden="true">§</span>
  <span className={styles.wordmarkTitle}>Praxis</span>
</div>
```

```css
/* nav.module.css — replaces .logo */
.wordmark {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  margin-right: auto;
  user-select: none;
}

.wordmarkOrnament {
  font-family: var(--font-display);
  font-feature-settings: "ss01", "ss02";
  font-size: 1.35rem;
  line-height: 1;
  color: var(--color-text-muted);
  transform: translateY(2px); /* optical baseline lift */
}

.wordmarkTitle {
  composes: editorial from global; /* italic display serif */
  font-size: 1.15rem;
  line-height: 1;
  letter-spacing: -0.005em;
  color: var(--color-text);
  font-weight: 400;
  font-feature-settings: "kern", "liga", "calt";
}
```

**Implementation notes**:
- The leading `§` ornament mirrors `route-header.module.css:44–55` —
  same display serif, same `ss01/ss02` stylistic-set features, same
  graphite (`--color-text-muted`) tint. This is the visual rhyme
  that ties the nav masthead to every RouteHeader without literally
  embedding one.
- Drop the existing `.logo` rules (which use `font-weight: 700` and
  `--color-accent` — both wrong for an editorial wordmark; the
  editorial system uses italic weight-400 serif throughout).
- The `<span>` split (ornament + title) is required so `composes:
  editorial from global;` can apply *only* to the title — the
  ornament stays upright and uses raw display-serif, the title is
  italic.
- `aria-hidden` on the ornament — same convention as RouteHeader
  ornaments. The wordmark text "Praxis" remains the accessible name.
- No `<h1>` semantic upgrade. The nav is chrome; the route's
  RouteHeader carries the page's primary heading.

**Acceptance criteria**:
- [ ] Wordmark renders with ornament + italic display-serif "Praxis".
- [ ] Snapshot test (theme-tokens or new nav.test.tsx) asserts the
      wordmark DOM structure: ornament span (aria-hidden) followed by
      title span containing "Praxis".
- [ ] Ornament is hidden from screen readers (aria-hidden="true");
      "Praxis" remains the accessible text.
- [ ] No regressions in light-mode contrast (text remains
      `--color-text` on `--color-surface` — WCAG AA preserved).

### Unit 3: Editorial alignment of the bar — typography, spacing, tokens

**File**: `packages/ui/src/components/nav.module.css`

```css
.nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  /* Tighter vertical, slightly more generous horizontal — matches
     RouteHeader padding rhythm (1.6rem 1.75rem 1.35rem 1.5rem). */
  padding: 0.85rem 1.5rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.links {
  list-style: none;
  display: flex;
  gap: 1.4rem; /* up from 1rem — editorial system breathes more */
}

.links a {
  /* Mono uppercase kicker treatment — rhymes with RouteHeader kicker
     (route-header.module.css:57-70) and the existing
     route-header.actionButton (lines 126-138). */
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 0.4rem 0;
  /* No background fill on active — replaced by a hairline underline
     below, matching .actionButton::after in route-header.module.css. */
  position: relative;
  transition: color 0.18s ease;
}

.links a:hover {
  color: var(--color-text);
}

.active {
  color: var(--color-text);
  /* Remove the background pill — replaced by hairline. */
  background: transparent;
}

.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--color-text);
}

.workspaceLink {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.lockArea {
  margin-left: 0.5rem;
  display: flex;
  align-items: center;
}

.dueBadge {
  /* Unchanged — semantic warning pill stays. */
  background: var(--color-badge);
  color: var(--color-badge-text);
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 1.2em;
  height: 1.2em;
  padding: 0 0.25em;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
```

**Implementation notes**:
- Nav link labels remain title-case strings in the TSX (`Library`,
  `Tutor`, `Workspace`, `Configure`, `Settings`); CSS
  `text-transform: uppercase` does the visual work. This keeps the
  accessible name in mixed case (screen readers announce "Library",
  not "L I B R A R Y").
- Active state moves from background-pill → hairline underline. The
  pill was a Phase-13-era affordance that pre-dates the editorial
  system; underline matches the rest of the editorial vocabulary
  (RouteHeader `.actionButton::after` uses the same idiom).
- Padding rhythm: nav vertical padding (`0.85rem`) is intentionally
  *tighter* than RouteHeader (`1.6rem` top) — chrome should be
  quieter than the route content it frames.
- Border tokens (`--color-border`, `--color-surface`,
  `--color-text-muted`, `--color-text`) are unchanged — already
  correct. The change is in *how* they're applied, not the palette.
- `.workspaceLink` keeps `display: inline-flex` so the `DueBadge`
  sits beside the label. Gap reduced from `0.3rem` → `0.4rem` to
  account for the wider letter-spacing.
- No changes to `LockIcon` — it's its own component and renders
  fine alongside the new bar.

**Acceptance criteria**:
- [ ] Nav links render in mono uppercase with `0.18em` letter-spacing.
- [ ] Active link shows a 1px hairline underline at the bottom edge
      (`--color-text`), not a background pill.
- [ ] Background, border, and text colors continue to come from CSS
      variables (`--color-surface`, `--color-border`,
      `--color-text-muted`, `--color-text`) — no hard-coded hex.
- [ ] Visual diff: dark mode and light mode both render legibly;
      no regressions to the `DueBadge` positioning beside "Workspace".
- [ ] Existing `theme-tokens.test.tsx` test "renders all primary nav
      links" still passes (asserts visible text, not DOM structure).

## Implementation order

1. **Unit 1 (rename)** — smallest, lowest risk; lands the
   semantic correctness first.
2. **Unit 3 (editorial alignment CSS)** — establishes the new
   `.links a` / `.active` / `.nav` styling tokens that unit 2 will
   compose alongside.
3. **Unit 2 (wordmark)** — depends on the CSS structure being in
   place; replaces `.logo` with `.wordmark` + `.wordmarkOrnament` +
   `.wordmarkTitle`.

All three land in a single PR — they touch the same file pair and
cannot be reviewed independently anyway.

## Testing

### Snapshot/unit tests

**File**: `packages/ui/src/__tests__/theme-tokens.test.tsx` (line 184)

Update the existing `"renders all primary nav links"` test:
- Change `getByText("Chat")` → `getByText("Tutor")`.
- Add an assertion that the wordmark text "Praxis" is rendered.
- Add an assertion that the wordmark ornament span has
  `aria-hidden="true"` (use `container.querySelector` or
  `getByText("§")` and check `getAttribute("aria-hidden")`).

No new test file is needed — `theme-tokens.test.tsx` already mounts
`<Nav />` under `<PraxisClientProvider>`. Co-locate the new
assertions there.

### Manual verification (after merge)

- Hot-reload `pnpm dev`, observe the nav bar in both light and dark
  mode.
- Confirm `/chat` route still navigates and the active state
  underlines.
- Confirm `DueBadge` still appears on "Workspace" when flashcards
  are due.
- Confirm wordmark renders italic + ornament; check that the
  display serif resolves (Iowan / Sitka / Charter / Source Serif
  depending on platform).

### Integration

No IPC / DB / service surface touched. UI-package-only change.
`pnpm typecheck && pnpm lint && pnpm test` is the full gate.

## Risks

**Low overall.** The change is bounded to one file pair plus one
snapshot update.

- **Display-serif rendering on Linux**. The editorial typography
  relies on system serifs (Iowan, Sitka, Charter, Source Serif). On
  some Linux distros the cascade falls through to Georgia or
  generic serif. This isn't new — every existing RouteHeader and
  the editorial system already depend on this cascade — but the
  wordmark is now a more visible touchpoint. If the fallback looks
  poor, the existing global.css cascade can be tuned; no need to
  block this feature.
- **Active-state visual regression**. Moving from background-pill
  to hairline-underline is a deliberate stylistic shift; users
  habituated to the pill might miss it. Acceptable — the editorial
  vocabulary already uses this idiom elsewhere (RouteHeader action
  buttons), so the new state is consistent rather than novel.

No spike unit needed. No fallback plan beyond the standard "revert
the PR" if the visual outcome doesn't match design intent.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 7 tests pass. All three units landed (rename Chat→Tutor, CSS editorial alignment, wordmark ornament+title). Test extended with wordmark structural assertion. No new IPC. Visual change only — manual verification will be done at release time.
