# Changelog

All notable changes to Praxis are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.1.3 — 2026-05-18

Two parallel epics — a ground-up UI redesign against a swapped editorial
token system, and the backend completion bundle that fills the new
surfaces — land together with a sweep of structural refactors. The mode
formerly called `bootstrap` is now `course-create`; the agent formerly
called the `explorer` is now the `drafter`; `course.start_exploration`
is now `course.start_drafting`. Behind the rename, `ipc-server.ts` is
split into per-domain channel modules, the engine session loop is
extracted out of `SessionServiceImpl` into a dedicated
`EngineSessionManager`, every streaming channel is factored onto two
shared helpers, every fanout service shares one listener-loop helper,
and `useResource` is now adopted across the configure tabs.

The release also lands the standard quality-gate sweeps (security,
tests, cruft, docs, patterns), with two new pattern skills codified —
`streaming-ipc-channel-helpers` and `notify-listeners-helper` — and one
new security hardening (`EngineConfig.baseUrl` scheme allowlist with
sanitize-on-load for legacy rows).

### Features

- **UI redesign, ground-up** — full app-shell rebuild (running-head
  `<TopNav>`, mounted ambient-progress `<StatusStrip>`, first-run flow,
  theme toggle, tabs strip), chat workspace (refined message bubbles,
  composer restyle, quiz / homework / exam / study-skills / document tab
  bodies, tool-call disclosure block, restyled side panels), workspace
  surfaces (catalogue rebuild, concept-map editor restyle, Cornell /
  Feynman / outline / free / sketch note editors, ask-tutor-from-note,
  chat-to-workspace inline panel, review-session flow), configure canvas
  (entry flow, course / gates / memory / prompts canvas tabs,
  canvas-side chat shell), and discovery surfaces (course-create entry
  path, session-open flow polish, workbench library rebuild,
  course-create ingestion status fix). The design-system token swap
  underpins everything.
- **Document viewer + spawn-from-passage** — citation tools persist
  `passageRange` on `document_scopes` rows, the viewer renders passage
  markers + a selection bar, and `SessionService.spawnFromPassage` opens
  a teach session scoped to the selected text. Same shape applies to
  spawn-from-note for note-driven teach sessions.
- **Drafter / configurator chat** — authoring pane gained an inline
  `<ToolCallEntry>` with per-call revert wired to `restoreAction`, a
  sub-agent block inline in the message thread, parent prompt updates
  reflected immediately, and a course-create tab body that consumes the
  draft stream cleanly.
- **Snapshot / restore** — every configurator action now captures a
  snapshot row so the new `restoreAction` IPC + UI can roll an edit
  back; the new `restore` action itself snapshots, enabling un-revert.
- **Cross-tab state primitives** — parent-child session linkage (a child
  assignment session injects a `system_note` event into its parent
  tutor session on submit), dirty-tracker for tabbed editors, and the
  spawn-from-note path landing the same `system_note` semantics.
- **Concept-map ↔ sketch bridge** — convert a sketch to a concept map
  with three-state ripples and an editing flow.
- **Note annotations and filters** — per-character-range annotations
  with severity, plus saved search/filter combinations.
- **UI completion bundle** — theme persistence, exam timer, quiz
  confidence debounce fix, spawn-from-note, create-course CTA from the
  catalogue, lesson-assessment render.
- **Workbench engine recommendation** — `RecommendationService` surfaces
  the suggested engine per session-shape (course-create vs teach vs
  configure vs grading-heavy modes) so the engine picker shows a
  default rather than blank.
- **Inline drafts list** — `feature-list-in-progress-drafts` makes the
  course-create surface enumerate in-flight drafts so a user picking up
  mid-flow sees options instead of a blank slate.
- **Reattach-docs mid-session** — a teach session can attach additional
  documents after open via `praxis.session.reattachDocuments`, scoped
  per-session, with the document scope service handling upsert
  semantics.
- **Deep mode-prompt course alignment** — the per-mode
  `course-context` fragment now also threads in the current lesson's
  concepts and the active mastery state so the tutor's opening turn is
  aware of where the student is in the course graph.

### Fixes

- **CLI crash on no-session resume** — opening a session whose stored
  engine id no longer resolves to a registered engine no longer crashes
  the CLI; it falls back to the project default and logs the swap.
- **Outline editor contenteditable cursor reset** — typing in the
  outline editor no longer jumps the caret back to the start on
  controlled re-render.
