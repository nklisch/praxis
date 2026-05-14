---
id: release-v0.1.2
kind: release
stage: quality-gate
tags: []
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Release v0.1.2

Third versioned release after v0.1.0 / v0.1.1. Captures everything that
landed between 2026-05-13 (v0.1.1 ship date) and 2026-05-14: eight epics
clustered out of the v0.1.1 backlog plus a handful of standalone fixes and
tooling stories. Headline themes: structured-tutor and document-library
buildout (course-aware mode prompts, draft resumption, scopes primitive,
viewer tab sidebar), unified prompt-editing surface (compose attribution +
diff-aware preview + full-fragment view + unified configure), editorial
polish (app chrome, concept-name surfacing, prompt-config redesign,
resizable panels), tutor session feel (cancellation, composer queue,
tool-call thread persistence, tab rename), UI rendering stability (loop
flickers + state transitions), security hardening round 2 (image-store
path guard, IPC boundary redactor, tool-bridge socket auth), test-coverage
adversarial pass (ingestion edges, state-and-config edges, UI assertion
gaps), and a small number of standalone fixes (rate-limit error message
format, SDK per-turn wall-clock timeout disable, biology pack smoke test,
electron multi-arch rebuild, engine CLI integration smoke test).

## Bound items

85 items bound across 8 epics, 30 features, and 47 stories.

### epic-course-structured-tutor — tutor-ux, bootstrap, curriculum

