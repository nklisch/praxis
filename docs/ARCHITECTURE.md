# ARCHITECTURE

How Praxis fits together. `SPEC.md` chooses the pieces; this document describes their interactions, dependency direction, and lifecycle. Concrete interfaces are formalized in `CONTRACT.md`.

## Mental model

Praxis is **an agent harness specialized for tutoring**. The tutor is always a model agent looping over tools; the framework's job is to give the agent the right tools, the right structured artifacts to operate on, the right memory to read from, and the right environment per mode.

```
                ┌─────────────────────────────────────────────┐
                │                  UI Surfaces                │
                │  (chat workspace, progress map, configure)  │
                │     <TopNav> + <StatusStrip> at router root │
                │     (<StatusStrip> is the live ambient-     │
                │      progress surface beneath <TopNav>;     │
                │      <ActivityRail> is retained but unused) │
                │                [@praxis/ui]                 │
                └─────────────────────────────────────────────┘
                                      ▲
                                      │ typed RPC + event subscription
                                      │ via @praxis/client
                                      ▼
                ┌─────────────────────────────────────────────┐
                │     Transport: IPC (Electron) | WS+HTTP     │
                └─────────────────────────────────────────────┘
                                      ▲
                                      ▼
                ┌─────────────────────────────────────────────┐
                │              Framework Core                 │
                │  modes · prompts · tools · artifacts ·      │
                │  memory · gates · curriculum                │
                │              [@praxis/core]                 │
                └─────────────────────────────────────────────┘
                                      ▲
                                      │ run(brief, tools)
                                      ▼ event stream
                ┌─────────────────────────────────────────────┐
                │              Engine Adapters                │
                │   Claude Code · Codex · Direct (Vercel AI)  │
                │             [@praxis/engines]               │
                └─────────────────────────────────────────────┘
```

The UI never imports `@praxis/core` directly — it goes through `@praxis/client`'s typed RPC over a transport. This holds in both deployments; only the transport implementation changes. The agent always loops inside an engine. The framework drives sessions, scopes briefs per mode, intercepts the event stream, projects memory, and persists state.

## Components

Praxis ships as a pnpm workspace monorepo. Every component is a TypeScript package. The `praxis-ingest` Python sidecar is deferred post-v1; ingestion is TS-native via the `Ingestor` port and per-format adapters in `@praxis/tools/runtime/ingestion/`.

| Package | Responsibility |
|---|---|
| **`@praxis/core`** | The agent harness. Brief construction, event stream consumption, mode runtime, tool registry, prompt composition. Owns the `run()` loop dispatch. Exposes a typed service interface consumed via transport. Houses `ActivityRegistry`, concept-graph indexers, draft persistence (`SqliteDraftStore`), prompt-customization layers (`PromptCustomizationService`), `SubAgentRegistry`, the signed-update verifier (`UpdateServiceImpl` + `update-feed-public-key`), the ingestion `Ingestor` port + per-format adapters, and `RecommendationServiceImpl` (priority-ordered Workbench "what's next" queue — aggregates open sessions, due cards, low-mastery concepts, active drafts, and pending quick checks). |
| **`@praxis/client`** | Typed RPC client for the UI. Bundles two transport implementations (IPC for Electron, WebSocket+HTTP for hosted), selected at runtime. The only `@praxis/*` package the UI imports — enforces the UI/backend boundary. Imports `@praxis/core` types only (no runtime). |
| **`@praxis/engines`** | The three engine adapters (Claude Code / Codex / Direct). Each implements the engine contract. Also exports `runOneShot` (a one-turn convenience helper) used by `@praxis/core/services` indexers and the drafter at runtime. The rest of `@praxis/core` (outside `services/`) must not import `@praxis/engines`. |
| **`@praxis/memory`** | Episodic log, the four projection layers, indexer agents that compute projections, the export/import format, the BKT-inspired mastery model. |
| **`@praxis/artifacts`** | Schemas and persistence for courses, lessons, units, assignments, exams, gates, flashcards, notes, concept maps, lesson assessments. The "structured world" the agent operates on. |
| **`@praxis/tools`** | Verification tools (math via sympy, code sandbox, retrieval, vision, citation), pedagogy tools, course tools, drafter tools (`course.start_drafting`, `course.draft_*`), sketch tools, clarification tool, gating tools. Zod-typed schemas; engine-adapter-format conversion. |
| **`@praxis/curriculum`** | Mode definitions, pedagogy pack runtime, gating logic, adaptive routing, knowledge-graph schema, BKT-style mastery updates. |
| **`@praxis/ui`** | Vite + React + TanStack Router SPA. Student surface (chat + progress map + workspace + concept-map), configure surface (course authoring, gate editing, prompt customization), shared component library. Embeds tldraw for sketching surfaces and React Flow for the gate editor. Imports only from `@praxis/client`. |
| **`@praxis/desktop`** | Electron host. Starts `@praxis/core` in the Electron main process (or a forked child for isolation), mounts the IPC transport server, loads the Vite-built `@praxis/ui` static bundle in the renderer. Adds local-first conveniences (file picker, on-disk storage paths) and at-rest secret encryption via `ElectronSafeStorageAdapter` (the `SecretStorage` port implementation backed by OS keyring through Electron `safeStorage`). |
| **`@praxis/claude-cli-sdk`** | In-tree TypeScript wrapper around the Claude Code CLI subprocess. Forked from `@nklisch/claude-cli-sdk` and brought in-tree so the workspace deploy pipeline can resolve it. Consumed exclusively by `@praxis/engines`'s Claude Code adapter. Owned and modified freely — Praxis is the only consumer. |
| **`praxis-ingest`** | Python CLI (deferred post-v1). In v1, ingestion is TS-native via `Ingestor` port + per-format adapters in `@praxis/tools/runtime/ingestion/`. Ingestion progress surfaces inline via `<StatusStrip>` beneath the running head — no blocking modal. |

