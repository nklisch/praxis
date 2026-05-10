---
id: epic-phase-18-pedagogy-pack
kind: feature
stage: drafting
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
