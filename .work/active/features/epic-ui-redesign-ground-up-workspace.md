---
id: epic-ui-redesign-ground-up-workspace
kind: feature
stage: drafting
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on:
  - epic-ui-redesign-ground-up-design-system
  - epic-ui-redesign-ground-up-app-shell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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
