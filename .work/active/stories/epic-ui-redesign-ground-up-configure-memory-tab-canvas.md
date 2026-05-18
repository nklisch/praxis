---
id: epic-ui-redesign-ground-up-configure-memory-tab-canvas
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Configure Memory tab canvas — projection tabs + tables/cards

## Scope

Rebuild Memory tab canvas per `tab-memory.html`:
- Projection-tab strip: semantic / misconceptions / procedural /
  affective / episodic.
- Per-projection canvas:
  - **semantic**: BKT-adjusted concept mastery table with per-row
    recompute action.
  - **misconceptions**: cards with evidence quotes + concept link +
    strength badge + inline address-or-clear actions.
  - **procedural / affective / episodic**: read-mostly views of the
    respective projections.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/memory-tab.tsx`.
2. New `<ProjectionTabStrip>` switching the canvas view.
3. Per-projection components:
   - `<SemanticTable>` with per-row recompute.
   - `<MisconceptionCards>` with evidence + actions.
   - Simple list views for procedural / affective / episodic.
4. Wire to `praxisClient.authoring.{resetConcept, clearMisconception, ...}`
   plus read methods on `MemoryService`.
5. Tests cover projection-switch + row interactions.
6. Quality checks green.

## Acceptance criteria

- [ ] Memory tab matches the locked mock.
- [ ] All five projection views render.
- [ ] Recompute + clear actions work end-to-end.
- [ ] All quality checks green.