## Dependency direction

The dependency graph is strict. The productization invariant — that removing the CLI engine adapters cannot break anything else — is enforced by the dependency rules below.

```
@praxis/ui  ─────→  @praxis/client
                          │
                          │  typed RPC over transport
                          │  (no runtime crossing in either deployment)
                          ▼
@praxis/desktop ────→ @praxis/core
                          │
   ┌──────────────────────┼─────────────────────┐
   ▼                      ▼                     ▼
domain packages: curriculum, artifacts, memory, tools
                          │
                          ▼
                   @praxis/engines
                   (no @praxis/* runtime imports)
```

**Rules:**

- `@praxis/ui` may only import from `@praxis/client`. No path to `@praxis/core` exists at the type level.
- `@praxis/client` may import **types only** from `@praxis/core` (the service interface, error types, event types). No runtime code crosses.
- `@praxis/desktop` orchestrates: it depends on `@praxis/core` at runtime (main process) and bundles `@praxis/ui`'s static build (renderer). The renderer doesn't know it's in Electron — it just imports `@praxis/client` and gets the IPC transport at boot.
- `@praxis/engines` may not import from any other `@praxis/*` package. The engine contract lives in `@praxis/core` as a pure type definition.
- The four "domain" packages (`curriculum`, `artifacts`, `memory`, `tools`) may share types defined in `@praxis/core`, but cannot import from each other directly. Cross-domain logic lives in `@praxis/core`.
- `praxis-ingest` is consumed by `@praxis/core` as a subprocess; no in-process import.

## Transport layer

The UI does not import `@praxis/core` at runtime. It imports `@praxis/client`, which exposes a typed RPC surface mapped to `@praxis/core`'s service interfaces.

```
[ UI components ]
        │
        ▼
[ @praxis/client ] — typed RPC + event subscription
        │
        ▼
   transport (chosen at runtime by the host)
        │
   ┌────┴────────────┐
   ▼                 ▼
 IPC bridge       WebSocket + HTTP
 (Electron)       (hosted)
   │                 │
   ▼                 ▼
[ @praxis/core ]  [ @praxis/core ]
 (in main proc)    (Node service)
```

**Two transport implementations, one client API:**

- **IPC transport (Electron)**: `@praxis/desktop` starts `@praxis/core` in the main process (or a forked child). The renderer talks to core via Electron's `contextBridge` / IPC. Synchronous RPC for queries; an event channel for the streaming agent loop.
- **WebSocket + HTTP transport (hosted)**: `@praxis/core` runs as a Node service. The SPA connects via WebSocket for the streaming session loop and via HTTP for stateless queries. Standard auth (token in WS upgrade headers / HTTP `Authorization`).

**Why this matters:**

