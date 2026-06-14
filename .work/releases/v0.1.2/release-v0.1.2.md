---
id: release-v0.1.2
kind: release
stage: released
tags: []
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-17
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
- **gate-patterns** (2026-05-14) — 4 patterns extracted, 2 inconsistencies flagged
  - New patterns: `ipc-envelope-handler`, `per-domain-channel-module`, `resizable-side-panel-hook`, `electron-ipc-test-harness`
  - Inconsistencies (→ `[refactor]` stories at drafting): `migrate-mutating-ipc-channels-to-envelope` (overlaps with `gate-security-ipc-helpers-rethrow-redactor-gap` finding), `share-vitest-spy-logger-factory`
  - Pattern files at `.claude/skills/patterns/`; index updated in `.claude/rules/patterns.md`; SKILL.md updated with 4 new entries; tracking item `gate-patterns-v0-1-2` at stage:done

## Ship

- **Shipped**: 2026-05-17
- **Mapping**: tag-based — annotated `v0.1.2` tag pushed to origin
- **Items shipped**: 127 (8 epics, 31 features, 88 stories) + this release file
- **Gate finding totals**: security 4, tests 20, cruft 6, docs 10, patterns
  4 patterns + 2 inconsistencies (1 absorbed into security envelope work,
  1 closed in-release as `gate-patterns-share-vitest-spy-logger-factory`)
- All bound items reached `stage: done` before tag-cut. The IPC envelope
  refactor (`feature-mutating-ipc-channels-envelope-migration`, 12 steps)
  closed every High-severity finding from gate-security in-release.

## Collapsed items

