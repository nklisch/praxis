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
   *
   * `signal` is wired to the adapter's SDK abort mechanism. When fired,
   * `SessionServiceImpl.send` yields a synthetic
   * `{ type: "interrupted", reason: "user_cancel" }` event as the final event
   * for the turn. Adapters that abort internally (engine_abort) yield the
   * same event with `reason: "engine_abort"`.
   */
  send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent>;

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
  dispatch(name: string, args: unknown, meta?: ToolDispatchMeta): Promise<ToolResult>;
}

/**
 * Per-call metadata threaded by engine adapters when invoking the registry.
 * Currently carries the SDK-supplied `callId` of the originating `tool_call`,
 * which the registry injects into `ToolContext.callId` so handlers that spawn
 * sub-agents can publish events keyed on the parent's call.
 */
interface ToolDispatchMeta {
  callId?: string;
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
  | {
      type: "final";
      usage: TokenUsage;
      /** Why the turn ended. Absent on legacy adapter paths; present in current adapters. */
      finalReason?: "success" | "max_turns" | "generation_error" | "interrupted";
      /** Populated when `finalReason === "generation_error"`. */
      errorMessage?: string;
    }
  /**
   * The turn was cut short. `user_cancel` = caller fired the `AbortSignal`
   * passed to `send()`. `engine_abort` = the adapter aborted internally
   * (e.g., SDK-level abort without a client-side signal). Yielded as the
   * last event for the turn; no `final` follows.
   */
  | { type: "interrupted"; reason: "user_cancel" | "engine_abort" }
  /**
   * Phase 16: a non-user, non-tool, non-model message appended by the runtime.
   * Used for assignment-submission notifications so the teach-mode tutor can
   * narrate per-item feedback. Stored in episodic and surfaced by
   * loadConversationHistory as a synthetic user turn prefixed `[Praxis] `.
   */
  | { type: "system_note"; content: string; origin: SystemNoteOrigin };

/**
 * Discriminated origin for `system_note` events (Phase 16).
 * `kind: "assignment_submission"` — fired when a student submits an assignment
 *   that has a `parentSessionId`; carries grade summary for the tutor to narrate.
 * `kind: "system"` — generic runtime notification; `topic` names the domain.
 */
type SystemNoteOrigin =
  | {
      kind: "assignment_submission";
      assignmentId: string;
      childSessionId: string;
      gradeTotal: number;
      submittedAt: number;
    }
  | { kind: "system"; topic: string };

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
  /**
   * The `callId` of the parent `tool_call` that invoked this handler. Set by
   * `InProcessToolRegistry.dispatch` when the engine adapter supplies it via
   * `ToolDispatchMeta`. Sub-agent-emitting tools key their `SubAgentRegistry`
   * events on this value so the UI can correlate sub-agent activity with the
   * parent tool_call in the chat thread.
   */
  callId?: string;
  services: {
    memory: MemoryService;
    artifacts: ArtifactsService;
    vectorStore: VectorStore;
    sandbox: CodeSandbox;
    sympy: SymPyService;
    pedagogyPack: PedagogyPackService;
    subAgent?: SubAgentRegistry;
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
  position:
    | "preamble"
    | "role"
    | "principles"
    | "tools"
    | "context"
    | "constraints"
    | "user-global"   // cross-mode global prompt from config_kv (user authoring)
    | "user-append"   // per-mode append from mode_prompt_appends (user authoring)
    | "postamble";
  template: string;       // may contain `{{template_vars}}`
  customizable: boolean;  // can parent/teacher override in configure UI?
}
```

**User-authored fragments**: `user-global` carries the cross-mode global prompt stored at `config_kv.prompt.global_fragment`; `user-append` carries the per-mode append stored in the `mode_prompt_appends` table. Both are injected via `additionalFragments` by `SessionServiceImpl.openActive` through `PromptCustomizationService.getEffectiveAdditionalFragments(modeId)`. Order within the composed prompt is enforced by `FRAGMENT_ORDER` — user-authored slots sit between `constraints` and `postamble` so they can amend the system's behavior without overriding load-bearing constraints.

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
  /** Phase 16: optional assessment plan. Absent for courses bootstrapped before Phase 16. */
  assessmentPlan?: AssessmentPlan;
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

### Unit / LessonAssessment / AssessmentPlan (Phase 16)

```typescript
/**
 * A band of lessons within a course. Courses that predate Phase 16 have no
 * units; the UI defaults to the flat-lesson view when `course.assessmentPlan`
 * is absent.
 */
interface Unit {
  id: UnitId;
  courseId: CourseId;
  name: string;
  summary?: string;
  orderIndex: number;
  /** Lesson IDs in study order. Resolved from the lessonUnits join. */
  lessonIds: LessonId[];
  /** Summative assessment (unit exam / midterm) at the end of this unit. Optional. */
  summativeAssignmentId?: AssignmentId;
}

/**
 * Scheduled assessment attached to a specific lesson.
 * The assignment.kind says quiz/homework/exam; purpose says why it's here.
 */
interface LessonAssessment {
  id: LessonAssessmentId;
  lessonId: LessonId;
  assignmentId: AssignmentId;
  /** When in the lesson flow this assessment runs. */
  timing: "before" | "after" | "interleaved";
  /** Pedagogical role of this assessment. */
  purpose: "readiness" | "practice" | "checkpoint";
}

/**
 * Aggregate description of a course's assessment scaffold. Stored as
 * JSON on the courses row. Written by persistDraft when the bootstrap
 * explorer produces a plan; immutable after that except via configure-mode.
 */
interface AssessmentPlan {
  perLesson: {
    /** Whether every lesson gets a homework assignment. */
    homework: boolean;
    /** 0 = no quizzes; N = quiz every Nth lesson. */
    quizFrequency?: number;
  };
  summatives: Array<{
    kind: "midterm" | "unit_exam" | "final";
    /** Exam is placed after the unit with this orderIndex. */
    afterUnitOrderIndex: number;
    title: string;
  }>;
  /** Optional pacing hints for a future calendar-pacing phase. */
  pacing?: { sessionsPerWeek?: number; weeksTotal?: number };
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
  /** Phase 16: the teach-mode session that issued this assignment via assignment.create. */
  parentSessionId?: SessionId;
}

type AssignmentItem =
  | SingleChoiceItem
  | MultiSelectItem
  | ShortAnswerItem
  | FreeResponseItem
  | MathItem
  | CodeItem
  | NumericalItem
  | MatchingItem
  | OrderingItem
  | TwoTierItem;

interface SingleChoiceItem {
  kind: "single-choice";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;  // required when requireReasoning is true (Zod refine)
  primaryWeight?: number;    // blends selection vs. reasoning scores; default 0.5
  authoredBy?: "tutor" | "configurator";
}

interface MultiSelectItem {
  kind: "multi-select";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndices: number[];  // ≥1, sorted ascending
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

interface NumericalItem {
  kind: "numerical";
  id: string;
  prompt: string;
  expectedValue: number;
  tolerance?: number;          // absolute tolerance; |x − expected| ≤ tol; default 0
  expectedUnits?: string;      // case-insensitive exact-string match when set
  significantFigures?: number; // when set, student answer must round to this many sig figs
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

interface MatchingItem {
  kind: "matching";
  id: string;
  prompt: string;
  leftItems: Array<{ id: string; text: string }>;
  rightItems: Array<{ id: string; text: string }>;
  correctPairs: Array<{ leftId: string; rightId: string }>;  // 1:1 in v1
  authoredBy?: "tutor" | "configurator";
}

interface OrderingItem {
  kind: "ordering";
  id: string;
  prompt: string;
  items: Array<{ id: string; text: string }>;  // shown shuffled to the student
  correctOrder: string[];                       // array of item ids in correct sequence
  authoredBy?: "tutor" | "configurator";
}

interface TwoTierItem {
  kind: "two-tier";
  id: string;
  prompt: string;              // tier-1 question
  options: string[];           // tier-1 options
  correctOptionIndex: number;  // tier-1 correct
  reasonPrompt: string;        // tier-2 question, e.g. "why did you pick that?"
  reasonOptions: string[];     // tier-2 options (the "reasons")
  correctReasonIndex: number;
  // Maps each reason option index to a misconception id, or null when the option
  // is correct or carries no clear misconception. Length must equal reasonOptions.length.
  misconceptionByReasonIndex: Array<string | null>;
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

// ShortAnswerItem, FreeResponseItem, MathItem, CodeItem retain the original
// shape from before the Phase 17 expansion (kind discriminator + prompt +
// per-kind validator/rubric fields).

**`requireReasoning` modifier**: applicable to `SingleChoiceItem`, `MultiSelectItem`, and `TwoTierItem` only. Short-answer and free-response are already textual; math and code use `workRubric`. When set, the student writes a free-text justification. The reasoning text travels in the existing `AssignmentResponse.work` field — the grader can distinguish it from `workRubric` work because `requireReasoning` lives on the item. The deterministic selection grade and the rubric-agent reasoning grade are blended via `primaryWeight` (default 0.5) using the existing `blendDeterministicAndWorkRubric` helper.

**Two-tier misconception evidence**: when a student picks a wrong tier-2 reason whose `misconceptionByReasonIndex` entry is non-null, the grader emits a misconception id in `GraderResult.misconceptionId`. The assignment service writes a misconception evidence event as a side effect, closing the loop with Phase 7's misconception memory.

**`QuickCheckAnswer` + `QuickCheckEvent`** are ephemeral types that flow through the IPC stream `praxis.quickCheck.events.<streamId>` and are never persisted to the DB (they appear in the episodic transcript only as the bracketing `tool_call` / `tool_result` events).

```typescript
type QuickCheckAnswer =
  | { kind: "single-choice"; selectedIndex: number }
  | { kind: "multi-select"; selectedIndices: number[] }
  | { kind: "short-answer"; text: string }
  | { kind: "matching"; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: "confidence"; rating: number }
  | { kind: "abandoned" };  // session ended or renderer never resolved

type QuickCheckEvent =
  | { kind: "pending"; callId: string; sessionId: SessionId; item: AssignmentItem }
  | { kind: "resolved"; callId: string; answer: QuickCheckAnswer };
```

The `praxis.quickCheck.resolve` IPC handler accepts `{ callId: string; answer: QuickCheckAnswer }` from the renderer and resolves the pending `Promise` in `QuickCheckService`. See SPEC.md §"Human-in-the-loop tool dispatch" for the full dispatch semantics.

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
  /**
   * Phase 16: open a child session bound to an assignment, deriving the mode
   * from the assignment's kind. The child session's parentSessionId is set so
   * tabs can link back to the tutor session.
   */
  spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle>;
  /**
   * Phase 16: inject a `system_note` event into a running session's event
   * stream. Used by AssignmentService to notify the teach-mode tutor when
   * a child assignment is submitted.
   */
  notifySession(input: {
    sessionId: SessionId;
    note: string;
    origin: SystemNoteOrigin;
  }): Promise<void>;
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

## Phase 10 additive changes

### `course.current_concept` output schema (additive, Phase 10)

The tool output gained five new optional fields in Phase 10. Existing Phase 6 callers that only read `conceptId`, `name`, `description`, and `lessonId` continue to work without modification.

```typescript
// Phase 6 fields (unchanged)
{ kind: "ok"; conceptId: string; name: string; description: string; lessonId: string }

// Phase 10 additions (always present on "ok" responses)
{
  reason: "next-in-order" | "frontier" | "review" | "interleave";
  masteryNow: number;      // 0..1 — decay-aware BKT estimate
  uncertainty: number;     // 0..1 — BKT uncertainty
  reviews: Array<{ conceptId: string; name: string; reason: "review"; masteryNow: number }>;
  interleaves: Array<{ conceptId: string; name: string; reason: "interleave"; masteryNow: number }>;
}
```

### `PackImportService` (new port, Phase 10)

Exposed to tools via `ToolServices.packs`. Implemented by `PackImportServiceImpl` in `@praxis/curriculum/packs`. The port lives in `@praxis/core/types/tool.ts`.

```typescript
interface PackImportService {
  listAvailablePacks(): Promise<PackSummaryView[]>;
  importPack(packId: string): Promise<ImportedPackView>;   // idempotent
  listImportedPacks(): Promise<ImportedPackView[]>;
  findPackBySubject(subject: string): Promise<PackSummaryView | null>;
  getConceptGraphForPack(packId: string): Promise<string | null>;
}

interface PackSummaryView {
  id: string; version: string; name: string; subject: string;
  gradeLevel: string; conceptCount: number; edgeCount: number; imported: boolean;
}

interface ImportedPackView {
  packId: string; version: string; conceptGraphId: ConceptGraphId; importedAt: number;
}
```

### Pack JSON format (Phase 10)

Pack files live in `packages/curriculum/packs/*.json`. The manifest schema:

```typescript
interface PackManifest {
  id: string;              // e.g. "algebra-1"
  version: string;         // semver
  name: string;
  subject: string;         // e.g. "math.algebra-1"
  gradeLevel: string;
  concepts: Array<{ id: string; name: string; description: string;
                    aliases?: string[]; standardsTags?: string[] }>;
  edges: Array<{ from: string; to: string; strength: number; rationale?: string }>;
}
```

Concept `id` values are prefixed as `<packId>.<conceptSlug>` within the pack JSON. When imported, the database stores them as `<conceptGraphId>:<packId>.<conceptSlug>`. Treat all concept IDs as opaque strings from the caller's perspective.

### `ArtifactsService.concepts(courseId)` (new method, Phase 10)

Returns all concepts for a course (looked up via the course's `conceptGraphId`). Exposed via IPC as `praxis.artifacts.concepts`.

```typescript
// Added to ArtifactsService in @praxis/core/types/tool.ts
concepts(courseId: CourseId): Promise<Array<{
  id: string; graphId: string; name: string; description: string;
  aliases: string[]; standardsTags: string[];
}>>;
```

### `PacksClient` (new client surface, Phase 10)

Exposed as `PraxisClient.packs`. Implemented by `PacksClientImpl` in `@praxis/client`.

```typescript
interface PacksClient {
  listAvailable(): Promise<PackSummaryClient[]>;
  listImported(): Promise<ImportedPackClient[]>;
  import(packId: string): Promise<ImportedPackClient>;
}
```

## Phase 11 additive changes

### `AuthoringService` — expanded client surface (Phase 11)

The `AuthoringService` interface in `@praxis/client` is fully implemented (replacing the Phase 3 stub). All methods are transported over `praxis.author.*` IPC channels. The IPC layer enforces lock via `requireUnlocked()` before every write.

```typescript
interface AuthoringService {
  // Course / lesson / gate — full CRUD
  updateCourse(input: { courseId: CourseId; patch: Partial<...>; reason?: string }): Promise<Course>;
  createLesson(input: { courseId: CourseId; title: string; conceptIds: ConceptId[]; ... }): Promise<Lesson>;
  updateLesson(input: { lessonId: LessonId; patch: Partial<...> }): Promise<Lesson>;
  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;
  createGate(input: { courseId: CourseId; guards: GateTarget; prerequisites: GateId[]; successCriteria: SuccessCriteria }): Promise<Gate>;
  updateGate(input: { gateId: GateId; patch: Partial<...>; reason?: string }): Promise<Gate>;
  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;
  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate>;
  getCourseSummary(courseId: CourseId): Promise<{ course: Course; lessons: Lesson[]; gates: Gate[]; concepts: [...] }>;
  // Prompt customization
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;
  // Prompt customization layers (user-authored fragments)
  setGlobalPrompt(text: string): Promise<void>;
  getGlobalPrompt(): Promise<string>;
  setModeAppend(input: { modeId: string; text: string }): Promise<void>;
  getModeAppend(modeId: string): Promise<string>;
  previewPrompt(input: { modeId: string; draftGlobal?: string; draftAppend?: string }): Promise<string>;
  // Memory administration
  resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { reason: string; confirm: true }): Promise<void>;
  // Audit log
  listConfiguratorActions(input?: { fromTs?: Timestamp; limit?: number }): Promise<ConfiguratorActionRow[]>;
}
```

### `PromptCustomizationService` — prompt customization layers

`PromptCustomizationServiceImpl` in `@praxis/core/services` reads and writes the two user-authored prompt slots that feed the `user-global` and `user-append` `PromptFragment` positions described under the Mode contract. Storage:

- **Global fragment** — `config_kv` row at key `prompt.global_fragment`, value `{ text: string }`. Applied across every mode.
- **Per-mode append** — row in the `mode_prompt_appends` table keyed by `mode_id`. Applied only to the named mode.

`SessionServiceImpl.openActive` calls `promptCustomization.getEffectiveAdditionalFragments(modeId)` to produce `{ id, position, template, customizable: false }` records, then passes them to `composeSystemPrompt(...)` as `additionalFragments`. Writes go through `AuthoringServiceImpl.setGlobalPrompt` / `setModeAppend`, which append a `prompt.set_global` or `prompt.set_mode_append` `ConfiguratorAction` audit row carrying **only the character count** of the text — never the content itself — so secrets pasted into a prompt do not leak into the audit log.

### `LockService` — new client surface (Phase 11)

Exposed as `PraxisClient.lock`. Implemented by `LockClientImpl` in `@praxis/client`, backed by `praxis.lock.*` IPC channels. Server-side `LockServiceImpl` stores a bcrypt hash in the `lock_state` table; the in-process unlocked flag is not persisted.

```typescript
interface LockClient {
  isSet(): Promise<boolean>;
  isUnlocked(): Promise<boolean>;
  setLockCode(input: { code: string }): Promise<void>;  // 4–8 digits
  unlock(input: { code: string }): Promise<{ ok: boolean }>;
  lock(): Promise<void>;
  clearLock(input: { currentCode: string }): Promise<void>;
}
```

### `ConfiguratorAction` — audit discriminated union (Phase 11)

Every write through `AuthoringServiceImpl` appends a `configurator_actions` row. The `action_json` column stores one of 15 `ConfiguratorAction` variants (discriminated by `kind`):

```typescript
type ConfiguratorAction =
  | { kind: "course.edit"; courseId: CourseId; patch: Partial<...>; reason?: string }
  | { kind: "lesson.create"; courseId: CourseId; lessonId: LessonId }
  | { kind: "lesson.edit"; lessonId: LessonId; patch: Partial<...> }
  | { kind: "lesson.delete"; lessonId: LessonId; reason?: string }
  | { kind: "gate.create"; gateId: GateId; courseId: CourseId }
  | { kind: "gate.edit"; gateId: GateId; patch: Partial<...>; reason?: string }
  | { kind: "gate.delete"; gateId: GateId; reason?: string }
  | { kind: "gate.override"; gateId: GateId; reason: string }
  | { kind: "prompt.override_fragment"; modeId: string; fragmentId: string }
  | { kind: "prompt.clear_fragment"; modeId: string; fragmentId: string }
  | { kind: "prompt.set_style"; level: { socratic: number; verbosity: number; formality: number } }
  | { kind: "prompt.set_global"; charCount: number }                  // value stores only char count, never content
  | { kind: "prompt.set_mode_append"; modeId: string; charCount: number }
  | { kind: "memory.reset_concept"; conceptId: ConceptId; reason: string }
  | { kind: "memory.clear_misconception"; misconceptionId: MisconceptionId; reason: string }
  | { kind: "memory.export" }
  | { kind: "memory.delete_all"; reason: string };
```

### `MemoryService` Phase 11 additions

Three new methods on the server-side `MemoryService` (in `@praxis/core/types/tool.ts`):
- `resetConcept(input)` — upserts BKT priors, clears evidence
- `clearMisconception(input)` — marks misconception "manually-cleared"
- `exportToFile(input)` — writes full memory snapshot as JSON to `targetPath`

### `configure` mode (Phase 11)

New mode with `id: "configure"`, `uiSurface: "configure"`, `requiredRole: "configurator"`. Session start is gated by `LockService.isUnlocked()` in `SessionServiceImpl`. Bootstrap mode intentionally has no lock gate (first-run authoring is lock-free).

Tool set: all bootstrap tools + 11 authoring tools + 4 configure-memory tools = 25 tools total.

Prompt fragments: preamble, role.configure (customizable), principles, tools.configure (not customizable), course-context, constraints, postamble.

### CLI additions (Phase 11)

`pnpm db:configurator-actions` — queries the `configurator_actions` table and prints a formatted table. Accepts `--limit <n>` and `--from <iso-date>` flags.

## Phase 12 additive changes

### `NoteBody` — discriminated union (`packages/core/src/types/notes.ts`)

```typescript
type NoteBody =
  | { kind: "cornell"; questions: string[]; details: string[]; summary: string }
  | { kind: "feynman"; explanation: string; followUps: string[] }
  /**
   * Outline body — exactly one of `rows`/`root` is present:
   *   rows: OutlineRow[]  — flat-list (keyboard-first editor, preferred).
   *   root: OutlineNode   — legacy recursive tree (migrated to rows on first editor load).
   */
  | { kind: "outline"; rows?: OutlineRow[]; root?: OutlineNode }
  | { kind: "free"; text: string }
  | { kind: "sketch"; snapshot: unknown };

interface OutlineNode { text: string; children: OutlineNode[]; }

/** Flat bullet row in the keyboard-first outline editor. */
interface OutlineRow {
  id: string;
  text: string;
  /** 1 = top-level heroic; 4 = muted-italic aside. */
  level: 1 | 2 | 3 | 4;
  isCheckbox?: boolean;
  checked?: boolean;
}
```

Runtime helpers exported from `@praxis/core/types`: `parseNoteBody(format, bodyJson)`, `serializeNoteBody(body)`.

### `Rating` + `FsrsState` + `FsrsScheduler` — new types (`packages/core/src/types/flashcards.ts`)

```typescript
type Rating = "again" | "hard" | "good" | "easy";

interface FsrsState {
  state: Record<string, unknown>; // opaque ts-fsrs Card
  nextReviewAt?: Timestamp;
  lastReviewedAt?: Timestamp;
  reps: number;
  lapses: number;
}

interface FsrsScheduler {
  initial(now: Timestamp): FsrsState;
  review(input: { state: FsrsState; rating: Rating; now: Timestamp }): FsrsState;
  preview(input: { state: FsrsState; now: Timestamp }): Record<Rating, { nextReviewAt: Timestamp }>;
}
```

### `NotesService` + `FlashcardsService` — new server-side service ports (`packages/core/src/types/tool.ts`)

Added to `ToolServices`: `notes: NotesService`, `flashcards: FlashcardsService`, `fsrsScheduler: FsrsScheduler`.

### `NotesClient` + `FlashcardsClient` — new client-side surfaces (`packages/core/src/types/client.ts`)

Added to `PraxisClient`: `notes: NotesClient`, `flashcards: FlashcardsClient`.

IPC channels follow `praxis.notes.*` and `praxis.flashcards.*` conventions.

### 9 new tools (Phase 12)

| Tool name | Category | Description |
|---|---|---|
| `note.create` | notes | Create a structured note |
| `note.update` | notes | Update note body |
| `note.show` | notes | Fetch a note by ID |
| `note.list` | notes | List notes with optional filters |
| `note.from_session_summary` | notes | Generate note from session transcript via LLM |
| `flashcard.create` | flashcards | Create a flashcard |
| `flashcard.from_note` | flashcards | Extract flashcard pairs from a note |
| `flashcard.review` | flashcards | Submit review rating; advances FSRS state |
| `flashcard.review_next` | flashcards | Fetch next due cards with preview intervals |

All 9 are in `teach` mode's `toolNames` list.

### CLI additions (Phase 12)

`pnpm db:cards-due` — queries the `flashcards` table for cards with `nextReviewAt <= now` and prints a table. Uses read-only DB connection.

## Phase 13 additive changes

Phase 13 (editorial foundation) added no new types to this contract. Changes were visual-layer only: editorial CSS, copy module, streaming pacing.

## Phase 14 additive changes

### `TabsService` — new client surface (Phase 14)

Exposed as `PraxisClient.tabs`. Backed by `praxis.tabs.*` IPC channels.

```typescript
interface TabsClient {
  list(): Promise<TabSummary[]>;
  open(input: { sessionId: SessionId; modeId: string; title?: string }): Promise<TabSummary>;
  close(tabId: string): Promise<void>;
  rename(tabId: string, title: string): Promise<void>;
  restore(): Promise<TabSummary[]>; // returns all non-archived tabs for restart
}

interface TabSummary {
  id: string;
  sessionId: SessionId;
  modeId: string;
  title: string;
  openedAt: Timestamp;
  lastSeenAt: Timestamp;
  archived: boolean;
}
```

### `SessionService.list` — new method (Phase 14)

```typescript
// Added to SessionService
list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]>;
```

## Phase 15a / 15b additive changes

### Sketch input pattern (Phase 15a)

Tools that accept sketched work return `{ json: TldrawSnapshot; image: ImageRef }`. Sketches are `tier: "grounded"`. The `sketch.read` tool is available in `teach` and `exam` modes.

### `ConceptMapDrawing` (Phase 15b)

The `ConceptMapDrawing` artifact and supporting types (`ConceptLink`, `ConceptMapDivergence`, `ConceptMapVersion`, `ConceptMapSummary`) are defined in the Artifact schemas section above. `ConceptMapService` is exposed via `praxis.conceptMaps.*` IPC channels.

## Phase 16 additive changes

### `EngineEvent.system_note` + `SystemNoteOrigin` (Phase 16)

See the updated `EngineEvent` union and `SystemNoteOrigin` type in the Engine adapter contract above.

### `Course.assessmentPlan` (Phase 16)

`Course` gains an optional `assessmentPlan?: AssessmentPlan` field. See the `Unit`, `LessonAssessment`, and `AssessmentPlan` types in the Artifact schemas section above.

### `Assignment.parentSessionId` (Phase 16)

`Assignment` gains an optional `parentSessionId?: SessionId` field tracking which teach-mode session issued the assignment via `assignment.create`.

### `SessionService.spawnFromAssignment` + `SessionService.notifySession` (Phase 16)

Both methods added to `SessionService` — see the updated interface in the Client RPC contract section above.

### `SessionHandle.parentSessionId` (Phase 16)

```typescript
interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId;
  assignmentId?: AssignmentId;        // Phase 8
  modeId: string;
  startedAt: Timestamp;
  parentSessionId?: SessionId;        // Phase 16 — set for sessions opened via spawnFromAssignment
}
```

### `ActivityRegistry` / `ActivityItem` / `ActivityEvent` (activity rail)

Ambient progress surface. Producers call `ActivityRegistry.start()` to register a running item; the rail streams `ActivityEvent`s to the renderer.

```typescript
interface ActivityItem {
  id: string;
  label: string;
  detail?: string;
  progress?: { value: number; total: number };
  status: "running" | "done" | "failed";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  errorMessage?: string;
  quietPeriodMs?: number;   // hide from rail until running this long
  lingerMs?: number;
  failedLingerMs?: number;
  /** Phase 16: opaque producer payload (e.g. `{ kind: "assignment.issued", assignmentId, parentSessionId }`). */
  metadata?: Record<string, unknown>;
}

type ActivityEvent =
  | { kind: "snapshot"; items: readonly ActivityItem[] }
  | { kind: "added"; item: ActivityItem }
  | { kind: "updated"; item: ActivityItem }
  | { kind: "removed"; id: string };

interface ActivityRegistry {
  start(input: ActivityStartInput): ActivityHandle;
  list(): readonly ActivityItem[];
  subscribe(listener: (event: ActivityEvent) => void): () => void;
  dismiss(id: string): void;
  shutdown(): void;
}

interface ActivityHandle {
  readonly id: string;
  update(patch: { label?: string; detail?: string; progress?: { value: number; total: number } }): void;
  finish(status: "done" | "failed", err?: { message: string }): void;
}
```

`ActivityRegistry` is injected via `ServiceDeps.activity`. Add new long-running producers by calling `ctx.activity?.start({ label, ... })` — do not create new blocking modals.

### New tools (Phase 16)

| Tool name | Mode(s) | Description |
|---|---|---|
| `clarification` | exam | Rephrase a confusing exam prompt; never reveals method or answer |
| `course.start_exploration` | bootstrap | Entry point for the multi-turn agentic bootstrap explorer |
| `course.draft_add_unit` | bootstrap (explorer) | Add a proposed unit to the in-progress draft |
| `course.draft_set_assessment_plan` | bootstrap (explorer) | Set the assessment plan on the draft |
| `course.draft_add_lesson_assessment` | bootstrap (explorer) | Add an assessment shell to a lesson in the draft |

## Phase 17 additive changes

Phase 17 (item types and quick-checks) expanded `AssignmentItem` into a full discriminated union and introduced the `QuickCheckService` human-in-the-loop dispatch pattern that lets the tutor pose inline formative questions mid-session without creating a graded assignment.

### `AssignmentItem` discriminated union expansion (Phase 17)

Six new item kinds join the existing `single-choice`, `multi-select`, `short-answer`, `free-response`, `math`, and `code` kinds in `packages/core/src/types/artifacts.ts`. The `kind` field is the discriminant throughout.

```typescript
// Phase 17 additions to AssignmentItem

interface NumericalItem {
  kind: "numerical";
  id: string;
  prompt: string;
  expectedValue: number;
  /** Absolute tolerance: |studentValue - expectedValue| ≤ tolerance. Default 0. */
  tolerance?: number;
  /** Optional units; case-insensitive exact-string match. */
  expectedUnits?: string;
  /** When set, student answer must round to this many significant figures. */
  significantFigures?: number;
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

interface MatchingItem {
  kind: "matching";
  id: string;
  prompt: string;
  leftItems: Array<{ id: string; text: string }>;
  rightItems: Array<{ id: string; text: string }>;
  /** Correct pairs as (leftId, rightId). One-to-one bijection in v1. */
  correctPairs: Array<{ leftId: string; rightId: string }>;
  authoredBy?: "tutor" | "configurator";
}

interface OrderingItem {
  kind: "ordering";
  id: string;
  prompt: string;
  /** Items shown in shuffled order to the student. Each has a stable id. */
  items: Array<{ id: string; text: string }>;
  /** Correct sequence as an array of item ids. Must be a permutation of items[].id. */
  correctOrder: string[];
  authoredBy?: "tutor" | "configurator";
}

interface TwoTierItem {
  kind: "two-tier";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  reasonPrompt: string;
  reasonOptions: string[];
  correctReasonIndex: number;
  /**
   * Maps each reason option index to a misconception id (or null when the
   * option is correct or has no clear misconception). Length must equal
   * reasonOptions.length.
   */
  misconceptionByReasonIndex: Array<string | null>;
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

// Full union after Phase 17
type AssignmentItem =
  | SingleChoiceItem
  | MultiSelectItem
  | ShortAnswerItem
  | FreeResponseItem
  | MathItem
  | CodeItem
  | NumericalItem
  | MatchingItem
  | OrderingItem
  | TwoTierItem;
```

Note: `"single-choice"` is the canonical kind (renamed from the pre-Phase-17 `"multiple-choice"`); a one-shot Drizzle migration rewrites stored JSON.

### `QuickCheckService` — in-process human-in-the-loop dispatch (`packages/core/src/types/quick-check.ts`)

Tool handlers call `await()` to block until the student answers an inline card; the renderer resolves via IPC. The service never persists answers — it is purely in-memory coordination.

```typescript
type QuickCheckAnswer =
  | { kind: "single-choice"; selectedIndex: number }
  | { kind: "multi-select"; selectedIndices: number[] }
  | { kind: "short-answer"; text: string }
  | { kind: "matching"; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: "confidence"; rating: number }
  | { kind: "abandoned" };

type QuickCheckEvent =
  | { kind: "pending"; callId: string; sessionId: SessionId; item: AssignmentItem }
  | { kind: "resolved"; callId: string; answer: QuickCheckAnswer };

interface QuickCheckService {
  await(input: {
    callId: string;
    sessionId: SessionId;
    item: AssignmentItem;
    timeoutMs?: number;
  }): Promise<QuickCheckAnswer>;
  resolve(input: { callId: string; answer: QuickCheckAnswer }): void;
  cancel(callId: string): void;
  subscribe(listener: (event: QuickCheckEvent) => void): () => void;
}
```

`QuickCheckService` is injected into `ToolServices` at `ctx.services.quickCheck`. Tool handlers receive it through `ToolContext.services`.

### `QuickCheckClientApi` — renderer-side surface (`packages/core/src/types/client.ts`)

```typescript
interface QuickCheckClientApi {
  events(): AsyncIterable<QuickCheckEvent>;
  resolve(input: { callId: string; answer: QuickCheckAnswer }): Promise<void>;
}
```

Exposed as `PraxisClient.quickCheck`. The renderer subscribes to `events()` once per app session and renders a `<QuickCheckCard>` whenever a `pending` event arrives; it calls `resolve()` when the student submits.

### IPC channel family `praxis.quickCheck.*` (`packages/desktop/electron/main/quick-check-channel.ts`)

- `praxis.quickCheck.events.start` (invoke with streamId) — subscribe to `QuickCheckEvent` stream
- `praxis.quickCheck.events.events.<streamId>` (push) — `IpcStreamMessage<QuickCheckEvent>`
- `praxis.quickCheck.events.cancel` (on streamId) — unsubscribe
- `praxis.quickCheck.resolve` (invoke) — deliver `{ callId, answer }` to the waiting tool handler

### New tools (Phase 17)

| Tool name | Mode(s) | Description |
|---|---|---|
| `quick_check.single_choice` | teach, study-skills | Inline single-choice card; blocks until the student answers |
| `quick_check.multi_select` | teach, study-skills | Inline multi-select card; blocks until the student submits |
| `quick_check.short_answer` | teach, study-skills | Inline free-text card; formative only, no answer key |
| `quick_check.matching` | teach, study-skills | Inline drag-and-drop pairing card |
| `quick_check.confidence` | teach, study-skills | Inline self-assessed confidence rating (1–4 or 1–5 scale) |

## Phase 18 additive changes

Phase 18 (study-skills + procedural memory) introduced the `study-skills` mode, the `PedagogyPackService` read-only pack accessor, five pedagogy tools, the metacognitive-prompts prompt fragment, and two new session-end indexers (`AffectiveIndexer`, `ProceduralIndexer`) backed by new schema tables. The router's `RouterInput` and `RouterSuggestion` types also gained affective and procedural fields.

### `PedagogyPackService` — read-only pack accessor (`packages/core/src/types/tool.ts`)

Loads the pedagogy pack JSON at boot; every accessor is synchronous. In empty-pack mode (no file or invalid JSON), all methods return empty arrays or `null`. Implemented by `PedagogyPackServiceImpl` in `@praxis/curriculum/pedagogy`; injected at `ServiceDeps.toolServices.pedagogyPack`.

```typescript
interface PedagogyPackService {
  /** Returns the loaded pack, or null if no pack is available at runtime. */
  current(): PedagogyPack | null;
  /** All teaching strategies in the loaded pack (empty if no pack). */
  listStrategies(): readonly TeachingStrategy[];
  /** Lookup a teaching strategy by id. Returns null if no pack or unknown id. */
  getStrategy(id: StrategyId): TeachingStrategy | null;
  /** All study techniques in the loaded pack (empty if no pack). */
  listTechniques(): readonly StudyTechnique[];
  /** Lookup a study technique by id. Returns null if no pack or unknown id. */
  getTechnique(id: TechniqueId): StudyTechnique | null;
  /**
   * Metacognitive prompts in the loaded pack, optionally filtered by trigger.
   * Returns an empty array if no pack is loaded.
   */
  listMetacognitivePrompts(opts?: {
    trigger?: MetacognitivePromptTrigger;
  }): readonly MetacognitivePrompt[];
}
```

### `study-skills` mode (Phase 18)

New mode (`packages/curriculum/src/modes/study-skills.ts`): `id: "study-skills"`, `label: "Study Skills"`, `requiredRole: "student"`, `uiSurface: "chat"`. Tool set: all five `pedagogy.*` tools, `course.what_can_i_teach`, all five `note.*` and four `flashcard.*` workspace tools, and four `quick_check.*` tools (excludes `quick_check.matching`). The mode does **not** include the metacognitive-prompts fragment (the fragment is excluded from study-skills, bootstrap, and configure).

### Metacognitive-prompts prompt fragment (`packages/curriculum/src/modes/fragments/metacognitive-prompts.ts`)

A parameterised fragment (`position: "principles"`, `customizable: false`) injected into `teach`, `quiz`, `homework`, and `exam` modes. It instructs the model to call `pedagogy.list_metacognitive_prompts({ trigger })` at five trigger moments (`pre-reading`, `post-reading`, `pre-quiz`, `post-error`, `session-end`) and weave one prompt naturally into the response. The fragment is absent from `study-skills`, `bootstrap`, and `configure`.

```typescript
type MetacognitivePromptTrigger =
  | "pre-reading"
  | "post-reading"
  | "pre-quiz"
  | "post-error"
  | "session-end";
```

### Affective and procedural indexer schema additions (`packages/memory/src/schema.ts`)

Two new tables written by the session-end indexers:

```typescript
// affective_samples — written by AffectiveIndexer
// source: "explicit-checkin" from quick_check.confidence tool results;
//         "model-inferred" from a one-shot LLM pass over the transcript.
// Values stored as milli-units (0..1000 = 0..1 float).

// procedural_strategies — written by ProceduralIndexer
// Tracks per-student, per-strategy preference in milli-units (-1000..1000).
// evidenceCount accumulates across sessions; delta per session capped to [-300, +300].
// Composite primary key: (studentId, strategyId).
```

`AffectiveIndexer` (`packages/core/src/services/indexers/affective-indexer.ts`) runs at `schedule: "session-end"`. It extracts `quick_check.confidence` tool_call/tool_result pairs as `source: "explicit-checkin"` rows, then runs a one-shot LLM inference over the transcript to produce one `source: "model-inferred"` row per session. Either path failing is non-fatal.

`ProceduralIndexer` (`packages/core/src/services/indexers/procedural-indexer.ts`) runs at `schedule: "session-end"`. It reads the session's current lesson `suggestedStrategy`, validates it against the loaded pedagogy pack, scores a preference delta from deterministic event signals (`grade_math`, `course.mark_studied`, `code_sandbox`), and upserts the `procedural_strategies` row with loss aversion (negative delta ×2).

### `RouterInput` and `RouterSuggestion` — Phase 18 additions (`packages/curriculum/src/router/types.ts`)

```typescript
// Fields added to RouterInput (Phase 18)
interface RouterInput {
  // ... existing fields ...
  /** Per-strategy preference + evidence, from the procedural indexer. Optional. */
  proceduralStrategies?: ReadonlyMap<string, { preference: number; evidenceCount: number }>;
  /** Rolling baseline engagement / frustration / confidence averages. Optional. */
  affectiveBaseline?: { engagement: number; frustration: number; confidence: number };
  /** Most-recent affect samples, most-recent first. Optional. */
  recentAffect?: ReadonlyArray<{ engagement: number; frustration: number; confidence: number }>;
}

// Fields added to RouterSuggestion (Phase 18)
interface RouterSuggestion {
  // ... existing fields ...
  /** Teaching strategy for the primary concept; overridden by procedural preferences when evidence is sufficient. */
  suggestedStrategy: StrategyId;
  /** "easier" | "normal" | "harder" based on frustration/ease signals from affective data. */
  difficultyHint: "easier" | "normal" | "harder";
  /** "study-skills" when sustained high frustration is detected; null otherwise. */
  suggestedModeTransition: "study-skills" | null;
}
```

### New tools (Phase 18)

| Tool name | Mode(s) | Description |
|---|---|---|
| `pedagogy.list_strategies` | teach, quiz, homework, exam, study-skills | List all teaching strategies from the loaded pedagogy pack |
| `pedagogy.get_strategy` | teach, quiz, homework, exam, study-skills | Fetch a single teaching strategy by id |
| `pedagogy.list_techniques` | teach, quiz, homework, exam, study-skills | List all study techniques from the loaded pedagogy pack |
| `pedagogy.get_technique` | teach, quiz, homework, exam, study-skills | Fetch a single study technique by id |
| `pedagogy.list_metacognitive_prompts` | teach, quiz, homework, exam, study-skills | List metacognitive prompts, optionally filtered by trigger |

## Phase 19 additive changes

Phase 19 (ship-v1) added the auto-update check surface, the first-run onboarding config, the bootstrap draft-stream client, and the biology canonical pack. These are additive surfaces; no existing interfaces changed shape.

### `UpdateService` / `UpdateClientApi` / `UpdateCheckResult` (Phase 19)

`UpdateService` lives server-side (`packages/core/src/services/update-service.ts`). The renderer-side port is `UpdateClientApi` (`packages/core/src/types/client.ts`). The renderer's surface is parameter-less — the main process knows the app version via `app.getVersion()`.

```typescript
type UpdateCheckResult =
  | { status: "disabled" }
  | { status: "up-to-date"; current: string }
  | { status: "available"; current: string; latest: UpdateFeed }
  | { status: "error"; message: string };

interface UpdateFeed {
  version: string;          // semver
  releaseDate?: string;     // ISO datetime
  downloadUrl: string;
  releaseNotesUrl?: string;
}

// Server-side
interface UpdateService {
  /**
   * One-shot update check. Returns "disabled" when no PRAXIS_UPDATE_FEED_URL
   * env var is set. Never throws — callers always receive a typed result.
   */
  checkLatest(currentVersion: string): Promise<UpdateCheckResult>;
}

// Renderer-side (via PraxisClient.update)
interface UpdateClientApi {
  checkLatest(): Promise<UpdateCheckResult>;
}
```

`UpdateFeed` is validated with Zod at runtime; a schema-mismatch yields `{ status: "error" }`. Enabled by setting `PRAXIS_UPDATE_FEED_URL` to a JSON endpoint.

- IPC channel: `praxis.update.checkLatest` (invoke) — handler in `packages/desktop/electron/main/ipc-server.ts`.
- Exposed as `PraxisClient.update`.

### `OnboardingConfig` — first-run state (`packages/core/src/config/onboarding-config.ts`)

```typescript
interface OnboardingConfig {
  /** ISO timestamp; null means first-run is not yet complete. */
  firstRunCompletedAt: string | null;
}
```

Stored in the `config_kv` table under key `"onboarding"`. Read by `readOnboardingConfig(db)`, written by `markFirstRunComplete(db)`. Default (fresh database): `{ firstRunCompletedAt: null }`.

- IPC channels (invoke): `praxis.config.firstRunCompleted`, `praxis.config.markFirstRunComplete` — both registered in `packages/desktop/electron/main/ipc-server.ts`.

### `DraftStreamClient` / `DraftStreamEvent` — bootstrap draft stream (`packages/core/src/types/draft-stream.ts`)

The bootstrap service streams draft mutations to the renderer so the right-pane outline rebuilds without polling.

```typescript
type DraftStreamEvent =
  | { kind: "snapshot"; drafts: readonly DraftCourseState[] }
  | { kind: "started"; draft: DraftCourseState }
  | { kind: "updated"; draft: DraftCourseState }
  | { kind: "finalized"; draftId: string; courseId: string }
  | { kind: "discarded"; draftId: string; reason: "expired" | "discarded" };

interface DraftStreamClient {
  events(): AsyncIterable<DraftStreamEvent>;
}
```

The server always delivers a `snapshot` event first on subscribe so a fresh subscriber sees current state immediately. Implemented by `DraftsClient` in `packages/client/src/services/drafts-client.ts`.

- IPC channel family (`packages/desktop/electron/main/bootstrap-drafts-channel.ts`):
  - `praxis.bootstrap.drafts.events.start` (invoke with streamId) — open subscription
  - `praxis.bootstrap.drafts.events.events.<streamId>` (push) — `IpcStreamMessage<DraftStreamEvent>`
  - `praxis.bootstrap.drafts.events.cancel` (on) — unsubscribe
- Exposed as `PraxisClient.drafts`.

### Biology canonical pack (`packages/curriculum/packs/biology.json`)

A second subject pack alongside `algebra-1.json` and `geometry.json`. Referenced by `course.use_canonical_pack` via subject id `"science.biology"`. The pack ships with the desktop bundle; its content version is tracked in the pack's top-level `version` field.

## Sub-agent transparency

When a tool handler spawns its own LLM agent (e.g. `course.start_exploration`'s bootstrap explorer), the framework surfaces that work as a first-class object in the chat thread so the student can see the steps it's taking. The contract lives in `@praxis/core/types/subagent.ts`.

```typescript
interface SubAgentItem {
  id: string;
  parentSessionId: SessionId;
  parentCallId: string;             // the parent tool_call.callId
  label: string;                    // human-readable agent name; e.g. "Bootstrap explorer"
  phase: SubAgentPhase;             // "running" | "succeeded" | "failed" | "cancelled"
  startedAt: Timestamp;
  endedAt?: Timestamp;
  steps: SubAgentStep[];            // append-only
}

interface SubAgentStep {
  id: string;
  kind: SubAgentStepKind;           // "tool_call" | "model_turn" | "narration"
  status: "started" | "succeeded" | "failed";
  toolName?: string;                // when kind === "tool_call"
  message?: string;                 // brief one-line summary surfaced in the UI
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

type SubAgentEvent =
  | { kind: "snapshot"; items: readonly SubAgentItem[] }
  | { kind: "started"; item: SubAgentItem }
  | { kind: "step_started"; itemId: string; step: SubAgentStep }
  | { kind: "step_settled"; itemId: string; step: SubAgentStep }
  | { kind: "phase_changed"; itemId: string; phase: SubAgentPhase; endedAt?: Timestamp };

interface SubAgentRegistry {
  start(input: { parentSessionId: SessionId; parentCallId: string; label: string }): SubAgentHandle | null;
  list(filter?: { parentSessionId?: SessionId; parentCallId?: string }): SubAgentItem[];
  subscribe(listener: (event: SubAgentEvent) => void, filter?: { parentCallId?: string }): () => void;
}

interface SubAgentHandle {
  itemId: string;
  step(kind: SubAgentStepKind, input: { toolName?: string; message?: string }): SubAgentStepHandle;
  finish(phase: "succeeded" | "failed" | "cancelled"): void;
}
```

`SubAgentRegistry` is exposed both as a top-level `ServiceDeps.subAgent` (for IPC fanout) and inside `ToolContext.services.subAgent` (so tool handlers can publish steps). Tools key their items on `ctx.callId` — the parent `tool_call`'s callId threaded in via `ToolDispatchMeta` — so the UI can render the sub-agent block inline with the originating tool_call. When `ctx.callId` is absent (test mode, direct invocation), `start(...)` returns `null` and the handler simply skips publishing without aborting its work.

**IPC channel family** (`packages/desktop/electron/main/subagent-channel.ts`):
- `praxis.subAgent.events.start` (invoke with `{ streamId, filter? }`) — open a filtered subscription
- `praxis.subAgent.events.events.<streamId>` (push) — `IpcStreamMessage<SubAgentEvent>`
- `praxis.subAgent.events.cancel` (on) — unsubscribe
- `praxis.subAgent.list` (invoke with optional filter) — snapshot read

Exposed as `PraxisClient.subAgent`. `<SubAgentBlock>` and `<SubAgentPanel>` (in `@praxis/ui`) render the items inline within the chat thread.

## Versioning rules

- All packages follow semver.
- **Major bump required** for: breaking changes to any interface in this document, removal or rename of fields, change of semantics on an existing field.
- **Minor bump** for: additive optional fields with sensible defaults, new optional methods, new tool definitions, new mode definitions.
- **Patch bump** for: bug fixes, performance, internal refactors that don't change observed behavior.
- Engine adapters version independently. The `Engine` interface in `@praxis/core` is the contract; adapters track its major version.
- Subject packs and pedagogy packs version independently and declare a compatible Praxis range in their manifest.