- **Audit log render flicker** — the audit log loop no longer re-mounts
  on every tick.
- **Chat documents-sidebar flicker** — same loop-induced re-mount fixed
  in the chat documents sidebar.
- **Question card persists after answer** — the quiz / homework
  question card unmounts on answer so the next question takes its
  place cleanly.
- **Sub-agents panel collapse** — sub-agent subscriptions release on
  panel collapse instead of leaking.
- **Chat right-panel storage-key collision** — `<ChatRightPanel>` got
  its own resize storage key instead of sharing the quiz/homework key
  with a different clamp range.
- **Configure prompt-tab dirty key mismatch** — the prompt-config tab
  reads/writes the same dirty key so unsaved-changes detection works
  again.
- **Ripples-panel legacy-token color error** — the ripples panel uses
  the renamed `--color-danger` token instead of the dropped
  `--color-error`.
- **Library service due-only FTS null inconsistency** — `dueOnly`
  filtering no longer drops rows that legitimately have null
  next-review timestamps.
- **Lesson-assessment pills fetch catch** — the lesson assessment pills
  surface no longer crashes on a fetch reject.
- **Configure gates inspector pending minscore strip** — the gate
  inspector no longer shows a phantom pending min-score row.
- **Configure memory-tab local empty state** — the memory tab renders
  a proper empty state on a fresh project instead of the loading state
  in perpetuity.
- **Configure-tab button change-dot test coverage** — the dirty-dot
  indicator on configure-tab buttons has tests.
- **Document-tab-body lint cleanup** — biome-flagged residue in the
  document tab body cleared.
- **Mode-glyph dead bootstrap entry** — the `bootstrap: "¶"` lookup row
  in `MODE_GLYPHS` is gone — no mode id maps to that key anymore.

### Refactor

- **`bootstrap → course-create` and `explorer → drafter` rename** —
  five-step atomic rename across modes, the tool registry
  (`course.start_drafting`), services, IPC channels
  (`praxis.courseCreate.drafts.events.*`), and foundation docs. The
  user-facing surface flips cleanly; load-bearing internal identifiers
  (`services.bootstrap` field key, `BootstrapOpts` type,
  `kind: "bootstrapped"`, `bootstrapEngineResolver`,
  `bootstrapConfigResolver`) are retained by design to keep the diff
  bounded. A wide stale-comment sweep across 53 files clears residue
  from JSDoc, log-key cross-references, test-helper docs, and user
  copy.
- **`ipc-server.ts` per-domain extraction** — the 3500-line
  `ipc-server.ts` is now a 183-line composition root that invokes 25+
  `register*Handlers` calls. Every cohesive IPC domain lives in its
  own `<domain>-channel.ts`. A new `per-domain-channel-module`
  pattern documents the shape.
- **Engine session loop extraction** — `SessionServiceImpl` is now a
  thin orchestrator that owns turn orchestration (recordUserMessage →
  yield → for-await engine events → append episodic); engine session
  lifecycle (open / acquire / send / close, swap detection,
  native-resume, prior-turn seeding, mode-tool filtering, additional-
  fragment composition) lives in `EngineSessionManager` at
  `packages/core/src/services/session/engine-session-manager.ts`.
- **Streaming IPC channel helpers** — `registerSubscriberStream`
  (callback-subscribe) and `registerGeneratorStream` (`AsyncIterable`)
  factories in `stream-handler.ts` own the `.start` / `.events.<id>` /
  `.cancel` triplet. Seven streaming channels (activity, sub-agent,
  course-create-drafts, quick-check, session.send, ingest, memory) now
  use them instead of ~60 lines of inline boilerplate each. New
  pattern: `streaming-ipc-channel-helpers`.
- **Subscriber-registry base** — `notifyListeners(listeners, event,
  log, component)` in `services/db-helpers.ts` is the shared per-
  listener `try/catch` fanout loop used by four services (activity,
  quick-check, sub-agent, course-create). New pattern:
  `notify-listeners-helper`.
- **`@praxis/core/types` split** — `core/src/types.ts` is split along
  tool and client boundaries into focused files; the umbrella module
  preserves the existing import paths.
- **`useResource` adoption sweep** — three configure tabs (memory,
  course, prompt) migrated from inlined `useEffect + try/catch` blocks
  to the `useResource(loader)` hook.
