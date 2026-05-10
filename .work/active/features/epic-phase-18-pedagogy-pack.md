---
id: epic-phase-18-pedagogy-pack
kind: feature
stage: implementing
tags: [content]
parent: epic-phase-18-study-skills
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Pedagogy pack — service + v1 content

## Brief

The pedagogy pack is the foundation Phase 18 builds on: a versioned, signed
bundle of teaching strategies, study techniques, metacognitive prompts, and
their citations. Type contracts already exist
(`packages/core/src/types/pedagogy.ts`) and `ToolServices.pedagogyPack: unknown`
is wired as a Phase 14 stub. This feature replaces the stub with a real
`PedagogyPackService`, authors the v1 pack content, and exposes the pack's
reads through the existing tool registry pattern.

What this delivers:

- `PedagogyPackService` port + `PedagogyPackServiceImpl` reading the bundled
  pack from disk at boot (signed manifest verified before contents are served).
- v1 pack content: a curated set of teaching strategies (worked-examples,
  Socratic, elaborative-interrogation, concept-mapping, retrieval-practice…
  cite primary sources), study techniques (Cornell notes, Feynman explanation,
  spaced-repetition, concept-mapping with the editor that already exists),
  and metacognitive prompts grouped by their five triggers (pre-reading,
  post-reading, pre-quiz, post-error, session-end).
- A small set of read-only tools (`pedagogy.list_strategies`,
  `pedagogy.get_strategy`, `pedagogy.list_techniques`,
  `pedagogy.get_technique`, `pedagogy.list_metacognitive_prompts`) so any
  mode that needs to surface technique content has an authoritative path.

What this feature does NOT cover: the indexers that consume strategy ids
(procedural memory), the prompt-fragment injection across modes (separate
feature), and the dedicated `study-skills` mode that teaches the techniques
(separate feature). All three depend on this one.

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: foundation feature — every other Phase 18 feature except
  `affective-memory` consumes the pack.

## Foundation references

- `docs/CURRICULUM.md` — "Principles taught" section + the metacognition coach
  curriculum
- `docs/CONTRACT.md` — `PedagogyPack`, `TeachingStrategy`, `StudyTechnique`,
  `MetacognitivePrompt` interfaces (around line 763)
- `docs/ARCHITECTURE.md` — pedagogy-pack lives outside the framework runtime,
  loaded at boot
- `docs/ROADMAP.md` Phase 18 — pedagogy pack is the first build item

## Design decisions

- **Mirror the canonical-pack pattern.** `PedagogyPackServiceImpl` reads
  JSON from disk at boot, validates with Zod, holds the pack in memory,
  serves accessors synchronously. The directory mirrors
  `packages/curriculum/packs/` (canonical packs) — pedagogy packs live at
  `packages/curriculum/pedagogy/`. The service implementation lives at
  `packages/curriculum/src/pedagogy/`. There is no DB persistence — the
  pack is read-only content; loading from JSON is fast enough at ~50 KB.
- **Defer cryptographic signing to a future feature.** `CONTRACT.md`
  defines a `signature` field on `PedagogyPack`, but no signing
  infrastructure (key management, verification policy, untrusted-source
  story) exists yet. v1 stores `signature: "v1-unsigned"` as a sentinel
  and the service does not verify. When a credible threat model
  surfaces — most likely when third-party packs become loadable — a
  follow-on feature can wire real verification. Documenting the deferral
  here so reviewers don't flag it as drift.
- **Empty-pack fallback.** When no pack file is bundled or the file fails
  validation, the service operates in empty mode: every accessor returns
  empty arrays / null, the boot log records the absence, and tools
  degrade to "nothing available" responses. This decouples the
  engineering story (`pedagogy-pack-service`) from the content-authoring
  story (`pedagogy-pack-v1-content`) — engineering can land first and
  ship correctly even without content.
- **Synchronous accessors.** Pack content is small and held in memory; no
  per-call I/O. Strategies and techniques are indexed by id in `Map`s
  built once at construction for O(1) lookup. This matches how loaded
  canonical packs are served post-import.
- **Strip citations from tool outputs.** Citations are an authoring /
  audit concern, not something the model needs in its tool-result
  payload. The five `pedagogy.*` tools return `name`, `description`,
  `applicability`, `promptFragment`, etc. — citations stay in the loaded
  pack object and surface only via the `current()` accessor for
  inspector views.

## Architectural choice

Single-file pack on disk + synchronous service. Considered alternatives:

- **Per-strategy / per-technique JSON files in a directory.** More flexible
  for incremental authoring but adds a manifest-merge step. The pack is
  small enough (~50 KB) and content authoring happens in one editor pass
  per release, so the indirection isn't worth it.
- **DB-backed pack tables.** Aligns with how canonical-pack content lands
  in the relational schema, but pedagogy content is read-only and
  versioned with the binary. No reason to pay for migrations on every
  pack iteration.

The chosen shape (single JSON, synchronous service, empty fallback) mirrors
how the project already loads similar configuration (logging-config,
bootstrap-config) and matches the canonical-pack file pattern at the
authoring layer.

## Implementation Order

Two child stories:

1. `epic-phase-18-pedagogy-pack-service` (no deps) — ports, schema, impl,
   tools, services wiring. Lands with the empty-pack fallback so it can
   ship before any content exists.
2. `epic-phase-18-pedagogy-pack-v1-content` (depends on the service story)
   — author the v1 JSON. Ends with a smoke test confirming the bundled
   pack is loaded at boot with the expected counts.

## Risks

- **Citation accuracy** is the primary risk in the content story. Authoring
  five strategies + four techniques means around fifteen citations in
  total; one or two could be misattributed if the author works from
  memory. Mitigation: log "(citation TBD)" markers in `description` for
  any uncertain citation rather than inventing one — follow-up pass
  verifies. Also: scope creep on the content surface itself — bias toward
  five strong strategies over seven thin ones.
- **Empty-pack mode silence.** If the v1 content story ships but the file
  ends up at an unexpected path (or excluded from the package's published
  files), the service falls back to empty mode and downstream consumers
  silently degrade. Mitigation: the smoke test in the content story
  asserts the loaded pack has non-zero counts.
- **`pedagogyPack: null` in test stubs.** Six call sites currently pass
  `null` for `ToolServices.pedagogyPack`. The service story has to keep
  the field non-null at the type level (so the `.unknown` is replaced
  with the real interface, not a maybe-null). Mitigation: ship a
  `makeEmptyPedagogyPackService()` test helper rather than scattering
  `null`-handling through production code.
