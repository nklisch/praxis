# Praxis — Roadmap

Built solo with AI assistance throughout. Phases are chunky — vibe-code each phase, hit the test checkpoint, ship. Each phase produces a system that does something demonstrably new. v1 is local-first only; hosted (Postgres + WebSocket) ships in v2. Engines are foundational — all three adapters (Claude Code, Codex, Direct) ship in the core layer; primary dev target is Claude Code via `../claude-cli-sdk` so testing happens on the existing CLI subscription, not on a paid API key.

Three integration milestones along the way: **M1** end-to-end tutor session (Phase 3), **M2** end-to-end course progression (Phase 9), **M3** shippable v1 (Phase 19).

## Shipped non-phase chunks

These landed alongside the numbered phases but don't carry a phase number of their own:

- **Activity rail** — replaced the `IngestionProgress` blocking modal. `<ActivityRail>` is mounted at the router root and surfaces ambient progress for ingestion, indexing, and grading. Producers inject `ActivityRegistry` via `ServiceDeps.activity`. Design: `docs/designs/activity-rail.md`.
- **Language sandbox registry** — QuickJS WASM (`quickjs-emscripten`) replaces `isolated-vm` for JavaScript execution. No native build required; no ABI dance. `CodeSandboxImpl` is registry-based with `QuickJsLanguageSandbox` and `PyodideLanguageSandbox` adapters. Design: `docs/designs/language-sandbox-registry.md`.

---

## Phase 1: Foundation skeleton

**Goal:** A working pnpm monorepo with shared types, storage schema, and CI green on hello-world.

**Build:**
- pnpm workspace with all `@praxis/*` packages stubbed
- Shared types in `@praxis/core/types` (Engine, EngineEvent, Brief, ToolDefinition, Mode per CONTRACT.md)
- Drizzle SQLite schema for all v1 tables (artifacts, episodic, projection layers, gates, concepts)
- Migration tooling, seed scripts, vitest + eslint + prettier

**Test checkpoint:** `pnpm install && pnpm typecheck && pnpm test && pnpm db:migrate` all pass on a clean clone. `pnpm db:show` lists all tables.

---

## Phase 2: Engine layer + vertical-slice backend

**Goal:** A Node script can run a full tutor session end-to-end against any of the three engines; transcript persists.

**Build:**
- All three engine adapters in `@praxis/engines`, conforming to `Engine` interface:
  - **Claude Code adapter** (primary dev target). Resolves `claude-cli-sdk` via pnpm `link:../claude-cli-sdk` for local development; brief → Claude Code session with in-process MCP server bound to `@praxis/tools`; internal-loop event projection
  - **Codex adapter**. Brief → Codex SDK invocation with function-declaration tool registration; event projection
  - **Direct adapter**. Wraps Vercel AI SDK; framework drives the loop; provider param selects Anthropic / OpenAI / Google / local; API key from config
- Engine selection from config (default Claude Code locally; Direct if API key set)
- Brief composition (system prompt assembly from prompt fragments)
- Minimal `teach` mode (prompt fragments, no tools yet)
- Episodic event stream → SQLite (immutable append-only)
- Tool dispatch shell (registry + dispatch path)
- Engine conformance test suite — same input must produce same normalized event shape across adapters

**Research:** Claude Code SDK shape at `../claude-cli-sdk` (MCP registration, session API, event types); Codex SDK current tool format; Vercel AI SDK provider configuration.

**Test checkpoint:** `pnpm script:run-session "Explain photosynthesis briefly" --engine=claude-code` streams a response. Same with `--engine=codex` (if installed) and `--engine=direct --api-key=$ANTHROPIC_API_KEY`. `pnpm db:episodic` shows three transcripts with equivalent normalized event shapes. `pnpm test:engines` (conformance suite) passes.

---

## Phase 3: UI shell + IPC transport + chat

**Goal:** Open the Electron dev app, type to a tutor, see streamed responses.

**Build:**
- `@praxis/desktop` Electron host (main spawns `@praxis/core`, mounts IPC server)
- IPC transport (server in core, client in `@praxis/client`)
- `@praxis/ui`: Vite + React + TanStack Router shell, chat surface with streaming
- Settings UI for engine selection (Claude Code default; switch to Direct + API key if desired)