All 127 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| course-aware-mode-prompts-missing-tests | Add missing tests for course-aware mode prompts foundation | story | — | 9faa47bd |
| epic-course-structured-tutor-buildout-progress | Buildout progress claims — stop the bootstrap explorer from promising bad ETAs | feature | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation | Foundation — extend facts fragment + add per-mode behavior composer + wire SessionServiceImpl | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-exam-addendum | Exam-mode course-aware addendum | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-homework-addendum | Homework-mode course-aware addendum | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-quiz-addendum | Quiz-mode course-aware addendum | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-study-skills-addendum | Study-skills-mode course-aware addendum | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts-story-teach-addendum | Teach-mode course-aware addendum | story | — | 9faa47bd |
| epic-course-structured-tutor-course-aware-mode-prompts | Course-aware mode prompts — anchor the tutor on the active course | feature | — | 9faa47bd |
| epic-course-structured-tutor-draft-resumption-mode-wiring | Wire `course.list_drafts` into bootstrap mode (mode-tool-scoping + prompt fragment) | story | — | 9faa47bd |
| epic-course-structured-tutor-draft-resumption-tool | `course.list_drafts` tool + projection | story | — | 9faa47bd |
| epic-course-structured-tutor-draft-resumption-ui-picker | Resume-draft picker on the courses route | story | — | 9faa47bd |
| epic-course-structured-tutor-draft-resumption | Draft resumption — list-drafts tool + resume picker | feature | — | 9faa47bd |
| epic-course-structured-tutor | Course-structured tutor — let the curriculum drive the tutor, not the other way around | epic | — | 9faa47bd |
| epic-document-library-bootstrap-session-scoped-attachment | Bootstrap-session-scoped document attachment | feature | — | 9faa47bd |
| epic-document-library-library-view-tabs-filters | Library route with scope tabs and filters | feature | — | 9faa47bd |
| epic-document-library-multi-file-folder-picker | Multi-file and folder document picker | feature | — | 9faa47bd |
| epic-document-library-rename-retrieve-from-documents | Rename `retrieve_from_textbook` → `retrieve_from_documents` | feature | — | 9faa47bd |
| epic-document-library-scopes-primitive-callsite-sweep | Call-site sweep: every consumer of the old service | story | — | 9faa47bd |
| epic-document-library-scopes-primitive-schema-and-migration | Schema + migration: `document_scopes` table | story | — | 9faa47bd |
| epic-document-library-scopes-primitive-service-and-types | Service + types: `DocumentScopesServiceImpl` | story | — | 9faa47bd |
| epic-document-library-scopes-primitive | `document_scopes` polymorphic scoping primitive | feature | — | 9faa47bd |
| epic-document-library-viewer-tab-scoped-sidebar-sidebar | Scope-aware sidebar | story | — | 9faa47bd |
| epic-document-library-viewer-tab-scoped-sidebar-tab-kind | Tab-kind foundation: `'document'` tabs | story | — | 9faa47bd |
| epic-document-library-viewer-tab-scoped-sidebar-viewer | Document viewer body | story | — | 9faa47bd |
| epic-document-library-viewer-tab-scoped-sidebar | Document viewer tab + scope-aware sidebar | feature | — | 9faa47bd |
| epic-document-library | Document library overhaul — multi-scope attachment, viewer, navigable library | epic | — | 9faa47bd |
| epic-editorial-polish-pass-app-chrome | App chrome refresh — top nav rename, wordmark, editorial alignment | feature | — | 9faa47bd |
| epic-editorial-polish-pass-concept-name-surfacing-concept-node | ConceptNode swap — name primary, id secondary | story | — | 9faa47bd |
| epic-editorial-polish-pass-concept-name-surfacing-gates-reading-view | Gates reading view + inline expand + inspector prereq names | story | — | 9faa47bd |
| epic-editorial-polish-pass-concept-name-surfacing-hook | useConceptNames hook — course-scoped batched concept lookup | story | — | 9faa47bd |
| epic-editorial-polish-pass-concept-name-surfacing-picker | LessonEditor multi-select concept picker | story | — | 9faa47bd |
| epic-editorial-polish-pass-concept-name-surfacing | Concept name surfacing — show names everywhere a concept appears in editing UIs | feature | — | 9faa47bd |
| epic-editorial-polish-pass-prompt-config-redesign-block-primitive | PromptBlock — editorial primitive for one slot in the composed prompt | story | — | 9faa47bd |
| epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview | PromptBlockStack — unified preview replacement with Blocks/Composed toggle | story | — | 9faa47bd |
| epic-editorial-polish-pass-prompt-config-redesign-tab-integration | PromptTab integration — section reorder + retirement of legacy editors | story | — | 9faa47bd |
| epic-editorial-polish-pass-prompt-config-redesign | Prompt config redesign — section reorder + unified block-oriented preview | feature | — | 9faa47bd |
| epic-editorial-polish-pass-resizable-panels | Resizable side panels — drag handles + persisted widths | feature | — | 9faa47bd |
| epic-editorial-polish-pass | Editorial polish pass — bring the chrome and the editors in line with the design system | epic | — | 9faa47bd |
| epic-prompt-editing-surface-v2-compose-attribution | Compose returns source attribution | feature | — | 9faa47bd |
| epic-prompt-editing-surface-v2-diff-aware-preview | Diff-aware prompt preview | feature | — | 9faa47bd |
| epic-prompt-editing-surface-v2-full-fragment-view | Full fragment view with locks, badges, and configurator lock fix | feature | — | 9faa47bd |
| epic-prompt-editing-surface-v2-unified-configure-surface | Unified prompt-customization surface in Configure | feature | — | 9faa47bd |
| epic-prompt-editing-surface-v2 | Prompt editing surface v2 — unify, reveal, diff | epic | — | 9faa47bd |
| epic-security-hardening-round-2-image-store-path-guard | Image-store path-traversal guard — defensive `dirFor` validation | feature | — | 9faa47bd |
| epic-security-hardening-round-2-ipc-boundary-engine-config-shape | engineConfig response shape: hasApiKey + reveal channel | story | — | 9faa47bd |
| epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor | IPC envelope helper + pattern-based secret redactor | story | — | 9faa47bd |
| epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout | Shared URL allowlist + per-channel envelope migration + redactor wiring | story | — | 9faa47bd |
| epic-security-hardening-round-2-ipc-boundary | IPC trust-boundary hardening | feature | — | 9faa47bd |
| epic-security-hardening-round-2-tool-bridge-socket-auth | Tool-bridge socket auth — permissions and per-session token | feature | — | 9faa47bd |
| epic-security-hardening-round-2 | Security hardening round 2 — close the gate findings from v0.1.1 | epic | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ingestion-edges-docx-image-boundary | Story: DOCX image-paragraph chunk-boundary pinning | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ingestion-edges-pptx-fallback-fixture | Story: PPTX `tryChunkBySlide` fallback — real-fixture pinning | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ingestion-edges | Ingestion adversarial test coverage — image boundaries and slide fallback | feature | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-state-and-config-edges-cancel-adversarial | cancel() adversarial states — use-streamed-send.test.tsx | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-state-and-config-edges-draft-rapid-save | SqliteDraftStore rapid back-to-back save — draft-store.test.ts | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-state-and-config-edges-engineid-rename-unavailable-storage | engineId rename round-trip — no apiKey + unavailable safeStorage | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-state-and-config-edges | State-machine and config persistence adversarial coverage | feature | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ui-assertion-gaps-subagent-collision | Sub-agent registry collision: pin silent-no-op contract | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ui-assertion-gaps-update-banner-hash | Update banner SHA-256 hash display: pin render contract | story | — | 9faa47bd |
| epic-test-coverage-adversarial-pass-ui-assertion-gaps | UI assertion gaps — banner hash display and sub-agent collision | feature | — | 9faa47bd |
| epic-test-coverage-adversarial-pass | Adversarial test-coverage pass — close the gate-tests findings from v0.1.1 | epic | — | 9faa47bd |
| epic-tutor-session-feel-cancellation-propagation-core-plumbing | Story 1: Core signal plumbing | story | — | 9faa47bd |
| epic-tutor-session-feel-cancellation-propagation-engine-and-subagent | Story 2: Engine + sub-agent propagation | story | — | 9faa47bd |
| epic-tutor-session-feel-cancellation-propagation | Cancellation propagation — stop actually stops everything | feature | — | 9faa47bd |
| epic-tutor-session-feel-composer-queue | Composer queue while streaming — keep typing, send when it's your turn | feature | — | 9faa47bd |
| epic-tutor-session-feel-tool-call-thread-persistence | Tool-call thread persistence — keep tool artifacts readable | feature | — | 9faa47bd |
| epic-tutor-session-feel-tutor-tab-rename | Tutor tab rename — teaching-shaped term for the session surface | feature | — | 9faa47bd |
| epic-tutor-session-feel | Tutor session feel — the chat tab is a tutoring session, not a chatbot | epic | — | 9faa47bd |
| epic-ui-rendering-stability-loop-flickers-audit | Stabilize `useConfiguratorActions` deps to stop the audit-log loop | story | — | 9faa47bd |
| epic-ui-rendering-stability-loop-flickers-sidebar | Stabilize `useDerivedScope` return identity to stop sidebar flicker | story | — | 9faa47bd |
| epic-ui-rendering-stability-loop-flickers | Loop flickers — kill the re-render storms in the documents sidebar and audit log | feature | — | 9faa47bd |
| epic-ui-rendering-stability-state-transitions-question-card-collapse | Question card collapses to compact summary after submit | story | — | 9faa47bd |
| epic-ui-rendering-stability-state-transitions-sub-agent-panel-unmount | Sub-agents panel unmounts chrome when hidden | story | — | 9faa47bd |
| epic-ui-rendering-stability-state-transitions | State transitions — question-card retirement and sub-agents panel collapse | feature | — | 9faa47bd |
| epic-ui-rendering-stability | UI rendering stability — kill the flickers, ghosts, and broken layouts | epic | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-1-session | Migrate `praxis.session.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-10-tabs | Migrate `praxis.tabs.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-11-sketches-concept-maps | Migrate `praxis.sketches.*` and `praxis.conceptMaps.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-12-misc-and-domain-modules | Migrate `praxis.auth.claude.status` and per-domain channel modules to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-2-documents | Migrate `praxis.documents.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-3-artifacts | Migrate `praxis.artifacts.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-4-memory | Migrate `praxis.memory.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-5-assignments | Migrate `praxis.assignments.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-6-packs | Migrate `praxis.packs.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-7-lock-and-config | Migrate `praxis.lock.*` and `praxis.config.*` remaining invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-8-author | Migrate `praxis.author.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration-step-9-notes-flashcards | Migrate `praxis.notes.*` and `praxis.flashcards.*` invoke channels to envelope pattern | story | — | 9faa47bd |
| feature-mutating-ipc-channels-envelope-migration | Migrate mutating IPC channels in `ipc-server.ts` to the `ipc-envelope-handler` pattern | feature | — | 9faa47bd |
| fix-wrapenvelope-withschema-arg-routing-and-client-unwrap | Fix `wrapEnvelope + withSchema` arg routing and missing `unwrapEnvelope` on client | story | — | 9faa47bd |
| gate-cruft-claude-code-vision-empty-maxtokens-spread | Empty conditional-spread of comment-only object in `ClaudeCodeVision.describe` | story | — | 9faa47bd |
| gate-cruft-query-unused-cleanupfn | Unused local variable `cleanupFn` in claude-cli-sdk `query()` | story | — | 9faa47bd |
| gate-cruft-quick-check-channel-dead-optional-guard | Dead `if (!services.quickCheck) return;` guard in quick-check-channel | story | — | 9faa47bd |
| gate-cruft-session-service-stale-phase-11-12-null-shims | Stale Phase 11/12 "wired by Agent 2; null is safe until then" defensive shims in SessionService.openActive | story | — | 9faa47bd |
| gate-cruft-stream-prefer-number-isfinite | Global `isFinite` instead of type-safe `Number.isFinite` in stream timeout check | story | — | 9faa47bd |
| gate-cruft-theme-tokens-test-unused-join | Unused `join` import in theme-tokens test | story | — | 9faa47bd |
| gate-docs-claude-md-document-scopes-primitive | CLAUDE.md still names `course_documents` join + `CourseDocumentsServiceImpl` as the document scoping primitive | story | — | 9faa47bd |
| gate-docs-context-hook-pair-tabs-now-shared | `context-hook-pair` pattern actively forbids putting tabs state in context, but tabs state was lifted to `TabsContext` | story | — | 9faa47bd |
| gate-docs-curriculum-bootstrap-tools-list-drafts | CURRICULUM.md bootstrap-mode tools list omits `course.list_drafts` even though it's now registered for the bootstrap mode | story | — | 9faa47bd |
| gate-docs-mode-prompt-fragment-in-course-behavior | `mode-prompt-fragment-composition` pattern's `teachMode` example is missing `behaviorInCourseFragmentDefault.teach` and the pattern body doesn't acknowledge course-aware fragments | story | — | 9faa47bd |
| gate-docs-mode-tool-scoping-retrieve-tool-rename | `mode-tool-scoping` pattern still uses the old `retrieve_from_textbook` tool name in three places | story | — | 9faa47bd |
| gate-docs-roadmap-phase16-document-scopes | ROADMAP Phase 16 build list still names `course_documents` table + `CourseDocumentsServiceImpl` | story | — | 9faa47bd |
| gate-docs-shared-test-fakes-rename-document-scopes | `shared-test-fake-factories` pattern (and patterns index) name `noopCourseDocuments` but the factory is `noopDocumentScopes` | story | — | 9faa47bd |
| gate-docs-tab-body-isolation-chat-line-anchor | `tab-body-isolation` pattern's "mounting pattern" example cites `chat.tsx:106-110`; the block is now at `chat.tsx:175-182` | story | — | 9faa47bd |
| gate-docs-ux-prompt-customization-v2-surface | UX.md "Prompt customization" surface still shows the v0.1.1 mode-fragment-list sketch — the v2 block-stack with attribution + diff preview shipped | story | — | 9faa47bd |
| gate-docs-ux-tutor-workspace-nav-label | UX.md menu tree calls the chat-workspace nav entry "Chat workspace"; the app-chrome label is now "Tutor" | story | — | 9faa47bd |
| gate-patterns-share-vitest-spy-logger-factory | Factor the per-test Vitest spy `Logger` fake into `tests/helpers/mocks.ts` | story | — | 9faa47bd |
| gate-patterns-v0-1-2 | Patterns extracted for v0.1.2 | story | — | 9faa47bd |
| gate-security-audit-cves-mcp-sdk-transitive | `pnpm audit` reports 2 high + 3 moderate + 1 low transitive vulnerabilities via `@modelcontextprotocol/sdk` | story | — | 9faa47bd |
| gate-security-ipc-helpers-rethrow-redactor-gap | `ipc-helpers.handle` re-throws raw errors, bypassing envelope redactor on ~117 channels | story | — | 9faa47bd |
| gate-security-streaming-channel-error-push-redactor-gap | Streaming IPC channels push unredacted error messages to renderer | story | — | 9faa47bd |
| gate-tests-composer-queue-exam-lockdown-regression | Composer-queue exam-lockdown regression case is missing | story | — | 9faa47bd |
| gate-tests-sdk-wall-clock-timeout-disable | Test coverage for SDK wall-clock timeout escape hatch (`timeout: 0` / `Infinity`) | story | — | 9faa47bd |
| gate-tests-streaming-channel-error-redaction | Pin test for the streaming-channel raw `err.message` leak (paired with the security fix) | story | — | 9faa47bd |
| gate-tests-tool-server-auth-frame-boundaries | Tool-server auth frame split / coalesced cases are missing | story | — | 9faa47bd |
| gate-tests-tool-server-auth-timeout-window | Tool-server auth 5-second timeout case is missing from `tool-server-auth.test.ts` | story | — | 9faa47bd |
| lift-tabs-state-to-context | Lift tabs state into a React context | story | — | 9faa47bd |
| list-scopes-for-document-client-api | Wire `listScopesForDocument` through the client API | story | — | 9faa47bd |
| resizable-panels-tests-and-sidekick-adoption | Resizable-panels — add tests + adopt on sidekick panel (Unit 3) | feature | — | 9faa47bd |
| resume-draft-picker-test-and-keyboard-nav | ResumeDraftPicker — add test file and arrow-key navigation | story | — | 9faa47bd |
| story-biology-pack-bootstrap-smoke-test | Extend biology-pack smoke test to cover bootstrap flow | story | — | 9faa47bd |
| story-electron-multi-arch-rebuild | Multi-arch native-module rebuild for macOS dist | story | — | 9faa47bd |
| story-engine-cli-integration-smoke-test | Engine CLI integration smoke test (gated) | story | — | 9faa47bd |
| story-fix-disable-sdk-wall-clock-timeout | Disable Claude CLI SDK per-turn wall-clock timeout in adapter + vision | story | — | 9faa47bd |
| story-fix-rate-limit-error-message-format | Format the rate-limit error message so the user can read it | story | — | 9faa47bd |
| test-gap-engine-config-shape-service-and-ui | Service-layer + settings-route test coverage for engine-config shape | story | — | 9faa47bd |
| test-gap-ipc-envelope-migration-integration | IPC envelope migration integration test + per-channel `withSchema` boundary coverage | story | — | 9faa47bd |

