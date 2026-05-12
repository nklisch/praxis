---
id: feature-editorial-polish-pass
kind: feature
stage: implementing
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Editorial polish pass

## Brief

A coordinated sweep that brings four UI surfaces into alignment with the
editorial design system established in Phase 13 (RouteHeader, LibrarySection,
EmptyState, COPY module, `composes: editorial from global;`). Each piece is
small in isolation but they share design-system surface area and are best
designed together so the same theme tokens, scroll affordances, and rendering
rules apply consistently.

**Surface 1 — Header bar light/dark mode alignment.** The header bar should
align with the overall editorial style and pick up light/dark theming. Pattern
check: ensure CSS variables in the design system have light/dark variants and
that the header bar consumes those tokens rather than hardcoded colors. The rest
of the app's editorial style must also render correctly in both modes — this
surface is the canary because it's always visible.

**Surface 2 — Notes table cell rendering.** Notes display in the table currently
doesn't preserve the formatting students expect — markdown (bold, italics,
inline code), bullet lists, and line breaks all collapse or render as raw
characters. The cell renderer should run notes through the same markdown path
used in the chat thread (or a lightweight subset — at minimum line breaks,
inline emphasis, lists) so what students see in the table matches what they
wrote.

**Surface 3 — Concepts list / concept-map navigation and scrolling.** The
concepts view doesn't scroll well and doesn't surface enough at a glance for
large concept sets. The math canonical pack already pushes the limits; the
biology pack will exceed them. Needs a scrollable container with sticky-header
or section grouping for hierarchy, plus a way to filter or jump to a concept
without paging through the full list. Touch the concept map and the flat list
view together.

**Surface 4 — General styling alignment sweep.** Periodic pass — anywhere the
app feels visually inconsistent or hasn't yet picked up the editorial primitives
gets brought into line. Concrete check: every route should be using
`RouteHeader`, every list surface should be using `LibrarySection` or have a
documented reason not to, every empty state should use `EmptyState`, every
copy string should resolve from `COPY` (or have an inline justification for a
literal). Tag-team with Surface 1: the dark-mode work surfaces every place
that hardcoded a color and didn't use a token.

## Scope notes

This is a feature with multiple bounded UI stories rather than an epic — each
surface is a single-session piece of work and the four share enough design-system
context that decomposing into an epic would add ceremony without insight. The
design phase should produce 3-4 child stories (header bar + theme tokens, notes
markdown rendering, concepts navigation + scroll, styling sweep) with explicit
file lists per story.

Dark/light mode and the styling sweep have ordering implications: do the theme
token work first (Surface 1), then the styling sweep can use the new tokens.
Notes rendering and concepts navigation are independent and can run in
parallel.

Origins: `.work/backlog/idea-headerbar-light-dark-mode.md`,
`.work/backlog/idea-notes-table-rendering.md`,
`.work/backlog/idea-concepts-navigation-scrolling.md`,
`.work/backlog/idea-styling-alignment-pass.md`.

<!-- Design and Implementation Notes accumulate here as work progresses. -->

## Design decisions

Ambiguities resolved during this design pass (autopilot delegation, judgment-based):

- **Light-mode strategy**: auto-switch via `prefers-color-scheme: light` media
  query in `global.css`. No manual toggle UI in v1 — minimum surface area;
  matches OS-level user preference; the user already trained the OS. Rationale:
  every modern OS exposes a system theme; auto-switching is the lowest-friction
  default. A Settings toggle can be added later if feedback warrants.
- **Theme-token shape**: keep `--color-*` CSS variables as the single source
  of truth for color. Add a `@media (prefers-color-scheme: light)` block in
  `global.css` that overrides each `--color-*` with its light-mode equivalent.
  No JS-driven theming; no `data-theme` attribute. The styling sweep then
  finds every hardcoded color in the codebase and replaces it with a token.
