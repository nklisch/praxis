---
id: gate-patterns-v0.1.0
kind: story
stage: done
tags: [patterns]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: patterns
created: 2026-05-10
updated: 2026-05-10
---

# Patterns extracted for v0.1.0

## New patterns codified

- `subscriber-fanout-stream` — Service `subscribe(listener)` (sends `snapshot`
  first) → `*-channel.ts` fanout with AbortController hold-open → client
  `events()` → UI hook iterating `for await` and folding `event.kind` into a
  Map → setState. Three end-to-end instances: activity rail, bootstrap drafts
  streaming, quick-check bridge.
- `lazy-resolver-thunk` — Cross-service deps that need late binding are
  passed as `() => T` or `(id) => T | null` thunks called per-use.
  5+ uses: `engineResolver`, `visionResolver`, `bootstrapConfigResolver`,
  `sessionCourseId`, plus the per-indexer `engineResolver` deps.
- `indexer-class` — Background memory writers implement `Indexer` (`id`,
  `schedule`, `run(ctx)`); registered as an array on `IndexerOrchestratorImpl`.
  5 concrete implementations (mastery, misconception, affective, procedural,
  concept-map-divergence).
- `mode-prompt-fragment-composition` — A `Mode` is a list of `PromptFragment`
  objects; `composeSystemPrompt` sorts by fixed `FRAGMENT_ORDER` and applies
  `overrides` (non-customizable overrides throw). 7 modes, 20 fragment files.

## Inconsistencies flagged

None. The discovery sub-agent verified that every bundle change either
follows a documented pattern or extends established sub-conventions
consistently. The `discriminated-union-dispatch` doc uses `type` for events
and `kind` for stored/transmitted shapes; the new `DraftStreamEvent`,
`QuickCheckEvent`, and `ActivityEvent` use `kind` because they are the
shared shape of the new `subscriber-fanout-stream` pattern (where `kind`
is the established discriminator). This is doc-staleness territory
(already filed by gate-docs); not a pattern violation here.

## Pattern files written

- `.claude/skills/patterns/subscriber-fanout-stream.md`
- `.claude/skills/patterns/lazy-resolver-thunk.md`
- `.claude/skills/patterns/indexer-class.md`
- `.claude/skills/patterns/mode-prompt-fragment-composition.md`
- `.claude/rules/patterns.md` (index updated; 4 new entries)
- `.claude/skills/patterns/SKILL.md` (available patterns list refreshed;
  stale "Phases 1-14 shipped" counter dropped per the rolling-foundation
  fix already filed under `gate-docs-patterns-skill-phase-counter`)
