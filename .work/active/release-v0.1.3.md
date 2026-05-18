---
id: release-v0.1.3
kind: release
stage: quality-gate
tags: []
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Release v0.1.3

Fourth versioned release after v0.1.0 / v0.1.1 / v0.1.2. Captures everything
that landed since v0.1.2 shipped on 2026-05-14. Headline themes:

- **UI redesign ground-up** — full app-shell, chat workspace, workspace
  surfaces, configure canvas, and discovery surfaces rebuilt against the
  editorial design system token-swap and component primitives.
- **Backend fills for the redesign** — document viewer, drafter/configurator
  chat, note annotations + filters, cross-tab state, snapshot/restore,
  concept-map ↔ sketch bridge, workbench engine recommendation, and the
  UI completion bundle (theme persistence, exam timer, quiz confidence
  fix, spawn-from-note, create-course CTA, lesson-assessment render).
- **Major architectural refactors** — rename bootstrap→drafter and
  explorer→drafter across modes/tools/services/docs; extract domain
  channels out of `ipc-server`; split `core/src/types.ts`; pull engine +
  episodic out of `SessionServiceImpl`; extract course-create-service
  drafter loop; useResource adoption sweep across three tabs; stream
  handler template adoption across four call sites; subscriber-registry
  base for fanout streams.
- **Code-hygiene refactors and cleanups** — shared `getStudentId()` helper;
  shared `loadOrThrow` adoption (concept-map, tabs); shared
  `normalizeConceptName` helper; brand draft-store id types;
  preview-prompt god function split; delete deprecated sandbox exports;
  stale explorer-comments sweep.
- **Bug fixes** — chat right-panel storage-key collision; ripples-panel
  legacy-token color error; outline-editor contenteditable cursor reset;
  configure prompt-tab dirty key mismatch; lesson-assessment fetch catch;
  library-service due-only FTS null inconsistency; sub-agents panel
  collapse; chat documents-sidebar flicker; audit-log render flicker;
  question-card persists-after-answer; CLI crash on no-session resume.
- **Quick configuration/test fixes** — configure gates inspector pending
  minscore strip; configure memory-tab local empty state; configure-tab
  button change-dot test coverage; document-tab-body lint cleanup;
  ipc-envelope validation coverage; root vitest praxis-source condition;
  course-buildout progress signals; per-turn quick-check service logger
  wiring; exactoptional typecheck baseline normalization; flaky
  use-fragment-overrides test diagnosis.
- **Security gate carryovers** — embedded image-store dirfor guard, SDK
  per-turn timeout disabled defense-in-depth, tool-socket perms and
  token, ipc-server raw-invoke residuals follow-up.
- **Test gate carryovers** — fifteen test-gate findings closed across
  ingestion edges, IPC envelope shape, redaction, cancel idempotency,
  fanout counts, rate-limit unknown status, sub-agent collision warn
  log, stored schema strict inheritance, drive-letter cases,
  cross-chunk boundary, draft-store ordering, rapid-save ordering,
  installer hash display, engine-id rename, and PPTX slide fallback.

## Bound items

165 items bound: 2 epics, 28 features, 135 stories.

### epic-ui-redesign-ground-up — ui, editorial

