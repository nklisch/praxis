---
id: epic-ui-redesign-ground-up-discovery-surfaces-workbench-library-rebuild
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-workbench-engine-recommendation-service
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# LibraryRoute → Workbench rebuild

## Scope

Rebuild `LibraryRoute` as the Workbench: greeting line with count of
ready things, what's-next queue (consumes
`praxisClient.recommendations.next`), lately timeline of recent
sessions, footer cards for packs / concept maps / documents.

## Implementation steps

1. Edit `packages/ui/src/routes/library.tsx`:
   - Greeting line at top ("Good morning. There's {n} things ready
     for you.").
   - Two-column layout: left queue / right timeline.
   - Queue: render `Recommendation[]` from
     `praxisClient.recommendations.next({ limit: 5 })`; each row
     shows reason + CTA per kind (resume / review / practice / etc.).
   - Timeline: existing `RecentSessionsSection` content restyled
     into a chronological strip.
   - Footer: three small cards linking to packs / concept maps /
     documents.

2. New components per locked mock:
   `recommendation-row.{tsx,module.css}` per kind.

3. Tests cover greeting, queue render, click-to-spawn behavior,
   timeline render.

4. Quality checks green.

## Acceptance criteria

- [ ] Library renders the Workbench shape.
- [ ] Queue items dispatch to the correct surface on click.
- [ ] Timeline + footer cards render.
- [ ] All quality checks green.
