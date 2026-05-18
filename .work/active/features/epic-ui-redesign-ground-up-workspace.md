---
id: epic-ui-redesign-ground-up-workspace
kind: feature
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on:
  - epic-ui-redesign-ground-up-design-system
  - epic-ui-redesign-ground-up-app-shell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Workspace — Notes, Flashcards, Sketch, Review

## Brief

Redesign the student's intimate working space — the surfaces dedicated to
note-taking, flashcards, sketching, and spaced-review. These are
"workshop" surfaces distinct from the conversational chat workspace: the
student goes here to consolidate, draft, review, and create — solo work
that the tutor references but doesn't conduct.

Current surfaces under `packages/ui/src/routes/workspace/`:

- **Notes** — `notes-list.tsx`, `note-editor-page.tsx`, and the format
  editors (`cornell`, `feynman`, `outline`, `free`, `sketch`)
- **Flashcards** — `cards-list.tsx`, `flashcard-proposal.tsx`,
  `flashcard-review.tsx`
- **Review session** — `review-session.tsx` (spaced-repetition flow)
- **Sketch** — full-chrome `sketch-canvas.tsx` and inline `composer-sketch.tsx`
- **Concept map editor** — `routes/concept-map-editor.tsx` (tldraw with
  ConceptLinkOverlay + CanonicalHintsOverlay)

These are grouped because they share a creative-work posture — generous
canvas, focused editing chrome, minimal nav — and because the design
choices about format pickers, persistence affordances, and how the
sketch / map / typed-text modes co-exist cut across all of them.

The **review flow** (queue → card → outcome → next-card → session-end
summary) lives entirely within this feature as an in-surface journey.

What lands:

- `.mockups/screens/epic-ui-redesign-ground-up-workspace/` — option set
  for notes index, note editor (per format), flashcards index, sketch
  canvas, concept map editor
- `.mockups/flows/review-session/` — multi-step walk through a spaced
  review session

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **creative-work surface feature** — depends on
  design-system and app-shell; parallelizes with chat-workspace,
  discovery, and configure.

## Foundation references

- `docs/UX.md` § "Surface map" — Workspace (notes) and Concept map
- `docs/ARCHITECTURE.md` § "UI architecture" → Workspace, Concept map —
  tldraw integration, Pointer Events for stylus
- `docs/VISION.md` § "How Praxis feels" — quiet intelligence,
  focus-preserving posture (especially relevant for sketch + review
  surfaces)

## Mockups

- Screens: `.mockups/screens/epic-ui-redesign-ground-up-workspace/index.html`
- **Selected: Option 3 — Catalogue** (2026-05-17)
  - **Search-first flat index** of every artifact the student has made
    — notes (all formats), flashcards, sketches all surface together
    with the same card primitive, distinguished by mono kicker
  - Big italic search box at the top (`search notes, sketches, cards
    · or a concept, a lesson, a phrase…`)
  - Left rail of filters: by format (notes / cards / sketches),
    by course, by concept, plus saved filters (due for review,
    recent, orphan/unlinked)
  - Result grid: artifact-typed cards with format kicker, italic
    title, excerpt, tag chips for course / concept / status
  - Sketches render mini-SVG previews; flashcards show Q + A snippet;
    notes show first-3-lines excerpt
  - "Recent today" and "due for review" are saved filters in the rail,
    not separate surfaces — the index IS the surface, filters carve
    views
- Considered: Continuous Notebook (chronological stream),
  Studio (tabbed rooms by format), Course Companion (pivots around
  active course) — in `.mockups/screens/.../option-{1,2,4}.html`

The review session flow spawns as a child story during implementation
— launched from the "due for review" filter view via a "Start review
session →" CTA at the top of filtered results.

### Per-format note editors (locked)

The catalogue is the index; each artifact has its own native editing
surface. Five note-format editors mocked at
`.mockups/screens/epic-ui-redesign-ground-up-workspace/note-*-editor.html`
plus the variants index at `note-editors-index.html`:

- **Cornell** (`note-cornell-editor.html`) — 3-zone layout: cue column
  (left, 240px), notes column (right, editorial body type), summary
  band (bottom). ◆ markers in the notes column anchor clickable cues
  on the left.