- **`CourseCreateServiceImpl` module extraction** — the drafter loop
  (engine adapter glue, tool dispatch threading, draft persistence,
  parent-session notification) is split into modules under
  `services/course-create/` with `CourseCreateServiceImpl` as the thin
  composition root.
- **IPC envelope validation coverage** — every schema-validated IPC
  channel now uses the new `handleEnvelope(channel, log, schema, fn)`
  helper composed from `wrapEnvelope + withSchema`. 121 call sites
  across 19 channel files.
- **`getStudentId()` helper sharing** — 44 inline regressions across
  12 channel files collapsed onto a single helper. `StudentId` /
  `Services` import type-only per the verbatimModuleSyntax rule.
- **`loadOrThrow` adoption** — concept-map and tabs services migrated
  off inline `if-null-throw` blocks to the shared helper, restoring
  the uniform `"<entity> not found after <op>: <id>"` error format.
- **`normalizeConceptName` helper** — extracted, then consolidated to
  a single home after a follow-up surfaced duplication.
- **`defaultStudentId` helper** — extracted out of multiple callers.
- **`previewPrompt` god-function split** — preview composition broken
  into landable pieces.
- **`brandId<"DraftId">` adoption** — draft-store id types brand-
  tightened.
- **`NoteBodySchema` discriminated-union restore** — the schema is
  back to `z.discriminatedUnion("kind", ...)` after a brief
  performance-motivated detour through `z.union`.
- **`explorer` rename in tool descriptions** — the `course.*` tool
  descriptions that still mentioned the `explorer` agent flipped to
  the `drafter`.
- **Stale explorer-comment cleanup sweep** — sibling to the wider
  bootstrap/explorer sweep.
- **`deprecated code sandbox exports` cleanup** — old isolated-vm
  carry-overs deleted.

### Security

- **`EngineConfig.baseUrl` scheme allowlist** — the renderer-facing
  `EngineConfigSchema.baseUrl` now refuses `file://`, `javascript:`,
  `data:`, and embedded-CR URIs via `isAllowedExternalUrl`. The
  stored-side schema stays permissive but the load path sanitizes —
  invalid `baseUrl` rows are dropped with a
  `config.engine_baseurl_dropped` warn rather than locking the user
  out.
- **Embedded image-store path guard** — the page-image store guard is
  now applied to the embedded-image extraction path in the PPTX
  ingestor.
- **SDK per-turn timeout disabled, defense-in-depth** — the
  Claude Code adapter passes `timeout: 0` and bounds turns via
  `maxSteps + AbortSignal`. A regression test asserts the disable is
  preserved.
- **Tool-bridge socket permissions and token** — the local Unix
  socket the tool-bridge uses for MCP fan-out now restricts socket
  permissions and requires a per-session token so a co-located
  process can't intercept tool traffic.
- **`ipc-server` raw-invoke residuals** — 13 raw `invoke` channels
  that bypassed the envelope redactor now run through the
  redacted-error path.

### Documentation

- **Foundation docs rolled forward** — CLAUDE.md, ARCHITECTURE.md,
  CONTRACT.md, UX.md, README.md, and `.claude/rules/patterns.md`
  updated to describe the present:
  `EngineSessionManager.openActive` (not `SessionServiceImpl`),
  `<StatusStrip>` as the mounted ambient-progress surface (not
  "planned"), `course-create` mode and `drafter` agent (not
  `bootstrap` / `explorer`), `passageRange` on `document_scopes` rows,
  `spawnFromNote` / `spawnFromPassage` on the `SessionService`
  interface.
- **Pattern skills refreshed** — five pattern skills updated for the
  ipc-server extraction (`per-domain-channel-module`,
  `ipc-channel-convention`, `ipc-envelope-handler` adds
  `handleEnvelope`, `subscriber-fanout-stream` reflects the helper-
  based form, plus engine-session-lifecycle Example 3 for
  `EngineSessionManager`). Three pattern skills updated for the
  bootstrap → course-create rename
  (`mode-prompt-fragment-composition`, `tab-body-isolation`,
  `lazy-resolver-thunk`).
- **Two new pattern skills** — `streaming-ipc-channel-helpers`
  documents the `registerSubscriberStream` / `registerGeneratorStream`
  factories; `notify-listeners-helper` documents the shared
  listener-loop with per-listener error isolation.

### Internal

