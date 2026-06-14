---
id: release-v0.1.1
kind: release
stage: released
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

- **gate-security** (2026-05-12) — 8 findings (0 Critical, 0 High, 1 Medium, 7 Low)
  - 1 Medium → `.work/active/stories/` (`gate-security-document-id-path-traversal`)
  - 7 Low → `.work/backlog/` (DOM ID guard, openExternal URL parse, IPC error leak, engineConfig plaintext apiKey, logger secret scrubber, setEngineConfig strict schema, tool-socket perms/token)
- **gate-docs** (2026-05-12) — 20 rolling-foundation findings (15 implementing, 5 drafting)
  - 14 CONTRACT.md / ARCHITECTURE.md / ROADMAP.md / ONBOARDING.md drifts
  - 4 pattern-skill staleness (engine-session-lifecycle signal, tool-dispatch meta, service-deps new fields, mode-prompt-fragment file:line)
  - 1 CHANGELOG gap (will be created by Phase 5.5)
  - 1 design-doc policy clarification
- **gate-cruft** (2026-05-12) — 11 findings (7 High, 4 Medium, 0 Low)
  - 7 High → `.work/active/stories/` (unused clearTimer, episodicToMessages alias, skipped Claude Code conformance test, misplaced biome-ignore suppressions, stale biome-ignore noExplicitAny, unused exam-test imports, unused MasterySignal import)
  - 4 Medium → `.work/active/stories/` (composeBrief unused export, docx-ingestor prior-pipeline comment, engine-config orphan comment, AuthoringClient Phase 3/11 narrative JSDoc)
- **gate-patterns** (2026-05-12) — 2 patterns extracted, 3 inconsistencies flagged
  - New patterns: `batch-tool-per-item-results`, `shared-test-fake-factories`
  - Inconsistencies (→ `[refactor]` stories at drafting): service-deps-injection required ports, subscriber-fanout-stream filter variant, load-or-throw read-side scope
  - Pattern files at `.claude/skills/patterns/`; index updated in `.claude/rules/patterns.md`; tracking item `gate-patterns-v0-1-1` at stage:done
- **gate-tests** (2026-05-12) — 20 findings (0 Critical, 3 High, 10 Medium, 7 Low)
  - 3 High → `.work/active/stories/` (SecretStorage unavailable encrypt, importUpdateFeedPublicKey length-guard tautology, prompt-customization lock-gating)
  - 10 Medium → `.work/active/stories/` (attach_document configureMode, ask_student_question toolnames, interrupted engine_abort, decryption-failure idempotency, empty apiKey write, ingestion-service embedded-image rename, IPC cancel e2e, authoring audit-log no-content, list_dangling_refs contract divergence, start_exploration without callId)
  - 7 Low → `.work/backlog/` (draft-store rapid save, image cross-chunk boundary, update-banner installer hash UI, pptx slide-fallback real fixture, engineId rename without key, sub-agent collision warn-log, cancel-idempotency states)

## Ship summary

- **Shipped**: 2026-05-13
- **Mapping**: tag-based (annotated tag `v0.1.1`, not pushed)
- **Items**: 100 total (48 originally bound + 52 gate-finding stories drained to done)
  - 2 epics, 13 features, 85 stories
- **Pre-ship verification**: `pnpm typecheck` clean across all 10 workspace packages; `pnpm test` 3149 passing / 21 skipped (0 failures)
- **Gate finding totals across 5 gates**: 61 findings
  - gate-security: 8 (0 Critical, 0 High, 1 Medium, 7 Low — 1 actionable + 7 deferred to backlog)
  - gate-tests: 20 (0 Critical, 3 High, 10 Medium, 7 Low — 13 actionable + 7 deferred)
  - gate-cruft: 11 (7 High, 4 Medium, 0 Low — all 11 actionable)
  - gate-docs: 20 (rolling-foundation drifts — all actionable)
  - gate-patterns: 2 patterns extracted + 3 inconsistencies flagged
