---
id: release-v0.1.0
kind: release
stage: quality-gate
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
