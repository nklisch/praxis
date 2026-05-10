---
id: feature-release-v0.1.0-doc-findings
kind: feature
stage: implementing
tags: [docs]
parent: epic-release-v0.1.0-readiness
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# v0.1.0 — documentation gate drain (rolling-foundation roll-forward)

## Brief

Container for the 23 findings produced by `/agile-workflow:gate-docs`
against the v0.1.0 bundle on 2026-05-10. Heavy drift was expected: the
bundle shipped Phases 17, 18, and 19 of work without rolling foundation
docs forward in between, and the chat-surface refactor reshaped two
heavily-pattern-cited UI hooks. All 23 findings are High confidence
(none Medium or Low). They sort into 5 categories:

- 10 foundation-doc-assertion items — ARCHITECTURE.md (3), CURRICULUM.md
  (4), UX.md (1), CONTRACT.md (1), Phase 17 "(planned)" tag stale across
  SPEC + CURRICULUM + UX (1).
- 1 changelog-gap — CHANGELOG.md does not exist; needs backfilled v0
  section before release-deploy Phase 5.5 prepends v0.1.0.
- 1 README staleness — phase counter.
- 2 repo-skill staleness — patterns SKILL.md phase counter +
  CLAUDE.md tab-body enumeration missing `StudySkillsTabBody`.
- 9 pattern-skill staleness — `file:line` drift across 8 pattern
  skills + an API-shape drift in `tab-body-isolation` (`useStreamedSend`
  returns `items`/`loadHistory`, not `messages`/`clearMessages`).

Most fixes are 1-line line-number bumps in pattern skills; a few
(CONTRACT.md additive sections, CHANGELOG.md backfill) are larger
writing tasks.

## Children (23 — all active, all High)

Foundation-doc-assertion (10):
- `gate-docs-architecture-claude-cli-sdk-package`
- `gate-docs-architecture-engines-runOneShot-export`
- `gate-docs-architecture-indexer-deterministic-flavor`
- `gate-docs-curriculum-study-skills-tool-list`
- `gate-docs-curriculum-teach-mode-tools`
- `gate-docs-curriculum-quiz-homework-tools`
- `gate-docs-curriculum-exam-tools`
- `gate-docs-phase17-planned-tag-stale`
- `gate-docs-contract-phase17-18-19-sections`
- `gate-docs-ux-study-skills-mode-rows`

Changelog + README + repo-skill (4):
- `gate-docs-changelog-missing` (backfill v0 + create file)
- `gate-docs-readme-phase-counter`
- `gate-docs-patterns-skill-phase-counter`
- `gate-docs-claudemd-tab-body-enumeration`

Pattern-skill staleness (9):
- `gate-docs-pattern-async-generator-line`
- `gate-docs-pattern-episodic-append-line`
- `gate-docs-pattern-discriminated-union-lines`
- `gate-docs-pattern-tool-dispatch-line`
- `gate-docs-pattern-tab-body-isolation-api` (also rewrites the API
  example)
- `gate-docs-pattern-session-tab-open-flow-lines`
- `gate-docs-pattern-mode-tool-scoping-lines`
- `gate-docs-pattern-service-deps-injection`
- `gate-docs-pattern-ipc-channel-convention-line`

## Implementation order

Three batches that can land in parallel because they touch different files:

1. **Pattern-skill line bumps** (9 items) — pure citation fixes; agent
   reads the new line, edits the doc. Mechanical.
2. **Foundation-doc rolls** (10 items) — substantive writing in
   ARCHITECTURE/CURRICULUM/UX/CONTRACT/SPEC. The CONTRACT.md additive
   sections (Phase 17/18/19) are the largest single piece of writing.
3. **CHANGELOG backfill + README/CLAUDE/SKILL phase counters** (4 items)
   — small writing tasks, mostly mechanical.

The CHANGELOG.md backfill is load-bearing for release-deploy's Phase 5.5
(it prepends the v0.1.0 entry to existing content; if the file doesn't
exist, that step has to create+backfill in one shot). Doing it now via
this gate means Phase 5.5 just prepends.

## Source

`/agile-workflow:gate-docs v0.1.0` audit committed at `68f4b44`. Full
reasoning and remediation per finding lives in each child story's body.