**Test checkpoint:** `pnpm dev` opens Electron. Default Claude Code engine connects via local CLI subscription. Type message; see streamed response. Event log in dev tools shows normalized model_message events.

**Integration milestone M1:** UI → IPC → core → engine → response → episodic → display all wired across all three engine adapters.

---

## Phase 4: Verification tools (math + code)

**Goal:** Tutor grades math symbolically and runs code in a sandbox.

**Build:**
- `grade_math` tool: sympy via Python subprocess, `tier: "deterministic"`
- `code_sandbox` tool: timed JS/Python execution
- Tools registered in `teach` mode; dispatch wired into all three engine adapters
- Verification round-trip helper (re-render LaTeX, validate)

**Research:** sympy subprocess vs. pyodide. Subprocess for v1 (Python already needed for ingestion).

**Test checkpoint:** Ask "is `2x + 5 = 11` solved by x = 3?" — tutor calls `grade_math`, gets `{correct: false, expected: 3}`, explains. tool_call event in transcript. Same behavior across all engines.

---

## Phase 5: Document RAG (multi-format ingestion + vision)

**Goal:** Upload any common study document — PDF, EPUB, DOCX, HTML, Markdown, plain text — ask about its contents, get cited answers. Math-heavy or scanned PDFs use the configured engine's native vision (no separate API key).

**Build:**
- `Ingestor` port + dispatcher in `@praxis/tools/runtime/ingestion/`
- Six default ingestors: `PlainTextIngestor`, `MarkdownIngestor`, `HtmlIngestor` (Readability), `DocxIngestor` (mammoth), `EpubIngestor` (epub2), `JsPdfIngestor` (pdfjs-dist for text-layer PDFs)
- `VisionCapability` on the `Engine` interface; per-adapter implementations: Direct uses Vercel AI SDK image content; Claude Code + Codex use pass-through via their SDKs' native file-reading tools so the user's CLI subscription handles vision billing — no separate API key
- `VisionPdfIngestor` — pdfjs-dist renders pages → engine vision describes; selectable per-document for math-heavy or scanned PDFs
- `VectorStore` port + `sqlite-vec` adapter (prebuilt binary; ABI-independent so no electron-rebuild)
- Local embedding via `@huggingface/transformers` v4 (bge-small-en-v1.5, 384d, ~33MB on first use)
- `retrieve_from_textbook` tool with citations; `[1]` `[2]` chip parsing in chat UI
- File picker + ingestion progress streaming + document list sidebar

**Research:** `sqlite-vec` integration with better-sqlite3; `@huggingface/transformers` v4 for local embedding; per-engine vision pass-through patterns (Claude Code SDK file reading, Codex SDK file inputs, Vercel AI SDK image content).

**Test checkpoint:** Drop a markdown notes file → indexed instantly. Drop a DOCX handout → instantly. Drop a textbook EPUB → indexed in seconds. Drop a PDF → choose JS or vision parsing. Ask "what does chapter 3 say about respiration?" → get cited answer with `[1]` `[2]` chips that scroll to source cards. Citations work across all three engines.

**Deferred to post-v1**: local Marker (Python sidecar with PyTorch + ~2GB model + GPU recommended) for power users who want fully offline equation OCR; see "Future enhancements" at the bottom of this document.

---

## Phase 6: Course + lesson + bootstrap

**Goal:** Author a course conversationally; tutor navigates lessons.

**Build:**
- Course / Lesson / Reference schemas + state machine (`lesson_progress`, `concept_progress` tables)
- Course-navigation tools in `teach` mode (`course.what_can_i_teach`, `course.start_lesson`, `course.current_concept`, `course.mark_studied`)
- New `bootstrap` mode + draft-authoring tools (`course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`) — bootstrap is conversational; the user refines the proposed course in dialogue with the agent
- Concept-extractor agent: one-shot fresh engine session reading ingested document chunks; returns proposed concepts, edges, lessons; persisted on `course.confirm_draft`
- Course context loaded into `teach` system prompts at session bootstrap (current lesson, concepts studied/unstudied, references, suggested strategy)

**Test checkpoint:** Drop syllabus + textbook through Phase 5 ingestion. Open a `bootstrap` session, ask the tutor to draft a course; refine via conversation; confirm. Confirmed course appears in /courses. Open a `teach` session against the new course — the tutor's first message references the active lesson and concepts.

---

## Phase 7: Adaptive memory (semantic + misconception)

