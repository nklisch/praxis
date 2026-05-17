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