- **Quality gates** — five-stage sweep with results:
  - **gate-security** — 1 new finding (Medium: baseUrl allowlist), 4
    carry-overs already tracked.
  - **gate-tests** — 12 coverage gaps closed (2 Critical, 4 High,
    4 Medium, 2 Low; the two migration-regression items were closed
    pre-release on the "no production data yet" rationale). 15 prior
    test-gate carry-overs landed.
  - **gate-cruft** — 18 raw findings consolidated into 6 focused
    items: mode-glyph dead entry, the bootstrap/explorer 53-file
    stale-comment sweep, the biome unused-imports/suppressions/
    variables sweep, the ipc-server-cancel test scaffolding cleanup,
    the ingest-pickfile comment, the concept-link-overlay legacy
    marker deletion.
  - **gate-docs** — 20 raw findings consolidated into 6 focused
    items covering all the foundation-doc and pattern-skill drift
    above.
  - **gate-patterns** — 2 new patterns codified, 2 inconsistencies
    in existing pattern skills tracked and resolved.
- **`feature-rate-limit-error-structured-fields`** — adapter-level
  rate-limit errors now expose `retryAt`, `windowType`, and
  `provider` as structured fields on the error envelope, in addition
  to the human-readable message landed in v0.1.2.
- **Configure-context textarea forwarding** — the configure surface
  forwards keyboard context into the underlying textarea so paste-
  and-replace works from the configure shell.
- **Course-buildout progress signals** — the buildout pipeline emits
  intermediate progress events so the activity rail surfaces the
  per-stage state.
- **Root vitest praxis-source condition** — `tests/` runs against the
  source condition correctly via the workspace config.
- **`wire-logger-into-quick-check-service`** — quick-check service
  takes its logger via `ServiceDeps` so per-turn logs are correctly
  tagged.
- **`investigate-flaky-use-fragment-overrides-test`** — flaky test
  diagnosed and stabilized.
- **`fix-exactoptional-typecheck-baseline`** — `exactOptionalPropertyTypes`-driven
  typecheck baseline normalized after the bundle's many small surface
  shifts.

## v0.1.2 — 2026-05-17

Largest release since v0.1.0. Eight epics clustered out of the v0.1.1 backlog
deliver: a course-aware structured tutor (mode prompts that carry course
context + draft resumption), a first-class document library (polymorphic
scopes primitive, viewer-tab sidebar, multi-file picker, library tab/filters),
a unified prompt-editing surface (compose attribution, diff-aware preview,
full-fragment view, one configure surface), an editorial polish pass (app
chrome, concept-name surfacing, prompt-config redesign, resizable panels),
the tutor session-feel set (cancellation propagation, composer queue,
tool-call thread persistence, tutor-tab rename), UI rendering stability
(loop flickers + state transitions), security hardening round 2 (image-store
path guard, IPC boundary redactor, tool-bridge socket auth), and a
test-coverage adversarial pass (ingestion / state-and-config / UI assertion
gaps). The release also lands the IPC envelope migration — every mutating
/ trust-boundary channel now returns `{ ok, value | error }` with redacted
errors — plus the standard quality-gate sweeps (security, tests, cruft,
docs, patterns).

### Features

- **Course-aware structured tutor** — the teach, quiz, homework, exam, and
  study-skills modes now compose a `course-context` prompt fragment so the
  tutor opens every turn already knowing the course's units, lessons, and
  active concept. A separate `in-course-behavior` addendum (with per-mode
  overrides) replaces the previous generic system prompt; mode-by-mode
  addendums describe the role-specific behavior the student should feel.
- **Bootstrap draft resumption** — `course.list_drafts` surfaces all in-flight
  drafts; the `<ResumeDraftPicker>` lets the tutor (or student) reopen one
  mid-bootstrap. Bootstrap mode wiring threads the picker into the
  course-creation flow so a refresh or restart no longer strands the work.
- **Document library** — new polymorphic `document_scopes` table replaces
  the per-course pivot, supporting `'course' | 'session'` scopes via a
  single primitive. Bootstrap sessions attach documents at session-scope;
  confirming a draft promotes them to course-scope. The library tab gained
  filters and document-kind tabs; the workspace gained a viewer tab kind
  with a scoped sidebar; a multi-file/folder picker replaces the
  one-at-a-time ingestion flow. `retrieve_from_textbook` was renamed and
  re-scoped to `retrieve_from_documents`.
