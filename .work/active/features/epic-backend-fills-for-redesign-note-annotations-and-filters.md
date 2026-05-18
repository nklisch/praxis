---
id: epic-backend-fills-for-redesign-note-annotations-and-filters
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Note annotations + Catalogue search/filters

## Brief

Two related additions to the workspace data layer:

**Selection-anchored note annotations.** The locked Feynman editor
(variant D — Two-Pass Margin) shows the student entering a "review
mode" where they select passages in their own explanation and attach
margin notes ("warning yellow" for soft gaps, "danger red" for load-
bearing ones). The current notes schema
(`packages/artifacts/src/schema.ts:188-206`) has `body` + `format` +
`sketchSceneJson` + `linksJson` but no field for inline annotations
attached to specific text ranges. This feature adds an annotations
field (likely JSON array of `{rangeStart, rangeEnd, text, severity}`)
plus the read/write API.

**Catalogue search + saved filters.** The locked Workspace
(`epic-ui-redesign-ground-up-workspace` Option 3 — Catalogue) is
search-first with a filter rail including saved filters: "from this
session", "due for review", "recent today", "orphan/unlinked". None
exist today. This feature adds: full-text search across artifact
bodies, "from-session" filter (needs originating-session index on
artifacts), "orphan" detection (artifacts not linked to any
course/lesson/concept), "due" filter (cards due now via the spaced-
review state), "recent" filter (date-windowed).

What this feature does **not** cover: the workspace UI itself; the
spaced-review scheduler (assumed); per-format note editor rewrites
(those are UI epic implementation stories).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-workspace`
  implementation (consumes both annotations and filters).

## Foundation references

- `packages/artifacts/src/schema.ts` — `notes` table (annotations
  field added here); originating session id likely added too
- `docs/ARCHITECTURE.md` § "Artifact lifecycle" + § "Storage
  architecture" — sqlite-vec already in use; FTS may need new index
- `packages/core/src/services/notes-service.ts` — annotations API
  surface lives here
- `.mockups/screens/.../-workspace/note-feynman-editor-d-two-pass.html`
  — the editor consuming annotations
- `.mockups/screens/.../-workspace/option-3.html` — Catalogue with
  filter rail

<!-- Two distinct sub-features inside one ship; the design pass will
either keep them together or recommend splitting. -->
