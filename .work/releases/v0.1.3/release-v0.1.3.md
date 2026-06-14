---
id: release-v0.1.3
kind: release
stage: released
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
- **gate-patterns** (2026-05-18) — 2 new patterns codified, 2 inconsistencies tracked
  - New: `streaming-ipc-channel-helpers` (7 call sites — activity, sub-agent, course-create-drafts, quick-check, session.send, ingest, memory)
  - New: `notify-listeners-helper` (4 services — activity, quick-check, sub-agent, course-create)
  - Tracking item: `gate-patterns-v0.1.3` (stage:done)
  - Inconsistency: `gate-patterns-inconsistency-subscriber-fanout-stream-skill-rewrite` (drafting)
  - Inconsistency: `gate-patterns-inconsistency-ipc-envelope-handler-add-handleenvelope` (drafting)
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
  - `gate-tests-migration-0023-bootstrap-mode-rename` (High → resolved pre-release: no production data to migrate)
  - `gate-tests-toolcall-entry-revert-correlation-collision` (High)
  - `gate-tests-engine-session-manager-isolation` (Medium)
  - `gate-tests-drafts-client-stream-channel-name` (Medium)
  - `gate-tests-set-annotations-inverted-range-classification` (Medium)
  - `gate-tests-migration-0024-config-key-rename` (Medium → resolved pre-release: no production data to migrate)
  - `gate-tests-snapshot-restore-un-revert-edges` (Low, backlog)
  - `gate-tests-course-start-drafting-wire-identifier` (Low, backlog)

## Shipped (2026-05-18)

- **Date shipped**: 2026-05-18
- **Mapping**: tag-based (annotated git tag `v0.1.3`)
- **Total items shipped**: 191 (2 epics, 28 features, 161 stories) bound + this release file
- **Items left in backlog** (Low-priority gate findings, do not gate ship):
  - `gate-tests-snapshot-restore-un-revert-edges` (Low)
  - `gate-tests-course-start-drafting-wire-identifier` (Low)
  - `idea-citation-schema-inverted-range-refine` (follow-up parked during ship)
- **Gate finding totals**:
  - gate-security: 1 new (Medium: baseUrl) + 4 carry-overs landed
  - gate-tests: 12 new (2 Crit, 4 High, 4 Med, 2 Low) + 15 carry-overs landed; 2 migration-regression items closed pre-release ("no production data" rationale)
  - gate-cruft: 18 raw findings consolidated into 6 focused sweep items
  - gate-docs: 20 raw findings consolidated into 6 focused doc/pattern-skill items
  - gate-patterns: 2 new patterns codified (`streaming-ipc-channel-helpers`, `notify-listeners-helper`), 2 inconsistencies in existing pattern skills resolved
- **Pre-existing typecheck baseline carried forward**: `packages/desktop/electron/main/services.ts:42` `IndexerOrchestrator | undefined` mismatch — predates v0.1.3, tracked separately in the typecheck-baseline workstream.

## Collapsed items

