# CONTRACT

The plug-and-play interfaces of Praxis. This is the document extension authors read first. `SPEC.md` says what we chose; `ARCHITECTURE.md` says how the pieces fit; this document specifies the typed contracts between them.

All types in this document are TypeScript-flavored pseudocode. Implementations may add fields, but cannot remove or rename without a major version bump per the versioning rules at the bottom.

## How to read this doc

Each section defines one contract. Contracts are **stable surfaces** — extensions that conform to them plug into Praxis without modifying core. The goal is that adding a new engine, tool, mode, subject, or pedagogy pack requires touching only that extension's package, not `@praxis/core`.

## Engine adapter contract

The interface every engine implements. Lives in `@praxis/core/types/engine.ts` and is the only thing `@praxis/engines` imports from `@praxis/core`.

**Phase 3 (v2):** Engines use a multi-turn lifecycle: `Engine.open(opts) → EngineSession`, then `session.send(userMessage)` per turn, then `session.close()`. This lets Claude Code and Codex use their native SDK conversation objects across turns (full prompt cache, full tool fidelity), while Direct holds an in-memory messages array. The framework provides a unified `EngineSession` surface and records every event to episodic.

```typescript
interface Engine {
  /** Identifier for diagnostics and selection. e.g. "claude-code", "codex", "direct.anthropic". */
  readonly id: string;

  /**
   * Engine category. Affects how the framework constrains options.
   * - "looped": engine runs its own internal loop until done per `send`.
   * - "single-shot": engine answers per model call; framework orchestrates the loop within `send`.
   */
  readonly kind: "looped" | "single-shot";

  /**
   * Open a multi-turn session. Async because adapters may need to spawn
   * subprocesses (MCP tool bridge), open SDK conversations, or perform other
   * setup that can fail. Throws on failure — the caller (SessionServiceImpl)
   * surfaces the error to the user before any send is attempted.
   */
  open(opts: EngineOpenOptions): Promise<EngineSession>;

  /** Health check / capability probe. Used at session start. */
  health(): Promise<HealthStatus>;
}

interface EngineOpenOptions {
  /** Composed system prompt (mode prompt + persona + scope context). Fixed for the session lifetime. */
  systemPrompt: string;
  /** Tool registry. Fixed for the session lifetime. */
  tools: ToolRegistry;
  /**
   * Prior conversation turns for seeding a session from episodic history
   * (engine swap, process restart). Empty or absent = brand new conversation.
   * Text-only by design: tool-call replay would change behavior and is wrong.
   */
  priorTurns?: ConversationTurn[];
  /** Cap on internal loop iterations (looped engines), or model calls (single-shot). */
  maxSteps?: number;
  /** Generation parameters (temperature, max_tokens, etc.). */
  generation?: GenerationParams;
}

interface EngineSession {
  /**
   * Stable session identifier for diagnostics. May match the SDK's native
   * session id (e.g., Claude Code's sessionId, Codex's thread id) when
   * applicable, or be a synthesized UUID for adapters without native ids.
   */
  readonly id: string;

  /**
   * Send one user message; yield engine events; resolves when the engine's
   * internal loop completes for this turn. Subsequent calls continue the same
   * conversation — the adapter's underlying SDK preserves history natively
   * (Claude Code, Codex) or via an in-memory messages array (Direct).
   */
  send(userMessage: string): AsyncIterable<EngineEvent>;

  /**
   * Tear down the underlying SDK session, MCP bridge subprocess, etc.
   * Idempotent. Called by the framework when ending a Praxis session OR
   * when swapping engines mid-session.
   */
  close(): Promise<void>;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  dispatch(name: string, args: unknown): Promise<ToolResult>;
}

interface ToolDefinitionSummary {
  name: string;
  description: string;
  /** JSON Schema serialization of the input schema. Always present. */
  inputSchemaJson: unknown;
  /**
   * Optional native input schema in the implementation's preferred form.
   * `InProcessToolRegistry` sets this to the original `z.ZodType` instance.
   * Engine adapters use it when available, falling back to JSON-Schema-to-Zod
   * conversion when not. Typed as `unknown` on the contract so implementations
   * are not forced to depend on Zod.
   */
  inputSchemaNative?: unknown;
  tier: "deterministic" | "grounded" | "model-derived";
}

type EngineEvent =
  /** Framework-emitted only (never adapter-emitted). Records the user's input in the episodic transcript. */
  | { type: "user_message"; content: string }
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };

interface HealthStatus {
  ok: boolean;
  detail?: string;
  capabilities: {
    vision: boolean;
    streaming: boolean;
    nativeMCP: boolean;
    contextWindow: number;
  };
}
```

