---
id: gate-docs-bootstrap-explorer-pattern-skill-rename
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# Sweep `bootstrap` / `explorer` / `BootstrapServiceImpl` residue in pattern skills

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/mode-prompt-fragment-composition.md:75`
- Doc: `.claude/skills/patterns/tab-body-isolation.md:9, 103-106`
- Doc: `.claude/skills/patterns/batch-tool-per-item-results.md:7`
- Doc: `.claude/skills/patterns/lazy-resolver-thunk.md:7, 21-26, 50, 54`
- Code: `packages/curriculum/src/modes/course-create.ts:23` (mode id);
  `packages/ui/src/components/course-create-tab-body.tsx`;
  `packages/tools/src/course/start-drafting.ts:97-108`;
  `packages/core/src/services/course-create-service.ts:70`

## Current doc text
- mode-prompt-fragment-composition.md:75 lists `bootstrap` in the seven-mode
  cluster.
- tab-body-isolation.md:9 says "teach, bootstrap, quiz, etc."; :103-106
  names the modality bodies as `QuizTabBody`, `ExamTabBody`,
  `HomeworkTabBody`, `BootstrapTabBody`.
- batch-tool-per-item-results.md:7 — "The bootstrap explorer agent has a
  tight step budget..."
- lazy-resolver-thunk.md:7, 21-26, 50 — names the class
  `BootstrapServiceImpl` and mentions "the next exploration".

## Reality
- The mode id is `course-create`.
- The modality body is `CourseCreateTabBody`.
- The renamed agent is the drafter (entry point `course.start_drafting`).
- The implementation class is `CourseCreateServiceImpl`.

Note: load-bearing identifiers that intentionally retained the
`bootstrap`/`Bootstrap` name in code (`services.bootstrap` field key,
`BootstrapOpts`, `bootstrapConfigResolver`, `bootstrapEngineResolver`,
`kind: "bootstrapped"`) are valid as-is — leave those untouched.

## Required edit
- mode-prompt-fragment-composition.md:75 — replace `bootstrap` with
  `course-create` in the mode cluster list.
- tab-body-isolation.md — replace `bootstrap` with `course-create` in
  rationale, and rename `BootstrapTabBody` → `CourseCreateTabBody` in the
  modality-bodies list.
- batch-tool-per-item-results.md:7 — replace "bootstrap explorer agent"
  with "drafter agent" (or "course-create drafter").
- lazy-resolver-thunk.md — rename `BootstrapServiceImpl` to
  `CourseCreateServiceImpl` in rationale and Example 1 code snippet.
  Replace "next exploration" with "next drafting run" in Example 3 prose.
  Leave the variable names (`bootstrapService`, `services.bootstrap`,
  `bootstrapEngineResolver`, `bootstrapConfigResolver`) as-is.

Apply rolling-foundation: replace assertions in place.

## Implementation notes (2026-05-18)

All four pattern skills updated in place with surgical edits:

- `mode-prompt-fragment-composition.md:75` — `bootstrap` → `course-create` in the seven-mode cluster list.
- `tab-body-isolation.md:9` — `bootstrap` → `course-create` in the rationale enumeration.
- `tab-body-isolation.md:103-106` — `BootstrapTabBody` → `CourseCreateTabBody` in the modality-bodies list.
- `batch-tool-per-item-results.md:7` — "bootstrap explorer agent" → "drafter agent".
- `lazy-resolver-thunk.md:7` — `BootstrapServiceImpl` → `CourseCreateServiceImpl` in rationale.
- `lazy-resolver-thunk.md:21` — `new BootstrapServiceImpl({` → `new CourseCreateServiceImpl({` in Example 1 code snippet.
- `lazy-resolver-thunk.md:50` — "the very next exploration" → "the very next drafting run" in Example 3 prose.

Load-bearing identifiers left intact: `bootstrapService` (local variable), `services.bootstrap` (field key), `bootstrapEngineResolver`, `bootstrapConfigResolver`, `readBootstrapConfig`.

Post-edit grep confirmed zero stale references matching `Bootstrap(Service|TabBody)|bootstrap explorer|next exploration`.
