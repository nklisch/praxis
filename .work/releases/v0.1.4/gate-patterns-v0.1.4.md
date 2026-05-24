---
id: gate-patterns-v0.1.4
kind: story
stage: done
tags: [patterns, documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: patterns
created: 2026-05-23
updated: 2026-05-24
---

# Patterns extracted for v0.1.4

## New patterns codified
- `dynamic-where-predicate` — Drizzle queries with optional filters seed
  a mutable `eq[]` accumulator and finalize with
  `.where(and(...predicates))`; never chain `.where().where()`. 6+ call
  sites including the new `session.list({ excludeModeIds })` and
  `session.active({ modeId })`.
- `use-resource-aggregation-loader` — page-level surfaces with N
  independent reads pass a `useCallback`'d `Promise.all` loader to
  `useResource`; one shared `loading`/`error`/`refresh`. 6+ call sites
  including the bundle's updated `use-library.ts`,
  `library-document-picker.tsx`.
- `ipc-envelope-test-triad` — each `handleEnvelope`-wrapped channel gets
  a per-`describe` block asserting four outcomes (`ok:true`,
  `VALIDATION_FAILED`, `INTERNAL` never-rejects, no host-path leakage).
  9+ test files, ~17 path-leakage assertions; the bundle adds
  `citations-channel-envelope.test.ts` and extends
  `session-channel-envelope.test.ts`.
- `server-resolved-student-id` — IPC handlers resolve `studentId` via
  `getStudentId(services)`; the Zod schema declares no `studentId` field.
  14 handler files, 20+ call sites; reinforced by the bundle's
  `session-channel.ts` IPC-schema layout for `spawnFromPassage` /
  `spawnFromNote`.

## Inconsistencies flagged
- `shared-test-fake-factories` divergence — the bundle's
  `session-channel-envelope.test.ts` inlines a local `makeFakeLogger()`
  instead of importing `makeSpyLogger` from `tests/helpers/mocks.ts`,
  while sibling `citations-channel-envelope.test.ts` uses the shared
  factory. Pre-existing systemic drift (~37 channel-envelope tests
  inline a logger); tracked separately as
  `gate-patterns-inconsistency-shared-test-fakes-logger`.
- `editorial-ui-primitives` divergence — Library route's Workbench
  rebuild builds a custom greeting header instead of `<RouteHeader>`.
  Already tracked as
  `gate-docs-pattern-editorial-ui-primitives-library-routeheader`.

## Pattern files written
- `.claude/skills/patterns/dynamic-where-predicate.md`
- `.claude/skills/patterns/use-resource-aggregation-loader.md`
- `.claude/skills/patterns/ipc-envelope-test-triad.md`
- `.claude/skills/patterns/server-resolved-student-id.md`
- `.claude/rules/patterns.md` (updated index)
- `.claude/skills/patterns/SKILL.md` (updated available-patterns list)

## Rerun (2026-05-24) — full-project sweep

Per user request "re-run patterns before releasing" with project-wide
scope. Opus discovery sub-agent scanned all 1,150+ TS/TSX files across
the 11 workspace packages (not just the original bind bundle), surfacing
emergent shapes that the post-bind refactor wave (artifacts service
decomposition, assignment grading extraction, author-channel per-domain
split, buildServices decomposition, course-create decomposition,
engine-adapter helpers, memory BKT extraction, session-service spawn
extraction, use-ingestion batch, use-streamed-send hook) brought into
view.

### Additional patterns codified
- `builder-module-composition` — 9 `build-<domain>-services.ts` modules
  each export an `<Domain>Services` interface + `build<Domain>Services(deps)`
  factory; orchestrator wires them in dependency order. Sourced from the
  buildServices decomposition refactor.
- `service-facade-sibling-dir` — services > ~400 LoC split into a thin
  `<name>-service.ts` facade + sibling `<name>/` directory of pure
  helpers, registries, prompt sidecars, and sub-services; barrel
  re-exports keep imports flat. 5 instances: graders, memory,
  course-create, indexers, session.
- `one-shot-llm-inference` — background LLM passes use
  `runOneShot(engine, { systemPrompt, tools: { list: () => [], dispatch: noopDispatch }, maxSteps: 1 }, userMessage)`
  + `for await` accumulating `assistantText` + graceful
  `event.type === "error"` handling + `extractJsonBlock` for JSON. 6+
  sites: affective / misconception / concept-map-divergence indexers,
  rubric / approach-feedback graders, notes-service summarization.
- `agent-prompt-sidecar` — each LLM agent ships its system prompt in a
  sibling `<name>-prompt.ts` file exporting one `NAME_SYSTEM_PROMPT`
  const. 5+ instances across indexers and graders.
- `row-to-domain-mapper` — per-service
  `function rowToX(row: typeof tableName.$inferSelect): X` colocated
  with the service; read methods funnel rows through it so
  JSON-parsing, brand-id wrapping, and Date→Timestamp normalization
  live in one place. 10+ instances (notes, flashcards, sketches,
  concept maps, drafts, courses, lessons, gates, mastery, submission).
- `hook-decomposition-setitems-callback` — complex hooks split into
  independent sub-hooks each owning one state slice + imperative API;
  parent's `setItems` is passed in at call time, not captured at
  construction, to avoid stale-closure bugs. Sourced from the
  `use-streamed-send` and `use-ingestion-batch` decompositions.
- `ref-cell-bridge` — when two services need a cyclic runtime
  dependency, the earlier builder declares a
  `let xxxRef: T | undefined` + `setXxxRef(fn)` setter, A's deps thunk
  over the ref, and the orchestrator closes the ref after the second
  service is constructed. 2 first-class instances in
  `build-artifacts-services.ts` (notifyParentSession) and
  `build-session-precursors.ts` (sessionService) — the 3rd occurrence
  is the orchestrator-side composition pattern.
- `kind-adapter-registry` — per-variant logic for a discriminated union
  exposed as `buildXxxRegistry(): Record<Union["kind"], Adapter>` —
  TS exhaustiveness forces every new union member to register an
  adapter; dispatch sites become `registry[obj.kind].method(...)`.
  Sourced from the graders refactor; similar shapes in indexers and
  mode-tool-scoping.

### Additional inconsistencies flagged (rerun)

Each becomes a `[refactor]` story without a release binding so v0.1.4
doesn't pick up new readiness blockers from a rerun finding:

- `gate-patterns-inconsistency-noop-dispatch-duplication` —
  `noopDispatch` is copy-pasted in 6 files (notes-service, 3 indexers,
  2 graders). Should be extracted to a shared helper alongside
  `runOneShot`.
- `gate-patterns-inconsistency-require-unlocked-duplication` —
  `requireUnlocked()` is duplicated literally 7 times across the
  author-* channel modules + config-channel. Either extract to
  `ipc-helpers.ts` or extend `handleEnvelope` with a `lockGated: true`
  option.
- `gate-patterns-inconsistency-builder-positional-deps` —
  `buildMemoryServices(db, log)` and `buildEmbeddingsServices(db, sqlite, log)`
  use positional parameters; the other 7 builders accept a typed
  `*ServiceDeps` object. Migrate the two outliers.

### Rerun pattern files written
- `.claude/skills/patterns/builder-module-composition.md`
- `.claude/skills/patterns/service-facade-sibling-dir.md`
- `.claude/skills/patterns/one-shot-llm-inference.md`
- `.claude/skills/patterns/agent-prompt-sidecar.md`
- `.claude/skills/patterns/row-to-domain-mapper.md`
- `.claude/skills/patterns/hook-decomposition-setitems-callback.md`
- `.claude/skills/patterns/ref-cell-bridge.md`
- `.claude/skills/patterns/kind-adapter-registry.md`
- `.claude/rules/patterns.md` (index extended)
- `.claude/skills/patterns/SKILL.md` (available-patterns list extended)