- **Pre-existing fix during ship**: cleared a missed `release_binding: v0.1.1` on the `gate-security-open-external-url-parse` backlog item (the file contains a null byte in an exploit example, which masked it from earlier grep-based scans)
- **Publish**: run `git push origin main v0.1.1` to publish the tag

## Collapsed items

All 99 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| epic-bootstrap-readiness-durable-drafts | Durable bootstrap drafts | feature | — | 3c11dc38 |
| epic-bootstrap-readiness-expressive-draft-api | Expressive draft-editing API | feature | — | 3c11dc38 |
| epic-bootstrap-readiness-in-flight-affordances | In-flight chat affordances — thinking indicator + turn cancel | feature | — | 3c11dc38 |
| epic-bootstrap-readiness-structured-questions | Tutor-initiated structured questions | feature | — | 3c11dc38 |
| epic-bootstrap-readiness | Bootstrap readiness — make the course-creator actually shippable to students | epic | — | 3c11dc38 |
| epic-v1-security-hardening-encrypt-api-key | Encrypt API key at rest using Electron safeStorage | feature | — | 3c11dc38 |
| epic-v1-security-hardening-sign-update-feed | Sign the update feed with Ed25519 and verify before offering updates | feature | — | 3c11dc38 |
| epic-v1-security-hardening | V1 security hardening | epic | — | 3c11dc38 |
| feature-agent-transparency-ux-rename-course-design | Rename "bootstrap" / "explore" to "course design" / "reading your materials" | story | — | 3c11dc38 |
| feature-agent-transparency-ux-stream-pacing | Stream pacing — min-visible tool interstitials + thinking reasoning block + near-bottom scroll | story | — | 3c11dc38 |
| feature-agent-transparency-ux-subagent-channel | SubAgentRegistry + IPC channel + explorer emission | story | — | 3c11dc38 |
| feature-agent-transparency-ux-subagent-ui | Inline sub-agent block + bootstrap side-panel transcript | story | — | 3c11dc38 |
| feature-agent-transparency-ux | Agent transparency UX | feature | — | 3c11dc38 |
| feature-docx-ingestor-cleanup | DocxIngestor cleanup and embedded-image extraction | feature | — | 3c11dc38 |
| feature-editorial-polish-pass-concepts-navigation | Concepts list: scrollable + filter + sticky section headers | story | — | 3c11dc38 |
| feature-editorial-polish-pass-notes-markdown | Notes table cells render via `<MarkdownContent>` | story | — | 3c11dc38 |
| feature-editorial-polish-pass-styling-sweep | Editorial primitives audit + styling sweep | story | — | 3c11dc38 |
| feature-editorial-polish-pass-theme-tokens | Light-mode CSS tokens via `prefers-color-scheme` | story | — | 3c11dc38 |
| feature-editorial-polish-pass | Editorial polish pass | feature | — | 3c11dc38 |
| feature-onboarding-completion-claude-code-signin | Inline Claude Code sign-in in EngineStep | story | — | 3c11dc38 |
| feature-onboarding-completion-course-card-preseed | Pre-seed bootstrap message on canonical-pack course-card click | story | — | 3c11dc38 |
| feature-onboarding-completion | Onboarding flow completion | feature | — | 3c11dc38 |
| feature-powerpoint-ingestion-embedded-images | PPTX embedded image extraction | story | — | 3c11dc38 |
| feature-powerpoint-ingestion-text-extraction | PPTX text extraction — skeleton ingestor | story | — | 3c11dc38 |
| feature-powerpoint-ingestion | PowerPoint ingestion support | feature | — | 3c11dc38 |
| feature-prompt-customization-layers-compose-wiring | Composition infrastructure: types, table, service, session-service reads | story | — | 3c11dc38 |
| feature-prompt-customization-layers-configure-mode-append | Configure prompt-tab per-mode append editor | story | — | 3c11dc38 |
| feature-prompt-customization-layers-settings-global | Settings global-prompt editor | story | — | 3c11dc38 |
| feature-prompt-customization-layers | Prompt customization layers | feature | — | 3c11dc38 |
| feature-root-tsconfig-typecheck-coverage-enable-gate | Enable root-tsconfig typecheck gate | story | — | 3c11dc38 |
| feature-root-tsconfig-typecheck-coverage-scripts-cleanup | Root-tsconfig cleanup: `scripts/` | story | — | 3c11dc38 |
| feature-root-tsconfig-typecheck-coverage-tests-cleanup | Root-tsconfig cleanup: `tests/` | story | — | 3c11dc38 |
| feature-root-tsconfig-typecheck-coverage | Root-tsconfig typecheck coverage | feature | — | 3c11dc38 |
| gate-cruft-authoring-client-phase-narrative-jsdoc | "Phase 3 methods kept for backward compatibility" in `AuthoringClient` JSDoc — stale on a v0.1.1 release | story | — | 3c11dc38 |
| gate-cruft-compose-brief-unused-export | `composeBrief` and its types are exported but consumed only by their own tests | story | — | 3c11dc38 |
| gate-cruft-docx-ingestor-prior-pipeline-comment | Stale "prior `convertToHtml` + regex-stripping pipeline" reference in DOCX ingestor doc | story | — | 3c11dc38 |
| gate-cruft-engine-config-orphan-comment | Orphan comment block in `readEngineConfig` describes code that doesn't exist | story | — | 3c11dc38 |
| gate-cruft-episodic-to-messages-alias | Unused `episodicToMessages` alias kept "for the transition" with zero callers | story | — | 3c11dc38 |
| gate-cruft-misplaced-biome-ignore-suppressions | Misplaced `biome-ignore noExplicitAny` suppressions — Biome reports `suppressions/unused` and the underlying `any` warnings stay unmuted | story | — | 3c11dc38 |
| gate-cruft-skipped-claude-code-conformance-test | Skipped Claude Code adapter test in cross-engine conformance suite duplicates passing coverage elsewhere | story | — | 3c11dc38 |
| gate-cruft-stale-biome-ignore-no-any | `biome-ignore noExplicitAny` suppressions where no `any` is used (cast goes through `unknown`) | story | — | 3c11dc38 |
| gate-cruft-subagent-registry-unused-cleartimer | Unused private member `clearTimer` in `SubAgentRegistryImpl` | story | — | 3c11dc38 |
| gate-cruft-unused-mastery-signal-import | Unused type import `MasterySignal` in `tests/mastery-end-to-end.test.ts` | story | — | 3c11dc38 |
| gate-cruft-unused-type-imports-exam-test | Unused type imports in `tests/exam-end-to-end.test.ts` | story | — | 3c11dc38 |
| gate-docs-architecture-core-services-additions | ARCHITECTURE.md "Where the big pieces live" doesn't name `SqliteDraftStore`, `PromptCustomizationServiceImpl`, `SubAgentRegistry`, `UpdateServiceImpl + verifier`, `SecretStorage`/`ElectronSafeStorageAdapter` | story | — | 3c11dc38 |
| gate-docs-architecture-pptx-ingestor-image-stores | ARCHITECTURE.md ingestor list omits `PptxIngestor` and the embedded-image / page-image stores | story | — | 3c11dc38 |
| gate-docs-changelog-v0-1-1-entry | CHANGELOG.md has no v0.1.1 entry yet | story | — | 3c11dc38 |
| gate-docs-contract-assignment-item-fold-in | CONTRACT.md `AssignmentItem` still shows pre-Phase-17 shape as primary; Phase 17 expansion lives only in a "(planned)" callout | story | — | 3c11dc38 |
| gate-docs-contract-engine-event-interrupted-variant | CONTRACT.md `EngineEvent` union missing the `interrupted` variant + `final.finalReason`/`final.errorMessage` fields | story | — | 3c11dc38 |
| gate-docs-contract-engine-session-send-signal | CONTRACT.md `EngineSession.send` signature omits the `signal?: AbortSignal` parameter | story | — | 3c11dc38 |
| gate-docs-contract-prompt-fragment-positions | CONTRACT.md `PromptFragment.position` union missing `"user-global"` and `"user-append"` values | story | — | 3c11dc38 |
| gate-docs-contract-tool-context-call-id | CONTRACT.md `ToolContext` interface omits `callId?: string` field | story | — | 3c11dc38 |
| gate-docs-contract-tool-registry-dispatch-meta | CONTRACT.md `ToolRegistry.dispatch` signature omits the `meta?: { callId?: string }` parameter | story | — | 3c11dc38 |
| gate-docs-design-doc-policy-clarification | No `docs/designs/` doc exists for the four substrate-driven features that landed in v0.1.1 | story | — | 3c11dc38 |
| gate-docs-onboarding-api-key-encryption | ONBOARDING.md still says API key is stored unencrypted; v0.1.1 ships `safeStorage` encryption | story | — | 3c11dc38 |
| gate-docs-onboarding-claude-code-inline-signin | ONBOARDING.md says Claude Code auth happens "in first session"; v0.1.1 added inline sign-in during the onboarding Engine step | story | — | 3c11dc38 |
| gate-docs-pattern-engine-session-lifecycle-signal | Pattern skill `engine-session-lifecycle.md` Example 2 omits the `signal?: AbortSignal` parameter | story | — | 3c11dc38 |
| gate-docs-pattern-mode-prompt-fragment-fileline | Pattern skill `mode-prompt-fragment-composition.md` Example 3 file:line anchor has drifted | story | — | 3c11dc38 |
| gate-docs-pattern-service-deps-new-fields | Pattern skill `service-deps-injection.md` `ServiceDeps` interface listing is out of date — missing `subAgent`, `promptCustomization`, `secretStorage` | story | — | 3c11dc38 |
| gate-docs-pattern-tool-dispatch-meta | Pattern skill `tool-dispatch-pipeline.md` Example 1 omits the `meta?: DispatchMeta` parameter and callId-on-context behavior | story | — | 3c11dc38 |
| gate-docs-prompt-customization-layers-section | CONTRACT.md + ARCHITECTURE.md missing prompt-customization layers entry (AuthoringClient extensions, `PromptCustomizationService`, `mode_prompt_appends` table) | story | — | 3c11dc38 |
| gate-docs-roadmap-phases-17-19-mark-shipped | ROADMAP.md does not mark Phases 17–19 as ✓ SHIPPED even though they all landed pre-v0.1.0 | story | — | 3c11dc38 |
| gate-docs-roadmap-pptx-no-longer-deferred | ROADMAP.md "Future enhancements" still lists PPTX as deferred, but PPTX shipped in v0.1.1 | story | — | 3c11dc38 |
| gate-docs-spec-ux-ask-student-question | SPEC.md and UX.md don't mention the `ask_student_question` structured-choice tool or `<StructuredQuestionCard>` UI | story | — | 3c11dc38 |
| gate-docs-sub-agent-registry-section | CONTRACT.md + ARCHITECTURE.md don't document `SubAgentRegistry`, sub-agent events, or the `praxis.subAgent.*` IPC channels | story | — | 3c11dc38 |
| gate-patterns-inconsistency-load-or-throw-readside-scope | `load-or-throw` boundary unclear — three new read-side `if (!row) throw` inline forms appeared | story | — | 3c11dc38 |
| gate-patterns-inconsistency-service-deps-required-ports | `service-deps-injection` pattern doc silent on the now-required `secretStorage` port (and `lockService`) | story | — | 3c11dc38 |
| gate-patterns-inconsistency-subscriber-fanout-filter | `subscriber-fanout-stream` pattern doc silent on filtered-subscribe variant | story | — | 3c11dc38 |
| gate-patterns-v0-1-1 | Patterns extracted for v0.1.1 | story | — | 3c11dc38 |
| gate-security-document-id-path-traversal | Renderer-supplied `documentId` flows into filesystem paths without validation | story | — | 3c11dc38 |
| gate-tests-ask-student-question-mode-toolnames | `ask_student_question` membership in `configureMode.toolNames` / `bootstrapMode.toolNames` not asserted | story | — | 3c11dc38 |
| gate-tests-attach-document-configure-mode-includes | `course.attach_document` symmetry: present in `configureMode.toolNames` is not asserted | story | — | 3c11dc38 |
| gate-tests-authoring-audit-log-no-prompt-content | `ConfiguratorAction` audit-log does not assert text content is NOT stored for prompt sets | story | — | 3c11dc38 |
| gate-tests-engine-config-decryption-failure-idempotent | Decryption-failure on `apiKey` is not asserted idempotent across multiple reads | story | — | 3c11dc38 |
| gate-tests-ingestion-service-rename-embedded-image-dir | `IngestionService` synthetic→real `documentId` rename for embedded images not exercised e2e | story | — | 3c11dc38 |
| gate-tests-interrupted-engine-abort-reason | `interrupted` event with `reason: "engine_abort"` is not exercised anywhere | story | — | 3c11dc38 |
| gate-tests-ipc-cancel-propagation-e2e | IPC cancel propagation end-to-end (`session.send.cancel → controller.abort → engine conv.abort`) lacks an integration test | story | — | 3c11dc38 |
| gate-tests-list-dangling-refs-contract-divergence | `course.list_dangling_refs` (and siblings) "draft-not-found" contract — design preferred empty+warning, impl picked throw | story | — | 3c11dc38 |
| gate-tests-prompt-customization-lock-gating | Lock-gating on `setGlobalPrompt` / `setModeAppend` is unverified | story | — | 3c11dc38 |
| gate-tests-secret-storage-unavailable-encrypt | `ElectronSafeStorageAdapter.encrypt` does not test the "unavailable" failure mode contract | story | — | 3c11dc38 |
| gate-tests-start-exploration-no-call-id | `course.start_exploration` without `ctx.callId` not exercised — sub-agent registration must be skipped | story | — | 3c11dc38 |
| gate-tests-update-feed-public-key-length-guard | `importUpdateFeedPublicKey` length-rejection branch is not exercised — current test is tautological | story | — | 3c11dc38 |
| gate-tests-write-engine-config-empty-api-key | Empty-apiKey write path is not tested | story | — | 3c11dc38 |
| story-bootstrap-attach-document-fix | Resolve `course.attach_document` advertised-but-throws trap in bootstrap mode | story | — | 3c11dc38 |
| story-bootstrap-prompt-no-inline-outline | Bootstrap prompts — point at the outline panel, don't narrate it | story | — | 3c11dc38 |
| story-cleanup-stale-singular-draft-tool-refs | Cleanup: stale references to removed singular draft tools | story | — | 3c11dc38 |
| story-embedded-image-store-delete-cascade | Fix: cascade-delete embedded images | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-durable-drafts-integration | Swap `BootstrapServiceImpl` from in-memory Map to `DraftStore` | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-durable-drafts-store | Drafts table + `DraftStore` port and SQLite adapter | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-expressive-draft-api-edit-ops | Extend `DraftEditOp` with relink/add-edge/cascade-removes/validate + warning-shape | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-expressive-draft-api-query-tools | Chunked-query tools for the draft (list_units, list_lessons_in_unit, get_lesson_detail, list_dangling_refs) | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-in-flight-affordances-signal | Thread `AbortSignal` end-to-end + add `interrupted` EngineEvent | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-in-flight-affordances-ui | Thinking indicator + cancel button/Esc binding in chat UI | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-structured-questions-tool | `ask_student_question` tool + type union extensions | story | — | 3c11dc38 |
| story-epic-bootstrap-readiness-structured-questions-ui | `<StructuredQuestionCard />` component + chat-tab-body integration | story | — | 3c11dc38 |
| story-fix-block-claude-code-builtins-from-tutor | Block Claude Code built-in tools from the tutor — fix "Couldn't finish askuserquestion" interstitial | story | — | 3c11dc38 |
| story-fix-quickcheck-toolcontext-wiring | Fix: ask_student_question and quick_check.* tools auto-abandon (card never appears) | story | — | 3c11dc38 |
| story-image-store-dirfor-abstraction | Refactor: add `dirFor()` to image stores | story | — | 3c11dc38 |
| story-pptx-slide-image-map-dead-fallback | Fix: dead-code fallback in PPTX slide-image map | story | — | 3c11dc38 |