**Implementer notes:**

- Looped engines must project their internal trace into the normalized event sequence. Tool calls inside the engine must round-trip through `ToolRegistry.dispatch` — the framework owns tool execution.
- Single-shot engines drive the loop themselves: call model, dispatch tool calls, feed results back, repeat until the model returns a final message or `maxSteps` is reached.
- `Engine.open` is async because spawning the MCP bridge subprocess is async. Adapters that don't need async setup can return `Promise.resolve(new Session(...))`.
- The `seedPreface` pattern: when `priorTurns` is non-empty, Claude Code and Codex adapters prepend a plain-text transcript to the FIRST `send` after open. Subsequent sends benefit from the SDK's native multi-turn. Direct populates its `messages[]` array from `priorTurns` directly.
- `EngineEvent.user_message` is emitted by the framework (`SessionServiceImpl.send`), never by engine adapters. Adapters must not emit this type.
- For single-turn compatibility (tests, scripts), use `runOneShot(engine, opts, userMessage)` from `@praxis/engines`.

**`runOneShot` convenience wrapper** (for tests and scripts):

```typescript
// From @praxis/engines
async function* runOneShot(
  engine: Engine,
  opts: EngineOpenOptions,
  userMessage: string,
): AsyncGenerator<EngineEvent, void, void> {
  const session = await engine.open(opts);
  try {
    yield* session.send(userMessage);
  } finally {
    await session.close();
  }
}
```

## Tool definition format

Tools live in `@praxis/tools` (or any extension package). Each has a Zod schema, a handler, metadata, and a verification tier.

```typescript
import { z } from "zod";

interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  /** Unique tool name. e.g. "math.grade", "course.get_next_lesson". */
  name: string;

  /** One-paragraph description shown to the model. Be precise. */
  description: string;

  input: I;
  output: O;

  /**
   * Verification tier — how much can the framework trust this tool's output?
   * - "deterministic": tool result is mathematically/algorithmically certain (sympy, code exec).
   * - "grounded": tool result comes from a verifiable source (RAG, search w/ citation).
   * - "model-derived": tool result is produced by an LLM and may be wrong (rubric grading, classification).
   */
  tier: "deterministic" | "grounded" | "model-derived";

  /** Side effects on persistent state. */
  effects: ReadonlyArray<EffectKind>;

  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  services: {
    memory: MemoryService;
    artifacts: ArtifactsService;
    vectorStore: VectorStore;
    sandbox: CodeSandbox;
    sympy: SymPyService;
    pedagogyPack: PedagogyPackService;
  };
  log: Logger;
}
```

Each engine adapter is responsible for translating `ToolDefinition` into its native registration format (MCP for Claude Code, function declarations for Codex, `tool_use` blocks for the Direct adapter).

**Sketch input pattern**: tools that accept sketched work (`sketch.read`, `concept_map.read`, submission tools) return both representations: `{ json: TldrawSnapshot, image: ImageRef }`. The image is rendered server-side from the JSON to ensure consistency. The tutor's prompt instructs that JSON gives structure where shape primitives are used and the image gives the visual artifact otherwise; when they diverge, prefer the image (younger students draw freehand and the JSON carries little semantic content). Sketches are always tier `"grounded"` — the image is the source of truth, derived deterministically from the persisted scene.

