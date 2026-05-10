# SPEC

Hard technical boundaries and decisions for Praxis v1. This document sets the constraints; `ARCHITECTURE.md` describes how the pieces fit together inside those constraints, and `CONTRACT.md` formalizes the interfaces.

## Tech stack

| Concern | Choice | Reasoning |
|---|---|---|
| Agent runtime language | TypeScript | Single language across UI, framework, and engine adapters. Matches the Claude Code SDK and Codex SDK landscape; broad library ecosystem. |
| Ingestion sidecar language | Python | The only acceptable PDF parsers for textbook-quality output (Marker and friends) are Python. Accepted as a documented boundary; ingestion is offline batch work and never enters the agent runtime. |
| Storage ORM | Drizzle | TypeScript-first, schema-as-code, runs on both SQLite and Postgres unchanged. |
| Local DB | SQLite (with the `sqlite-vec` extension) | File-on-disk; zero-ops for personal use. `sqlite-vec` keeps vectors co-located with relational artifact data — single transaction, single backup. |
| Hosted DB | Postgres (with the `pgvector` extension) | Production-grade. `pgvector` with HNSW indexes is the pragmatic 2026 default. |
| RAG | `sqlite-vec` / `pgvector` behind a `VectorStore` port | One interface, two adapters (~150 LOC). No second storage system. |
| Low-level model SDK | Vercel AI SDK | Used **inside the Direct engine adapter only**. Provider-agnostic, type-safe, supports Anthropic / OpenAI / Google / local-via-Ollama. Not a framework dependency anywhere else. |
| PDF ingestion | Marker (Python, OSS) | Layout-aware segmentation, equation→LaTeX, heading hierarchy, table preservation. Ships in the `praxis-ingest` package. |
| Vision OCR | The same model loaded by the engine adapter (Claude / Gemini vision) | No third-party OCR tooling. The model is already loaded; cheap, natural integration. |
| UI framework | Vite + React + TanStack Router (SPA), Electron (desktop wrapper) | The UI is a pure SPA. No server framework. Final form settled in `ARCHITECTURE.md`. |
| Sketching / canvas | tldraw (`tldraw` on npm) | Embedded in workspace, submission, concept-mapping surfaces, and (Phase 16) homework / quiz / exam modality bodies for sketched answers and per-problem workspaces. Excellent stylus support with pressure, infinite canvas, multi-page, polished freeform drawing — chosen over Excalidraw for student-facing drawing quality. Licensed under the tldraw license (source-available; commercial terms required for paid products); licensing decision deferred to be revisited if/when commercializing. Tools read drawings as `{ json, image }` — JSON when shape primitives are used, image as the always-meaningful fallback. |
| Tab persistence | A dedicated `tabs` table in SQLite (Phase 14) | Open chat tabs survive app restart. Schema: `id, sessionId, modeId, title, openedAt, lastSeenAt, archived`. Stored in the same SQLite DB as everything else, so a backup of the DB restores the workspace exactly. Not persisted to `config_kv` — tabs are first-class enough that they deserve a typed table with its own indexes. |
| Node-based diagrams | React Flow (`@xyflow/react`, MIT) | Powers the gate editor in configure mode. Better fit than freeform canvas for structured node/edge artifacts. |
| Stylus input | Pointer Events API (browser native) | Apple Pencil / Wacom / Surface Pen all work via `pointerType: 'pen'` with pressure. iPad with Pencil works through Safari — no native iPad app needed in v1. |
| Transport (UI ↔ core) | IPC bridge (Electron) / WebSocket + HTTP (hosted), via `@praxis/client` | UI is a pure SPA; backend is its own service. One transport adapter per deployment shape. Forces a clean, testable UI/backend boundary. |
| Build / package manager | pnpm + workspaces | Monorepo across `@praxis/*` packages. |

**Things deliberately NOT in the stack:**

- No agent framework as foundation (Mastra, LangGraph, AutoGen, CrewAI, etc.). The agent harness is custom and thin.
- No durable execution platform in v1 (Trigger.dev, Inngest, Temporal). The engine adapter is designed so a Trigger.dev wrapper is a clean future addition for the hosted deployment.
- No third-party OCR (Mathpix, Textract, Document Intelligence). Vision via the engine adapter's model.
- No graph database (Neo4j, Kuzu, OxiGraph). Concept graph models in plain Drizzle tables; recursive CTEs handle traversal.
- No second vector store (Pinecone, Weaviate, Chroma, LanceDB, Qdrant, Turso vector). One storage system, two adapters.

## Engine roster

Praxis is engine-agnostic. All engines conform to one interface (defined in `CONTRACT.md`): `run(brief, tools) → event stream`.

| Engine | Type | Purpose |
|---|---|---|
| **Claude Code adapter** | Looped | Wraps the Claude Code SDK. Personal-use deployments leveraging a Claude Code subscription. The engine's internal loop runs to completion; the adapter projects its trace into the normalized event stream. |
| **Codex adapter** | Looped | Wraps the Codex SDK. Personal-use deployments leveraging a Codex subscription. |
| **Direct adapter** | Single-shot | Wraps Vercel AI SDK. Drives the loop itself (model call → tool dispatch → next call). Provider parameter selects Anthropic / OpenAI / Google / local. The hosted deployment's primary engine. |