**Goal:** System tracks concept mastery over time and surfaces misconceptions.

**Build:**
- Semantic memory (BKT-based `ConceptMastery` with exponential decay at read time)
- `Indexer` port + `IndexerOrchestratorImpl` (debounced post-turn + synchronous session-end)
- `MasteryIndexer` (deterministic post-turn): scans episodic events for grade/course signals; applies BKT updates via `applySignalsToConcept`
- `MisconceptionIndexer` (agent-driven session-end): one-shot LLM pass over full transcript; deduplicates by `(studentId, conceptId, errorForm)`
- `update_mastery` and `record_misconception` active-path tools (teach mode)
- `MemoryServiceImpl` (reads + export + delete); `MemoryClient` real implementation
- `praxis.memory.*` IPC channels including streamed `episodic`
- Course-context fragment updated with graduated mastery tags (`mastered / in progress / not yet started`)
- `pnpm db:mastery` CLI script

**LLM mastery refinement deferred to Phase 7.x** — `Indexer` interface accommodates it as a one-file addition.

**Test checkpoint:** Multi-turn session with deliberate wrong answers. `pnpm db:mastery` shows updated scores; misconception entries with evidence event IDs. Next session system prompt shows graduated mastery tags instead of binary studied/not-studied.

---

## Phase 8: Multi-mode + assessment

**Goal:** Tutor authors quizzes / homework / exams; student takes them as structured artifacts in the chat surface; server grades each item; agent narrates per-item feedback.

**Build:**
- Three new modes (`quiz`, `homework`, `exam`) — distinct prompt fragments + tool subsets; same chat surface; chat composer disabled in exam mode while assignment is unsubmitted
- `AssignmentServiceImpl` with per-item grader dispatch (`MathGrader` / `CodeGrader` / `MultipleChoiceGrader` / `ShortAnswerGrader` / `FreeResponseGrader`); registry-driven (single source of truth)
- **Per-criterion 0-10 rubric grading** via shared `runRubricAgent` helper. The agent scores each criterion with an integer 0-10 + rationale; the system computes the 0..1 aggregate deterministically as a weighted sum. Allowed in all modes including exam (verification stance preserved by explicit pre-authored rubric + per-criterion auditability + deterministic aggregation).
- **Optional `workRubric` per item** for partial credit on shown work (math/code only). Agent decides per-item at create time whether to add it; deterministic check + work rubric blend via `primaryWeight`. Defaults: 0.5 for quiz/homework, 1.0 for exam.
- **Approach feedback layer** as a fallback: enriches feedback for items WITHOUT a rubric or workRubric in quiz/homework; skipped for exam. Items with rubrics get richer feedback through per-criterion rationales directly.
- Resumable per-item progress (`assignment_responses` table with optional `work` column; auto-save with 1s debounce)
- Active-path tools: `assignment.create` (teach mode, with detailed authoring guidance for workRubric heuristics), `assignment.show`, `assignment.read_grade` (assessment modes)
- UI: `<AssignmentCard>` rendered inline in chat when session has `assignmentId`; structured per-item input with optional "show your work" field; tone-coded post-submission feedback with collapsible per-criterion breakdown
- `praxis.assignments.*` IPC + `AssignmentsClient`
- `pnpm db:grades` CLI

**Deferred to a later phase**: configurator-authored assignments (Phase 11 configure mode); sketch input for assignments (Phase 13); photo upload for handwritten work (Phase 13); gate auto-evaluation on exam pass (Phase 9); canonical pre-made assessment packs (Phase 10 / Phase 15); per-criterion deterministic kinds (Phase 14 — e.g., key-term-presence criteria graded without LLM).

**Test checkpoint:** Tutor in teach mode authors a 5-item quiz on the active concepts. Student starts a quiz session; the `<AssignmentCard>` renders inline with the items. Student answers (some correctly, some not), submits. Server grades; per-item feedback renders inline (color-coded, with approach feedback for incorrect items). Grade artifact is in DB; `pnpm db:grades` shows the result. Agent narrates feedback in chat after the student asks "how did I do?" or naturally on the next turn.

---

## Phase 9: Gates + progress map

**Goal:** Gates evaluate at session-end against mastery + grades; locked content stops the agent from acting on it; passing an assessment unlocks the next gate; progress map renders the path; agent narrates unlocks.

