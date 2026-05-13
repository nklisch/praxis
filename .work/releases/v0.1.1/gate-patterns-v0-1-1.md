---
id: gate-patterns-v0-1-1
kind: story
stage: done
tags: [patterns]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: patterns
created: 2026-05-12
updated: 2026-05-12
---

# Patterns extracted for v0.1.1

## New patterns codified
- `batch-tool-per-item-results` — Tools that mutate N items in one step return `{ ok: AND(item.ok), results: ({ok:true, ...id} | {ok:false, ...id, reason})[] }`; sequential `await` to preserve order. Discovered across `course.draft_add_concepts`, `course.draft_add_edges`, `course.draft_add_lessons`, `course.draft_add_lesson_assessments` — 4 occurrences ship in v0.1.1.
- `shared-test-fake-factories` — Port test doubles live in `tests/helpers/mocks.ts` as factory functions; tests import these instead of inlining literal mocks. 137+ call sites across 5 factories.

## Inconsistencies flagged (become `[refactor]` stories)
1. `service-deps-injection` pattern doc silent on the now-required `secretStorage` port → `gate-patterns-inconsistency-service-deps-required-ports`
2. `subscriber-fanout-stream` pattern doc silent on filtered-subscribe variant (`subscribe(listener, { parentCallId })`) → `gate-patterns-inconsistency-subscriber-fanout-filter`
3. `load-or-throw` boundary unclear — three new read-side `if (!row) throw` inline forms appeared in bundle; pattern is scoped to post-write round-trips → `gate-patterns-inconsistency-load-or-throw-readside-scope`

## Pattern files written
- `.claude/skills/patterns/batch-tool-per-item-results.md`
- `.claude/skills/patterns/shared-test-fake-factories.md`
- `.claude/rules/patterns.md` (index updated)
- `.claude/skills/patterns/SKILL.md` (available-patterns list updated)

## Discovery summary
- Pattern candidates evaluated: 10
- Genuine patterns (3+ occurrences, not duplicating existing): 2
- Inconsistencies with existing patterns: 3