All 193 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| backlog-ux-md-quiz-mode-doc-drift | Roll UX.md quiz-mode section forward for no-tutor redesign | story | — | 11490134 |
| bug-audit-log-render-flicker | Audit log view flickers in a tight render loop | story | — | 11490134 |
| bug-chat-documents-sidebar-flicker | Chat documents sidebar flickers between library view and loading state | story | — | 11490134 |
| bug-cli-crash-no-session-resume | Resume Claude CLI session after a mid-stream crash | feature | — | 11490134 |
| bug-question-card-persists-after-answer | Inline quick-check question card persists after answer is submitted | story | — | 11490134 |
| bug-sub-agents-panel-collapse | Sub-agents panel doesn't collapse layout when hidden | story | — | 11490134 |
| cleanup-delete-deprecated-code-sandbox-exports | Story: delete deprecated codeSandboxInput and codeSandboxTool exports | story | — | 11490134 |
| cleanup-stale-explorer-comments-sweep | Story: sweep stale "explorer" references in code comments and JSDoc | story | — | 11490134 |
| configure-gates-inspector-strip-pending-minscore | Fix GateInspectorStrip: pendingMinScore never reflects user-edited value | story | — | 11490134 |
| configure-memory-tab-local-empty-state | Replace local EmptyState in memory-tab.tsx with shared editorial primitive | story | — | 11490134 |
| configure-tab-button-change-dot-test-coverage | Add test coverage for TabButton change-dot and useDirtyStateObserver | story | — | 11490134 |
| consolidate-normalize-concept-name-helper | Consolidate `normalizeConceptName` between course-create-service and draft-validator | story | — | 11490134 |
| course-create-context-textarea-forwarding | Course-create context textarea — forward to bootstrap session | story | — | 11490134 |
| document-tab-body-lint-cleanup | Fix lint errors in document-tab-body.tsx introduced by citation highlights | story | — | 11490134 |
| epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion | Sketch → concept-map conversion + undo | story | — | 11490134 |
| epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples | Three-state concept-map nodes + ripples panel | story | — | 11490134 |
| epic-backend-fills-for-redesign-concept-map-and-sketch-bridge | Concept-map UX completion + Sketch ↔ concept-map conversion | feature | — | 11490134 |
| epic-backend-fills-for-redesign-cross-tab-state-dirty-tracker | Cross-tab dirty-state tracker — hook + provider + configure save bar | story | — | 11490134 |
| epic-backend-fills-for-redesign-cross-tab-state-parent-child-and-system-note | Parent-child tab decoration + `<SystemNoteCard>` rendering | story | — | 11490134 |
| epic-backend-fills-for-redesign-cross-tab-state | Cross-tab state + parent-child + system-event UI | feature | — | 11490134 |
| epic-backend-fills-for-redesign-document-viewer-citations-and-spawn | Document citations + passage-scoped spawn + cited-passage rendering | story | — | 11490134 |
| epic-backend-fills-for-redesign-document-viewer-selection-bar | Selection action bar — `+ note · ↗ ask Praxis · + cite · + flashcard` | story | — | 11490134 |
| epic-backend-fills-for-redesign-document-viewer | Document viewer enhancements | feature | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane | Extract `<AuthoringChatPane>` from `<ConfigureChatPane>` | story | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body | Course-create tab body — Canvas + Side Chat | story | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat-parent-prompt-updates | Parent prompt updates — drafter + configurator postures | story | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat-sub-agent-block-inline | `<SubAgentBlock>` inline marginalia + live step events | story | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry | `<ToolCallEntry>` — summary + verdict + ↶ revert | story | — | 11490134 |
| epic-backend-fills-for-redesign-drafter-configurator-chat | Drafter & Configurator chat surfaces | feature | — | 11490134 |
| epic-backend-fills-for-redesign-note-annotations-and-filters-annotations | Note annotations — schema + service API + IPC | story | — | 11490134 |
| epic-backend-fills-for-redesign-note-annotations-and-filters-search-and-filters | Catalogue search + saved filters — FTS5 + LibraryService | story | — | 11490134 |
| epic-backend-fills-for-redesign-note-annotations-and-filters | Note annotations + Catalogue search/filters | feature | — | 11490134 |
| epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore | Snapshot capture + restore — service-layer infrastructure | story | — | 11490134 |
| epic-backend-fills-for-redesign-snapshot-restore-ipc | Snapshot restore — IPC channel + client method | story | — | 11490134 |
| epic-backend-fills-for-redesign-snapshot-restore | Artifact snapshot / restore infrastructure | feature | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-create-course-cta | Library "+ Create a course" CTA | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-exam-timer | Exam mode timer + auto-submit | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render | Lesson-assessment plan rendering — colour-coded pills | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence-debounce-fix | Fix: debounce timer silently clears confidence after selection | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence | Quiz confidence band — schema + UI + indexer signal | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note | `spawnFromNote(noteId, cueId?)` + workspace button | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle-theme-persistence | Theme persistence — auto / light / dark toggle | story | — | 11490134 |
| epic-backend-fills-for-redesign-ui-completion-bundle | UI completion bundle | feature | — | 11490134 |
| epic-backend-fills-for-redesign-workbench-engine-recommendation-service | Workbench RecommendationService — service + IPC + client | story | — | 11490134 |
| epic-backend-fills-for-redesign-workbench-engine | Workbench recommendation engine | feature | — | 11490134 |
| epic-backend-fills-for-redesign | Backend fills for the UI redesign | epic | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-first-run-flow-engine-select-label | Onboarding engine step: restore accessible label association for select/input | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-first-run-flow | First-run / onboarding flow — rebuild per locked mock | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-root-layout-top-nav-doc-drift | Roll foundation docs forward: ActivityRail unmounted from RootLayout | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-root-layout-top-nav | Root layout — swap left-rail for top horizontal nav | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-status-strip | Status strip — replace blocking ActivityRail with near-invisible ambient surface | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-tabs-strip-fix-ux-doc-drift | Roll forward UX.md Tab Strip section after deck-line redesign | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-tabs-strip | Open-tabs strip — italic deck-line typography next to nav | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell-theme-toggle-mount | Theme toggle — mount in the running head | story | — | 11490134 |
| epic-ui-redesign-ground-up-app-shell | App Shell — Root Chrome, Navigation, Ambient Surface, First-Run | feature | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles | Chat shell — Refined Bubbles base | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-composer-restyle | Composer restyle — italic serif + accent button + mono hints | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-document-tab-body-restyle | Document tab body — read-mostly viewer restyle | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-exam-tab-body | Exam tab body — proctored chrome + rubric + strict tool subset | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-homework-tab-body | Homework tab body — paginated batch + save/skip/flag | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-quiz-tab-body | Quiz tab body — item-typed cards, no tutor scaffolding | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle | Chat workspace side panels — three-column layout | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-study-skills-tab-body | Study-skills tab body — structured reflection + technique rail | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace-tool-call-disclosure | Tool-call rendering — `<details>` one-line disclosure | story | — | 11490134 |
| epic-ui-redesign-ground-up-chat-workspace | Chat Workspace — Tabs, Messages, Mode Bodies, Side Panels | feature | — | 11490134 |
| epic-ui-redesign-ground-up-configure-canvas-side-chat-shell | Configure shell — Canvas + Side Chat layout | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure-course-tab-canvas | Configure Course tab canvas — unit/lesson tree + assessment pills | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure-entry-flow | Configure entry / unlock flow polish | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure-gates-tab-canvas | Configure Gates tab canvas — React Flow polish | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure-memory-tab-canvas | Configure Memory tab canvas — projection tabs + tables/cards | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure-prompts-tab-canvas | Configure Prompts tab canvas — composed fragment document | story | — | 11490134 |
| epic-ui-redesign-ground-up-configure | Configure — Authoring Surfaces | feature | — | 11490134 |
| epic-ui-redesign-ground-up-design-system-token-swap | Token swap: adopt `tokens.css` + rename CSS variables | story | — | 11490134 |
| epic-ui-redesign-ground-up-design-system | Design System — Palette, Typography, Tokens | feature | — | 11490134 |
| epic-ui-redesign-ground-up-discovery-surfaces-course-create-entry-path | Course-create entry path — 5-step flow | story | — | 11490134 |
| epic-ui-redesign-ground-up-discovery-surfaces-course-create-ingestion-status-fix | Fix: course-create upload screen — batch ingestion status stuck at "indexing" | story | — | 11490134 |
| epic-ui-redesign-ground-up-discovery-surfaces-session-open-flow-polish | Session-open flow polish — animation, banner, scroll restoration | story | — | 11490134 |
| epic-ui-redesign-ground-up-discovery-surfaces-workbench-library-rebuild | LibraryRoute → Workbench rebuild | story | — | 11490134 |
| epic-ui-redesign-ground-up-discovery-surfaces | Discovery Surfaces — Library, Progress Map, Concept-Maps Index | feature | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-ask-tutor-from-note | Ask-tutor-from-note brief preparation surface | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-catalogue-rebuild | Workspace catalogue — search + filter rail + artifact cards | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-chat-to-workspace-inline-panel | Chat → workspace inline-panel infrastructure | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-concept-map-editor-restyle | Concept-map editor — canonical-hints panel layout | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-cornell-fix-nested-interactive | Fix: textarea inside button in Cornell cue column (invalid HTML) | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-cornell | Cornell note editor — 3-zone layout with cue-anchor markers | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-feynman | Feynman note editor — two-pass (writing / reviewing) | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-free | Free note editor — typewriter page + slash commands + drift tags | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-outline | Outline note editor — keyboard-first hierarchical bullets | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-note-editor-sketch | Sketch note editor — free canvas + `↗ convert to concept map` bridge | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace-review-session-flow | Review-session flow rebuild | story | — | 11490134 |
| epic-ui-redesign-ground-up-workspace | Workspace — Notes, Flashcards, Sketch, Review | feature | — | 11490134 |
| epic-ui-redesign-ground-up | UI Redesign — Ground-Up | epic | — | 11490134 |
| feature-ipc-envelope-validation-coverage-step-1-add-validation | Step 1: bring 3 IPC channels under handleEnvelope (with Zod validation) | story | — | 11490134 |
| feature-ipc-envelope-validation-coverage | Feature: bring all IPC channels under the envelope + withSchema validation pattern | feature | — | 11490134 |
| feature-list-in-progress-drafts | Resume an in-progress course draft by name (list + picker) | feature | — | 11490134 |
| feature-mode-prompts-deep-course-alignment | Deeper course-structure alignment in mode prompts | feature | — | 11490134 |
| feature-rate-limit-error-structured-fields | Rate-limit error: structured fields instead of message-string parsing | feature | — | 11490134 |
| feature-reattach-docs-mid-session | Add documents to a running bootstrap-design session | feature | — | 11490134 |
| fix-chat-right-panel-storage-key-collision | Fix chat right panel storage key collision | story | — | 11490134 |
| fix-configure-prompt-tab-dirty-key-mismatch | Fix Prompt tab change-dot: dirty-key mismatch "configure.prompt" vs "configure.prompts" | story | — | 11490134 |
| fix-exactoptional-typecheck-baseline | Fix the `exactOptionalPropertyTypes` typecheck baseline | story | — | 11490134 |
| fix-outline-editor-contenteditable-cursor-reset | Fix: outline editor cursor resets when typing special characters | story | — | 11490134 |
| fix-ripples-panel-color-error-legacy-token | Fix ripples panel color error legacy token | story | — | 11490134 |
| gate-cruft-biome-unused-imports-and-suppressions-sweep | Sweep biome-flagged unused imports, suppressions, and variables across the v0.1.3 bundle | story | — | 11490134 |
| gate-cruft-bootstrap-explorer-stale-comment-sweep | Sweep stale `bootstrap` / `explorer` / "explore agent" references in JSDoc and copy | story | — | 11490134 |
| gate-cruft-concept-link-overlay-legacy-markers-decision | `concept-link-overlay.tsx` "§ markers (legacy — kept for backwards compat)" decision | story | — | 11490134 |
| gate-cruft-ingest-pickfile-back-compat-comment | "back-compat" comment on `praxis.ingest.pickFile` is stale — channel is current | story | — | 11490134 |
| gate-cruft-ipc-server-cancel-test-dead-scaffolding | Dead test scaffolding in `ipc-server.cancel.test.ts` left over from an earlier test approach | story | — | 11490134 |
| gate-cruft-mode-glyph-bootstrap-entry-dead | Dead `bootstrap` glyph entry in mode-glyph map | story | — | 11490134 |
| gate-docs-bootstrap-explorer-pattern-skill-rename | Sweep `bootstrap` / `explorer` / `BootstrapServiceImpl` residue in pattern skills | story | — | 11490134 |
| gate-docs-contract-spawn-and-passagerange | CONTRACT.md `SessionService` and ARCHITECTURE.md document-scopes assertion miss `spawnFromNote`, `spawnFromPassage`, and `passageRange` | story | — | 11490134 |
| gate-docs-engine-session-manager-extraction-references | Relocate `SessionServiceImpl.openActive` doc references to `EngineSessionManager` | story | — | 11490134 |
| gate-docs-ipc-server-extraction-pattern-skill-references | Pattern skills still cite `ipc-server.ts` for handlers now in per-domain channel modules | story | — | 11490134 |
| gate-docs-readme-refactors-latest-date | README `docs/refactors/` line cites the wrong latest date | story | — | 11490134 |
| gate-docs-status-strip-no-longer-planned | `<StatusStrip>` is mounted; foundation docs still say "(planned)" | story | — | 11490134 |
| gate-patterns-inconsistency-ipc-envelope-handler-add-handleenvelope | Add `handleEnvelope` to the `ipc-envelope-handler` pattern skill | story | — | 11490134 |
| gate-patterns-inconsistency-subscriber-fanout-stream-skill-rewrite | Rewrite `subscriber-fanout-stream` Example 2 to use the new streaming-ipc-channel-helpers | story | — | 11490134 |
| gate-patterns-v0.1.3 | Patterns extracted for v0.1.3 | story | — | 11490134 |
| gate-security-embedded-image-store-dirfor-guard | Add a defensive guard inside `FsEmbeddedImageStore.dirFor` / `FsPageImageStore.dirFor` | story | — | 11490134 |
| gate-security-engine-baseurl-url-validator-scheme-allowlist | `EngineConfig.baseUrl` validator accepts `file://`, `javascript:`, and `data:` URIs | story | — | 11490134 |
| gate-security-ipc-server-raw-invoke-residuals | 13 raw invoke channels in `ipc-server.ts` still bypass envelope redactor | story | — | 11490134 |
| gate-security-sdk-timeout-disabled-defense-in-depth | SDK wall-clock timeout disabled without compensating watchdog when `maxSteps` is also unbounded | story | — | 11490134 |
| gate-security-tool-socket-perms-and-token | MCP tool-bridge Unix-domain-socket has no explicit permission set or auth token | story | — | 11490134 |
| gate-tests-cancel-idempotency-after-final | `cancel()` idempotency not exercised across all hook states (after-final, double-cancel, during-loadHistory) | story | — | 11490134 |
| gate-tests-course-start-drafting-wire-identifier | `course.start_drafting` tool-name rename has no test asserting MCP-bridge wire identifier | story | — | 1ca3665f |
| gate-tests-document-id-guard-drive-letter-cases | `assertSafeDocumentId` lacks tests for lowercase / mixed-case Windows drive prefixes | story | — | 11490134 |
| gate-tests-document-scopes-passagerange-untested | `DocumentScopesService.attach({ passageRange })` and `getPassageRange` are untested | story | — | 11490134 |
| gate-tests-draft-store-rapid-save-ordering | SqliteDraftStore rapid back-to-back save() ordering not adversarially tested | story | — | 11490134 |
| gate-tests-drafts-client-stream-channel-name | `DraftsClient` streamBase channel name (`praxis.courseCreate.drafts.events`) has no client-side test | story | — | 11490134 |
| gate-tests-engine-id-rename-no-key-unavailable-storage | `engineId` rename with no apiKey + unavailable safeStorage — full round-trip not pinned | story | — | 11490134 |
| gate-tests-engine-session-manager-isolation | `EngineSessionManager` has no isolation tests despite the "individually testable" criterion | story | — | 11490134 |
| gate-tests-image-cross-chunk-boundary | Image markdown straddling a chunk boundary — contract is silent | story | — | 11490134 |
| gate-tests-interrupt-all-event-fanout-count | `interruptAllForSession` event fanout call-count under concurrent in-flight items is untested | story | — | 11490134 |
| gate-tests-interrupt-fanout-ui-observability | Interrupt fanout tests are tautological at the registry layer — UI observability is untested | story | — | 11490134 |
| gate-tests-migration-0023-bootstrap-mode-rename | Mode-id rename migration (`0023_rename-bootstrap-mode-to-course-create.sql`) has no regression test | story | — | 11490134 |
| gate-tests-migration-0024-config-key-rename | `0024_rename-bootstrap-config-key.sql` migration is not regression-tested | story | — | 11490134 |
| gate-tests-pptx-slide-fallback-real-fixture | `tryChunkBySlide` fallback to `ast.toText()` is mock-only — no real-fixture coverage | story | — | 11490134 |
| gate-tests-rate-limit-unknown-status-guard | Rate-limit error format for unknown `rateLimitType` (future SDK addition) is unguarded by test | story | — | 11490134 |
| gate-tests-redact-secrets-production-key-shapes | `redactSecrets` lacks assertion for production-shape Anthropic keys | story | — | 11490134 |
| gate-tests-serialize-error-redacted-circular | `serializeErrorRedacted` redaction of a circular-object stack is untested | story | — | 11490134 |
| gate-tests-set-annotations-inverted-range-classification | `setAnnotations` IPC envelope returns `INTERNAL` instead of `VALIDATION_FAILED` for inverted range | story | — | 11490134 |
| gate-tests-snapshot-restore-schema-drift-branch | `restoreAction` schema-drift branch is never tested | story | — | 11490134 |
| gate-tests-snapshot-restore-un-revert-edges | `restoreAction` un-revert path has only one happy-path test | story | — | 1ca3665f |
| gate-tests-spawn-from-passage-inverted-range | `SpawnFromPassageSchema` accepts `endOffset < startOffset` at the IPC trust boundary | story | — | 11490134 |
| gate-tests-spawn-from-passage-service-untested | `SessionService.spawnFromPassage` end-to-end behavior is untested at the service level | story | — | 11490134 |
| gate-tests-stored-schema-strict-inheritance | `EngineConfigStoredSchema` rejection of unknown top-level keys is untested | story | — | 11490134 |
| gate-tests-sub-agent-collision-warn-log | Sub-agent `parentCallId` collision — silent no-op vs. warn-log contract is unpinned | story | — | 11490134 |
| gate-tests-toolcall-entry-revert-correlation-collision | `<ToolCallEntry>` revert correlation under multiple same-kind tool calls in one turn | story | — | 11490134 |
| gate-tests-unwrap-envelope-shape-collision | `unwrapEnvelope` passthrough collision-shape edge case is not tested | story | — | 11490134 |
| gate-tests-update-banner-installer-hash-display | Update-feed installer hash UI display contract not pinned | story | — | 11490134 |
| investigate-flaky-use-fragment-overrides-test | Investigate flaky `use-fragment-overrides` UI test | story | — | 11490134 |
| lesson-assessment-pills-add-catch-on-fetch | Add .catch() to FetchingPills lessonAssessments call | story | — | 11490134 |
| library-service-dueonly-fts-null-inconsistency | LibraryService dueOnly: FTS path treats NULL nextReviewAt as due, non-FTS path does not | story | — | 11490134 |
| refactor-brand-draft-store-id-types | Story: replace `string` with branded ID types in draft-store and draft-stream | story | — | 11490134 |
| refactor-course-create-service-extract-modules-step-1-extract | Step 1: Move free functions out of course-create-service.ts | story | — | 11490134 |
| refactor-course-create-service-extract-modules | Refactor: extract DraftValidator and DraftPersistence from course-create-service.ts | feature | — | 11490134 |
| refactor-extract-default-student-id-helper | Story: extract getDefaultStudentId helper in ipc-server.ts | story | — | 11490134 |
| refactor-extract-normalize-concept-name-helper | Story: extract normalizeConceptName helper in course-create-service.ts | story | — | 11490134 |
| refactor-ipc-server-extract-domain-channels-step-1-small-domains | Step 1: Extract 7 small/medium domain channels from ipc-server.ts | story | — | 11490134 |
| refactor-ipc-server-extract-domain-channels-step-2-medium-domains | Step 2: Extract 8 medium domain channels from ipc-server.ts | story | — | 11490134 |
| refactor-ipc-server-extract-domain-channels-step-3-large-domains | Step 3: Extract 3 large domain channels from ipc-server.ts | story | — | 11490134 |
| refactor-ipc-server-extract-domain-channels | Refactor: extract domain channels out of ipc-server.ts | feature | — | 11490134 |
| refactor-loadorthrow-concept-map-service | Story: adopt loadOrThrow in concept-map-service.ts | story | — | 11490134 |
| refactor-loadorthrow-tabs-service | Story: adopt loadOrThrow in tabs-service.ts | story | — | 11490134 |
| refactor-note-body-schema-restore-discriminated-union | Refactor note body schema restore discriminated union | story | — | 11490134 |
| refactor-previewprompt-god-function | Refactor the `previewPrompt` god-function in author-channel.ts | story | — | 11490134 |
| refactor-rename-bootstrap-and-explorer | Refactor: rename bootstrap + explorer to course-create + drafter | feature | — | 11490134 |
| refactor-rename-step-1-explorer-to-drafter | Step 1: Rename Explorer → Drafter (internal agent abstraction) | story | — | 11490134 |
| refactor-rename-step-2-tool-rename | Step 2: Rename tool `course.start_exploration` → `course.start_drafting` | story | — | 11490134 |
| refactor-rename-step-3-mode-id | Step 3: Rename mode id `bootstrap` → `course_create` (with DB migration) | story | — | 11490134 |
| refactor-rename-step-4-service-and-ipc | Step 4: Rename BootstrapService + bootstrap/ directory + IPC channels + config | story | — | 11490134 |
| refactor-rename-step-5-foundation-docs | Step 5: Roll foundation docs forward | story | — | 11490134 |
| refactor-session-service-extract-engine-and-episodic-step-1-engine-manager | Step 1: Extract EngineSessionManager from session-service.ts | story | — | 11490134 |
| refactor-session-service-extract-engine-and-episodic | Refactor: extract EngineSessionManager + EpisodicEventRecorder from session-service.ts | feature | — | 11490134 |
| refactor-split-core-type-files-tool-and-client-step-1-tool | Step 1: Move service interfaces from tool.ts to per-domain homes | story | — | 11490134 |
| refactor-split-core-type-files-tool-and-client-step-2-client | Step 2: Move client API interfaces from client.ts to per-domain homes | story | — | 11490134 |
| refactor-split-core-type-files-tool-and-client | Refactor: split packages/core/src/types/{tool,client}.ts by service domain | feature | — | 11490134 |
| refactor-stream-handler-template-step-1-helper-and-activity | Step 1: add stream-handler.ts module and adopt in activity-channel.ts | story | — | 11490134 |
| refactor-stream-handler-template-step-2-quick-check-and-subagent | Step 2: adopt registerSubscriberStream in quick-check + subagent | story | — | 11490134 |
| refactor-stream-handler-template-step-3-course-create-drafts | Step 3: adopt in course-create-drafts (with onEvent hook for debug logging) | story | — | 11490134 |
| refactor-stream-handler-template-step-4-generator-streams | Step 4: adopt registerGeneratorStream in ingest + ipc-server (session.send + memory.episodic) | story | — | 11490134 |
| refactor-stream-handler-template | Refactor: extract reusable stream-handler template for IPC channels | feature | — | 11490134 |
| refactor-subscriber-registry-base-step-1-notify-listeners-helper | Step 1: add notifyListeners helper and adopt in 4 services | story | — | 11490134 |
| refactor-subscriber-registry-base | Refactor: extract SubscriberRegistry<EventType> base for services | feature | — | 11490134 |
| refactor-useresource-adoption-sweep-step-1-memory-tab | Step 1: memory-tab — convert 4 single-fetch loaders to useResource | story | — | 11490134 |
| refactor-useresource-adoption-sweep-step-2-course-tab | Step 2: course-tab — convert Promise.all loader to useResource | story | — | 11490134 |
| refactor-useresource-adoption-sweep-step-3-prompt-tab | Step 3: prompt-tab — convert load operations to useResource | story | — | 11490134 |
| refactor-useresource-adoption-sweep | Refactor: adopt useResource across configure routes and misc components | feature | — | 11490134 |
| rename-explorer-in-tool-description | Rename "bootstrap explorer" residual in `use_canonical_pack` tool description | story | — | 11490134 |
| share-getstudentid-helper-across-channels | Extract a shared `getStudentId()` helper across all channel modules | story | — | 11490134 |
| story-course-buildout-progress-signals | Course build-out: replace misleading time estimate with progress signals | story | — | 11490134 |
| story-root-vitest-praxis-source-condition | Root-level vitest should resolve `@praxis/*` imports via `praxis-source` condition | story | — | 11490134 |
| wire-logger-into-quick-check-service | Wire production logger into QuickCheckServiceImpl | story | — | 11490134 |