**Build:**
- `GateEvaluator` port + `GateEvaluatorImpl` (pure, lives in `@praxis/curriculum/gates`)
- `MasteryReader` + `GradeReader` adapter ports (Phase 7's `MemoryServiceImpl` and Phase 8's `AssignmentServiceImpl` implement them)
- `ArtifactsService.evaluateAndPersistGates` runs evaluator at session-end inside `SessionService.end`; transitions are atomic; unlock events written to `gate_unlock_events`
- Brief composer extension: bounded visibility window (current lesson full detail; next lesson with lock tag; remaining count; active-gate "working toward" line)
- Tool lock enforcement: `course.start_lesson`, `course.mark_studied`, `assignment.create` all refuse with descriptive errors when the target lesson/concept is locked
- React Flow progress map at `/courses/:courseId/map` (concept nodes colored by mastery; gate edges between lessons; click → side panel)
- Courses-list "newly unlocked" badge via `gate_unlock_events.viewedAt`; agent narrates unlocks at start of next session
- `pnpm db:gates` CLI script

**Test checkpoint:** Course with three gated lessons. Mastery reaches threshold → session end evaluates and unlocks gate → next session brief includes "Newly unlocked" fragment → `gate_unlock_events` row written. Tool lock test: `start_lesson` on locked lesson throws.

**Integration milestone M2:** bootstrap → learn → assess → unlock → progress all wired.

---

## Phase 10: Knowledge graph + canonical math pack ✓ SHIPPED

**Goal:** Ship a curated Algebra 1 / Geometry concept graph; courses built from it route by prerequisite.

**Build:**
- Concept / PrerequisiteEdge schemas + embedding generation (`@praxis/curriculum/schema`)
- `SqliteConceptEmbeddingsStore` + `PackImportServiceImpl` (`@praxis/curriculum/packs`)
- Pack import flow; pack-versioning manifest; idempotent re-import
- Adaptive router (`suggestNext` pure function in `@praxis/curriculum/router`): mastery
  uncertainty, interleaving, and spaced-review insertion via next-in-order / frontier /
  review / interleave reasons
- `course.current_concept` tool rewritten to use the adaptive router (additive output:
  `reason`, `masteryNow`, `uncertainty`, `reviews[]`, `interleaves[]`)
- Bootstrap-mode pack tools: `course.list_canonical_packs`, `course.use_canonical_pack`
- `BootstrapServiceImpl.createCourseFromPack`: groups pack concepts into lessons of 7,
  inserts course + lessons + skeleton gates in a single transaction
- `ArtifactsServiceImpl.concepts(courseId)`: exposes full concept list for a course via IPC
- `PacksClient` + IPC handlers: `praxis.packs.listAvailable`, `.listImported`, `.import`
- `pnpm db:packs` CLI: list imported packs; `pnpm db:packs --import <packId>` to import

**Test checkpoint:** `pnpm db:packs --import algebra-1` → pack in DB. Create course via
`course.use_canonical_pack`. Router selects concepts in lesson order, interleaves earlier
concepts, inserts decayed-concept reviews. 5 new test files (tools + core + client).

---

## Phase 11: Configure mode + lock + authoring UI ✓ SHIPPED

**Goal:** Parent or self-directed learner authors courses and tunes the system from a lock-gated UI.

**Build (landed):**
- `LockServiceImpl` — bcrypt code hashing + install-ID salt; in-process unlock flag; `lock_state` table
- `AuthoringServiceImpl` — audit-log boundary; every write calls `appendAction` after the underlying write; `configurator_actions` table
- `configure` mode — 25 tools (bootstrap + 11 authoring + 4 memory admin); 7 prompt fragments; `uiSurface: "configure"`; lock-gated in `SessionServiceImpl.start`
- 16 authoring/memory tools: `course.edit`, `lesson.{create,edit,delete}`, `gate.{create,edit,delete,override}`, `prompt.{override_fragment,clear_fragment,set_style}`, `memory.{reset_concept,clear_misconception,export,delete_all}`
- Full IPC wiring: `praxis.lock.*` (6 handlers) + `praxis.author.*` (16 handlers, all behind `requireUnlocked()`)
- `LockClientImpl` + `AuthoringClientImpl` (real implementation replacing Phase 3 stub)
- `pnpm db:configurator-actions` CLI for audit-log inspection