- `epic-ui-redesign-ground-up` (epic)
  - `epic-ui-redesign-ground-up-app-shell` (feature) — 8 stories
    - `epic-ui-redesign-ground-up-app-shell-first-run-flow`
    - `epic-ui-redesign-ground-up-app-shell-first-run-flow-engine-select-label`
    - `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav`
    - `epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift`
    - `epic-ui-redesign-ground-up-app-shell-status-strip`
    - `epic-ui-redesign-ground-up-app-shell-tabs-strip`
    - `epic-ui-redesign-ground-up-app-shell-tabs-strip-fix-ux-doc-drift`
    - `epic-ui-redesign-ground-up-app-shell-theme-toggle-mount`
  - `epic-ui-redesign-ground-up-chat-workspace` (feature) — 9 stories
    - `epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles`
    - `epic-ui-redesign-ground-up-chat-workspace-composer-restyle`
    - `epic-ui-redesign-ground-up-chat-workspace-document-tab-body-restyle`
    - `epic-ui-redesign-ground-up-chat-workspace-exam-tab-body`
    - `epic-ui-redesign-ground-up-chat-workspace-homework-tab-body`
    - `epic-ui-redesign-ground-up-chat-workspace-quiz-tab-body`
    - `epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle`
    - `epic-ui-redesign-ground-up-chat-workspace-study-skills-tab-body`
    - `epic-ui-redesign-ground-up-chat-workspace-tool-call-disclosure`
  - `epic-ui-redesign-ground-up-configure` (feature) — 6 stories
    - `epic-ui-redesign-ground-up-configure-canvas-side-chat-shell`
    - `epic-ui-redesign-ground-up-configure-course-tab-canvas`
    - `epic-ui-redesign-ground-up-configure-entry-flow`
    - `epic-ui-redesign-ground-up-configure-gates-tab-canvas`
    - `epic-ui-redesign-ground-up-configure-memory-tab-canvas`
    - `epic-ui-redesign-ground-up-configure-prompts-tab-canvas`
  - `epic-ui-redesign-ground-up-design-system` (feature) — 1 story
    - `epic-ui-redesign-ground-up-design-system-token-swap`
  - `epic-ui-redesign-ground-up-discovery-surfaces` (feature) — 4 stories
    - `epic-ui-redesign-ground-up-discovery-surfaces-course-create-entry-path`
    - `epic-ui-redesign-ground-up-discovery-surfaces-course-create-ingestion-status-fix`
    - `epic-ui-redesign-ground-up-discovery-surfaces-session-open-flow-polish`
    - `epic-ui-redesign-ground-up-discovery-surfaces-workbench-library-rebuild`
  - `epic-ui-redesign-ground-up-workspace` (feature) — 11 stories
    - `epic-ui-redesign-ground-up-workspace-ask-tutor-from-note`
    - `epic-ui-redesign-ground-up-workspace-catalogue-rebuild`
    - `epic-ui-redesign-ground-up-workspace-chat-to-workspace-inline-panel`
    - `epic-ui-redesign-ground-up-workspace-concept-map-editor-restyle`
    - `epic-ui-redesign-ground-up-workspace-note-editor-cornell`
    - `epic-ui-redesign-ground-up-workspace-note-editor-cornell-fix-nested-interactive`
    - `epic-ui-redesign-ground-up-workspace-note-editor-feynman`
    - `epic-ui-redesign-ground-up-workspace-note-editor-free`
    - `epic-ui-redesign-ground-up-workspace-note-editor-outline`
    - `epic-ui-redesign-ground-up-workspace-note-editor-sketch`
    - `epic-ui-redesign-ground-up-workspace-review-session-flow`

### epic-backend-fills-for-redesign — backend, ui

- `epic-backend-fills-for-redesign` (epic)
  - `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge` (feature) — 2 stories
  - `epic-backend-fills-for-redesign-cross-tab-state` (feature) — 2 stories
  - `epic-backend-fills-for-redesign-document-viewer` (feature) — 2 stories
  - `epic-backend-fills-for-redesign-drafter-configurator-chat` (feature) — 5 stories
  - `epic-backend-fills-for-redesign-note-annotations-and-filters` (feature) — 2 stories
  - `epic-backend-fills-for-redesign-snapshot-restore` (feature) — 2 stories
  - `epic-backend-fills-for-redesign-ui-completion-bundle` (feature) — 7 stories
  - `epic-backend-fills-for-redesign-workbench-engine` (feature) — 1 story

### Standalone features and their stories

- `refactor-rename-bootstrap-and-explorer` (feature) — 5 stories (foundation rename across modes/tools/services/ipc/docs)
- `refactor-ipc-server-extract-domain-channels` (feature) — 3 stories
- `refactor-stream-handler-template` (feature) — 4 stories
- `refactor-useresource-adoption-sweep` (feature) — 3 stories
- `refactor-split-core-type-files-tool-and-client` (feature) — 2 stories
- `refactor-session-service-extract-engine-and-episodic` (feature) — 1 story
- `refactor-subscriber-registry-base` (feature) — 1 story
- `refactor-course-create-service-extract-modules` (feature) — 1 story
- `feature-ipc-envelope-validation-coverage` (feature) — 1 story
- `feature-list-in-progress-drafts` (feature)
- `feature-mode-prompts-deep-course-alignment` (feature)
- `feature-rate-limit-error-structured-fields` (feature)
- `feature-reattach-docs-mid-session` (feature)
- `bug-cli-crash-no-session-resume` (feature)

### Standalone stories (orphans)

Refactors and helpers (12):
`refactor-extract-default-student-id-helper`,
`share-getstudentid-helper-across-channels`,
`refactor-extract-normalize-concept-name-helper`,
`consolidate-normalize-concept-name-helper`,
`refactor-loadorthrow-concept-map-service`,
`refactor-loadorthrow-tabs-service`,
`refactor-brand-draft-store-id-types`,
`refactor-previewprompt-god-function`,
`refactor-note-body-schema-restore-discriminated-union`,
`rename-explorer-in-tool-description`,
`cleanup-delete-deprecated-code-sandbox-exports`,
`cleanup-stale-explorer-comments-sweep`.