- The UI is identical between deployments. No conditional imports, no `if (electron) ... else ...` branches in components.
- The transport boundary is a typed contract — testable in isolation, mockable for UI development, explicit about what's an RPC vs. an event stream.
- Third parties can build alternative UIs against `@praxis/client` without touching core.

**Rough API shape (formalized in `CONTRACT.md`):**

```typescript
// session lifecycle
client.session.start(courseId, modeId): SessionHandle
client.session.send(sessionId, userMessage): EventStream
client.session.end(sessionId): SessionSummary

// queryable artifacts
client.artifacts.course(id): Course
client.artifacts.gates(courseId): Gate[]
client.artifacts.progress(): ProgressSnapshot

// authoring (configure mode)
client.author.createCourse(...): Course   // placeholder — v1 course creation goes through course-create mode tools
client.author.editGate(id, patch): Gate

// memory
client.memory.studentModel(): StudentModel
client.memory.misconceptions(): Misconception[]
client.memory.export(): MemoryExport
```

Event streams (the agent loop) flow over the same transport — emitted by the engine adapter through `@praxis/core` and surfaced to the UI as typed events.

## Session data flow

A typical student session, end to end:

```
1. Bootstrap
   └─ UI requests session start (via @praxis/client)
      ├─ @praxis/core: load student state
      │  ├─ @praxis/memory: read student model + recent episodic context
      │  ├─ @praxis/artifacts: load active course
      │  └─ @praxis/curriculum: evaluate gates → compute scope
      ├─ Mode resolution
      │  └─ @praxis/curriculum: select mode → load prompt fragments + tool subset
      └─ Brief composition
         └─ @praxis/core: assemble brief (system prompt + context + scope)

2. Agent loop (delegated to engine)
   └─ @praxis/core: engine.run(brief, tools) → event stream
      └─ @praxis/engines: engine adapter runs internal loop
         ├─ Model produces text → emit model_message event
         ├─ Model calls tool → adapter routes back to @praxis/tools
         │  ├─ @praxis/tools: dispatch (sympy / sandbox / retrieval / vision / etc.)
         │  └─ Result returned → emit tool_call + tool_result events
         └─ Loop continues until engine considers the turn done → emit final event

3. Intercept and persist (per event)
   ├─ @praxis/core: append event to episodic log
   │  └─ @praxis/memory: persist (immutable append-only)
   ├─ Trigger projection updates (debounced, after-turn)
   │  └─ @praxis/memory: indexer agents update semantic / procedural / affective / misconception
   └─ Update artifact state when tools mutated them
      └─ @praxis/artifacts: persist mutations (course progress, mastery, assignment state)

4. UI update
   └─ @praxis/client streams events to the UI over the transport
      ├─ Chat: model messages and selected tool I/O
      ├─ Progress map: gate state changes, unlock notifications
      └─ Workspace: artifact edits (notes, flashcards)

5. Session end
   └─ @praxis/core: finalize
      ├─ @praxis/memory: complete projection updates
      ├─ @praxis/curriculum: re-evaluate gates with new state
      └─ Surface unlock events to the student in the UI
```

Two important properties:

- **Memory is fed both passively and actively.** The intercept layer captures everything (passive). The agent also calls explicit tools like `record_misconception(...)` and `update_mastery(...)` to mark significant moments (active). Both flow into the same memory layer through different doors.
- **Gates re-evaluate at session boundaries, not mid-session.** Mid-session unlocks are confusing. Unlocks surface as accomplishments at session end: "you've unlocked Trigonometry — start a new session to begin."

## Storage architecture

Same logical schema, two physical engines.

**Local-first (SQLite + sqlite-vec):**

