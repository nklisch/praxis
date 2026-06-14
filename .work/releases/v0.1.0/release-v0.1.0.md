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

## Collapsed items

All 78 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| epic-phase-18-affective-memory-indexer | Affective indexer + read path + check-in pipe | story | — | ff246510 |
| epic-phase-18-affective-memory | Affective memory — indexer + read path + check-in surface | feature | — | ff246510 |
| epic-phase-18-coach-mode-impl | `study-skills` mode + role fragment + UI accent | story | — | ff246510 |
| epic-phase-18-coach-mode | `study-skills` coach mode | feature | — | ff246510 |
| epic-phase-18-metacognitive-prompts-impl | Cross-mode metacognitive prompt fragment | story | — | ff246510 |
| epic-phase-18-metacognitive-prompts | Metacognitive prompt injection across modes | feature | — | ff246510 |
| epic-phase-18-pedagogy-pack-service | `PedagogyPackService` + tools + services wiring | story | — | ff246510 |
| epic-phase-18-pedagogy-pack-v1-content | Pedagogy pack v1 content | story | — | ff246510 |
| epic-phase-18-pedagogy-pack | Pedagogy pack — service + v1 content | feature | — | ff246510 |
| epic-phase-18-procedural-memory-indexer | Procedural memory: indexer + read path | story | — | ff246510 |
| epic-phase-18-procedural-memory | Procedural memory — indexer + read path | feature | — | ff246510 |
| epic-phase-18-routing-integration-impl | Router consumes procedural + affective; surfaces strategy / difficulty / mode-transition | story | — | ff246510 |
| epic-phase-18-routing-integration | Adaptive routing: read procedural + affective into next-step decisions | feature | — | ff246510 |
| epic-phase-18-study-skills | Phase 18 — Study-skills + pedagogy pack + remaining memory | epic | — | ff246510 |
| epic-phase-19-auto-update | Auto-update channel | feature | — | ff246510 |
| epic-phase-19-biology-pack | Biology canonical pack | feature | — | ff246510 |
| epic-phase-19-electron-signing | Signed Electron installer | feature | — | ff246510 |
| epic-phase-19-first-run-flow | First-run flow | feature | — | ff246510 |
| epic-phase-19-onboarding-docs | Onboarding documentation | feature | — | ff246510 |
| epic-phase-19-ship-checklist | Ship checklist (v1.0.0) | feature | — | ff246510 |
| epic-phase-19-ship-v1 | Phase 19 — Biology canonical + Electron packaging + ship v1 | epic | — | ff246510 |
| epic-release-v0.1.0-readiness | v0.1.0 release readiness — drain all 5 gate origins | epic | — | ff246510 |
| feature-bootstrap-drafts-streaming | Bootstrap drafts: live stream from explorer to renderer | feature | — | ff246510 |
| feature-chat-markdown-and-code-rendering | Chat: render markdown, code, and inline math in tutor messages | feature | — | ff246510 |
| feature-chat-tool-call-visibility | Chat: surface tool calls inline as ambient editorial interstitials | feature | — | ff246510 |
| feature-chat-turn-bubble-boundaries | Chat: split assistant text into one bubble per model turn | feature | — | ff246510 |
| feature-claude-cli-sdk-refactor | `@praxis/claude-cli-sdk` surface refactor | feature | — | ff246510 |
| feature-logger-rolling-file-rotation | Logger: pino-roll for daily rotation + pino-pretty stdout | feature | — | ff246510 |
| feature-release-v0.1.0-cruft-findings | v0.1.0 — cruft gate drain | feature | — | ff246510 |
| feature-release-v0.1.0-doc-findings | v0.1.0 — documentation gate drain (rolling-foundation roll-forward) | feature | — | ff246510 |
| feature-release-v0.1.0-security-findings | v0.1.0 — security gate drain | feature | — | ff246510 |
| feature-release-v0.1.0-test-findings | v0.1.0 — test-quality gate drain | feature | — | ff246510 |
| gate-cruft-dead-pending-sketch-id-state | Dead state hook `pendingSketchId` in chat-tab-body.tsx | story | — | ff246510 |
| gate-cruft-dead-queries-persist-units-test | Dead query `courseRow` and `rawCourse` in bootstrap-service.persist-units.test.ts | story | — | ff246510 |
| gate-cruft-misplaced-noexplicitany-suppression-client-test | Misplaced/unused `noExplicitAny` suppression in client.test.ts | story | — | ff246510 |
| gate-cruft-stale-single-item-adds-comment | Stale navigational comment "single-item adds removed" in start-exploration.ts | story | — | ff246510 |
| gate-cruft-unused-import-proposed-assessment | Unused import `ProposedAssessment` in bootstrap-service.ts | story | — | ff246510 |
| gate-cruft-unused-import-timestamp-bootstrap-test | Unused import `Timestamp` in bootstrap-service.units.test.ts | story | — | ff246510 |
| gate-cruft-unused-noexplicitany-suppression-pedagogy-pack | Unused `noExplicitAny` suppression in pedagogy-pack-service.ts | story | — | ff246510 |
| gate-docs-architecture-claude-cli-sdk-package | ARCHITECTURE.md package table omits `@praxis/claude-cli-sdk` | story | — | ff246510 |
| gate-docs-architecture-engines-runOneShot-export | ARCHITECTURE.md `@praxis/engines` description states "Self-contained — no other `@praxis/*` package may import here" | story | — | ff246510 |
| gate-docs-architecture-indexer-deterministic-flavor | ARCHITECTURE.md indexer description claims all indexers are "themselves agents — prompt-driven" | story | — | ff246510 |
| gate-docs-changelog-missing | CHANGELOG.md does not exist in the repository | story | — | ff246510 |
| gate-docs-claudemd-tab-body-enumeration | CLAUDE.md "Per-mode tab bodies" enumeration omits `StudySkillsTabBody` | story | — | ff246510 |
| gate-docs-contract-phase17-18-19-sections | CONTRACT.md ends at Phase 16 — Phase 17, 18, 19 contract changes are absent | story | — | ff246510 |
| gate-docs-curriculum-exam-tools | CURRICULUM.md `exam` mode tool list claims "and nothing else" but Phase 18 added a tool | story | — | ff246510 |
| gate-docs-curriculum-quiz-homework-tools | CURRICULUM.md `quiz` and `homework` mode tool lists omit `pedagogy.list_metacognitive_prompts` | story | — | ff246510 |
| gate-docs-curriculum-study-skills-tool-list | CURRICULUM.md `study-skills` mode description lists wrong tools | story | — | ff246510 |
| gate-docs-curriculum-teach-mode-tools | CURRICULUM.md `teach` mode tool list omits Phase 17 + 18 tools | story | — | ff246510 |
| gate-docs-pattern-async-generator-line | Pattern `async-generator-event-stream.md` cites stale `session-service.ts:91` | story | — | ff246510 |
| gate-docs-pattern-discriminated-union-lines | Pattern `discriminated-union-dispatch.md` cites stale `grade-math.ts:160` and `:36` | story | — | ff246510 |
| gate-docs-pattern-episodic-append-line | Pattern `episodic-append-ordering.md` cites stale `session-service.ts:139` | story | — | ff246510 |
| gate-docs-pattern-ipc-channel-convention-line | Pattern `ipc-channel-convention.md` cites stale `ipc-server.ts:29` | story | — | ff246510 |
| gate-docs-pattern-mode-tool-scoping-lines | Pattern `mode-tool-scoping.md` cites stale lines and shows outdated `teachMode.toolNames` | story | — | ff246510 |
| gate-docs-pattern-service-deps-injection | Pattern `service-deps-injection.md` cites stale `types.ts:13` and stripped-down `ServiceDeps` example | story | — | ff246510 |
| gate-docs-pattern-session-tab-open-flow-lines | Pattern `session-tab-open-flow.md` cites stale lines for course-detail / library / new-tab-picker | story | — | ff246510 |
| gate-docs-pattern-tab-body-isolation-api | Pattern `tab-body-isolation.md` cites stale chat.tsx lines and outdated `useStreamedSend` API | story | — | ff246510 |
| gate-docs-pattern-tool-dispatch-line | Pattern `tool-dispatch-pipeline.md` cites stale `registry.ts:52` | story | — | ff246510 |
| gate-docs-patterns-skill-phase-counter | `.claude/skills/patterns/SKILL.md` says "Phases 1–14 shipped" | story | — | ff246510 |
| gate-docs-phase17-planned-tag-stale | Foundation docs tag Phase 17 sections as "(Phase 17, planned)" — Phase 17 shipped | story | — | ff246510 |
| gate-docs-readme-phase-counter | README.md "phases 1–16 shipped" — current is through Phase 19 | story | — | ff246510 |
| gate-docs-ux-study-skills-mode-rows | UX.md surface map and mode-tints table omit `study-skills` mode | story | — | ff246510 |
| gate-patterns-v0.1.0 | Patterns extracted for v0.1.0 | story | — | ff246510 |
| gate-security-api-key-cleartext-vs-onboarding-doc | API key stored in plaintext SQLite, contradicting onboarding docs | story | — | ff246510 |
| gate-security-author-export-memory-target-path-validation | `praxis.author.exportMemory` accepts an arbitrary `targetPath` from the renderer | story | — | ff246510 |
| gate-security-browser-window-navigation-guards | BrowserWindow has no `will-navigate` / `setWindowOpenHandler` guards | story | — | ff246510 |
| gate-security-engine-config-ipc-lock-gate | Engine config (incl. API key) is readable/writable over IPC with no lock guard | story | — | ff246510 |
| gate-security-preload-sandbox-comment-mismatch | Preload comment claims `sandbox: true`; window is created with `sandbox: false` | story | — | ff246510 |
| gate-security-update-feed-integrity-signature | Update feed has no integrity/authenticity verification | story | — | ff246510 |
| gate-security-update-feed-url-scheme-validation | Update-feed `downloadUrl` accepts dangerous URL schemes | story | — | ff246510 |
| gate-tests-affective-indexer-transaction-atomicity | Affective indexer transaction atomicity (rollback on mid-batch failure) not asserted | story | — | ff246510 |
| gate-tests-ipc-handler-seam-first-run-update | IPC handlers for first-run + auto-update have no handler-side test | story | — | ff246510 |
| gate-tests-logger-rotation-behavior | Logger rotation / `maxFiles` / `maxFileSizeMb` behavior not asserted | story | — | ff246510 |
| gate-tests-metacognitive-prompts-exclusion-assertions | Negative assertions for metacognitive-prompts fragment exclusion | story | — | ff246510 |
| gate-tests-onboarding-config-persistence | `onboarding-config.ts` persistence layer has no direct unit test | story | — | ff246510 |
| gate-tests-onboarding-skip-coverage | Skip on engine and course steps of the onboarding flow not exercised | story | — | ff246510 |
| gate-tests-tab-state-isolation-parity | Tab-state isolation between teach and study-skills tabs is not parity-tested | story | — | ff246510 |
| gate-tests-update-banner-version-edge-inputs | `compareVersions` lacks stress test for prerelease / non-3-part versions | story | — | ff246510 |