**Deferred to UI phase:** Authoring UI split-pane, Gate editor (React Flow), Prompt customization form, Memory inspector tabs.

**Test checkpoint:** 999 tests pass (18 new for authoring-service + configure-mode). `pnpm typecheck` clean. Lock + authoring IPC handlers registered. Configure surface gated by lock when set.

---

## Phase 12: Workspace + notes + flashcards ✓ SHIPPED (backend)

**Goal:** Students take structured notes and review them via spaced repetition.

**Build:**
- Note / Flashcard DB schemas (notes + flashcards tables in @praxis/artifacts)
- NoteBody discriminated union (cornell / feynman / outline / free); FsrsScheduler port + FsrsSchedulerImpl wrapping ts-fsrs v5.3.2
- NotesServiceImpl (create, update, get, list, delete, fromSessionSummary via one-shot LLM)
- FlashcardsServiceImpl (create, update, get, list, delete, review, dueCount)
- 9 tools: note.create, note.update, note.show, note.list, note.from_session_summary, flashcard.create, flashcard.from_note, flashcard.review, flashcard.review_next
- IPC handlers for all 12 note + flashcard channels; NotesClient + FlashcardsClient
- `pnpm db:cards-due` CLI; teach mode updated with all 9 tool names + prompt fragment

**Deferred:** Workspace UI (Unit 10) handed to UI agent.

**Research:** FSRS reference TS implementation (ts-fsrs v5.3.2).

**Test checkpoint:** Take a Cornell note in a session. Generate flashcards. See FSRS-scheduled due dates. `pnpm db:cards-due` confirms.

---

## Phase 13: Editorial foundation ✓ SHIPPED

**Goal:** The whole app speaks one editorial visual language; the chat composer invites tutor-shaped requests; streamed model output reads as deliberate writing rather than machine output. **No structural changes** — this is a polish phase that establishes the design language all later phases inherit.

**Build:**
- Extend the editorial mode-header system (italic display serif + uppercase mono kicker; real typographic ornaments; whisper-faint mode tints; asymmetric hanging-ornament layouts) across all existing routes, modals, and empty states. System fonts only — no remote font fetch (CSP forbids), no bundled assets.
- Composer tutor-verb chip rail above the chat textarea. Mode-aware verbs prefill the input (e.g. *explain · quiz me on · let me try · show your work · slower* in teach mode). Chips are starter words, not autosend; the cursor lands ready for the student to keep typing.
- Eased streaming pacing in `useStreamedSend`: small ring-buffer + `requestAnimationFrame` release schedule + per-chunk fade-in. Same content, deliberate rhythm; reads as someone *thinking and writing*, not a machine.
- Editorial copy throughout — replace "No items found" / "Loading…" / generic error toasts with invitational lines that fit a tutor app (empty / loading / error / idle). Lives in a small copy module so future surfaces inherit the voice.
- Commitment to no notification badges, streak counters, or dopamine-tap surfaces. Editorial restraint is enforced by absence.

**Test checkpoint:** All routes use the editorial system. Composer in chat shows the verb chips; tapping one prefills the textarea with the cursor positioned to keep typing. Streamed text reads smoothly with no stutter on slow networks. Empty states everywhere read as invitations rather than absences.

---

## Phase 14: Tabs + Library ✓ SHIPPED

**Goal:** Multiple sessions of any mode run as parallel tabs in the chat workspace; a single Library replaces the courses / packs / documents trinity as the front door. Sessions become named arcs you can leave and come back to.

**Build:**
- Tab strip at the top of the chat workspace. Each tab is a live session of any mode; ornament glyph + name in the tab itself; tint colors the active-tab hairline. New tab `+` opens a quick session picker (mode + course + optional assignment).
- Tab persistence — open tabs survive app restart. Stored in `tabs` table (small: `id, sessionId, modeId, title, openedAt, lastSeenAt, archived`).
- Tab CRUD — open from any session-start affordance; close ends/archives the session; right-click for archive / rename. Sessions remain in the archive after their tab closes; reopening one reopens its tab.
- `/library` route replaces `/courses` and `/packs`. Editorial table-of-contents listing: courses (in progress, unstarted), packs (available with "Use this pack" CTA — no bootstrap detour), documents, recent sessions. Each item's primary action opens a new tab. The mental model unifies: a Library has materials and a record of your reading.
- Session archive — closed sessions remain visible in Library with auto-generated summaries (the Phase 12 `notes.from_session_summary` machinery, repurposed). Past arcs are browsable like a reading list.
- All session-start entry points (course-detail "Start", assignment "Begin", "New course", Library) open a new tab rather than replacing the current chat.
- Each tab still uses the existing chat surface inside (modality work lands in Phase 16).