- Single SQLite file per user, in the OS app data directory (`~/Library/Application Support/Praxis/`, `%APPDATA%\Praxis\`, `~/.local/share/praxis/`).
- All artifacts, memory, vectors in one file.
- Drizzle migrations applied on startup.
- Backup is "copy the file."

**Hosted (Postgres + pgvector):**

- Per-account schema with row-level student isolation.
- Same Drizzle schema; Postgres-specific migrations applied via CI.
- Vectors in `pgvector` columns alongside relational data — no separate vector store.
- Backups are managed Postgres backups.

**`VectorStore` port**: `@praxis/memory` and `@praxis/tools` (retrieval) talk to a `VectorStore` interface. Two implementations (`SqliteVecStore`, `PgVectorStore`) selected at boot by deployment config.

## Engine adapter integration

Three adapters, one contract. The adapter's job is to translate between the framework's brief / tool / event-stream format and the engine's native shape.

**Claude Code adapter:**

- Consumes brief → renders a system prompt for Claude Code's expected harness shape.
- Tools registered via Claude Code's MCP server mechanism: the framework spins up an in-process MCP server bound to `@praxis/tools`.
- Internal Claude Code loop runs to completion.
- Stream interceptor projects model messages, tool calls, and tool results into normalized events.
- Final result extracted and returned.

**Codex adapter:**

- Same pattern using Codex SDK's tool/function format.
- Tools registered as Codex function declarations or via Codex's MCP support, depending on what's available in the SDK.

**Direct adapter:**

- Wraps Vercel AI SDK.
- Drives the loop itself: `streamText({ messages, tools })` → consume tool calls → dispatch via `@praxis/tools` → feed result back → repeat.
- Produces the same normalized event stream.
- Provider parameter (Anthropic / OpenAI / Google / local) selects the underlying SDK provider.

**Engine selection** is configured at deployment time. Local users pick in the configure UI; hosted defaults to Direct with Anthropic. The selected engine is **sticky per-session** — no mid-session switching, to keep transcripts and tool-call patterns consistent within a session for the indexers.

## Memory architecture

Five layers over an immutable episodic log.

```
        Event stream from engine adapter
                       │
                       ▼
              ┌──────────────────┐
              │  Episodic log    │  ←── append-only, immutable, source of truth
              │  (per session)   │
              └──────────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
   ┌─────────┐    ┌──────────┐    ┌──────────┐  ┌──────────┐
   │Semantic │    │Procedural│    │ Affective│  │   Mis-   │
   │(student │    │(strategy │    │(engagement│  │conception│
   │ model)  │    │ prefs)   │    │ patterns)│  │  list)   │
   └─────────┘    └──────────┘    └──────────┘  └──────────┘
        ▲              ▲               ▲              ▲
        │              │               │              │
        └──────┬───────┴───────┬───────┴──────┬──────┘
               │               │              │
        Indexer agents (background, per-session, debounced)
               │               │              │
               └─────── also fed by explicit tool calls
                       (record_misconception, update_mastery, ...)
```

**Semantic** is the student model — concept-graph annotated with mastery. Mastery scoring uses a Bayesian Knowledge Tracing (BKT) prior, updated by the indexer based on episodic evidence (correct/incorrect responses, time to respond, hint requests, exam outcomes). Mastery decays with time-since-practiced.

**Procedural** captures inferred preferences for *this* student — whether the tutor's "use a worked example" approach worked, whether Socratic on novel material frustrated them. Updated post-session by an indexer that compares strategy choice to outcome signals.

**Affective** captures engagement, frustration, and confidence patterns — sampled from transcripts (model-inferred sentiment) plus explicit student check-ins. Used by adaptive routing: back off difficulty when frustration spikes, push when boredom signals.

**Misconception** is an explicit list of wrong mental models the student has shown, each tagged with the concept it attaches to, the form of the error, evidence pointers, and a remediation strategy. The most actionable layer.

**Indexers** come in two flavors. Deterministic indexers (mastery, procedural) compute projection updates directly from explicit event signals — no LLM call. LLM-driven indexers (misconception, affective model-inferred path, concept-map divergence) call `runOneShot` from `@praxis/engines` to infer a projection update from recent episodic events. Both flavors run debounced after each session turn (or on session end), are non-fatal on failure, and are regenerable from episodic, so an indexer bug is recoverable.

## Tool dispatch architecture

Tools are defined in `@praxis/tools` with Zod schemas and runtime handlers. Engine adapters expose these to engines in their native format.

```
@praxis/tools (Zod schemas + handlers)
        │
        ▼
@praxis/engines/<adapter>
        ├─ register tools in engine-native format (MCP / fn decl / tool_use)
        ├─ when engine invokes a tool:
        │     ├─ adapter receives the call
        │     ├─ routes back to @praxis/tools handler (single source of truth)
        │     ├─ handler runs (sympy, sandbox, retrieval, vision, etc.)
        │     └─ result normalized + returned to engine
        └─ emit tool_call + tool_result events to the framework
