# Changelog

All notable changes to Praxis are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.1.0 — 2026-05-10

The first versioned release. Praxis ships as an Electron desktop app with a
first-run onboarding flow, an adaptive routing layer that picks between modes
based on the student's evolving state, a dedicated study-skills coach, and an
in-app update channel.

### Features

- **First-run onboarding flow** — new `<OnboardingFlow>` walks fresh users
  through Claude Code authentication and a course pre-seed step. Persistent
  via the new `OnboardingConfig` record so subsequent launches skip the wizard.
- **Auto-update channel** — `praxis.update.checkLatest` IPC channel fetches a
  signed-by-publisher feed at `PRAXIS_UPDATE_FEED_URL`, surfaces an
  `<UpdateBanner>` when a newer version is available, links to the manual
  installer download. Trust model documented in `docs/UPDATE-CHANNEL.md`.
- **Coach mode + dedicated study-skills tab body** — new mode practices the
  metacognition principles taught throughout the curriculum. Surfaces 5
  `pedagogy.*` tools, the workspace's note + flashcard family, and inline
  quick-checks. New `StudySkillsTabBody` component routes via the existing
  ChatTabBody dispatcher.
- **Adaptive mode routing** — the new router watches affective + procedural
  signals and suggests mode transitions (frustration spike → coach handoff,
  sustained ease → next concept, etc.) via `RouterSuggestion`.
- **Pedagogy pack v1** — content pack defines strategies, techniques, and
  metacognitive prompts that are read at runtime by the new
  `PedagogyPackService`. Loaded from `packages/curriculum/pedagogy/v1.json`.
- **Affective + procedural memory indexing** — two new background indexers
  mine the episodic stream and write derived projections (`affective_samples`,
  `procedural_strategies`). Run debounced on session-end, non-fatal on
  failure, regenerable from episodic.
- **Metacognitive prompts fragment** — composable mode-prompt fragment that
  the teach, quiz, homework, and exam modes carry; deliberately excluded from
  study-skills, bootstrap, and configure (where the role IS the coach voice
  or curriculum is pre-pedagogical).
- **Biology canonical pack** — first concrete starter content available via
  `course.use_canonical_pack`.
- **Bootstrap drafts streaming** — live `praxis.bootstrap.drafts.events.*`
  IPC channel with snapshot-on-subscribe semantics, surfacing in-flight
  course exploration as the explorer agent drafts units and lessons.