## Mode contract

A mode is a configuration: prompt fragments + tool subset + UI surface + artifact scope. Modes live in `@praxis/curriculum` or extension packages.

```typescript
interface Mode {
  /** Unique mode name. e.g. "teach", "quiz", "homework", "exam", "study-skills", "configure". */
  id: string;
  label: string;
  description: string;
  requiredRole: "student" | "configurator";

  /** Prompt fragments composed at session start to form the system prompt. Order matters. */
  promptFragments: PromptFragment[];

  /** Names of tools available in this mode. */
  toolNames: string[];

  /** UI surface this mode runs in. */
  uiSurface: UISurfaceId;

  /** Artifact scope. Restricts what `course.*` and similar tools can see. */
  artifactScope?: ArtifactScope;

  /** Optional: hook called after every event stream completes. */
  onTurnEnd?(events: EngineEvent[]): Promise<void>;
}

interface PromptFragment {
  id: string;
  position: "preamble" | "role" | "principles" | "tools" | "context" | "constraints" | "postamble";
  template: string;       // may contain `{{template_vars}}`
  customizable: boolean;  // can parent/teacher override in configure UI?
}
```

## Artifact schemas

The structured world the agent operates on. All artifacts live in `@praxis/artifacts`.

### Course

```typescript
interface Course {
  id: CourseId;
  studentId: StudentId;
  title: string;
  subject: SubjectId;             // e.g. "math.algebra-1", "biology.high-school"
  gradeLevel: GradeBand;          // e.g. "6-8", "9-12"
  source: CourseSource;
  lessons: LessonId[];            // ordered
  conceptGraphId: ConceptGraphId;
  gates: GateId[];
  thresholds: ThresholdConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type CourseSource =
  | { kind: "authored"; authorRole: "parent" | "teacher" | "self-directed" }
  | { kind: "bootstrapped"; sourceMaterials: DocumentId[] }
  | { kind: "imported"; pack: SubjectPackId };

interface ThresholdConfig {
  conceptMastery: number;         // 0..1 — required to mark a concept "passed"
  examPass: number;               // 0..1 — required to pass an exam-gate
  allowRetake: boolean;
  decayDays: number;              // days before mastery decays into review-required
}
```

### Lesson

```typescript
interface Lesson {
  id: LessonId;
  courseId: CourseId;
  title: string;
  conceptIds: ConceptId[];        // ordered by intended sequence
  references: Reference[];
  suggestedStrategy: StrategyId;
  estimatedMinutes: number;
}

interface Reference {
  kind: "textbook" | "url" | "video" | "note";
  source: string;
  locator?: { page?: number; section?: string; timestamp?: number };
}
```

### Assignment / Exam

```typescript
interface Assignment {
  id: AssignmentId;
  courseId: CourseId;
  kind: "quiz" | "homework" | "exam";
  title: string;
  items: AssignmentItem[];
  conceptIds: ConceptId[];
  assignedAt: Timestamp;
  submittedAt?: Timestamp;
  grade?: Grade;
}

interface AssignmentItem {
  id: string;
  kind: "multiple-choice" | "short-answer" | "free-response" | "math" | "code";
  prompt: string;
  options?: string[];             // multiple-choice
  rubric?: Rubric;                // free-response / exam-quality grading
}

interface Grade {
  total: number;                  // 0..1
  perItem: Array<{ itemId: string; score: number; feedback: string }>;
  rubricUsed?: Rubric;
  reviewedBy: "tool" | "rubric-agent" | "needs-human-review";
}
```