- **Feynman** (`note-feynman-editor-d-two-pass.html` — LOCKED variant D
  of 4 explored) — explicit mode toggle `I'm writing` ↔ `I'm reviewing`.
  Pass 1 is a clean writing surface (no gap-finding chrome to
  self-censor against). Pass 2 enters review mode — select text in the
  explanation to attach a margin note (warning yellow for soft gaps,
  danger red for load-bearing ones). Separates *making the explanation*
  from *finding the gaps*. Variants A (stacked cards refined),
  B (editorial page), and C (living audience that reacts in right
  column) considered and available at `note-feynman-editor.html`,
  `note-feynman-editor-b-editorial.html`,
  `note-feynman-editor-c-audience.html`; full pick rationale captured
  in `note-feynman-variants.html`.
- **Outline** (`note-outline-editor.html`) — hierarchical bullets,
  keyboard-first. Tab indents / Shift+Tab outdents / ⌘. converts to
  checkbox. 4 indentation levels (level-1 bold heroic → level-4
  muted-italic asides). Drag handles on hover.
- **Free** (`note-free-editor.html`) — minimal-chrome typewriter page.
  Full-bleed title input, drop-cap on first paragraph, slash-command
  for inline structure. Right gutter (fixed) shows word count +
  read time + drifted concept tags.
- **Sketch** (`note-sketch-editor.html`) — free drawing canvas with
  tools rail (pen / shape / arrow / text / color swatches). **Inline
  notice at top** explicitly distinguishes from concept map and offers
  a `convert to a concept map ↗` bridge — this is the load-bearing
  visual proof that sketch and concept-map are distinct primitives.

### Concept-map editor (locked)

Concept-map editor is its own surface (distinct from notes; canonical-
concept linking is the load-bearing distinction). Mock at
`.mockups/screens/epic-ui-redesign-ground-up-workspace/concept-map-editor.html`.

- Canvas in the middle — student-drawn nodes connected by labeled
  edges; each node carries the student's own phrasing AND a canonical-
  link annotation underneath
- Three node states made visible — **linked** (✓ green outline),
  **best-guess suggested** (? amber dashed; Praxis's tentative link
  awaiting confirmation), **unlinked** (default outline, dimmed)
- Left rail of drawing tools (select / node / edge / text / pen /
  box / erase)
- Right panel shows canonical match candidates for the selected node
  with confidence scores + canonical definition + source citation;
  "make this concept your own" escape hatch when nothing fits

Implementation: tldraw + the existing `ConceptLinkOverlay` and
`CanonicalHintsOverlay` (already in the codebase).

### Production-time editor library choices (not constrained by mocks)

The mocks set layout, posture, and visual language. Implementation
child stories pick the editor library per format when each lands:

- **Cornell / Feynman / Outline / Free**: contenteditable rich-text
  editor (TipTap or Lexical likely) for keyboard navigation,
  undo/redo, inline formatting, slash commands, autosave debouncing
- **Sketch**: tldraw (already in the project)
- **Concept map**: tldraw + `ConceptLinkOverlay` + `CanonicalHintsOverlay`

### Sketch vs concept-map distinction (architectural)

The Sketch editor includes an **inline notice + `↗ convert to concept
map` bridge** at the top, surfacing the architectural distinction:
sketches are free drawing surfaces with no canonical-concept linking;
concept maps are structured graphs whose nodes link to canonical
concepts (drives BKT mastery, misconception machinery). The
`sketch-to-concept-map` flow (below) walks the conversion explicitly,
preserving the original sketch alongside the new concept map.

### Flows landing here

- **chat-to-workspace-note** (`.mockups/flows/chat-to-workspace-note/`)
  — mid-session insight capture from chat-workspace; format-picker
  popover (Cornell suggested first, numbered shortcuts) → inline
  Cornell panel slides in → saved + linked to lesson → later visible
  in the Catalogue with a "from this session" filter. Cross-feature
  integration from `chat-workspace`.
- **note-to-tutor-brief** (`.mockups/flows/note-to-tutor-brief/`) —
  the back-flow: note in workspace → "ask the tutor to brief from
  this note" CTA → new teach session opens quoting the note's
  unanswered cue → conversation closes the loop and offers to update
  the note's cue with the just-earned answer. Workspace ↔ chat
  integration via the briefed-session pattern.