- **Prompt-editing surface v2** — one unified configure surface ties the
  cross-mode `user-global`, per-mode `user-append`, and customizable
  built-in fragments together. New `<PromptBlockStack>` renders each
  fragment as a directly-editable block; a diff-aware preview shows the
  composed prompt with attribution per fragment; the full-fragment view
  expands the source line-by-line. `composeSystemPrompt` records
  attribution so the surface can show "this paragraph came from
  `metacognitive-prompts`" without a reverse search.
- **Tutor session feel** — four coordinated UX improvements: turn
  cancellation propagates through the engine + sub-agents to
  `conv.abort()` (no orphaned tool calls); the composer accepts queued
  messages while a turn is in-flight and delivers them after `final`;
  per-turn tool-call threads persist across reloads so the chat surface
  reads the same after a refresh; the tutor tab is renameable in place.
- **Editorial polish pass** — new app chrome (tighter `<Nav>`, slimmer
  route headers, refreshed library section spacing); concept names now
  surface everywhere they're referenced (gate inspector, concept-picker,
  gates-reading-view, concept-node) via the new `useConceptNames` hook;
  the prompt configure tab adopts the v2 block primitive + stack; chat
  side-panels are now drag-to-resize with persisted width via the new
  `useResizableWidth` hook.
- **UI rendering stability** — loop-induced flickers in the chat
  documents sidebar and other live-stream surfaces are gone; question
  cards no longer persist after answer; the sub-agents panel unmounts
  cleanly on collapse instead of leaking subscriptions.
- **Activity rail adoption** — long-running services now surface ambient
  progress through the existing `<ActivityRail>` instead of blocking
  modals, with the rail's quiet-period threshold tuned per producer.

### Fixes

- **Rate-limit error message format** — adapter-level rate-limit errors now
  surface a readable, structured message (ISO retry time + window type)
  instead of a JSON blob; the UI banner reads as English.
- **SDK per-turn wall-clock timeout disabled** — long-running tutor turns
  (multi-step tool use, vision prompts) no longer hit the SDK's default
  per-turn timeout and abort mid-thought. The adapter sets the timeout to
  disabled at conversation open.
- **Question card persists after answer** — the inline question card now
  collapses to its settled state once the student answers, matching the
  quick-check card behavior.
- **Sub-agent panel collapse leak** — collapsing the sub-agent panel now
  unmounts its event subscriber instead of leaving it streaming in the
  background.
- **`wrapEnvelope`/`withSchema` arg routing** — fixed a production bug where
  the envelope wrapper passed Zod-parsed args to handlers in the wrong
  order, surfaced by the IPC envelope integration test gap. Client now
  peels envelopes via a single `unwrapEnvelope` helper.

### Security

- **Embedded image store path guard** — `EmbeddedImageStore` now refuses
  any `documentId` that would resolve outside its base directory, closing
  a traversal vector reachable from ingestion of attacker-controlled
  filenames.
- **IPC boundary redactor + envelope** — every mutating / trust-boundary
  IPC channel now returns `{ ok, value | error: { code, message, requestId } }`.
  Errors are mapped through a redactor that strips internal stack details
  and replaces unknown codes with `INTERNAL`; each error carries a
  UUIDv7 `requestId` for log correlation. Twelve channel domains migrated
  (session, documents, artifacts, memory, assignments, packs, lock/config,
  author, notes/flashcards, tabs, sketches/concept-maps, misc); residual
  raw `ipcMain.handle` callsites swept to closure.
- **Engine config shape** — the renderer can no longer read the stored
  `apiKey` directly; `praxis.config.engineConfig` returns
  `{ hasApiKey: boolean }`, and the decrypted key is only available via
  the separate `reveal` channel under `requireUnlocked()`.
- **URL allowlist hardening** — `parseAllowedUrl` now rejects C0 control
  characters and whitespace in URLs before WHATWG normalization, closing
  a class of homograph / smuggling attacks against the update-feed and
  retrieve-document URL paths.
- **Tool-bridge socket auth** — the local tool-bridge socket now requires
  a per-launch token (compared via `crypto.timingSafeEqual`), enforces
  `0600` perms on the socket file, and times out unauthenticated frames
  in 5 s.
- **MCP SDK transitive CVE sweep** — audited transitive dependencies of
  `@modelcontextprotocol/sdk` and pinned forward off two advisory-flagged
  versions.