**Research:** TanStack Router multi-instance route patterns; how `/chat/:tabId` handles deep-link reopening; whether tab state should live client-side (renderer state machine) or main-process-side (shared across renderer reloads).

**Test checkpoint:** Open three sessions of three different modes; switch between them via tabs. Close one, restart the app; the other two are restored, the closed one is in the Library archive. Library shows packs alongside courses with one-click "Use pack" affordances; no bootstrap detour required. Past closed sessions are browsable with summaries.

---

## Phase 15a / 15b: Sketching + concept map (tldraw) ✓ SHIPPED

**Goal:** Stylus-friendly sketching everywhere typing is allowed; student-authored concept maps; tutor reads JSON + image. Foundation primitive that Phase 16's modality bodies depend on.

**Build:**
- tldraw integration in chat input, submission, workspace (`format: "sketch"` Note)
- Sketch input pattern: `sketch.read` returns `{ json, image }`; image rendered server-side
- ConceptMapDrawing artifact + spatial editor surface
- Concept-linking (element ↔ canonical concept) + canonical-hint toggle
- Coach divergence-detection indexer
- Vision OCR for sketched math via engine adapter; verification round-trip
- **Embedded image extraction during ingestion (Phase 5 follow-up)**: pdfjs-dist image XObjects from PDFs, mammoth.js custom converter for DOCX images, epub2 chapter image refs for EPUBs. Images stored content-addressed under the document; chunks reference them via `imageRefs[]`. Chat renders inline thumbnails when the agent cites a chunk with image refs; click to enlarge in a side panel. Reuses the image-rendering UI patterns built for tldraw and `praxis.documents.pageImage`.

**Research:** tldraw v4 SDK API; iPad Safari Pointer Events; pdfjs-dist image XObject extraction; mammoth.js image converter API.

**Test checkpoint:** On iPad Safari with Pencil, sketch `2x + 5 = 11` and steps. Submit — sympy validates final answer; feedback shown. Concept-map: draw 3 concepts + edge; toggle canonical hints; see ghosted suggestions. Re-ingest a textbook PDF — embedded figures now appear as inline thumbnails when the tutor cites pages that contain them.

---

## Phase 16a: Bootstrap explorer + course-scoped documents ✓ SHIPPED

**Goal:** Replace the single-shot `course.propose_draft` with an agentic multi-turn exploration loop. The bootstrap agent reads uploaded materials deeply and produces a richer draft with units, lessons, and assessment shells.

**Build:**
- `course.start_exploration` tool — entry point for the multi-turn bootstrap explorer. Spawns a fresh engine session scoped to the attached documents.
- Explorer reads documents via `document.outline`, `document.list_sections`, `document.read_pages`, `retrieve_from_textbook`.
- Draft mutation tools: `course.draft_add_unit`, `course.draft_set_assessment_plan`, `course.draft_add_lesson_assessment` — the explorer builds the draft incrementally.
- `persistDraft` materialises units + lessons + assessment shells in one transaction on `course.confirm_draft`.
- `course_documents` join table + `CourseDocumentsServiceImpl` — links ingested documents to specific courses so the explorer's retrieval is scoped.
- `Unit`, `LessonAssessment`, `AssessmentPlan` types added to `@praxis/artifacts`.
- Bootstrap mode toolNames updated: `course.start_exploration` replaces `course.propose_draft`.

**Test checkpoint:** Drop a textbook PDF → ingest. Open bootstrap session → `course.start_exploration` → explorer reads chapters → draft contains units + lesson assessments + assessment plan. Confirm → course has structured `assessmentPlan`.

---

## Phase 16b: Modalities per mode + assessment loop ✓ SHIPPED

**Goal:** Each mode has its own embodied UI shape inside its tab. The teach-mode tutor can author assignments that spawn child sessions; when the student submits, the tutor is notified and narrates feedback.

