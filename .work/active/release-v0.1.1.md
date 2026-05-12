---
id: release-v0.1.1
kind: release
stage: quality-gate
tags: []
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Release v0.1.1

Second versioned release after v0.1.0. Captures everything that landed between
2026-05-10 (v0.1.0 ship date) and 2026-05-12: the bootstrap-readiness epic,
v1 security hardening epic, ingestion improvements (PowerPoint + DOCX cleanup
+ image-store fixes), editorial polish pass, onboarding completion, agent
transparency UX, prompt customization layers, root-tsconfig typecheck
coverage, and a handful of standalone bug fixes / cleanups.

## Bound items

48 items bound across 2 epics, 13 features, and 33 stories.

### epic-bootstrap-readiness — bootstrap, course-authoring, tutor-ux

- `epic-bootstrap-readiness` (epic)
  - `epic-bootstrap-readiness-durable-drafts` (feature) — bootstrap, persistence
    - `story-epic-bootstrap-readiness-durable-drafts-store` (story)
    - `story-epic-bootstrap-readiness-durable-drafts-integration` (story)
  - `epic-bootstrap-readiness-expressive-draft-api` (feature) — bootstrap, course-authoring
    - `story-epic-bootstrap-readiness-expressive-draft-api-edit-ops` (story)
    - `story-epic-bootstrap-readiness-expressive-draft-api-query-tools` (story)
  - `epic-bootstrap-readiness-in-flight-affordances` (feature) — tutor-ux, chat
    - `story-epic-bootstrap-readiness-in-flight-affordances-signal` (story)
    - `story-epic-bootstrap-readiness-in-flight-affordances-ui` (story)
  - `epic-bootstrap-readiness-structured-questions` (feature) — bootstrap, tutor-ux, tools
    - `story-epic-bootstrap-readiness-structured-questions-tool` (story)
    - `story-epic-bootstrap-readiness-structured-questions-ui` (story)
  - `story-bootstrap-attach-document-fix` (story) — bug
  - `story-bootstrap-prompt-no-inline-outline` (story) — prompts
  - `story-cleanup-stale-singular-draft-tool-refs` (story) — cleanup

### epic-v1-security-hardening — security

- `epic-v1-security-hardening` (epic)
  - `epic-v1-security-hardening-encrypt-api-key` (feature)
  - `epic-v1-security-hardening-sign-update-feed` (feature)

### Standalone features

- `feature-agent-transparency-ux` (feature) — ui, chat
  - `feature-agent-transparency-ux-rename-course-design` (story)
  - `feature-agent-transparency-ux-stream-pacing` (story)
  - `feature-agent-transparency-ux-subagent-channel` (story)
  - `feature-agent-transparency-ux-subagent-ui` (story)
- `feature-docx-ingestor-cleanup` (feature) — ingestion
- `feature-editorial-polish-pass` (feature) — ui
  - `feature-editorial-polish-pass-concepts-navigation` (story)
  - `feature-editorial-polish-pass-notes-markdown` (story)
  - `feature-editorial-polish-pass-styling-sweep` (story)
  - `feature-editorial-polish-pass-theme-tokens` (story)
- `feature-onboarding-completion` (feature) — ui, onboarding
  - `feature-onboarding-completion-claude-code-signin` (story)
  - `feature-onboarding-completion-course-card-preseed` (story)
- `feature-powerpoint-ingestion` (feature) — ingestion
  - `feature-powerpoint-ingestion-embedded-images` (story)
  - `feature-powerpoint-ingestion-text-extraction` (story)
- `feature-prompt-customization-layers` (feature) — content, ui
  - `feature-prompt-customization-layers-compose-wiring` (story)
  - `feature-prompt-customization-layers-configure-mode-append` (story)
  - `feature-prompt-customization-layers-settings-global` (story)
- `feature-root-tsconfig-typecheck-coverage` (feature) — tooling
  - `feature-root-tsconfig-typecheck-coverage-enable-gate` (story)
  - `feature-root-tsconfig-typecheck-coverage-scripts-cleanup` (story)
  - `feature-root-tsconfig-typecheck-coverage-tests-cleanup` (story)

### Standalone stories

- `story-embedded-image-store-delete-cascade` (bug, ingestion)
- `story-fix-block-claude-code-builtins-from-tutor` (bug)
- `story-fix-quickcheck-toolcontext-wiring` (bug)
- `story-image-store-dirfor-abstraction` (cleanup, ingestion)
- `story-pptx-slide-image-map-dead-fallback` (cleanup, ingestion)

## Gate runs

_(populated by Phase 4)_
