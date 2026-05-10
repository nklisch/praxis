---
id: release-v0.1.0
kind: release
stage: released
tags: []
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Release v0.1.0

First versioned release after the substrate's v0 retro-bundle. Captures
everything shipped since 2026-05-09: phase-18 study-skills foundations,
the phase-19 ship-v1 epic, and the standalone refactors / chat-surface
features that landed alongside.

## Bound items

27 items bound (1 release file + 27 work items).

### Phase 19 — ship-v1 epic

- `epic-phase-19-ship-v1` (epic) — content
  - `epic-phase-19-auto-update` (feature)
  - `epic-phase-19-biology-pack` (feature) — content
  - `epic-phase-19-electron-signing` (feature)
  - `epic-phase-19-first-run-flow` (feature) — ui, content
  - `epic-phase-19-onboarding-docs` (feature) — docs
  - `epic-phase-19-ship-checklist` (feature)

### Phase 18 — study-skills epic

- `epic-phase-18-study-skills` (epic) — content
  - `epic-phase-18-affective-memory` (feature)
    - `epic-phase-18-affective-memory-indexer` (story)
  - `epic-phase-18-coach-mode` (feature)
    - `epic-phase-18-coach-mode-impl` (story)
  - `epic-phase-18-metacognitive-prompts` (feature)
    - `epic-phase-18-metacognitive-prompts-impl` (story)
  - `epic-phase-18-pedagogy-pack` (feature)
    - `epic-phase-18-pedagogy-pack-service` (story)
    - `epic-phase-18-pedagogy-pack-v1-content` (story)
  - `epic-phase-18-procedural-memory` (feature)
    - `epic-phase-18-procedural-memory-indexer` (story)
  - `epic-phase-18-routing-integration` (feature)
    - `epic-phase-18-routing-integration-impl` (story)

### Standalone features

- `feature-bootstrap-drafts-streaming` — content, ui
- `feature-chat-markdown-and-code-rendering` — ui
- `feature-chat-tool-call-visibility` — ui
- `feature-chat-turn-bubble-boundaries` — ui
- `feature-claude-cli-sdk-refactor` — refactor
- `feature-logger-rolling-file-rotation` — cleanup

## Gate runs

- **gate-security** (2026-05-10) — 7 findings (1 High, 3 Medium, 3 Low). 4
  active stories at `release_binding: v0.1.0` (must drain to done before
  ship); 3 backlog items also bound but parked at backlog stage.
  - High: `gate-security-update-feed-url-scheme-validation` (active, implementing)
  - Medium: `gate-security-api-key-cleartext-vs-onboarding-doc` (active, drafting)
  - Medium: `gate-security-engine-config-ipc-lock-gate` (active, drafting)
  - Medium: `gate-security-update-feed-integrity-signature` (active, drafting)
  - Low: `gate-security-browser-window-navigation-guards` (backlog)
  - Low: `gate-security-preload-sandbox-comment-mismatch` (backlog)
  - Low: `gate-security-author-export-memory-target-path-validation` (backlog)
- **gate-tests** (2026-05-10) — 8 findings (1 High, 2 Medium, 5 Low). Zero
  Criticals; zero tautological tests flagged. Strong overall calibration —
  41 bundle test files, ~200 cases asserted against acceptance criteria.
  - High: `gate-tests-onboarding-config-persistence` (active, implementing)
  - Medium: `gate-tests-metacognitive-prompts-exclusion-assertions` (active, drafting)
  - Medium: `gate-tests-onboarding-skip-coverage` (active, drafting)
  - Low: `gate-tests-ipc-handler-seam-first-run-update` (backlog)
  - Low: `gate-tests-tab-state-isolation-parity` (backlog)
  - Low: `gate-tests-update-banner-version-edge-inputs` (backlog)
  - Low: `gate-tests-logger-rotation-behavior` (backlog)
  - Low: `gate-tests-affective-indexer-transaction-atomicity` (backlog)
- **gate-cruft** (2026-05-10) — 7 findings (6 High, 0 Medium, 1 Low). All 6
  Highs are mechanical Biome-detected issues (unused imports, dead vars,
  misplaced suppressions) — easy to drain in a single pass.
  - High: `gate-cruft-unused-import-proposed-assessment` (active, implementing)
  - High: `gate-cruft-unused-import-timestamp-bootstrap-test` (active, implementing)
  - High: `gate-cruft-dead-pending-sketch-id-state` (active, implementing)
  - High: `gate-cruft-dead-queries-persist-units-test` (active, implementing)
  - High: `gate-cruft-misplaced-noexplicitany-suppression-client-test` (active, implementing)
  - High: `gate-cruft-unused-noexplicitany-suppression-pedagogy-pack` (active, implementing)
  - Low: `gate-cruft-stale-single-item-adds-comment` (backlog)