```

This means:

- One implementation of `grade_math` that always uses sympy, regardless of which engine is active.
- Tool implementations may themselves call sub-agents (e.g., `course.start_drafting` runs the drafter agent; `grade_with_rubric` runs a small grader agent against the rubric). Sub-agent activity is published through `SubAgentRegistry` — the registry surfaces a `SubAgentItem` per parent `tool_call`, streams `step_started` / `step_settled` / `phase_changed` events, and is fanned out to renderers over the `praxis.subAgent.events` IPC family. The chat UI renders these inline as `<SubAgentBlock>` next to the originating tool_call. Tools key their items on `ctx.callId` (threaded in via `ToolDispatchMeta`); when `ctx.callId` is absent (tests, direct invocation) the registry returns null and the tool simply doesn't publish.
- Adding a tool is a single-place change: define schema + handler in `@praxis/tools`, register in the right mode's tool subset.

## Artifact lifecycle

Artifacts are the structured world the agent operates on.

```
Author  ──┐
          │   create / update via tools
Student  ─┼─→ @praxis/artifacts ──→ persisted in DB
          │   (course, lesson, assignment, exam, gate, flashcard, note)
Tutor   ──┘
                       │
                       ▼
            queryable by tools at session boot
            (course.what_can_i_teach(), gate.evaluate(), etc.)
```

**Authoring path** (configure mode, parent/teacher or self-directed): the agent has tools that mutate artifacts. The user "talks to the agent" to build a course; the agent calls `course.create()`, `course.add_lesson()`, etc.

**Self-onboard path**: course-create mode is agentic — `course.start_drafting` runs a multi-turn drafting loop. The agent reads ingested documents via `document.outline` / `document.list_sections` / `document.read_pages` / `retrieve_from_documents` and writes drafts with `course.draft_*` tools. `persistDraft` materialises units + lessons + assessment shells in one transaction on confirmation.

**Student-facing**: artifacts are read-only to the student via the agent (tutor session) plus directly via the UI (progress map, workspace). The student never sees raw artifact JSON; the UI renders it.

**Concept extraction** is an agentic task. Course-create mode runs `course.start_drafting`, which spawns a multi-turn drafter agent that reads documents via `document.outline` / `document.list_sections` / `document.read_pages` / `retrieve_from_documents` and writes unit/lesson/concept drafts via `course.draft_*` tools. The draft is confirmed by the user; `persistDraft` materialises units + lessons + assessment shells in one transaction. Never auto-applied without confirmation in v1.

## UI architecture

**Vite + React + TanStack Router** as a pure SPA. No server framework. The build output is static files; deployment differs only in *who serves them*. TanStack Router gives type-safe routes, search-param parsing, and route loaders without dragging in a server framework.

**Student surface:**

- **Chat** — primary interaction. Streamed model messages plus selected tool I/O (e.g., a graph the math tool produced).
- **Progress map** — out-of-conversation view. Topics, gates, current position, what's unlocked, what's next. Reads directly from `@praxis/artifacts` and `@praxis/memory` semantic layer (via `@praxis/client`).
- **Workspace** — note-taking surface. Cornell-style, Feynman-prompted, sketch / canvas (tldraw), or Anki-like flashcards depending on study-skill preference. Stylus / Apple Pencil / Wacom supported via Pointer Events. Writes back to `@praxis/artifacts`.
- **Concept map** — first-class spatial editor (tldraw) for student-authored concept maps. Links drawing nodes to canonical concepts; persisted as `ConceptMapDrawing` artifacts.
- **Submission** — typed, sketched (tldraw), or uploaded (image / PDF), routed to the appropriate grading tool. Sketched work is read by the tutor as both structured JSON and rendered image — JSON when shape primitives carry meaning, image as the always-reliable fallback.

**Configure surface (lock-gated):**

- **Course authoring** — agent-assisted course building (chat + structured editor). Same tutor agent loop, different mode and tool subset.
- **Gate editor** — visual editor for the gate graph (React Flow); custom React node components per gate type; sets thresholds, prerequisites, override flags.
- **Prompt customization** — knobs for teaching style, persona, mode-prompt overrides. Surfaces the prompt-composition system as a config UI.
- **Memory inspector** — student model view, misconception list, recent episodic browser. Read-mostly with controlled edit (e.g., manually clear a stale misconception).

**Electron wrapper** (`@praxis/desktop`): hosts the UI's static build inside Electron, starts `@praxis/core` in the main process, exposes IPC transport to the renderer. The renderer is a regular Vite-built SPA that doesn't know it's running in Electron — it imports `@praxis/client` and gets the IPC transport at boot.

## Ingestion pipeline

Ingestion is TS-native. The `Ingestor` port in `@praxis/tools/runtime/ingestion/` dispatches to per-format adapters: `PlainTextIngestor`, `MarkdownIngestor`, `HtmlIngestor`, `DocxIngestor`, `EpubIngestor`, `PptxIngestor`, `JsPdfIngestor`, `VisionPdfIngestor`. Embedded figures extracted by `DocxIngestor` / `PptxIngestor` are saved to the `EmbeddedImageStore` port; page rasters from `VisionPdfIngestor` go to the `PageImageStore` port. Both stores are content-addressed under the document id. The Python `praxis-ingest` sidecar is deferred post-v1.

```
User selects file(s) in UI
        │
        ▼
