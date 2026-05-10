# Changelog

All notable changes to Praxis are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