- **concept-map-link** (`.mockups/flows/concept-map-link/`) — the
  finer component: draw a new node → Praxis's best-guess link
  surfaces (`?` amber badge) → hover candidate (ghost edges preview
  in canvas) → confirm → ripples surface (concept count +1, tutor
  reference, notes re-tagged). The three node states
  (linked ✓ / best-guess ? / unlinked) carry the visual contract
  between agent suggestion and student confirmation.
- **sketch-to-concept-map** (`.mockups/flows/sketch-to-concept-map/`)
  — the primitive bridge: sketch editor with the `↗ Convert` pill
  glowing → confirmation modal (what changes, reversibility called
  out) → conversion in motion (sketch fades to 32%, nodes pop in
  with `?` badges, hints panel slides in) → it's a concept map; the
  original sketch is saved alongside (toast links back).

## Design decisions

- **Many parallel stories.** Per-format editors and the catalogue are
  independent; spawn one story each for maximum fan-out.
- **Concept-map editor changes split** — the three-state UX + ripples
  panel is owned by sibling backend feature
  `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge`
  (story
  `-three-state-and-ripples`); this feature's concept-map story is the
  surface restyle + integration with the new design tokens.
- **Sketch → concept-map bridge** owned by sibling backend feature's
  conversion story.

## Implementation Units (one story each)

1. **`-catalogue-rebuild`** — Rebuild `notes-list.tsx` as the
   Catalogue (search box + filter rail + artifact-typed cards).
   Consumes `LibraryService.search` from sibling
   `epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters`.
2. **`-note-editor-cornell`** — 3-zone Cornell editor with ◆
   cue-anchor markers.
3. **`-note-editor-feynman`** — Two-pass Feynman editor (locked
   variant D) with mode toggle and margin-anchored gap notes
   (consumes annotations API from
   `epic-backend-fills-for-redesign-note-annotations-and-filters-annotations`).
4. **`-note-editor-outline`** — Keyboard-first hierarchical outline.
5. **`-note-editor-free`** — Typewriter page + slash-command + drift
   tags.
6. **`-note-editor-sketch`** — Free canvas + `↗ convert to concept
   map` bridge (consumes
   `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion`).
7. **`-concept-map-editor-restyle`** — Refactor `concept-map-editor.tsx`
   to match the canonical-hints panel mock (consumes three-state UX
   from sibling backend story).
8. **`-review-session-flow`** — Deferred until a flow mockup pass
   produces the locked direction.
9. **`-chat-to-workspace-inline-panel`** — Inline note panel sliding
   in from chat composer; format-picker popover; saves linked to
   originating session.
10. **`-ask-tutor-from-note`** — "▶ talk to Praxis about this" button
    in note editors (consumes
    `epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note`).

## Implementation Order

Stories largely parallel. Sequencing notes:
- Story 1 (catalogue) is independent of editors.
- Editors (2-6) can run fully parallel.
- Concept-map (7) depends on backend three-state story landing first.
- Inline-panel (9) depends on at least one note editor (10's
  triggering surface).

## Acceptance Criteria

- [x] Catalogue renders + filters work end-to-end.
- [x] All five note-format editors match their locked mocks.
- [x] Concept-map editor renders three-state + canonical hints panel.
- [x] Inline-panel infrastructure surfaces from the chat composer.
- [x] Ask-tutor-from-note button spawns sessions per the locked flow.
- [x] All quality checks green.

## Children complete (2026-05-18)

All 10 child stories at `stage: done`. Feature advanced `implementing → review`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none (the cornell nested-interactive finding was triaged to backlog during child review; the chat-to-workspace `format` hardcode and `SavedNoteToast.noteId` dead prop were noted as nits during child review)
**Nits**: (see individual child review sections)

**Notes**: All 10 implementation units delivered per brief. Each child story was individually reviewed and approved (some with inline blocker fixes: catalogue search-box remount, outline cursor-reset, concept-map tool-id swap). Cross-cutting aggregate check: design-system token adoption consistent across all editors; sketch ↔ concept-map distinction is correctly surfaced via the inline notice + convert bridge; ask-tutor and inline-panel cross-feature integrations land cleanly against the session-open and spawn-from-note patterns. Capability completeness confirmed end-to-end.