@praxis/core: IngestionService.ingest(file)
        │
        ▼
IngestorRegistry.pick(mimeType) → per-format adapter
        │
        ▼
Adapter parses → structured chunks
        │
        ▼
IngestionService:
   ├─ artifacts: store source document and chunks
   ├─ vectors: embed and store (sqlite-vec or pgvector)
   └─ activity: emit ActivityItem via ActivityRegistry (progress on rail)
        │
        ▼
UI confirms with the user (especially for self-onboard) and persists
```

Ingestion is offline batch work, not in the agent's hot path. Long-running ingestion (large textbooks) surfaces progress inline via `<StatusStrip>` beneath the running head without blocking other use.

## Document scoping

Documents are linked to **scopes** via the `document_scopes` table — a polymorphic join with rows `(document_id, scope_kind, scope_id, source, attached_at)`. Scope kinds start with `course` and `session`; the primitive is extensible (lesson, unit, etc.) without schema migration. A document can belong to multiple scopes simultaneously, enabling patterns like "a document attached to a course is also remembered as having been ingested during a specific course-create session."

The drafter reads from session-scoped documents during a drafting run and promotes them to course-scope when the user confirms the draft. Manual attachments from the configure surface go directly to course-scope. The `retrieve_from_documents` tool (and the `document.*` tools) takes a scope argument and queries documents linked to that scope.

## Future seams

- **Trigger.dev integration**: the engine adapter contract is designed so a `TriggerDevAdapter` could wrap any other adapter, persisting brief + tool registrations + event-stream cursor durably. Important for the hosted deployment when sessions span hours or days. Not built in v1.
- **Multi-student**: the data model already namespaces by `student_id`. Multi-student involves auth, account management, and a shared curriculum service — but no architectural changes to memory, artifacts, or engine adapters.
- **Voice I/O**: a vision adapter exists; an audio adapter (STT in, TTS out) plugs into the same brief shape. Not v1.
- **Mobile**: a React Native shell over the same `@praxis/client` if/when needed. Not v1.
- **Alternative UIs**: third parties can build their own UI against `@praxis/client`'s typed RPC surface — the UI/backend boundary is intentional.

## Testing and dev tooling

- **Unit**: tools, indexers, gating logic, prompt composition.
- **Integration**: full session walkthroughs with a mock engine adapter that produces deterministic event streams.
- **Engine conformance**: each adapter has contract-conformance tests against a shared suite — same inputs must produce the same normalized event shape.
- **Transport conformance**: both transport implementations (IPC, WebSocket+HTTP) tested against the same client API contract.
- **Eval**: a curated set of tutor scenarios with expected behavior signals (does the tutor scaffold appropriately? does it call sympy on math? does it cite the textbook?), run against each engine.
- **Observability**: structured logs at the framework level (every event, every tool call, every projection update); optional LangSmith / Helicone wiring at the engine adapter for hosted.

## Build and distribution

- **Local**: an Electron installer for macOS / Windows / Linux. Bundles the Vite-built UI, the Node-side `@praxis/core`, and the engine adapters. `praxis-ingest` is a separate `uv tool install` step (or auto-prompted on first ingestion).
- **Hosted**: the Vite-built UI is served as static files from any CDN (or co-served by the Node service). `@praxis/core` runs as a Node service (Fly / Railway / Render / self-host); Postgres provisioned externally; `praxis-ingest` running in a worker container.
- **Versioning**: independent semver per package. Breaking interface changes cascade — major bump on `@praxis/core` requires `@praxis/client` to update its type bindings.