- `epic-course-structured-tutor` (epic)
  - `epic-course-structured-tutor-buildout-progress` (feature) — tutor-ux, bootstrap
  - `epic-course-structured-tutor-course-aware-mode-prompts` (feature) — tutor-ux, mode-prompts, curriculum
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation` (story)
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-exam-addendum` (story)
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-homework-addendum` (story)
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-quiz-addendum` (story)
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-study-skills-addendum` (story)
    - `epic-course-structured-tutor-course-aware-mode-prompts-story-teach-addendum` (story)
  - `epic-course-structured-tutor-draft-resumption` (feature) — tutor-ux, bootstrap
    - `epic-course-structured-tutor-draft-resumption-mode-wiring` (story)
    - `epic-course-structured-tutor-draft-resumption-tool` (story)
    - `epic-course-structured-tutor-draft-resumption-ui-picker` (story)
  - `course-aware-mode-prompts-missing-tests` (story, archive) — testing, curriculum
  - `resume-draft-picker-test-and-keyboard-nav` (story, archive) — ui, testing, a11y

### epic-document-library — documents, ui, ingestion

- `epic-document-library` (epic)
  - `epic-document-library-bootstrap-session-scoped-attachment` (feature) — bootstrap, documents, tutor-ux
  - `epic-document-library-library-view-tabs-filters` (feature) — ui, documents
  - `epic-document-library-multi-file-folder-picker` (feature) — ui, ingestion, configure
  - `epic-document-library-rename-retrieve-from-documents` (feature) — tools, prompts, curriculum
  - `epic-document-library-scopes-primitive` (feature) — core, documents, ingestion, schema
    - `epic-document-library-scopes-primitive-callsite-sweep` (story)
    - `epic-document-library-scopes-primitive-schema-and-migration` (story)
    - `epic-document-library-scopes-primitive-service-and-types` (story)
  - `epic-document-library-viewer-tab-scoped-sidebar` (feature) — ui, documents, tutor-ux
    - `epic-document-library-viewer-tab-scoped-sidebar-sidebar` (story)
    - `epic-document-library-viewer-tab-scoped-sidebar-tab-kind` (story)
    - `epic-document-library-viewer-tab-scoped-sidebar-viewer` (story)
  - `list-scopes-for-document-client-api` (story, archive) — ui, documents, ipc

### epic-editorial-polish-pass — ui, editorial, configure

- `epic-editorial-polish-pass` (epic)
  - `epic-editorial-polish-pass-app-chrome` (feature) — ui, editorial
  - `epic-editorial-polish-pass-concept-name-surfacing` (feature) — ui, configure, editorial
    - `epic-editorial-polish-pass-concept-name-surfacing-concept-node` (story)
    - `epic-editorial-polish-pass-concept-name-surfacing-gates-reading-view` (story)
    - `epic-editorial-polish-pass-concept-name-surfacing-hook` (story)
    - `epic-editorial-polish-pass-concept-name-surfacing-picker` (story)
  - `epic-editorial-polish-pass-prompt-config-redesign` (feature) — ui, configure, prompt-customization
    - `epic-editorial-polish-pass-prompt-config-redesign-block-primitive` (story)
    - `epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview` (story)
    - `epic-editorial-polish-pass-prompt-config-redesign-tab-integration` (story)
  - `epic-editorial-polish-pass-resizable-panels` (feature) — ui, editorial
  - `lift-tabs-state-to-context` (story, archive) — ui, refactor
  - `resizable-panels-tests-and-sidekick-adoption` (feature, archive) — ui, testing, editorial, a11y

### epic-prompt-editing-surface-v2 — ui, configure, prompt-customization, core

- `epic-prompt-editing-surface-v2` (epic)
  - `epic-prompt-editing-surface-v2-compose-attribution` (feature) — core, curriculum, prompt-customization
  - `epic-prompt-editing-surface-v2-diff-aware-preview` (feature) — ui, configure, prompt-customization
  - `epic-prompt-editing-surface-v2-full-fragment-view` (feature) — ui, configure, prompt-customization
  - `epic-prompt-editing-surface-v2-unified-configure-surface` (feature) — ui, configure, prompt-customization

### epic-security-hardening-round-2 — security

- `epic-security-hardening-round-2` (epic)
  - `epic-security-hardening-round-2-image-store-path-guard` (feature) — security
  - `epic-security-hardening-round-2-ipc-boundary` (feature) — security
    - `epic-security-hardening-round-2-ipc-boundary-engine-config-shape` (story)
    - `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor` (story)
    - `epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout` (story)
  - `epic-security-hardening-round-2-tool-bridge-socket-auth` (feature) — security

### epic-test-coverage-adversarial-pass — testing

- `epic-test-coverage-adversarial-pass` (epic)
  - `epic-test-coverage-adversarial-pass-ingestion-edges` (feature) — testing
    - `epic-test-coverage-adversarial-pass-ingestion-edges-docx-image-boundary` (story)
    - `epic-test-coverage-adversarial-pass-ingestion-edges-pptx-fallback-fixture` (story)
  - `epic-test-coverage-adversarial-pass-state-and-config-edges` (feature) — testing
    - `epic-test-coverage-adversarial-pass-state-and-config-edges-cancel-adversarial` (story)
    - `epic-test-coverage-adversarial-pass-state-and-config-edges-draft-rapid-save` (story)
    - `epic-test-coverage-adversarial-pass-state-and-config-edges-engineid-rename-unavailable-storage` (story)
  - `epic-test-coverage-adversarial-pass-ui-assertion-gaps` (feature) — testing
    - `epic-test-coverage-adversarial-pass-ui-assertion-gaps-subagent-collision` (story)
    - `epic-test-coverage-adversarial-pass-ui-assertion-gaps-update-banner-hash` (story)

### epic-tutor-session-feel — chat, tutor-ux, ui, core, engines

- `epic-tutor-session-feel` (epic)
  - `epic-tutor-session-feel-cancellation-propagation` (feature) — core, engines, tools, chat
    - `epic-tutor-session-feel-cancellation-propagation-core-plumbing` (story)
    - `epic-tutor-session-feel-cancellation-propagation-engine-and-subagent` (story)
  - `epic-tutor-session-feel-composer-queue` (feature) — ui, chat, tutor-ux
  - `epic-tutor-session-feel-tool-call-thread-persistence` (feature) — ui, chat, tutor-ux
  - `epic-tutor-session-feel-tutor-tab-rename` (feature) — ui, chat, tutor-ux

### epic-ui-rendering-stability — ui, bug

- `epic-ui-rendering-stability` (epic)
  - `epic-ui-rendering-stability-loop-flickers` (feature) — ui, bug
    - `epic-ui-rendering-stability-loop-flickers-audit` (story)
    - `epic-ui-rendering-stability-loop-flickers-sidebar` (story)
  - `epic-ui-rendering-stability-state-transitions` (feature) — ui, bug
    - `epic-ui-rendering-stability-state-transitions-question-card-collapse` (story)
    - `epic-ui-rendering-stability-state-transitions-sub-agent-panel-unmount` (story)

### Standalone stories

- `story-biology-pack-bootstrap-smoke-test` (story) — content, testing
- `story-electron-multi-arch-rebuild` (story) — desktop, build
- `story-engine-cli-integration-smoke-test` (story) — testing, engine
- `story-fix-disable-sdk-wall-clock-timeout` (story) — bug, engines
- `story-fix-rate-limit-error-message-format` (story) — bug, ui, engines

## Gate runs

- **gate-security** (2026-05-14) — 4 findings (0 Critical, 1 High, 2 Medium, 1 Low)
  - 1 High → `.work/active/stories/` (`gate-security-streaming-channel-error-push-redactor-gap`)
  - 2 Medium → `.work/active/stories/` (`gate-security-ipc-helpers-rethrow-redactor-gap`, `gate-security-audit-cves-mcp-sdk-transitive`)
  - 1 Low → `.work/backlog/` (`gate-security-sdk-timeout-disabled-defense-in-depth`)
  - Verified-clean: tool-bridge socket auth (token compare via `crypto.timingSafeEqual`, 0600 perms, 5s auth timeout), URL allowlist (pre-WHATWG C0 + whitespace check), engine-config encryption shape (renderer sees only `hasApiKey: boolean`; decrypted key only via separate `reveal` channel that demands `requireUnlocked()`), envelope redactor mapping to generic INTERNAL + UUIDv7 requestId.
- **gate-tests** (2026-05-14) — 20 findings (0 Critical, 6 High, 5 Medium, 9 Low). Two pre-existing backlog items (`test-gap-engine-config-shape-service-and-ui`, `test-gap-ipc-envelope-migration-integration`) were promoted from `.work/backlog/` to `.work/active/stories/` and bound to v0.1.2 because they elaborate acceptance criteria for shipped security features. One tautological-rework item flagged (interrupt fanout registry tests → UI observability).
  - 4 High → `.work/active/stories/` (`test-gap-engine-config-shape-service-and-ui` (promoted), `test-gap-ipc-envelope-migration-integration` (promoted), `gate-tests-sdk-wall-clock-timeout-disable`, `gate-tests-streaming-channel-error-redaction`)
  - 3 Medium → `.work/active/stories/` (`gate-tests-tool-server-auth-timeout-window`, `gate-tests-tool-server-auth-frame-boundaries`, `gate-tests-composer-queue-exam-lockdown-regression`)
  - 8 Low → `.work/backlog/` (`gate-tests-redact-secrets-production-key-shapes`, `gate-tests-stored-schema-strict-inheritance`, `gate-tests-document-id-guard-drive-letter-cases`, `gate-tests-serialize-error-redacted-circular`, `gate-tests-interrupt-all-event-fanout-count`, `gate-tests-rate-limit-unknown-status-guard`, `gate-tests-interrupt-fanout-ui-observability`, `gate-tests-unwrap-envelope-shape-collision`)
  - Verified-clean: `epic-test-coverage-adversarial-pass` and all child stories (the adversarial-pass IS tests; spec-faithful coverage). `epic-tutor-session-feel-cancellation-propagation-core-plumbing`, `epic-tutor-session-feel-tool-call-thread-persistence`, all `epic-ui-rendering-stability-*` children, `epic-editorial-polish-pass-resizable-panels`, archived stories (`course-aware-mode-prompts-missing-tests`, `lift-tabs-state-to-context`, `list-scopes-for-document-client-api`, `resume-draft-picker-test-and-keyboard-nav`), and `story-biology-pack-bootstrap-smoke-test`.
- **gate-cruft** (2026-05-14) — 6 findings (5 High, 1 Medium, 0 Low). All actionable; no Low/backlog.
  - 5 High → `.work/active/stories/` (`gate-cruft-query-unused-cleanupfn`, `gate-cruft-theme-tokens-test-unused-join`, `gate-cruft-session-service-stale-phase-11-12-null-shims`, `gate-cruft-quick-check-channel-dead-optional-guard`, `gate-cruft-claude-code-vision-empty-maxtokens-spread`)
  - 1 Medium → `.work/active/stories/` (`gate-cruft-stream-prefer-number-isfinite`)
- **gate-docs** (2026-05-14) — 10 rolling-foundation findings (8 High implementing, 2 Medium drafting)
  - 1 CLAUDE.md staleness — `gate-docs-claude-md-document-scopes-primitive` (course_documents → document_scopes polymorphic primitive)
  - 4 foundation-doc-assertion drift — ROADMAP Phase 16, UX prompt-customization v2 surface, UX "Tutor workspace" label (drafting), CURRICULUM bootstrap-mode `course.list_drafts`
  - 5 pattern-skill staleness — `mode-tool-scoping` (`retrieve_from_textbook` → `retrieve_from_documents`), `context-hook-pair` (tabs lifted), `shared-test-fake-factories` + index (`noopCourseDocuments` → `noopDocumentScopes`), `tab-body-isolation` (chat.tsx line anchor 106 → 175), `mode-prompt-fragment-composition` (`in-course-behavior` addendum — drafting)
  - CHANGELOG.md gap is handled in phase 5.5 of release-deploy, outside this gate.

<populated as remaining gates execute>