- **Notes markdown rendering**: reuse the existing `<MarkdownContent>` component
  (`packages/ui/src/components/markdown-content.tsx`, react-markdown +
  remark-gfm + remark-math) rather than building a "lightweight subset".
  Consistency with chat rendering is more valuable than the byte savings of a
  trimmer. The notes-list cell becomes a thin wrapper that calls
  `<MarkdownContent>` for non-empty bodies.
- **Concepts list scroll/filter**: CSS-only sticky-header sections grouped by
  the concept's parent unit, plus a text filter input at the top. No
  virtualization — typical concept counts (tens to hundreds) don't need it.
  Substring match (case-insensitive); clears with Escape or a small clear
  button.
- **Concepts grouping**: by parent unit (the natural curriculum hierarchy
  from the knowledge graph). Falls back to "Ungrouped" when a concept has no
  parent unit. Sticky `<h3>` per group.
- **Styling sweep enumeration**: per the brief's concrete checks. Each route
  audited against the editorial-primitives checklist (RouteHeader,
  LibrarySection, EmptyState, COPY). Surface 1 (theme tokens) ships first so
  the sweep can replace any hardcoded color it finds with a token.
- **Concept map (graph view) scroll**: out of scope for this feature — the
  graph view uses React Flow which has its own pan/zoom. Only the flat-list
  concepts route gets the scroll/filter work. Brief mentions "Touch the
  concept map and the flat list view together" — re-reading, the flat list
  is the primary subject; the map view needs no scrolling changes. If a
  concrete issue surfaces during implementation, it gets a follow-up item.

## Architectural choice

**4 parallelizable stories with explicit deps**: Surface 1 (theme tokens)
ships first; Surfaces 2 (notes), 3 (concepts), and 4 (sweep) depend on
Surface 1. Stories 2 and 3 don't depend on each other and can land in
parallel.

Rationale: each surface is a single-session UI piece. Decomposing into an
epic would add a level of indirection without insight (the brief's own
note). The 4-story shape captures the natural dependency (theme tokens
land first, then sweep can use them) without over-engineering. The orchestrator
will run wave 1 = story 1, wave 2 = stories 2/3/4 in parallel.

## Implementation Units (child stories)

### Story 1: Theme tokens + light-mode media query
**ID**: `feature-editorial-polish-pass-theme-tokens`
**Depends on**: `[]`

Scope: extend `packages/ui/src/styles/global.css` with a
`@media (prefers-color-scheme: light)` block defining light-mode equivalents
for every `--color-*` variable. Audit the nav bar
(`packages/ui/src/components/nav.tsx` + `nav.module.css`) for any hardcoded
colors and replace with tokens. Update the existing dark-mode default values
in `:root` where they need a light-mode counterpart.

**Files**:
- `packages/ui/src/styles/global.css` — add light-mode block; verify each `--color-*` has both modes.
- `packages/ui/src/components/nav.module.css` — replace any hardcoded colors with tokens.
- `packages/ui/src/__tests__/theme-tokens.test.tsx` (new) — snapshot test asserting `:root` has both dark (default) and light (media-query) values for each token name; smoke test that a `<Nav>` render in jsdom doesn't error and uses tokens.

**Light-mode token candidates** (the implementer adjusts for visual quality):
```css
@media (prefers-color-scheme: light) {
  :root {
    --color-bg: #fafafa;
    --color-surface: #ffffff;
    --color-border: #e8e8e8;
    --color-text: #1a1a1a;
    --color-text-muted: #6a6a6a;
    --color-accent: #4f5fb8;
    --color-user-bubble: #e8ecff;
    --color-assistant-bubble: #eef5e8;
    --tint-route: var(--color-text-muted);
  }
}
```

**Acceptance Criteria**:
- [ ] `prefers-color-scheme: light` switches every visible color in the nav bar to its light equivalent.
- [ ] All other surfaces (chat, library, configure, etc.) render correctly in light mode — no white-on-white or black-on-black contrast failures (the sweep story tightens any leftovers).
- [ ] Existing dark-mode visual baseline is unchanged (no token values regress; the existing palette stays the default).