- **Streaming-channel error redactor parity** — the streaming IPC path now
  pushes errors through the same redactor as the request/response path,
  closing a gap where streamed errors could leak internal codes.

### Refactor

- **Mutating IPC channels → envelope pattern** — twelve-step refactor
  migrating every mutating channel domain to `wrapEnvelope(channel, log,
  withSchema(zod, fn))`. Documented as the `ipc-envelope-handler` and
  `per-domain-channel-module` patterns. Net effect: every wire crossing is
  now schema-validated, error-redacted, and uniformly shaped.
- **Tabs state lifted to context** — chat tab state moved out of the
  route component into a `<TabsProvider>` so tab-body unmount/remount no
  longer rebuilds the per-tab message log. Documented as the updated
  `context-hook-pair` pattern.
- **Shared vitest spy logger factory** — duplicated `vi.fn()`-spy logger
  shapes across IPC channel tests collapsed into a single
  `makeSpyLogger()` factory. Inconsistency flagged by `gate-patterns`,
  closed in-release.
- **Session-service stale Phase 11/12 null shims removed** — Phase 11 and
  12 backward-compat shims (now unreachable) deleted; one fewer set of
  always-null branches.

### Tests

- **Test-coverage adversarial pass** — three feature-scoped sweeps closing
  coverage gaps from prior releases: ingestion edges (DOCX image
  boundary, PPTX fallback fixture), state-and-config edges (cancel under
  adversarial timing, rapid-save draft churn, engine-id rename under
  unavailable storage), UI assertion gaps (sub-agent collision, update
  banner content hash).
- **Engine-config shape + envelope migration integration** — two previously
  parked test-gap stories promoted into the release: explicit coverage of
  the encrypted-at-rest engine-config service + UI flow, and an
  integration test that exercises every envelope channel end-to-end.
- **SDK wall-clock timeout disable + streaming-error redaction** — new
  tests pin the wall-clock timeout-disabled posture and the streaming
  channel's error-redaction parity with the request/response path.
- **Tool-bridge auth window + frame boundaries** — explicit tests for the
  5 s auth timeout and the socket's frame-boundary handling.
- **Composer queue exam-lockdown regression** — added a regression test
  pinning the composer-queue behavior under exam-mode lockdown.

### Cleanup

- **Six gate-cruft removals** — unused `cleanupFn` in
  `executePersistedQuery`; `theme-tokens-test` unused `.join()`; stale
  Phase 11/12 null shims in `SessionServiceImpl`; dead optional-guard in
  `praxis.quickCheck.*` channel; empty `maxTokens` spread in
  `claude-code/vision.ts`; `Number.isFinite` modernization in the
  pacing/stream helpers.

### Documentation

- **Rolling-foundation roll-forward (10 findings)** — `CLAUDE.md` updated
  for the `document_scopes` polymorphic primitive; ROADMAP Phase 16 brought
  to current; UX prompt-customization v2 surface and "Tutor workspace"
  nav label reconciled; CURRICULUM bootstrap-mode tool list updated for
  `course.list_drafts`. Pattern-skill staleness swept: `mode-tool-scoping`
  (`retrieve_from_textbook` → `retrieve_from_documents`),
  `context-hook-pair` (tabs lifted), `shared-test-fake-factories` +
  index (`noopCourseDocuments` → `noopDocumentScopes`),
  `tab-body-isolation` (chat.tsx line anchor), and
  `mode-prompt-fragment-composition` (in-course-behavior addendum).
- **Four new pattern skills** codified by the patterns gate:
  `ipc-envelope-handler`, `per-domain-channel-module`,
  `resizable-side-panel-hook`, `electron-ipc-test-harness`.

## v0.1.1 — 2026-05-12

Iteration release on the v0.1.0 base. Focuses on tutor-side authoring quality
(durable bootstrap drafts, expressive draft API, in-flight cancel, structured
questions), security hardening (apiKey encrypted at rest, signed-update-feed
verification), additional document formats (PowerPoint + cleaner DOCX path),
and chat-surface transparency (sub-agent channel, stream pacing).

### Features

- **Bootstrap readiness** — the explorer now persists its draft state to
  SQLite (`SqliteDraftStore`), so refreshing or restarting mid-bootstrap no
  longer loses the work. The draft API gained query and edit-ops tools that
  let the agent revise unit/lesson/concept drafts in place, plus
  `course.list_dangling_refs` to surface broken back-references before commit.