> **v1 status (Phase 8)**: Assignments are structured artifacts taken inline in the chat surface. Submission flows through `praxis.assignments.submit`, not through agent tools — the server runs the grader dispatch and persists the Grade.
>
> **Free-response grading uses a rubric agent** with per-criterion 0-10 integer scoring. The agent's job is per-criterion judgment ("on criterion X, score 0-10 with rationale"); the system computes the 0..1 aggregate as a deterministic weighted sum of `(score / 10) × weight`. This satisfies SPEC.md's "graded against an explicitly-written rubric the tutor produces before grading" by pre-committing to criteria, narrowing per-criterion judgment scope, and keeping aggregation deterministic. Allowed in all modes including exam; exam free-response items are required to have a rubric (validated at create time).
>
> **`workRubric` opt-in per item** lets math/code items award partial credit for shown work. The deterministic check (sympy / test cases) and the work rubric blend via `primaryWeight` (default 0.5 for quiz/homework, 1.0 for exam). The agent decides at item-create time whether to add a workRubric — guidance lives in the `assignment.create` tool description.
>
> **Approach-feedback layer** is a fallback for items WITHOUT a rubric/workRubric in quiz/homework only — it enriches `feedback` text without modifying `score`. Items with rubrics get per-criterion rationales as their feedback. Approach-feedback never runs for exam.
>
> The deterministic grader's score is the ground truth for items without a rubric; rubric scores are deterministic-aggregated from per-criterion judgment. Items are typed-only in v1; sketch / photo input lands in Phase 13.

### Gate

```typescript
interface Gate {
  id: GateId;
  courseId: CourseId;
  guards: GateTarget;
  prerequisites: GateId[];
  successCriteria: SuccessCriteria;
  state: GateState;
  evidence: EvidenceRef[];
}

type GateTarget =
  | { kind: "concept"; conceptId: ConceptId }
  | { kind: "lesson"; lessonId: LessonId }
  | { kind: "topic"; topicId: TopicId }
  | { kind: "course-completion" };

type SuccessCriteria =
  | { kind: "mastery-threshold"; conceptIds: ConceptId[]; minScore: number }
  | { kind: "exam-pass"; assignmentId: AssignmentId; minScore: number }
  | { kind: "and"; criteria: SuccessCriteria[] }
  | { kind: "or"; criteria: SuccessCriteria[] };

type GateState =
  | { kind: "locked"; missingPrerequisites: GateId[] }
  | { kind: "unlocked"; unlockedAt: Timestamp; evidence: EvidenceRef[] }
  | { kind: "overridden"; by: ConfiguratorId; reason: string };
```

**Gate lifecycle (Phase 9):**
- Gates are bootstrapped in `locked` state with chained prerequisites.
- `SessionService.end()` calls `ArtifactsService.evaluateAndPersistGates()` after the indexer run. The `GateEvaluatorImpl` (pure function in `@praxis/curriculum/gates`) evaluates all gates for the course using `MasteryReader` and `GradeReader` adapters. Transitions are persisted atomically in a single transaction.
- Once unlocked, gates stay unlocked in v1 (no re-locking). Re-lock logic is planned for Phase 14.
- `gate_unlock_events` table provides an append-only audit trail (one row per unlock per student per gate). Used by the "newly unlocked" badge (`viewedAt` column) and `pnpm db:gates`.
- Tool lock enforcement: `course.start_lesson`, `course.mark_studied`, and `assignment.create` read gate state from the snapshot and refuse with descriptive errors when the target is locked.

### Flashcard / Note