---

### Story 2: Notes table markdown rendering
**ID**: `feature-editorial-polish-pass-notes-markdown`
**Depends on**: `[feature-editorial-polish-pass-theme-tokens]`

Scope: render note bodies in the notes-list table through `<MarkdownContent>`.
Match the chat-thread rendering exactly (same component, same plugins).

**Files**:
- `packages/ui/src/routes/workspace/notes-list.tsx` — wrap the cell body in `<MarkdownContent value={note.body} />`. Identify the existing plain-text cell and replace.
- `packages/ui/src/routes/workspace/notes-list.module.css` — table cell styling adjusted so rendered markdown sits cleanly (constrain heading sizes; prevent oversized images; preserve line height).
- `packages/ui/src/__tests__/notes-list-route.test.tsx` (extend) — assert: a note with `**bold**` renders a `<strong>` element; a note with `- item` renders a `<ul>`; a note with no markdown renders as a paragraph.

**Implementation Notes**:
- The `<MarkdownContent>` component is already part of the chat rendering path; it imports lazily-loaded math/code blocks. Verify the imports work in the notes context (typically yes; same React tree).
- Cell width may be constrained — make sure long markdown content doesn't break the table layout. Apply `overflow-wrap: anywhere` or `word-break: break-word` on the cell.
- Block-level elements inside a `<td>` are valid HTML; the existing chat usage is also inside arbitrary containers.

**Acceptance Criteria**:
- [ ] Notes with markdown render with the same shape as chat: bold, italic, inline code, lists, line breaks.
- [ ] Plain-text notes render identically to today (paragraph wrapping; no behavior change for users with no markdown in their notes).
- [ ] Table layout doesn't break on long lines or oversized images.
- [ ] At least 3 test cases lock the contract.

---

### Story 3: Concepts list scroll + filter + sticky sections
**ID**: `feature-editorial-polish-pass-concepts-navigation`
**Depends on**: `[feature-editorial-polish-pass-theme-tokens]`

Scope: the flat-list concepts route (find the file; likely `packages/ui/src/routes/concepts.tsx` or similar — implementer confirms). Add a scrollable container, sticky-header section grouping by parent unit, and a text filter input.

**Files** (implementer to confirm exact filename):
- The route file rendering the flat concept list.
- Its CSS module — add `overflow-y: auto`, `max-height` constrained to viewport; `position: sticky; top: 0` on the `<h3>` group headers.
- A new test asserting filter narrows the visible list and Escape clears the filter.

**Design notes**:
- Group label = unit title; fallback "Ungrouped" when a concept has no parent unit.
- Filter input above the scroll container; uses the editorial primitives (e.g., a styled `<input>` matching existing search/filter inputs in the codebase if any exist).
- Filter behavior: case-insensitive substring against the concept name. Optional: include the concept's description in the search if there's space.
- Filter clears on Escape or a small "clear" button (right side of the input).
- No virtualization (sub-1000 concepts; sticky CSS handles the rest).
- Concept-map (graph view) scrolling is OUT of scope — React Flow owns that interaction. Only the flat list is touched.

**Acceptance Criteria**:
- [ ] Concept list scrolls cleanly when the count exceeds the viewport height.
- [ ] Concept groups have sticky `<h3>` headers that stay visible as the user scrolls within a group.
- [ ] Filter input narrows the visible list as the user types; case-insensitive substring match.
- [ ] Escape clears the filter input and restores the full list.
- [ ] A clear button (when input is non-empty) does the same.
- [ ] No regression: existing concept click / select behaviors continue to work.

---

### Story 4: Editorial primitives audit + styling sweep
**ID**: `feature-editorial-polish-pass-styling-sweep`
**Depends on**: `[feature-editorial-polish-pass-theme-tokens]`