- **Chat surface fidelity** — three coordinated improvements: GitHub-flavored
  markdown rendering with syntax-highlighted code blocks; per-turn assistant
  bubble splits (multi-turn tool-using exchanges read as distinct utterances
  instead of one growing wall of text); ambient tool-call interstitials
  (italic editorial copy on its own line, e.g. "looking up textbook
  references…", with restraint matching the activity rail).
- **Rolling log file rotation** — pino-roll wired into the Electron main-
  process logger writes JSONL under `userData/logs/`, rotates on size +
  date, retains a configured window. Diagnostic transparency without
  unbounded disk growth.

### Refactor

- **Forked `@nklisch/claude-cli-sdk` in-tree** as `@praxis/claude-cli-sdk`
  so `pnpm deploy --inject-workspace-packages` can see it (it can't follow
  `link:` paths). Praxis is the only consumer; the package is owned and
  modified freely from now on.

### Security

- Tightened the auto-update feed `downloadUrl` schema to reject non-`http(s)`
  URL schemes (`javascript:`, `data:`, `file:`), closing a click-targeted
  vector if the feed publisher were compromised.
- Wrapped `praxis.config.engineConfig` and `praxis.config.setEngineConfig`
  IPC handlers in `requireUnlocked()` so the API key isn't readable or
  writable when the configure surface is locked.
- Added `path.resolve` canonicalisation + traversal-segment refusal to
  `praxis.author.exportMemory`, scoping renderer-supplied write paths.
- Installed Electron `will-navigate` and `setWindowOpenHandler` guards on
  the main `BrowserWindow`, preventing renderer-initiated navigation away
  from the app origin and routing popups through the existing
  `shell.openExternal` allowlist.
- Trust-model section added to `docs/UPDATE-CHANNEL.md` documenting the
  current unconditional feed-publisher trust and steering users toward
  installer-signature verification. Full Ed25519 feed-signing parked as a
  follow-up.
- Onboarding doc reconciled with reality: the API key is stored
  unencrypted in the local SQLite — `safeStorage` integration parked as a
  follow-up.
- Preload comment fixed to reflect actual `sandbox: false` posture (ESM
  preload constraint).

### Documentation

- All foundation docs rolled forward to v0.1.0:
  - `ARCHITECTURE.md` — package table now includes `@praxis/claude-cli-sdk`;
    `@praxis/engines` description acknowledges `runOneShot` carve-out for
    `@praxis/core/services` indexers; indexer description distinguishes
    deterministic (mastery, procedural) from LLM-driven (misconception,
    affective, concept-map divergence) flavors.
  - `CURRICULUM.md` — every mode's tool list now matches its source file;
    new study-skills mode entry added; `(Phase 17, planned)` tag stripped.
  - `UX.md` — study-skills surface and tint added; `(Phase 17, planned)`
    tags stripped.
  - `CONTRACT.md` — three new additive sections (Phase 17, 18, 19)
    documenting item kinds, quick-check service, pedagogy pack, study-skills
    mode, indexers, update service, onboarding config, and draft-stream
    client.
  - `SPEC.md` — Phase 17 sections moved from "(planned)" to current.
- New pattern skills codified by the patterns gate:
  - `subscriber-fanout-stream` — service `subscribe(listener)` + IPC
    fanout + client `events()` + UI hook fold (3 end-to-end instances:
    activity rail, bootstrap drafts, quick-check bridge).
  - `lazy-resolver-thunk` — `() => T` thunks for late-bound deps (engine,
    vision, bootstrap config, course lookup).
  - `indexer-class` — `Indexer` interface + orchestrator (5 concrete
    impls).
  - `mode-prompt-fragment-composition` — `Mode` is a list of
    `PromptFragment` objects; `composeSystemPrompt` sorts by fixed
    `FRAGMENT_ORDER` and applies `overrides`.
- `CHANGELOG.md` created (this file) with backfilled v0 retro-section.
- 9 pattern-skill `file:line` citations refreshed across the chat-surface
  refactor's source-line drift.
- README + CLAUDE.md tab-body enumeration updated.

### Tests

- 12 new test cases landed via the test-quality gate covering: onboarding
  config persistence (4 cases), URL-scheme rejection in the update feed
  (3 cases), metacognitive-prompts fragment exclusion across study-skills /
  bootstrap / configure (1 `it.each`), onboarding skip-step partitions
  (2 cases), tab-state isolation across teach ↔ study-skills (1 case),
  IPC handler seam for first-run + update channels (6 cases),
  `compareVersions` edge inputs (2 cases), logger file rotation (1 case),
  affective indexer transaction-atomicity rollback (1 case).
- Test count: 2365 → 2389 passing.

### Internal

- Cruft pass: 6 mechanical Biome-detected fixes (unused imports, dead
  state hooks, misplaced lint suppressions). One stale navigational
  comment cleaned up.
- Vitest config gained `praxis-source` resolve condition to enable
  workspace subpath-export resolution in tests without a build step.
- 4 organisational features (`feature-release-v0.1.0-{security,test,
  cruft,doc}-findings`) and a parent `epic-release-v0.1.0-readiness`
  epic organised the 45 gate-produced findings into a coherent drain.

### Follow-ups parked to backlog

- `idea-encrypt-api-key-with-safestorage` — long-term replacement for
  the v0.1.0 doc-fix on API-key storage.
- `idea-update-feed-ed25519-signature` — full feed-signing mechanism
  blocking real auto-update beyond the current manual-download flow.

---

## v0 — 2026-05-09 (retro-release)

Captures all phases and non-phase chunks shipped before the agile-workflow
substrate was bootstrapped. This is a retrospective bundle, not a distributed
release. No `v0` git tag was cut; the bundle exists so future versioned releases
can declare `depends_on:` against prior work without dangling references.

### Foundation and engines

- Phase 1 — `@praxis/*` workspace skeleton, Drizzle SQLite schema, migration
  tooling, and test/lint baseline (Biome + Vitest).
- Phase 2 — `Engine` / `EngineSession` / `EngineEvent` contract; Claude Code,
  Codex, and Direct adapters; tool-dispatch shell; episodic event stream.
- Phase 4 — `@praxis/tools` with Zod-schema'd handlers; sympy-based math grader;
  initial language sandbox (later replaced by the registry refactor).
- Language sandbox registry — QuickJS WASM replaces `isolated-vm`; per-language
  registry with `QuickJsLanguageSandbox` and `PyodideLanguageSandbox` adapters;
  `code_sandbox` tool derives its input enum from the registry.
- Structured logging and observability — `pino`-backed structured logger across
  main and renderer; child-logger correlation (`sessionId`, `streamId`,
  `turnIndex`); JSONL rotation; secret redaction; IPC error-wrapping helper.

### Content and curriculum

- Phase 5 — Multi-format ingestion (PDF, EPUB, DOCX, HTML, Markdown, plain text);
  sqlite-vec embeddings; `document.outline` / `document.read_pages` /
  `document.list_sections` tools with citations.
- Phase 6 — Course and lesson artifacts; initial single-shot bootstrap flow
  (`course.propose_draft` → `course.confirm_draft`).
- Phase 7 — Semantic and misconception memory projection layers from the episodic
  stream; BKT-inspired mastery scoring.
- Phase 8 — Quiz, homework, and exam mode shells; five assessment item kinds
  (multiple-choice, short-answer, free-response, math, code); server grading;
  per-item agent narration.
- Phase 9 — Gate artifacts and evaluator; locked content enforcement; progress-map
  rendering; agent unlock narration. (M2 milestone)
- Phase 10 — Canonical Algebra 1 / Geometry concept graph; prerequisite-aware
  course routing in `@praxis/curriculum`.
- Phase 11 — Configure-mode tutor variant; lock pattern (`useLock` hook); authoring
  surfaces for courses and gates.
- Phase 16a — Agentic multi-turn bootstrap explorer replacing the single-shot draft
  tool; `course.start_exploration`, `draft_add_unit`, `draft_set_assessment_plan`,
  `draft_add_lesson_assessment` tools; `course_documents` join table.
- Phase 17 — Assessment item palette expanded from five to nine kinds; inline
  `quick_check.*` tool family for mid-conversation formative probes without a
  dedicated assignment tab; `<QuickCheckCard>` in-thread UI.

### UI shell and editorial

- Phase 3 — Electron host; IPC transport (`@praxis/client`); React + TanStack
  Router shell; streaming chat surface. (M1 milestone)
- Phase 12 — Notes and flashcards artifacts; spaced-repetition scheduler; workspace
  shell hosting both.
- Phase 13 — Editorial design language: `RouteHeader`, `LibrarySection`,
  `EmptyState`, `LoadingState`, `ErrorMessage` primitives; COPY module;
  `composes: editorial from global;` CSS utility.
- Phase 14 — Multi-tab chat workspace (`useTabs()` + `display:none` isolation);
  Library route consolidating all artifact surfaces.
- Phase 15a — `<SketchCanvas>` backed by tldraw; composer-sketch and note-editor-
  sketch surfaces; sketch stored as JSON + image.
- Phase 15b — Student-authored concept maps; React Flow / `@xyflow/react` editor;
  snapshotter for review.
- Phase 16b — Per-mode tab bodies (`QuizTabBody`, `HomeworkTabBody`, `ExamTabBody`,
  `BootstrapTabBody`); `spawnFromAssignment()` + `notifySession()` parent-child
  session linkage.
- Activity rail — `<ActivityRail>` replaces the blocking `IngestionProgress` modal;
  `ActivityRegistry` injected via `ServiceDeps.activity`; producers hold an
  `ActivityHandle` and call `update(patch)` / `finish("done"|"failed")`.
- Claude CLI authentication — `auth` namespace in `@praxis/claude-cli-sdk`;
  `ClaudeAuthService` exposed via IPC; `<ClaudeAuthModal>` for first-run sign-in
  and recoverable mid-session expiry detection.