**Build:**
- Tab body component shape per mode, dispatched by `session.modeId`:
  - **teach** — chat as today (nothing changes)
  - **quiz** — flashcard rhythm: one item at a time, large display typography, keyboard-driven (`Space` = next, `1`–`4` = confidence rating after answering). Tutor visible as a side strip the student can summon.
  - **homework** — paginated problem set; per-problem workspace combining sketch (Phase 15 primitive) + typed input + chat side-rail. Auto-saves on each navigation.
  - **exam** — proctored full-tab; timer in the kicker; problem-by-problem nav; sketched and/or typed answers; AI agent restricted to `clarification` tool only.
  - **bootstrap** — canvas with a side outline of the course being built.
  - **configure** — already largely its own surface; editorial polish.
- `parent_session_id` column on sessions and assignments tables.
- `assignment.create` records `parentSessionId` on the assignment linking back to the teach session.
- `SessionService.spawnFromAssignment()` opens a child session whose `parentSessionId` links back.
- `SessionService.notifySession()` injects a `system_note` event into a running parent session.
- `system_note` `EngineEvent` variant + `SystemNoteOrigin` discriminated union.
- `useAssignmentIssuedSpawn` hook — renderer auto-opens a child tab in the right modality when `ActivityItem.metadata.kind === "assignment.issued"` lands.
- `<SidekickPanel>`, `<ClarificationPill>` — exam-mode UI affordances.
- `clarification` tool — rephrase a confusing prompt; never reveals method or answer.
- Mode-aware composer chips extended for quiz / exam / bootstrap modes.

**Test checkpoint:** Teach session authors quiz. `useAssignmentIssuedSpawn` opens quiz tab automatically (no focus steal). Student submits in quiz tab. Teach-session tutor receives `system_note` with grade summary and narrates feedback. In exam mode, asking for help returns only a clarification.

---

## Phase 17: Item type expansion + inline quick checks ✓ SHIPPED

**Goal:** Expand the assessment item palette from five kinds to nine and introduce inline formative checks. The tutor gains a lightweight `quick_check.*` tool family for single-question probes mid-conversation — no assignment tab required, no context switch, just a card in the thread and a reaction in the same turn.

**Build:**
- Rename `multiple-choice` → `single-choice` (schema + migration + grader rename). Migration rewrites stored `items_json` blobs; hard cut — no backward-compat alias.
- Four new `AssignmentItem` kinds: `multi-select` (Jaccard partial-credit grader), `numerical` (value + tolerance + optional units + sig-figs), `matching` (pair-fraction grader), `ordering` (position-fraction grader), `two-tier` (answer + reason; each reason option maps to a misconception id; wrong reason emits a misconception evidence event automatically).
- `requireReasoning` modifier on `single-choice`, `multi-select`, and `two-tier` — student writes a justification; rubric-graded and blended with the deterministic selection score via the existing `blendDeterministicAndWorkRubric` helper.
- Per-kind grader files under `packages/core/src/services/graders/`; grader registry is the single source of truth.
- Drag-and-drop UI for matching (two-column with SVG line overlay) and ordering (vertical reorder list); pick-from-dropdown / up-down-button keyboard fallbacks toggled by a "use keyboard" affordance; reduced-motion and touch devices default to the accessible fallback.
- New `quick_check.*` tool family: `single_choice`, `multi_select`, `short_answer`, `matching`, `confidence` — five tools the tutor calls inline during a teach session. Formative only; no DB persistence; the tool call blocks until the student answers via IPC.
- `QuickCheckService` — in-memory pending-call map; emits typed events; `await(callId, item)` → `Promise<QuickCheckAnswer>`; `resolve(callId, answer)` and `cancel(callId)` for lifecycle management. IPC channels: `praxis.quickCheck.events.<streamId>` (streaming pending/resolved events) and `praxis.quickCheck.resolve` (student submission).
- `<QuickCheckCard>` rendered inline in the chat thread as a synthetic system message — thin border, "tutor asked" tag, item body, submit button. Locks on submission; correct/incorrect feedback shown when `correctIndex` was provided. Reuses the same per-kind item-body subcomponents as `<AssignmentItemCard>`.
- Teach mode prompt fragment update: explains when to use `quick_check.*` (formative, mid-explanation) vs. `assignment.create` (summative, gradeable, own tab); item-kind reference with pedagogical notes.