```typescript
interface Flashcard {
  id: FlashcardId;
  studentId: StudentId;
  conceptId?: ConceptId;
  front: string;
  back: string;
  reviewState: ReviewState;       // FSRS or SM-2 internal state
  source: { kind: "authored" | "extracted" | "user-created"; ref?: string };
}

interface Note {
  id: NoteId;
  studentId: StudentId;
  context: NoteContext;
  format: "cornell" | "feynman" | "free" | "outline" | "sketch";
  /** Used for text formats: cornell / feynman / free / outline. */
  body?: string;
  /** Used for "sketch" format. Excalidraw scene JSON. */
  sketchScene?: TldrawSnapshot;
  links: ArtifactRef[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ConceptMapDrawing {
  id: ConceptMapId;
  studentId: StudentId;
  courseId?: CourseId;
  /** The Excalidraw scene JSON. */
  scene: TldrawSnapshot;
  /** Linkage from drawing nodes (by element ID) to canonical concepts. */
  conceptLinks: Array<{
    elementId: string;
    conceptId: ConceptId;
    confidence: number;             // 0..1, model-derived for fuzzy matches
  }>;
  /** Comparison results vs. the canonical concept graph (computed lazily). */
  divergences?: ConceptMapDivergence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ConceptMapDivergence {
  kind: "missing-edge" | "extra-edge" | "mislabeled-direction" | "missing-concept";
  description: string;
  elementIds: string[];             // drawing elements involved
}
```

## Memory schemas

Memory layers live in `@praxis/memory`. Episodic is source of truth; the four projections are computed.

### Episodic

```typescript
interface EpisodicEvent {
  id: EventId;
  sessionId: SessionId;
  studentId: StudentId;
  ts: Timestamp;
  source: { engineId: string; modeId: string; turnIndex: number };
  event: EngineEvent;
  artifactSnapshotIds?: ArtifactSnapshotId[];
}
```

Append-only. Indexed by session, student, time, mode, and concept references mentioned in tool calls.

### Semantic (student model)

```typescript
interface StudentModel {
  studentId: StudentId;
  conceptMastery: Map<ConceptId, ConceptMastery>;
  lastUpdated: Timestamp;
}

interface ConceptMastery {
  conceptId: ConceptId;
  pKnown: number;                 // BKT-style probability of mastery, 0..1
  uncertainty: number;            // confidence interval width
  lastPracticedAt?: Timestamp;
  effectivePKnown: number;        // decay-aware mastery
  evidence: EventId[];            // episodic events that contributed
}
```

### Procedural

```typescript
interface ProceduralModel {
  studentId: StudentId;
  strategies: Map<StrategyId, StrategyPreference>;
}

interface StrategyPreference {
  strategyId: StrategyId;
  preference: number;             // -1..1 — how well student responds
  evidenceCount: number;
}
```

### Affective

```typescript
interface AffectiveModel {
  studentId: StudentId;
  recent: AffectSample[];
  baseline: { engagement: number; frustration: number; confidence: number };
}

interface AffectSample {
  ts: Timestamp;
  source: "model-inferred" | "explicit-checkin";
  engagement: number;             // 0..1
  frustration: number;            // 0..1
  confidence: number;             // 0..1
}
```

### Misconception

```typescript
interface Misconception {
  id: MisconceptionId;
  studentId: StudentId;
  conceptId: ConceptId;
  description: string;
  errorForm: string;              // structured form (e.g., "treats inequality as equality after operation")
  remediation: { strategyId: StrategyId; rationale: string };
  evidence: EventId[];
  status: "active" | "remediated" | "manually-cleared";
  firstObservedAt: Timestamp;
  lastObservedAt: Timestamp;
}
```

## Knowledge graph schema

Canonical packs and extracted graphs both conform to this shape.

```typescript
interface ConceptGraph {
  id: ConceptGraphId;
  source: "canonical" | "extracted" | "hybrid";
  standardsRef?: { body: string; version: string };  // e.g. { body: "CCSS-Math", version: "2010" }
  concepts: Concept[];
  edges: PrerequisiteEdge[];
}

interface Concept {
  id: ConceptId;
  graphId: ConceptGraphId;
  name: string;
  description: string;
  aliases: string[];              // for cross-graph matching
  standardsTags: string[];
  embedding?: number[];
}

interface PrerequisiteEdge {
  fromId: ConceptId;
  toId: ConceptId;
  strength: number;               // 0..1 — soft graphs admit weak edges
  source: "canonical" | "extracted" | "manual";
}
```

## Pedagogy pack format

A versioned, signed bundle of teaching strategies and research-grounded methods. Lives outside the framework runtime; loaded at boot.

