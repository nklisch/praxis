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