Bug fixes and UI repairs (15):
`bug-audit-log-render-flicker`,
`bug-chat-documents-sidebar-flicker`,
`bug-question-card-persists-after-answer`,
`bug-sub-agents-panel-collapse`,
`fix-chat-right-panel-storage-key-collision`,
`fix-configure-prompt-tab-dirty-key-mismatch`,
`fix-outline-editor-contenteditable-cursor-reset`,
`fix-ripples-panel-color-error-legacy-token`,
`fix-exactoptional-typecheck-baseline`,
`lesson-assessment-pills-add-catch-on-fetch`,
`library-service-dueonly-fts-null-inconsistency`,
`configure-gates-inspector-strip-pending-minscore`,
`configure-memory-tab-local-empty-state`,
`configure-tab-button-change-dot-test-coverage`,
`document-tab-body-lint-cleanup`.

Test + tooling stories (6):
`investigate-flaky-use-fragment-overrides-test`,
`wire-logger-into-quick-check-service`,
`story-course-buildout-progress-signals`,
`story-root-vitest-praxis-source-condition`,
`course-create-context-textarea-forwarding`,
`backlog-ux-md-quiz-mode-doc-drift`.

Security gate carryovers (4):
`gate-security-embedded-image-store-dirfor-guard`,
`gate-security-ipc-server-raw-invoke-residuals`,
`gate-security-sdk-timeout-disabled-defense-in-depth`,
`gate-security-tool-socket-perms-and-token`.

Test gate carryovers (15):
`gate-tests-cancel-idempotency-after-final`,
`gate-tests-document-id-guard-drive-letter-cases`,
`gate-tests-draft-store-rapid-save-ordering`,
`gate-tests-engine-id-rename-no-key-unavailable-storage`,
`gate-tests-image-cross-chunk-boundary`,
`gate-tests-interrupt-all-event-fanout-count`,
`gate-tests-interrupt-fanout-ui-observability`,
`gate-tests-pptx-slide-fallback-real-fixture`,
`gate-tests-rate-limit-unknown-status-guard`,
`gate-tests-redact-secrets-production-key-shapes`,
`gate-tests-serialize-error-redacted-circular`,
`gate-tests-stored-schema-strict-inheritance`,
`gate-tests-sub-agent-collision-warn-log`,
`gate-tests-unwrap-envelope-shape-collision`,
`gate-tests-update-banner-installer-hash-display`.

## Gate runs

- **gate-security** (2026-05-18) — 1 new finding (Medium=1), 4 already-tracked skipped
  - `gate-security-engine-baseurl-url-validator-scheme-allowlist` (Medium)
- **gate-docs** (2026-05-18) — 6 items from 20 raw findings (5 implementing, 1 drafting); consolidated by surface
  - `gate-docs-status-strip-no-longer-planned` (High — CLAUDE.md, UX.md, ARCHITECTURE.md)
  - `gate-docs-engine-session-manager-extraction-references` (High — CLAUDE.md, CONTRACT.md, patterns.md, 2 pattern skills)
  - `gate-docs-ipc-server-extraction-pattern-skill-references` (High — 4 pattern skills)
  - `gate-docs-bootstrap-explorer-pattern-skill-rename` (High — 4 pattern skills)
  - `gate-docs-contract-spawn-and-passagerange` (High — CONTRACT.md, ARCHITECTURE.md, CLAUDE.md)
  - `gate-docs-readme-refactors-latest-date` (Medium — README.md)
- **gate-cruft** (2026-05-18) — 6 items from 18 raw findings (4 implementing, 2 drafting); consolidated to focused sweeps
  - `gate-cruft-mode-glyph-bootstrap-entry-dead` (High)
  - `gate-cruft-bootstrap-explorer-stale-comment-sweep` (High, ~30-file sweep)
  - `gate-cruft-biome-unused-imports-and-suppressions-sweep` (High)
  - `gate-cruft-ipc-server-cancel-test-dead-scaffolding` (High)
  - `gate-cruft-ingest-pickfile-back-compat-comment` (Medium)
  - `gate-cruft-concept-link-overlay-legacy-markers-decision` (Medium)
- **gate-tests** (2026-05-18) — 12 new findings (Critical=2, High=4, Medium=4, Low=2), 15 already-tracked skipped
  - `gate-tests-document-scopes-passagerange-untested` (Critical)
  - `gate-tests-spawn-from-passage-service-untested` (Critical)
  - `gate-tests-snapshot-restore-schema-drift-branch` (High)
  - `gate-tests-spawn-from-passage-inverted-range` (High)
  - `gate-tests-migration-0023-bootstrap-mode-rename` (High)
  - `gate-tests-toolcall-entry-revert-correlation-collision` (High)
  - `gate-tests-engine-session-manager-isolation` (Medium)
  - `gate-tests-drafts-client-stream-channel-name` (Medium)
  - `gate-tests-set-annotations-inverted-range-classification` (Medium)
  - `gate-tests-migration-0024-config-key-rename` (Medium)
  - `gate-tests-snapshot-restore-un-revert-edges` (Low, backlog)
  - `gate-tests-course-start-drafting-wire-identifier` (Low, backlog)