```typescript
interface PedagogyPack {
  version: string;                // semver
  signature: string;              // detached signature over manifest+content
  manifest: PedagogyManifest;
  strategies: TeachingStrategy[];
  studyTechniques: StudyTechnique[];
  metacognitivePrompts: MetacognitivePrompt[];
}

interface TeachingStrategy {
  id: StrategyId;
  name: string;                   // "worked-examples", "socratic", "elaborative-interrogation"
  description: string;
  applicability: {
    conceptKinds: string[];
    bloomsLevels: string[];
    cognitiveLoad: "low" | "medium" | "high";
  };
  promptFragment: string;
  citations: Citation[];
}

interface StudyTechnique {
  id: TechniqueId;
  name: string;                   // "cornell-notes", "feynman-explanation", "spaced-repetition"
  description: string;
  uiAffordances: string[];
  curriculum: { lessons: TechniqueLesson[] };  // for teaching the technique to students
  citations: Citation[];
}

interface MetacognitivePrompt {
  id: string;
  trigger: "pre-reading" | "post-reading" | "pre-quiz" | "post-error" | "session-end";
  template: string;
}
```

## Client RPC contract

The interface `@praxis/client` exposes to the UI. Mirrors `@praxis/core`'s service surface; transport-agnostic.

```typescript
interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsService;
  author: AuthoringService;       // configure-mode-only; gated by lock code
  memory: MemoryService;
  config: ConfigService;
}

interface SessionService {
  start(opts: { courseId: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

interface ArtifactsService {
  course(id: CourseId): Promise<Course>;
  /** Phase 6 change: returns CourseSummary[] for the list view; full Course is fetched per-id via course(id). */
  courses(): Promise<CourseSummary[]>;
  lessons(courseId: CourseId): Promise<Lesson[]>;
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(): Promise<ProgressSnapshot>;
  flashcards(opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]>;
  notes(opts?: { courseId?: CourseId }): Promise<Note[]>;
}

/**
 * v1 ships course-bootstrap as a `bootstrap` mode (Phase 6) and full lock-gated
 * authoring as `configure` mode (Phase 11). The bootstrap(files, opts) → DraftCourse
 * interface remains specified for forward-compat with scripted-authoring use cases
 * but is unimplemented in v1.
 */
interface AuthoringService {
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  /** Unimplemented in v1 — Phase 6 ships bootstrap as a mode, not a service method. */
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
}

/**
 * Client-facing MemoryService (v1, Phase 7).
 * This is the interface exported by `@praxis/client` (no studentId params — the
 * client is always scoped to the single-student v1 install).
 *
 * The server-side `MemoryService` interface in `@praxis/core/types/tool.ts`
 * additionally includes `applySignal()` and `recordMisconception()` write methods
 * used by `update_mastery` and `record_misconception` tools.
 *
 * `Map` fields (`conceptMastery`, `strategies`) are serialized as `[key, value][]`
 * entry arrays over IPC and reconstructed as Maps on the client.
 */
interface MemoryService {
  studentModel(): Promise<StudentModel>;
  misconceptions(): Promise<Misconception[]>;
  procedural(): Promise<ProceduralModel>;
  affective(): Promise<AffectiveModel>;
  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent>;
  export(): Promise<MemoryExport>;
  delete(opts: { confirm: true }): Promise<void>;
}
```

## Versioning rules

- All packages follow semver.
- **Major bump required** for: breaking changes to any interface in this document, removal or rename of fields, change of semantics on an existing field.
- **Minor bump** for: additive optional fields with sensible defaults, new optional methods, new tool definitions, new mode definitions.
- **Patch bump** for: bug fixes, performance, internal refactors that don't change observed behavior.
- Engine adapters version independently. The `Engine` interface in `@praxis/core` is the contract; adapters track its major version.
- Subject packs and pedagogy packs version independently and declare a compatible Praxis range in their manifest.