**Productization invariant:** removing the Claude Code and Codex adapters leaves a working hosted deployment on the Direct adapter. No package outside `@praxis/engines` may import from either CLI adapter.

## Deployment shapes

Two deployment shapes from day one, same codebase.

| Aspect | Local-first | Hosted |
|---|---|---|
| Engines | Claude Code / Codex / Direct | Direct only |
| Engine credentials | CLI subscription / user API key | User API key (or managed service) |
| Storage | SQLite on disk | Postgres |
| Vectors | `sqlite-vec` | `pgvector` |
| Ingestion | `praxis-ingest` CLI installed locally | Worker container running `praxis-ingest` |
| Auth | Optional lock code | Account + lock code |
| Networking | Outbound only (engine API or local CLI) | Standard web app |
| Telemetry | Off by default; opt-in | Operational metrics on; user analytics opt-in |

## Ingestion sidecar boundary

> **v1 status (April 2026)**: no Python sidecar exists in v1. Phase 5 ships document ingestion entirely in TypeScript via the `Ingestor` port + per-format adapters (txt, md, html, docx, epub, PDF text-layer) plus a vision tier that uses the configured engine's native vision capability (no third-party OCR). The `praxis-cli` Python sidecar described below is **deferred to a post-v1 enhancement** — see `docs/ROADMAP.md` "Future enhancements" for the trigger to revisit. This spec section documents the future boundary so the architecture is reserved when needed.

When Python tooling does eventually land (most likely as a Marker-based PDF ingestor for power users with appropriate hardware), it conforms to this contract:

`praxis-cli` (or equivalently named) is a Python package distributed separately from the TypeScript framework. It exposes a CLI consumed as a subprocess by `@praxis/core`. The contract:

- Input: a file path (PDF / EPUB / image / etc.) and a course/student scope.
- Output: a directory of structured chunks with metadata (page, section, heading hierarchy, equations as LaTeX, figure references) plus a manifest JSON.
- No persistent state. Idempotent. Re-runnable.

Local users install via `uv tool install praxis-cli`. Hosted users never see it; it runs in a worker container. The TypeScript runtime never imports Python; Python never imports TypeScript.

This is the **single** documented language boundary in Praxis. Any other Python is a regression. The boundary is reserved for cases where Python is genuinely the only viable option (heavy ML toolchains like PyTorch-based models that have no JS/WASM equivalent).

## OCR

Handwritten work (math, prose) is read by the model already loaded by the active engine adapter. No third-party OCR tooling.

For graded math, the verification round-trip is:

1. **Vision**: read the handwritten work into LaTeX.
2. **Render**: re-render the LaTeX (KaTeX or sympy LaTeX printer).
3. **Confirm**: ask the model to verify the rendered LaTeX matches the original work.
4. **Validate**: pass the LaTeX expression through sympy for symbolic correctness.

If any step disagrees, the tool returns `needs_human_review` rather than a confident grade.

## Verification rules (hard constraints)

The **graded grounding hierarchy.** The tutor prefers the most authoritative source available, in order:

1. Student's own course material (RAG over uploaded textbook, syllabus, notes, references).
2. Deterministic computation (sympy for math, sandboxed code execution, symbolic checkers).
3. Cited external search (citation in output).
4. Curated pedagogy pack (versioned content for teaching strategies).
5. Model knowledge (transparent fallback).

**Hard rules — no degradation, no bypass:**

- **Grading**: any answer used to assess the student is validated, not generated. Math goes through sympy. Code runs against tests. Free-response is graded against an explicitly-written rubric the tutor produces before grading.
- **Material claims**: anything the tutor presents as "from your textbook" comes from retrieval, with section/page citation attached.
- **Dated or factual claims**: anything presented as current uses cited search.
- **Transparency**: when leaning on model knowledge where higher-authority sources could plausibly apply but aren't available, the tutor signals that explicitly.

These rules are enforced **by tool design** — the tool that grades math literally uses sympy; the tool that quotes the textbook literally retrieves. The agent's only choice is whether to call the tool. That's a model-behavior concern handled by prompts and engine selection, not architecture.

## Human-in-the-loop tool dispatch

Most tools return a result synchronously — they do computation or call a service, then resolve. A small class of tools needs to block on user input before they can return. Phase 17 introduces this pattern for the `quick_check.*` family; the mechanism is general enough to serve future uses (multi-step approval flows, disambiguation prompts).

**Why not just emit a message and wait for the next user turn?** Quick checks are tool calls. The engine's internal loop is running; the model issued a `tool_call` event and is waiting for the matching `tool_result`. If the framework returned a synthetic "please respond" string, the engine would treat that as the tool result and continue — the student's actual answer would arrive in a separate turn as a `user_message`, which the model would have to correlate with the earlier question manually. Human-in-the-loop dispatch avoids this by holding the tool-result Promise open until the renderer signals back.