- **In-flight affordances** — cancelling a turn now propagates through the
  full IPC path to `conv.abort()` in the Claude Code adapter. The new
  `interrupted` `EngineEvent` variant carries `reason: "user_cancel" |
  "engine_abort"` so the UI can distinguish a deliberate cancel from an
  adapter-level abort.
- **Structured questions** — new `ask_student_question` tool surfaces an
  inline `<StructuredQuestionCard>` in the chat thread; the tool blocks until
  the student answers via the same IPC family that powers quick-checks. Used
  by bootstrap / configure flows where the agent needs to disambiguate intent
  without yielding the turn.
- **Agent transparency UX** — sub-agent runs (e.g. the bootstrap explorer)
  now surface a `<SubAgentBlock>` inline next to the parent `tool_call`,
  streaming `step_started` / `step_settled` / `phase_changed` events through
  the new `praxis.subAgent.*` IPC family. MCP `callId` propagation
  (`ToolDispatchMeta` → `ToolContext.callId`) keys events to the originating
  tool_call.
- **Prompt customization layers** — two new authoring slots: a cross-mode
  `user-global` fragment (Settings) and a per-mode `user-append` fragment
  (Configure prompt tab). Backed by `PromptCustomizationServiceImpl`;
  injected into the system prompt via `additionalFragments` at session open.
  Audit log records character counts only — secrets pasted into prompts
  never reach the audit trail.
- **PowerPoint ingestion** — `.pptx` files now ingest via `PptxIngestor`
  (`officeparser` for the AST). Embedded figures land in the new
  `EmbeddedImageStore` content-addressed under the document.
- **Onboarding completion** — the engine step in `<OnboardingFlow>` now
  offers inline Claude Code sign-in next to the engine selector (no more
  "happens in your first session"). Picking a canonical pack pre-seeds the
  course-card on the home tab so the next launch lands ready-to-tutor.

### Security

- **API key encrypted at rest** — Electron `safeStorage` (Keychain on macOS,
  DPAPI on Windows, libsecret / kwallet on Linux) protects the stored
  apiKey via `ElectronSafeStorageAdapter` (the new `SecretStorage` port).
  On platforms with no OS keyring, the config service refuses to persist
  the key and instructs the user to use `PRAXIS_API_KEY` instead. Legacy
  plaintext rows migrate forward on the next write.
- **Signed update feed** — `praxis.update.checkLatest` now verifies the feed
  payload with an Ed25519 detached signature against a baked-in public key.
  Tampered feeds are rejected; the banner only surfaces verified entries.

### Fixes

- **Attach-document flow** — `course.attach_document` removed from
  `bootstrapMode.toolNames` (it can't run before a course exists); stays
  available in `configureMode` where a course is already in scope.
- **Block Claude Code builtins from tutor** — the tutor's MCP bridge no
  longer leaks Claude Code's built-in tools alongside the Praxis tool set.
- **QuickCheck `ToolContext` wiring** — `quick_check.*` handlers now
  receive the populated `ctx.services.quickCheck`; missing-service crashes
  resolved.
- **Embedded image store delete cascade** — deleting a document cleans up
  its image directory; `dirFor` abstraction landed for both stores
  (`EmbeddedImageStore`, `PageImageStore`).
- **PPTX slide-image map dead-fallback** — unused fallback branch removed
  during ingestion; correct path now exercised on all real fixtures.

### Refactor

- **DOCX ingestor cleanup** — switched to `mammoth.convertToMarkdown()`,
  retiring the regex-strip-from-HTML pipeline; shares the embedded-image
  store with PPTX.
- **Editorial polish pass** — theme tokens normalized, notes markdown
  styling tightened, concepts navigation cleaned up, styling sweep across
  the shared design-system primitives.
- **Root-tsconfig typecheck coverage** — `pnpm typecheck` now covers
  `tests/` and `scripts/` via the root tsconfig; the typecheck gate catches
  type errors in non-package code that previously slipped through.

### Documentation

- Rolling-foundation roll-forward for `CONTRACT.md`, `ARCHITECTURE.md`,
  `ROADMAP.md`, `ONBOARDING.md`, and the pattern-skill catalog. New
  patterns codified: `batch-tool-per-item-results`,
  `shared-test-fake-factories`.

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