Scope: comprehensive audit of every route + list surface for editorial-primitives compliance. Replace any hardcoded color with a CSS token (Surface 1's work surfaces this).

**Checklist** (each item is a per-route check):
- Every route under `packages/ui/src/routes/**/*.tsx` uses `<RouteHeader>` for its header.
- Every list view uses `<LibrarySection>` or has a documented one-line reason not to (e.g., the chat thread is not a "list" in that sense).
- Every empty-state surface uses `<EmptyState>`.
- Every copy string resolves from `COPY` (the SSOT) or has an inline comment explaining the literal.
- Every CSS module's color values come from `var(--color-*)` tokens; no hex codes outside `global.css`'s `:root` / light-mode block.

**Approach**:
1. Spawn a quick `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/ui/src --include='*.css' --include='*.tsx'` to find every hex color outside global.css.
2. For each result, either replace with a token or add `/* intentional literal: <reason> */`.
3. Walk every route file and tick each checklist item against the actual code; for routes that fail a check, fix or document.

**Files**:
- Touches potentially many files across `packages/ui/src/routes/` and `packages/ui/src/components/`. Each is a small change.
- Possibly extend `packages/ui/src/lib/copy.ts` if the audit finds hardcoded strings worth adding to COPY.

**Acceptance Criteria**:
- [ ] `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/ui/src --include='*.css'` finds matches only in `global.css` (or files with a documented inline justification).
- [ ] Every route file under `packages/ui/src/routes/` either renders `<RouteHeader>` or has an inline comment explaining why it doesn't (e.g., session tab bodies, modals).
- [ ] Light-mode visuals are clean (no orphan dark-on-dark or light-on-light contrast failures discovered during the audit).
- [ ] `pnpm --filter @praxis/ui test` green; no UI regression.

## Implementation Order

```
Story 1 (theme-tokens)          ─── foundation; ships first
    │
    ├── Story 2 (notes-markdown)        ─── parallel with 3, 4
    ├── Story 3 (concepts-navigation)    ─── parallel with 2, 4
    └── Story 4 (styling-sweep)          ─── parallel with 2, 3
```

The orchestrator runs Wave 1 = Story 1, then Wave 2 = Stories 2 + 3 + 4 in
parallel (3-agent wave).

## Testing

Each story carries its own test scope per the per-story acceptance criteria.
Cross-cutting verification after all four land:

```bash
pnpm --filter @praxis/ui typecheck
pnpm --filter @praxis/ui lint
pnpm --filter @praxis/ui test
pnpm typecheck   # root gate
pnpm test
```

Manual visual smoke (out of automated test scope):
- `pnpm dev`, toggle OS theme between dark and light, walk every route. No
  contrast failures, no hardcoded color leaks.
- Write a note with `**bold**`, list, and code-block. View in the notes
  list — formatting renders.
- Open a course with 50+ concepts. Scroll the concepts list, type in the
  filter, hit Escape.

## Risks

1. **Existing UI relies on dark-mode-specific contrast in places that won't
   translate cleanly to light mode.** Some "muted" colors that read well on
   dark backgrounds become unreadable on light. **Mitigation**: the sweep
   story (Story 4) catches these as part of the audit; any genuinely
   problematic surface gets a per-surface light-mode override rather than
   a global token shift.
2. **`<MarkdownContent>` rendering inside a table cell may produce
   block-level descendants in `<td>` that browsers handle inconsistently.**
   **Mitigation**: existing chat usage already nests block elements inside
   arbitrary containers; verify with a real browser smoke. If problematic,
   wrap the cell content in a `<div>` to give the markdown its own block
   context inside the `<td>`.
3. **Concepts filter degrades with 1000+ concepts (perf).** Unlikely for
   v1 (math pack has ~80, biology pack will have ~200). **Mitigation**:
   if a future pack exceeds 1000, swap in virtualization as a follow-up.
4. **The sweep story's scope is open-ended.** Hard to know when "done".
   **Mitigation**: the checklist is exhaustive at the route level; once
   every route is audited and either complies or has a documented
   exception, the story is done. Resist scope creep into refactors
   tangentially related to styling.