- **gate-docs** (2026-05-10) — 23 findings, all High confidence. Heavy
  drift expected: the bundle shipped Phases 17, 18, 19 of work without
  rolling foundation docs forward in between. Categories:
  - foundation-doc-assertion: 10 — ARCHITECTURE.md (3), CURRICULUM.md (4),
    UX.md (1), CONTRACT.md (1), Phase 17 "(planned)" tag stale across
    SPEC/CURRICULUM/UX (1).
  - changelog-gap: 1 — CHANGELOG.md does not exist; needs backfilled v0
    section before release-deploy Phase 5.5 prepends v0.1.0.
  - readme-staleness: 1 — phase counter.
  - repo-skill-staleness: 2 — patterns SKILL.md phase counter + CLAUDE.md
    tab-body enumeration missing `StudySkillsTabBody`.
  - pattern-skill-staleness: 9 — file:line drift across 8 pattern skills
    plus an API-shape drift in `tab-body-isolation` (`useStreamedSend`
    returns `items`/`loadHistory`, not `messages`/`clearMessages`).
  - All 23 items at `stage: implementing` in active/stories.
- **gate-patterns** (2026-05-10) — 4 new patterns codified, 0 inconsistencies.
  - `subscriber-fanout-stream` — service subscribe + IPC fanout + client events()
    + UI hook fold (3 end-to-end instances: activity rail, bootstrap drafts,
    quick-check bridge)
  - `lazy-resolver-thunk` — `() => T` / `(id) => T | null` for late-bound deps
    (5+ uses: engine, vision, bootstrap config, course lookup)
  - `indexer-class` — `Indexer` interface + orchestrator (5 concrete impls)
  - `mode-prompt-fragment-composition` — Mode = list of fragments; fixed
    FRAGMENT_ORDER + overrides (7 modes, 20 fragments)
  - Tracking item `gate-patterns-v0.1.0` at `stage: done` (gate's deliverable
    is the pattern files themselves).

## Readiness state (2026-05-10)

**Not ready.** 45 gate-produced items remain active. Stage stays at
`quality-gate` until they all reach `stage: done`.

| Gate | High/Critical | Medium | Low (backlog) | Total |
|---|---|---|---|---|
| security | 1 | 3 | 3 | 7 |
| tests | 1 | 2 | 5 | 8 |
| cruft | 6 | 0 | 1 | 7 |
| docs | 23 | 0 | 0 | 23 |
| patterns | (4 patterns codified, no findings) | | | 0 |

Drain options:
- Implement findings via `/agile-workflow:autopilot --all` (will pick up
  every active stage:implementing item across all gate origins).
- Or scope individually: `/agile-workflow:implement <id>` per item.
- The 9 Low backlog items are bound to `release_binding: v0.1.0` for
  attribution but have no `stage` field — they will block readiness as
  written. To exclude from the release, edit each backlog item's
  frontmatter and remove the `release_binding` line (they remain
  `gate_origin: <name>` for historical traceability).

Re-run `/agile-workflow:release-deploy v0.1.0` after draining to resume
from Phase 5.5 (changelog draft) → Phase 6 (ship).

---

## Shipped (2026-05-10)

**Date**: 2026-05-10
**Mapping**: tag-based
**Tag**: `v0.1.0` (annotated, local — not yet pushed per user choice)
**Items shipped**: 79 total in `.work/releases/v0.1.0/`
- 1 release file
- 1 epic-phase-19-ship-v1 + 6 phase-19 features
- 14 phase-18 study-skills items (epic + features + stories)
- 6 standalone features (chat surface fidelity, claude-cli-sdk fork, logger rotation, bootstrap drafts streaming)
- 1 organisational epic (epic-release-v0.1.0-readiness) + 4 organisational features (one per gate origin)
- 45 gate-produced findings (security 7 + tests 8 + cruft 7 + docs 23) + 1 patterns tracking item

**Gate finding totals (all drained to done)**:
- security: 7 (1 H + 3 M + 3 L)
- tests: 8 (1 H + 2 M + 5 L)
- cruft: 7 (6 H + 1 L)
- docs: 23 (all H — heavy foundation-doc roll-forward expected since the bundle covered Phases 17, 18, 19)
- patterns: 4 patterns codified (subscriber-fanout-stream, lazy-resolver-thunk, indexer-class, mode-prompt-fragment-composition); 0 inconsistencies flagged

**Verification at ship**: 2389 tests passing (12 net new from this release's gate-produced test additions). Typecheck clean across all 10 workspace packages.

**Follow-ups parked to backlog**:
- `idea-encrypt-api-key-with-safestorage`
- `idea-update-feed-ed25519-signature`

**Pre-existing 18 lint errors** in `@praxis/claude-cli-sdk` and a few end-to-end test files were unchanged by this release; none introduced.
