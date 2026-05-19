---
id: epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Root layout — swap left-rail for top horizontal nav

## Scope

Rebuild `RootLayout` in `packages/ui/src/router.tsx` to the locked
Index shape: top horizontal nav (wordmark + five surface links +
right-aligned section for tabs/theme), no left sidebar, full-width
content beneath.

See parent feature
`.work/active/features/epic-ui-redesign-ground-up-app-shell.md`.

## Implementation steps

1. Edit `packages/ui/src/router.tsx`:
   - Replace left-rail nav layout with a top-nav layout.
   - Wordmark on left; five surface links (Library / Workspace /
     Concept maps / Progress / Configure) center-left; reserved
     space on right for tabs strip + theme toggle (mounted by sibling
     stories).
   - Full-width content area below.

2. New `packages/ui/src/components/top-nav.{tsx,module.css}` if
   extraction simplifies. Otherwise inline in `router.tsx`.

3. Match the locked mock typography + spacing
   (`.mockups/screens/.../-app-shell/option-3.html`).

4. Tests: `router.test.tsx` covering top-nav rendering and active-link
   state.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] RootLayout uses top horizontal nav matching the locked mock.
- [ ] Five surface links render with editorial typography from the
      tokens.
- [ ] Active link state visible.
- [ ] All quality checks green.

## Out of scope

- Status strip (Story 2).
- Tabs strip (Story 4).
- Theme toggle (mounted by Story 3 + sibling backend-fills bundle).

## Implementation notes

### Files changed

- `packages/ui/src/components/top-nav.tsx` — new `<TopNav>` component: wordmark
  (italic serif, 22px, `--font-display`), five surface links with typographic
  glyph ornaments (§ ¶ ‡ ‖ ⁂), right slot div for tabs+theme (empty; sibling
  stories mount into it).
- `packages/ui/src/components/top-nav.module.css` — running-head layout matching
  `option-3.html` exactly: `padding: 18px 32px 12px`, `border-bottom: 1px solid
  var(--color-border)`, serif nav links at 14px/500, accent hairline underline
  on active.
- `packages/ui/src/router.tsx` — replaced `<Nav>` + `<ActivityRail>` mount with
  `<TopNav>`. ActivityRail removed from layout (being replaced by status strip in
  Story 2; the ActivityRail component itself is not deleted).
- `packages/ui/src/routes/concept-maps.tsx` — stub `<ConceptMapsRoute>` so
  TanStack Router's type-safe `to="/concept-maps"` compiles. Full surface story
  pending.
- `packages/ui/src/routes/progress.tsx` — stub `<ProgressRoute>` for the same
  reason. Full surface story pending.
- `packages/ui/src/__tests__/top-nav.test.tsx` — 9 tests covering: wordmark,
  nav accessible label, all 5 link labels, all 5 glyphs, link hrefs, and
  active/inactive CSS class application.

### Design fidelity

Matched `option-3.html` running-head CSS verbatim (padding, gap, font specs,
border style, hover/active transitions). The wordmark uses an `<em>` tag as in
the mock (`<span class="wordmark"><em>Praxis</em></span>`). Glyph ornaments are
`aria-hidden="true"` spans with `font-style: italic; color: var(--color-text-tertiary)`.

### ActivityRail

`<ActivityRail>` is no longer mounted in `RootLayout` — it was previously
rendered below `<main>` and served as a blocking-modal ambient progress surface.
Story 2 (status strip) replaces its function inline beneath the running head.
The `activity-rail.tsx` component is not deleted; it is simply unmounted.

### Route stubs

Two new top-level routes (`/concept-maps`, `/progress`) are registered in the
router tree and linked from the top-nav. They render minimal `<RouteHeader>`
placeholders. These will be replaced by full surface implementations in
downstream stories.

### Tests

All 390 test files pass; 9 new tests added for `<TopNav>`.

## Review (2026-05-18)

**Verdict**: Request changes

**Blockers**: foundation-doc drift — `<ActivityRail>` unmounted from `RootLayout` but docs still assert it is mounted at the router root
  → Item: `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift`

**Important**: none

**Nits**:
- Story 2 (`status-strip`) scopes "Remove the existing `<ActivityRail />` mount" but this story already did it. Story 2 should drop that step to avoid confusion.

**Notes**: The implementation is otherwise clean and complete. `<TopNav>` component matches the locked mock, CSS is verbatim from `option-3.html`, the right slot is correctly reserved for sibling stories, route stubs use `<RouteHeader>` editorial primitive correctly, and the 9 tests give good behavioral coverage (wordmark, accessible label, all 5 links, all 5 glyphs, href attributes, active/inactive CSS class). The sole blocker is that `docs/ARCHITECTURE.md` (line 13), `docs/UX.md` (lines 5, 75, 92), and `CLAUDE.md` (line 111) still claim `<ActivityRail>` is mounted at the router root — a stale assertion that will mislead agents working in adjacent areas. Rolling the docs forward is a one-commit fix tracked in the blocker story.

## Review findings

### Blockers

- **Foundation-doc drift: `<ActivityRail>` still claimed as router-root mount** — `docs/ARCHITECTURE.md` line 13, `docs/UX.md` lines 5/75/92, and `CLAUDE.md` line 111 all assert `<ActivityRail>` is mounted at the router root. This story removed it; the docs must be rolled forward before the story can advance to done.
  → Item: `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift`

## Re-review note

Doc-drift sibling story `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift` cleared the only review blocker (foundation-doc drift for `<ActivityRail>` unmounting). No code changes needed in this story. Re-advanced to `review` for verdict pass 2.

## Review (2026-05-18, pass 2)

**Verdict**: Approve

**Blockers**: none — sole blocker from pass 1 (foundation-doc drift) was cleared by sibling story `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift`

**Important**: none

**Nits**:
- Story 2 (`status-strip`) still has "Remove the existing `<ActivityRail />` mount" in its scope; implementers will find it already done and can skip that step. (Carried from pass 1; not a new issue.)

**Notes**: Re-review confirms the doc-drift blocker is fully resolved. `docs/ARCHITECTURE.md`, `docs/UX.md`, `CLAUDE.md`, and `docs/ROADMAP.md` all correctly state that `<ActivityRail>` exists but is no longer mounted, and that the status strip pattern is the planned replacement. The implementation itself was clean in pass 1 (TopNav matches locked mock, CSS verbatim from option-3.html, right slot reserved, route stubs use RouteHeader editorial primitive, 9 tests with good behavioral coverage). Advancing to done.