**Dispatch mechanics:**

1. The tutor emits `tool_call: quick_check.single_choice({ prompt, options, correctIndex? })`.
2. The engine adapter passes the call to `InProcessToolRegistry.dispatch(name, args)`.
3. The handler generates a `callId` (uuidv7), then calls `ctx.services.quickCheck.await({ callId, sessionId, item })`.
4. `QuickCheckService.await` inserts a pending entry in an in-memory map and emits a `QuickCheckEvent { kind: "pending", callId, sessionId, item }` to all subscribers. The call returns a `Promise` that stays unresolved.
5. The renderer subscribes to `praxis.quickCheck.events.<streamId>`. On a `pending` event matching the active session, it renders a `<QuickCheckCard>` as a synthetic message bubble in the chat thread.
6. The student answers. The card calls `client.quickCheck.resolve({ callId, answer })`.
7. The IPC handler forwards to `quickCheckService.resolve({ callId, answer })`, which resolves the pending `Promise`.
8. The tool handler returns the answer as its result; the registry emits a `tool_result` event; the engine continues its loop and narrates the response in the same turn.

**IPC channel shapes:**

```typescript
// Renderer subscribes — streaming, push from main process
"praxis.quickCheck.events.<streamId>"
// Payload types: QuickCheckEvent (see CONTRACT.md)
// { kind: "pending"; callId; sessionId; item }
// { kind: "resolved"; callId; answer }

// Renderer calls — invoke, main process handles
"praxis.quickCheck.resolve"
// Input: { callId: string; answer: QuickCheckAnswer }
```

**Abandonment semantics:** if the session ends while a quick check is pending (the student closed the tab, or the session timed out), `QuickCheckService.cancel(callId)` is called during session teardown. The awaiting Promise resolves with `{ kind: "abandoned" }`. The tool handler returns a sentinel response (`selectedIndex: -1`) that the model interprets as "student didn't answer." The conversation remains in a consistent state; the next user message in a new session can proceed normally.

**Multiple in-flight checks:** the service supports concurrent pending calls, each keyed by its own `callId`. Each renders its own `<QuickCheckCard>` in the thread, ordered top-down by call arrival.

---

## Memory commitments

- **Episodic transcripts are immutable.** Append-only, retained until the user deletes them. Source of truth.
- **Projection layers** (semantic, procedural, affective, misconception) **are regenerable** from the episodic log by indexer agents. They can be rebuilt if the indexer logic improves.
- **Students own their memory.** Export to a portable format (JSON-with-attachments). Delete on demand. Move between installations.
- **Memory is per-student.** No cross-student leakage. Multi-student support (later) will not change this — each student's memory remains isolated.
- **Cross-course memory is shared via shared concept-graph nodes.** Mastery of "linear equations" learned in Algebra 1 is visible in Physics if the courses share that concept node.

## Privacy stance

- **Local-first deployment**: all data on-device. No telemetry by default. Opt-in only.
- **Hosted deployment**: encryption at rest, TLS in transit, per-student data isolation, deletion on request, exportability.
- **COPPA**: the hosted deployment is **not COPPA-compliant in v1**. Hosted is restricted to users 13+. K–5 (which would require COPPA) ships only as local-first in v1; hosted COPPA compliance is a future milestone.
- **FERPA**: explicitly out of scope for v1. Praxis is not a school-of-record system; districts integrating it are responsible for their own FERPA posture.
- **Pedagogy pack** (curated research) is delivered via signed updates; integrity verified before ingestion.

## License

To be settled before public release. Constraints:

- The framework license must be compatible with commercial use of the *hosted product* by the same authors (the framework license cannot prohibit a managed service built on top).
- Plausible candidates: MIT, Apache 2.0, BSL (Business Source License) with a converted-to-Apache clause.
- Pedagogy pack content licensing is a separate question and also TBD.

## Out of scope for v1

- **Multi-student installations.** One student per install. Classroom mode is later.
- **LMS integration** (Canvas, Schoology, Google Classroom, etc.).
- **Live tutoring sessions across users.** No real-time collaborative learning.
- **Voice / speech I/O.** Text and image only in v1.
- **Mobile apps.** Web responsive + Electron desktop only.
- **District / institutional admin tooling.**
- **Synthetic curriculum generation.** Curriculum is authored or extracted from real materials; not generated whole-cloth by the model.
- **Pedagogy research generation.** Praxis consumes curated research; it does not produce findings.

## Versioning and extension model

- Public packages follow semver. Breaking changes to `CONTRACT.md` interfaces require a major bump.
- **Subjects** (canonical concept graphs + content packs) are independently versioned packages.
- **Modes** are independently versioned and pluggable.
- **Pedagogy pack** is independently versioned.
- **Engine adapters** live in `@praxis/engines` as separate exports; new adapters add an entry, not a fork.
