---
id: epic-phase-19-biology-pack
kind: feature
stage: drafting
tags: [content]
parent: epic-phase-19-ship-v1
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Biology canonical pack

## Brief

Author the second canonical pack — high-school biology, NGSS-mapped, roughly
~250 concepts — that ships alongside the existing `algebra-1` and `geometry`
packs from Phase 10. The pack drops a single JSON file at
`packages/curriculum/packs/biology.json` conforming to `PackManifestSchema`
in `@praxis/curriculum/packs`. The bootstrap and configure modes already
expose `course.list_canonical_packs` / `course.use_canonical_pack`, and
`PackImportServiceImpl` already loads any `*.json` in `packs/`, so the
delivery surface is just the file plus integration tests.

What this feature covers:

- The pack manifest with stable concept ids (`biology.<concept-slug>`),
  descriptions, aliases, and `standardsTags` mapping to NGSS HS-LS codes.
- Prerequisite edges that produce a sensible router order (cell biology
  before genetics, photosynthesis paired with cellular respiration as
  parallel rather than chained, etc.). The pack feature owns the pedagogical
  structure decision.
- A smoke test that imports the pack via `PackImportServiceImpl` and asserts
  conceptCount, edge sanity (no orphan refs, no cycles), and that
  `BootstrapServiceImpl.createCourseFromPack` produces a course with lessons
  of ~7 concepts each.
- A short authoring note in the pack file's `authoredBy` / `standardsRef`
  fields and (optionally) a sibling `biology.notes.md` capturing sources and
  tradeoffs.

What this feature does NOT cover:

- No schema changes to `PackManifestSchema` — biology must fit the existing
  shape. If it doesn't, that's a finding for a separate refactor feature,
  not this one.
- No bootstrap-mode UI changes — the canonical-pack picker already lists
  whatever is on disk.
- No mastery-model tuning for biology specifically.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: independent capability — produces the second canonical
  pack the v1 ship promises. Does not block any other feature; ship-checklist
  consumes it at the end.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Biology canonical pack
  (NGSS-mapped, ~250 concepts)").
- `docs/CURRICULUM.md` § "Canonical graphs at launch" — biology is one of
  the two canonical graphs at launch (the other is the math pack from
  Phase 10).
- `docs/SPEC.md` § "Subjects (canonical concept graphs + content packs)
  are independently versioned packages" — the pack-versioning story.
- `packages/curriculum/packs/algebra-1.json` and `geometry.json` — reference
  shape and tone for descriptions.
- `packages/curriculum/src/packs/import-service.ts` — the loader the pack
  must satisfy.
- `packages/curriculum/src/packs/schema.ts` — `PackManifestSchema`, the
  binding contract.

<!-- Feature-design pass will produce the concept-list outline, NGSS mapping
strategy, and authoring approach (e.g., LLM-drafted then human-curated vs.
fully hand-curated). -->