**Research:** Drag-and-drop library fit on the React 19 stack — verify whether `@dnd-kit/core` is already in the project's dependencies; if not, evaluate it vs. a hand-rolled pointer handler. Accessibility patterns for matching exercises (keyboard pairing semantics). Force Concept Inventory–style two-tier item authoring conventions for the pedagogy pack.

**Test checkpoint:** Open a teach session; ask the tutor to check understanding mid-explanation; verify a `<QuickCheckCard>` appears inline; answer; confirm the tutor's next message reacts to the response. Author an assignment containing one item of each new kind via the configurator; take it; verify each kind renders correctly, accepts input, and grades as expected. On a two-tier item, deliberately pick a wrong reason whose `misconceptionByReasonIndex` entry is non-null; submit; confirm a misconception evidence event lands in `pnpm db:mastery`.

---

## Phase 18: Study-skills + pedagogy pack + remaining memory ✓ SHIPPED

**Goal:** Dedicated metacognition coach mode plus the procedural / affective memory it relies on.

**Build:**
- Pedagogy pack format + v1 content (strategies, techniques, metacognitive prompts, citations)
- `study-skills` mode (curriculum delivery)
- Metacognitive prompt injection across other modes (pre-reading, post-error, session-end)
- Procedural memory + indexer (strategy preference inference)
- Affective memory + indexer (engagement / frustration / confidence)
- Coach voice / visual treatment in modes

**Research:** review citations; confirm BKT + FSRS held up under real evidence.

**Test checkpoint:** Run study-skills session on Cornell notes. Run several teach sessions; procedural memory reflects strategy preferences. Force a frustration trigger; difficulty backs off next item.

---

## Phase 19: Biology canonical + Electron packaging + ship ✓ SHIPPED

**Goal:** Shippable v1 — signed installer for at least one platform with both canonical packs.

**Build:**
- Biology canonical pack (NGSS-mapped, ~250 concepts)
- electron-builder pipelines for macOS / Windows / Linux
- Code signing for macOS (Apple Developer cert)
- Installer flow + first-run onboarding
- `praxis-ingest` distribution (PyPI or bundled)
- Final `pnpm test:e2e` integration suite

**Test checkpoint:** Build signed installer. Install on clean machine. Self-onboard with real syllabus + textbook. Session, sketch math, submit homework, pass exam, unlock, notes, flashcards. All works without dev tools.

**Integration milestone M3:** shippable v1.

---

## Future enhancements (post-v1)

Items with a clear owner-defined trigger to revisit, but explicitly out of scope for v1.

### Local Marker for advanced PDF parsing

**Why deferred from Phase 5**: Marker (the best-in-class structure-aware PDF parser with native LaTeX equation OCR) requires PyTorch + ~2 GB of model downloads + a discrete GPU or Apple Silicon to be usable. On Intel laptops and budget hardware (a meaningful portion of student users) it falls back to CPU and takes 30 min – 2 hours per textbook, which is unacceptable as a default. Phase 5 instead ships a JS tier (text-layer PDFs + DOCX + EPUB + HTML + Markdown + text) and a vision tier that uses the configured engine's native vision via pass-through (no separate API key).

**Trigger to add**: a power-user request, OR a meaningful share of users who want fully-offline equation OCR (no engine API call for parsing) AND have appropriate hardware. The `Ingestor` port shipped in Phase 5 makes adding `MarkerIngestor` a self-contained addition: one new ingestor class + the `python/praxis-cli/` Python sidecar package + uv-installable distribution. Roughly 1-2 days of work plus tested cross-platform packaging. The Phase 5 ingestor architecture and the Python sidecar boundary documented in SPEC.md are both already in place.

### Other deferred items

- **Vision-capable Claude Code / Codex pass-through optimization**: Phase 5 ships pass-through but uses one-shot SDK sessions per page (clean isolation). A future optimization could batch multi-page calls to reduce subscription/API overhead.
- **PDF page rendering in citation cards**: Phase 5 cards show extracted text + page number; rendered page images would require pdfjs-dist in the renderer process. Couples to Phase 13 vision work.
- **Hybrid keyword + vector search**: pure vector for v1; BM25 layer is a future polish.
- **EPUB-with-images, RTF**: skipped in Phase 5 by deliberate format-set choice; revisit if user demand emerges.
- **Image OCR for raw photo uploads (PNG/JPG)**: Phase 13 territory (vision OCR for handwritten student work uses the same path).
