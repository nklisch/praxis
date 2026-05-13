---
id: epic-editorial-polish-pass-concept-name-surfacing
kind: feature
stage: drafting
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Concept name surfacing — show names everywhere a concept appears in editing UIs

## Brief

The gates editor and the course editor both surface concept IDs to the
user where they should display the concept's human-readable name.
Anchor verification confirmed the divergence: the **gates editor**
uses a React Flow `ConceptNode` custom node for graph visualization
(`gates-tab.tsx`), while the **course editor** renders concepts as a
comma-separated text input inside the `LessonEditor` (`lesson-editor.tsx`
lines 112–127). These are two separate rendering paths — fixing one
doesn't fix the other.

This feature **standardizes on showing concept names everywhere a
concept appears in editing UIs**, with the raw ID available on hover
or as secondary text. Both render paths get touched: ConceptNode in the
gates editor (which currently shows the ID prominently and needs to
swap to name + secondary ID), and the LessonEditor's text-input field
(which today is a CSV of IDs — needs to become a picker that displays
names while still storing IDs).

The gates editor also has a layout problem: concepts are crammed into a
single horizontal line that's barely legible. This feature reorganizes
that layout (wrap, stack, group by unit/lesson, or a denser-but-
readable component — exact shape at feature-design) and adds a
zoom/expand affordance so an author can actually reason about which
concepts are involved.

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — touches the configurator tab panels.
  Runs in parallel.

## Scope absorbed from backlog

- `idea-gates-editor-show-concept-names-not-ids` — show concept names
  (not IDs) everywhere a concept appears in editing UIs; reorganize
  the gates editor layout for readability + add expand affordance.

## Foundation references

- `docs/CURRICULUM.md` — concept / knowledge-graph model
- `CLAUDE.md` — pattern `editorial-ui-primitives`

## Anchors (current implementation)

- Gates editor route —
  `packages/ui/src/routes/configure/gates-tab.tsx` (uses ConceptNode
  React Flow custom node, imported at line ~8)
- Concept node component — search for `ConceptNode` definition in
  `packages/ui/src/components/`
- Course editor route —
  `packages/ui/src/routes/configure/course-tab.tsx`
- Lesson editor (concept CSV input) —
  `packages/ui/src/components/lesson-editor.tsx:112-127` (the
  comma-separated-text-input pattern)
- Concept lookup — `@praxis/artifacts` and `@praxis/curriculum`
  accessors; feature-design should consider a batched lookup hook
  (`useConceptNames(ids)`) to avoid N+1 fetches when rendering
  many concepts
