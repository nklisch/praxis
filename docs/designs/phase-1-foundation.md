# Design: Phase 1 — Foundation Skeleton

## Overview

This design produces the bedrock everything else stands on: a pnpm monorepo with all `@praxis/*` packages stubbed, the complete TypeScript type contract derived from `CONTRACT.md`, the Drizzle SQLite schema for every v1 table, migration tooling, and a smoke-test suite. After Phase 1 completes, the project is ready for Phase 2 (engine layer + vertical-slice backend) without further structural decisions.

**No runtime logic ships in Phase 1** — only type definitions, schema definitions, and the migration runner. The DB module exposes `getDb()` and `migrate()` but no domain operations. Engines, tools, modes, memory layers, and modes are stubs that re-export type aliases.

## Scope and assumptions

- **Driver**: `better-sqlite3` (mature, synchronous, well-supported by Drizzle).
- **ID generation**: UUID v7 via the `uuid` package. Time-sortable. TypeScript brand types provide nominal typing.
- **Module system**: ESM (`"type": "module"`). Node 22+.
- **TypeScript**: 5.6+, strict, `verbatimModuleSyntax: true` so `import type` separation is enforced.
- **Testing**: vitest 2+. One workspace config; per-package tests collocated as `*.test.ts`.
- **Lint**: ESLint v9 flat config + `@typescript-eslint`. **Prettier** for formatting.
- **Embeddings deferred**: `Concept.embedding` exists as an optional TypeScript field, but no embedding column or sqlite-vec virtual table ships in Phase 1. Phase 5 adds `sqlite-vec` setup.
- **Single SQLite file**: stored at `~/Library/Application Support/Praxis/praxis.db` on macOS, equivalents on other OSes. In dev, defaults to `./.praxis/dev.db`.
- **`@praxis/core` runtime depends on domain packages' schemas** to assemble the full DB. This is intentional — `@praxis/core` is the orchestrator per `ARCHITECTURE.md`.

---

## Implementation Units

### Unit 1: Monorepo skeleton, root tooling, and conventions

**Files**:
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.workspace.ts`
- `eslint.config.js`
- `.prettierrc.json`
- `.gitignore`
- `.editorconfig`
- `.nvmrc`
- `.npmrc`
- `README.md`
- `CLAUDE.md`

**`package.json`**:

```json
{
  "name": "praxis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r run build",
    "typecheck": "pnpm -r run typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:generate": "drizzle-kit generate",
    "db:show": "tsx scripts/db-show.ts",
    "db:reset": "rm -f .praxis/dev.db && pnpm db:migrate"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@typescript-eslint/eslint-plugin": "^8.10.0",
    "@typescript-eslint/parser": "^8.10.0",
    "drizzle-kit": "^0.27.0",
    "eslint": "^9.13.0",
    "prettier": "^3.3.3",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

**`pnpm-workspace.yaml`**:

```yaml
packages:
  - "packages/*"
```

**`tsconfig.base.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**`vitest.workspace.ts`**:

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*",
  {
    test: {
      include: ["tests/**/*.test.ts"],
      name: "root",
      environment: "node",
    },
  },
]);
```

**`eslint.config.js`** — flat config with `@typescript-eslint`'s `recommended-type-checked`. Excludes `dist/`, `.praxis/`, `drizzle/` (generated migrations).

**`.prettierrc.json`**:

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

**`.gitignore`** must include: `node_modules/`, `dist/`, `.praxis/`, `*.tsbuildinfo`, `.env*`, `coverage/`, `.DS_Store`.

**`.nvmrc`**: `22`

**`.npmrc`**: `node-linker=isolated`, `auto-install-peers=true`

**`README.md`**: Quickstart instructions covering install, typecheck, test, db:migrate, db:show. Lists package layout. Points to `docs/` for design.

**`CLAUDE.md`**: Project conventions for AI coding agents. Includes:
- Stack summary (TS, pnpm workspace, Drizzle, vitest)
- Dependency direction rules (UI → client → core → domains → engines)
- Type-only imports must use `import type`
- File naming: kebab-case for files, PascalCase for types, camelCase for functions
- Tests are colocated as `*.test.ts` next to source
- No `any` without explanation comment
- Pointer to `docs/CONTRACT.md` as type SSOT

**Implementation Notes**:
- The pnpm version is pinned via `packageManager` for reproducible installs.
- `verbatimModuleSyntax: true` enforces that domain packages can only `import type` from `@praxis/core/types` — this is how the architectural rule "client may import types only from core" gets enforced at compile time.
- ESLint flat config (eslint v9+) is the modern standard; legacy `.eslintrc` is deprecated.
- `vitest.workspace.ts` discovers tests in every package and the root `tests/` dir.

**Acceptance Criteria**:
- [ ] `pnpm install` succeeds on a clean clone
- [ ] `pnpm typecheck` passes (no source files yet — checks tsconfig graph)
- [ ] `pnpm lint` runs without errors
- [ ] `pnpm format:check` passes on the committed config files
- [ ] `node --version` matches `.nvmrc`
- [ ] `CLAUDE.md` exists and references `docs/CONTRACT.md`

---

### Unit 2: Package stubs (9 packages)

**Files** (each package has these three files):

```
packages/core/{package.json,tsconfig.json,src/index.ts}
packages/engines/{package.json,tsconfig.json,src/index.ts}
packages/memory/{package.json,tsconfig.json,src/index.ts}
packages/artifacts/{package.json,tsconfig.json,src/index.ts}
packages/tools/{package.json,tsconfig.json,src/index.ts}
packages/curriculum/{package.json,tsconfig.json,src/index.ts}
packages/client/{package.json,tsconfig.json,src/index.ts}
packages/ui/{package.json,tsconfig.json,src/index.ts}
packages/desktop/{package.json,tsconfig.json,src/index.ts}
```

**Per-package `package.json` template** (shown for `@praxis/core`; other packages identical except for name and dependencies):

```json
{
  "name": "@praxis/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./db": "./src/db/index.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@praxis/artifacts": "workspace:*",
    "@praxis/memory": "workspace:*",
    "@praxis/curriculum": "workspace:*",
    "better-sqlite3": "^11.3.0",
    "drizzle-orm": "^0.36.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/uuid": "^10.0.0"
  }
}
```

**Per-package dependency map** (workspace deps only — npm deps detailed inline as units land):

| Package | Workspace deps |
|---|---|
| `@praxis/core` | `@praxis/artifacts`, `@praxis/memory`, `@praxis/curriculum` |
| `@praxis/engines` | (none — type-only `@praxis/core/types`) |
| `@praxis/memory` | (none — type-only `@praxis/core/types`) |
| `@praxis/artifacts` | (none — type-only `@praxis/core/types`) |
| `@praxis/tools` | (none — type-only `@praxis/core/types`) |
| `@praxis/curriculum` | (none — type-only `@praxis/core/types`) |
| `@praxis/client` | (none — type-only `@praxis/core/types`) |
| `@praxis/ui` | `@praxis/client` |
| `@praxis/desktop` | `@praxis/core`, `@praxis/ui` (runtime only; brings UI bundle) |

Type-only imports do not appear as runtime workspace deps in `package.json` — they're resolved through the type-only `exports` paths and consumed via `import type`. Each package's `tsconfig.json` adds `references` to `@praxis/core` so TS sees the types:

**Per-package `tsconfig.json` template**:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

**Per-package `src/index.ts`** is a stub that re-exports nothing meaningful in Phase 1 but proves the package compiles:

```typescript
// @praxis/<name> — stub; populated in subsequent phases.
export const PACKAGE_NAME = "@praxis/<name>" as const;
```

For `@praxis/core/src/index.ts`:

```typescript
export const PACKAGE_NAME = "@praxis/core" as const;
export * from "./types/index.js";
```

**Implementation Notes**:
- The exports map for `@praxis/core` exposes both `.` and `./types` — the latter is the type-only public API consumed by `@praxis/client` and others. This gives us the "types-only" boundary at module-resolution level.
- `composite: true` + `tsBuildInfoFile` enables TypeScript project references for incremental builds. `pnpm typecheck` traverses the full reference graph.
- `@praxis/core` deliberately depends on `artifacts`, `memory`, `curriculum` at runtime (DB schema aggregation in Unit 12) — this is the dependency direction from `ARCHITECTURE.md`.
- `@praxis/desktop` is the runtime entry that mounts `@praxis/core` and serves the `@praxis/ui` build; it's the only package outside `core` that imports `core` at runtime.

**Acceptance Criteria**:
- [ ] All 9 packages exist under `packages/`
- [ ] `pnpm -r run typecheck` succeeds (TypeScript project references resolve correctly)
- [ ] `pnpm -r run build` produces `dist/` per package
- [ ] No runtime cross-package imports exist except those listed in the dependency map above
- [ ] Importing `@praxis/core/types` from any package resolves to `packages/core/src/types/index.ts`

---

### Unit 3: Common types — IDs and base primitives

**File**: `packages/core/src/types/common.ts`

```typescript
/**
 * Branded primitive for nominal typing of IDs and other domain primitives.
 * Use the helpers in `ids.ts` to construct branded values.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Timestamp = Brand<number, "Timestamp">; // milliseconds since epoch

export interface Citation {
  source: string; // free-form: textbook section ref, URL, etc.
  locator?: { page?: number; section?: string; timestamp?: number };
  text?: string; // optional excerpt
}

export interface TimeRange {
  fromMs: number;
  toMs: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface GenerationParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Tldraw scene snapshot. Opaque to Praxis; persisted as JSON.
 * Real shape comes from the `tldraw` package; we keep it loose here so the
 * type module has no runtime tldraw dependency.
 */
export type TldrawSnapshot = Record<string, unknown>;
```

**File**: `packages/core/src/types/ids.ts`

```typescript
import type { Brand } from "./common.js";

export type StudentId = Brand<string, "StudentId">;
export type SessionId = Brand<string, "SessionId">;
export type EventId = Brand<string, "EventId">;
export type ArtifactSnapshotId = Brand<string, "ArtifactSnapshotId">;

export type CourseId = Brand<string, "CourseId">;
export type LessonId = Brand<string, "LessonId">;
export type TopicId = Brand<string, "TopicId">;
export type AssignmentId = Brand<string, "AssignmentId">;
export type GateId = Brand<string, "GateId">;
export type FlashcardId = Brand<string, "FlashcardId">;
export type NoteId = Brand<string, "NoteId">;
export type ConceptMapId = Brand<string, "ConceptMapId">;
export type DocumentId = Brand<string, "DocumentId">;

export type ConceptId = Brand<string, "ConceptId">;
export type ConceptGraphId = Brand<string, "ConceptGraphId">;
export type StrategyId = Brand<string, "StrategyId">;
export type TechniqueId = Brand<string, "TechniqueId">;
export type SubjectId = Brand<string, "SubjectId">;
export type SubjectPackId = Brand<string, "SubjectPackId">;
export type MisconceptionId = Brand<string, "MisconceptionId">;
export type ConfiguratorId = Brand<string, "ConfiguratorId">;

export type GradeBand = "K-2" | "3-5" | "6-8" | "9-12" | "undergrad" | "grad";

/**
 * Construct a new branded ID from a UUID v7 string. Caller responsible for
 * generating the UUID — this helper just brands it. Lives here (type module)
 * because it's a pure type-level coercion.
 */
export function brandId<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>;
}
```

**Acceptance Criteria**:
- [ ] Every ID listed in `CONTRACT.md` has a brand type
- [ ] `brandId<"CourseId">("uuid-string")` returns a `CourseId`
- [ ] A non-branded `string` cannot be assigned to a `CourseId` parameter without a cast
- [ ] `Timestamp` is a numeric brand (passes arithmetic checks)

---

### Unit 4: Engine, Tool, and Mode types

**File**: `packages/core/src/types/engine.ts`

```typescript
import type { TokenUsage, GenerationParams } from "./common.js";

export interface Engine {
  readonly id: string;
  readonly kind: "looped" | "single-shot";
  run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent>;
  health(): Promise<HealthStatus>;
}

export interface Brief {
  systemPrompt: string;
  userMessage: string;
  context: BriefContext;
  maxSteps?: number;
  generation?: GenerationParams;
}

export interface BriefContext {
  retrievedChunks: RetrievedChunk[];
  studentSummary?: string; // model-readable summary derived from semantic memory
  artifactRefs: string[];  // serialized references to artifacts in scope
}

export interface RetrievedChunk {
  documentId: string;
  text: string;
  locator: { page?: number; section?: string };
  score: number;
}

export interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  dispatch(name: string, args: unknown): Promise<ToolResult>;
}

export interface ToolDefinitionSummary {
  name: string;
  description: string;
  inputSchemaJson: unknown; // JSON Schema serialization
  tier: "deterministic" | "grounded" | "model-derived";
}

export type ToolResult =
  | { ok: true; value: unknown; tier: "deterministic" | "grounded" | "model-derived" }
  | { ok: false; error: { code: string; message: string; recoverable: boolean } };

export type EngineEvent =
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
}

export interface HealthStatus {
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

**File**: `packages/core/src/types/tool.ts`

```typescript
import type { z } from "zod";
import type { Logger } from "./common.js";
import type { StudentId, SessionId } from "./ids.js";

export type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  input: I;
  output: O;
  tier: "deterministic" | "grounded" | "model-derived";
  effects: ReadonlyArray<EffectKind>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

/**
 * Service handles available to tool handlers. These are placeholders in
 * Phase 1 — concrete service implementations land in subsequent phases.
 */
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  memory: unknown;       // MemoryService — concrete in Phase 7
  artifacts: unknown;    // ArtifactsService — concrete in Phase 6
  vectorStore: unknown;  // VectorStore — concrete in Phase 5
  sandbox: unknown;      // CodeSandbox — concrete in Phase 4
  sympy: unknown;        // SymPyService — concrete in Phase 4
  pedagogyPack: unknown; // PedagogyPackService — concrete in Phase 14
}
```

**File**: `packages/core/src/types/mode.ts`

```typescript
import type { Brief, EngineEvent } from "./engine.js";
import type { CourseId, ConceptId } from "./ids.js";

export type UISurfaceId = "chat" | "submission" | "progress-map" | "workspace" | "concept-map" | "configure";

export interface ArtifactScope {
  courseIds?: CourseId[];
  conceptIds?: ConceptId[];
  includeUnlocked?: boolean;
}

export type PromptFragmentPosition =
  | "preamble"
  | "role"
  | "principles"
  | "tools"
  | "context"
  | "constraints"
  | "postamble";

export interface PromptFragment {
  id: string;
  position: PromptFragmentPosition;
  template: string;
  customizable: boolean;
}

export interface ModeContext {
  brief: Brief;
  courseId?: CourseId;
  // Concrete fields populated by mode runtime in Phase 2+.
}

export interface Mode {
  id: string;
  label: string;
  description: string;
  requiredRole: "student" | "configurator";
  promptFragments: PromptFragment[];
  toolNames: string[];
  uiSurface: UISurfaceId;
  artifactScope?: ArtifactScope;
  shapeBrief?(brief: Brief, context: ModeContext): Brief;
  onTurnEnd?(events: EngineEvent[], context: ModeContext): Promise<void>;
}
```

**Implementation Notes**:
- `ToolRegistry.list()` returns summaries (name + description + JSON schema) rather than full `ToolDefinition`s — this keeps the registry serializable for engine adapters to translate into native formats.
- `ToolResult.ok: false` carries a `recoverable` flag — `EngineError` does too. Engines and tools share the convention so adapters can decide whether to retry.
- `BriefContext.retrievedChunks` is included in Phase 1 even though Phase 5 fills it; it's the carrier for retrieval results that the prompt composition will use.
- `ToolServices` uses `unknown` placeholders for services that Phase 1 hasn't built yet. This is deliberate — the type module makes the contract visible without depending on packages that don't have runtime code yet.

**Acceptance Criteria**:
- [ ] `Engine.run()` returns `AsyncIterable<EngineEvent>`
- [ ] `EngineEvent` is a discriminated union of seven variants matching `CONTRACT.md`
- [ ] `ToolDefinition` is generic over Zod schemas; type inference flows through `handler` args/return
- [ ] `Mode.toolNames` is `string[]` — names are resolved by registry at runtime, not at type level
- [ ] All types compile under `verbatimModuleSyntax: true` (no value imports of types)

---

### Unit 5: Artifact types

**File**: `packages/core/src/types/artifacts.ts`

```typescript
import type { Citation, Timestamp, TldrawSnapshot } from "./common.js";
import type {
  ConceptGraphId,
  ConceptId,
  ConceptMapId,
  ConfiguratorId,
  CourseId,
  DocumentId,
  EventId,
  FlashcardId,
  GateId,
  GradeBand,
  LessonId,
  AssignmentId,
  NoteId,
  SubjectId,
  SubjectPackId,
  StrategyId,
  StudentId,
  TopicId,
} from "./ids.js";

export interface Course {
  id: CourseId;
  studentId: StudentId;
  title: string;
  subject: SubjectId;
  gradeLevel: GradeBand;
  source: CourseSource;
  lessons: LessonId[];
  conceptGraphId: ConceptGraphId;
  gates: GateId[];
  thresholds: ThresholdConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type CourseSource =
  | { kind: "authored"; authorRole: "parent" | "teacher" | "self-directed" }
  | { kind: "bootstrapped"; sourceMaterials: DocumentId[] }
  | { kind: "imported"; pack: SubjectPackId };

export interface ThresholdConfig {
  conceptMastery: number;
  examPass: number;
  allowRetake: boolean;
  decayDays: number;
}

export interface Lesson {
  id: LessonId;
  courseId: CourseId;
  title: string;
  conceptIds: ConceptId[];
  references: Reference[];
  suggestedStrategy: StrategyId;
  estimatedMinutes: number;
}

export interface Reference {
  kind: "textbook" | "url" | "video" | "note";
  source: string;
  locator?: { page?: number; section?: string; timestamp?: number };
}

export interface Assignment {
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

export interface AssignmentItem {
  id: string;
  kind: "multiple-choice" | "short-answer" | "free-response" | "math" | "code";
  prompt: string;
  options?: string[];
  rubric?: Rubric;
}

export interface Rubric {
  criteria: Array<{ id: string; description: string; weight: number }>;
  maxScore: number;
}

export interface Grade {
  total: number;
  perItem: Array<{ itemId: string; score: number; feedback: string }>;
  rubricUsed?: Rubric;
  reviewedBy: "tool" | "rubric-agent" | "needs-human-review";
}

export interface Gate {
  id: GateId;
  courseId: CourseId;
  guards: GateTarget;
  prerequisites: GateId[];
  successCriteria: SuccessCriteria;
  state: GateState;
  evidence: EvidenceRef[];
}

export type GateTarget =
  | { kind: "concept"; conceptId: ConceptId }
  | { kind: "lesson"; lessonId: LessonId }
  | { kind: "topic"; topicId: TopicId }
  | { kind: "course-completion" };

export type SuccessCriteria =
  | { kind: "mastery-threshold"; conceptIds: ConceptId[]; minScore: number }
  | { kind: "exam-pass"; assignmentId: AssignmentId; minScore: number }
  | { kind: "and"; criteria: SuccessCriteria[] }
  | { kind: "or"; criteria: SuccessCriteria[] };

export type GateState =
  | { kind: "locked"; missingPrerequisites: GateId[] }
  | { kind: "unlocked"; unlockedAt: Timestamp; evidence: EvidenceRef[] }
  | { kind: "overridden"; by: ConfiguratorId; reason: string; at: Timestamp };

export interface EvidenceRef {
  kind: "event" | "assignment" | "manual";
  id: string;
}

export interface Flashcard {
  id: FlashcardId;
  studentId: StudentId;
  conceptId?: ConceptId;
  front: string;
  back: string;
  reviewState: ReviewState;
  source: { kind: "authored" | "extracted" | "user-created"; ref?: string };
}

/**
 * Spaced-repetition state. Phase 12 chooses FSRS or SM-2 implementation;
 * the type carries the algorithm-specific fields opaquely as JSON.
 */
export interface ReviewState {
  algorithm: "fsrs" | "sm2";
  state: Record<string, unknown>;
  nextReviewAt?: Timestamp;
  lastReviewedAt?: Timestamp;
}

export interface Note {
  id: NoteId;
  studentId: StudentId;
  context: NoteContext;
  format: "cornell" | "feynman" | "free" | "outline" | "sketch";
  body?: string;
  sketchScene?: TldrawSnapshot;
  links: ArtifactRef[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NoteContext {
  courseId?: CourseId;
  lessonId?: LessonId;
  sessionId?: string;
  conceptIds?: ConceptId[];
}

export interface ConceptMapDrawing {
  id: ConceptMapId;
  studentId: StudentId;
  courseId?: CourseId;
  scene: TldrawSnapshot;
  conceptLinks: Array<{ elementId: string; conceptId: ConceptId; confidence: number }>;
  divergences?: ConceptMapDivergence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ConceptMapDivergence {
  kind: "missing-edge" | "extra-edge" | "mislabeled-direction" | "missing-concept";
  description: string;
  elementIds: string[];
}

export interface ArtifactRef {
  kind: "course" | "lesson" | "assignment" | "note" | "flashcard" | "concept-map" | "document";
  id: string;
}

export interface DraftCourse {
  course: Course;
  draftLessons: Lesson[];
  proposedConcepts: ProposedConcept[];
  proposedEdges: ProposedEdge[];
  needsConfirmation: true;
}

export interface ProposedConcept {
  name: string;
  description: string;
  evidence: EvidenceRef[];
}

export interface ProposedEdge {
  fromName: string;
  toName: string;
  strength: number;
  rationale: string;
}

export interface DocumentArtifact {
  id: DocumentId;
  studentId: StudentId;
  filename: string;
  mimeType: string;
  ingestedAt: Timestamp;
  manifestJson: Record<string, unknown>; // shape from praxis-ingest
  chunkCount: number;
}
```

**Acceptance Criteria**:
- [ ] Every artifact described in `CONTRACT.md` § "Artifact schemas" has a corresponding interface
- [ ] `GateState`, `SuccessCriteria`, `GateTarget`, `CourseSource` are discriminated unions on `kind`
- [ ] `Note.body` and `Note.sketchScene` are both optional and at least one must be present at runtime (enforced in Phase 12)
- [ ] `DocumentArtifact.manifestJson` is the structure returned by `praxis-ingest` — typed as `Record<string, unknown>` for Phase 1, refined in Phase 5

---

### Unit 6: Memory types

**File**: `packages/core/src/types/memory.ts`

```typescript
import type { Timestamp } from "./common.js";
import type {
  ArtifactSnapshotId,
  ConceptId,
  EventId,
  MisconceptionId,
  SessionId,
  StrategyId,
  StudentId,
} from "./ids.js";
import type { EngineEvent } from "./engine.js";

export interface EpisodicEvent {
  id: EventId;
  sessionId: SessionId;
  studentId: StudentId;
  ts: Timestamp;
  source: { engineId: string; modeId: string; turnIndex: number };
  event: EngineEvent;
  artifactSnapshotIds?: ArtifactSnapshotId[];
}

export interface StudentModel {
  studentId: StudentId;
  conceptMastery: Map<ConceptId, ConceptMastery>;
  lastUpdated: Timestamp;
}

export interface ConceptMastery {
  conceptId: ConceptId;
  pKnown: number;        // 0..1
  uncertainty: number;   // 0..1
  lastPracticedAt?: Timestamp;
  effectivePKnown: number;
  evidence: EventId[];
}

export interface ProceduralModel {
  studentId: StudentId;
  strategies: Map<StrategyId, StrategyPreference>;
}

export interface StrategyPreference {
  strategyId: StrategyId;
  preference: number;    // -1..1
  evidenceCount: number;
}

export interface AffectiveModel {
  studentId: StudentId;
  recent: AffectSample[];
  baseline: { engagement: number; frustration: number; confidence: number };
}

export interface AffectSample {
  ts: Timestamp;
  source: "model-inferred" | "explicit-checkin";
  engagement: number;
  frustration: number;
  confidence: number;
}

export interface Misconception {
  id: MisconceptionId;
  studentId: StudentId;
  conceptId: ConceptId;
  description: string;
  errorForm: string;
  remediation: { strategyId: StrategyId; rationale: string };
  evidence: EventId[];
  status: "active" | "remediated" | "manually-cleared";
  firstObservedAt: Timestamp;
  lastObservedAt: Timestamp;
}

export interface MemoryExport {
  studentId: StudentId;
  episodic: EpisodicEvent[];
  studentModel: StudentModel;
  procedural: ProceduralModel;
  affective: AffectiveModel;
  misconceptions: Misconception[];
  exportedAt: Timestamp;
  formatVersion: string;
}
```

**Acceptance Criteria**:
- [ ] All five memory layers (episodic + 4 projections) have a type
- [ ] `EpisodicEvent.event` is the full `EngineEvent` union — episodic captures everything
- [ ] `MemoryExport` includes `formatVersion` for future migration of exported files
- [ ] `Map<K, V>` is used for keyed projection layers; serialization to/from records is the indexer's concern

---

### Unit 7: Concept-graph and pedagogy types

**File**: `packages/core/src/types/concept-graph.ts`

```typescript
import type { Citation } from "./common.js";
import type { ConceptGraphId, ConceptId } from "./ids.js";

export interface ConceptGraph {
  id: ConceptGraphId;
  source: "canonical" | "extracted" | "hybrid";
  standardsRef?: { body: string; version: string };
  concepts: Concept[];
  edges: PrerequisiteEdge[];
}

export interface Concept {
  id: ConceptId;
  graphId: ConceptGraphId;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
  /**
   * Optional vector embedding for cross-graph linking.
   * NOT persisted in Phase 1 schema — sqlite-vec virtual tables land in Phase 5.
   * Type field exists for forward compatibility.
   */
  embedding?: number[];
}

export interface PrerequisiteEdge {
  fromId: ConceptId;
  toId: ConceptId;
  strength: number;     // 0..1
  source: "canonical" | "extracted" | "manual";
}
```

**File**: `packages/core/src/types/pedagogy.ts`

```typescript
import type { Citation } from "./common.js";
import type { StrategyId, TechniqueId } from "./ids.js";

export interface PedagogyPack {
  version: string;
  signature: string;
  manifest: PedagogyManifest;
  strategies: TeachingStrategy[];
  studyTechniques: StudyTechnique[];
  metacognitivePrompts: MetacognitivePrompt[];
}

export interface PedagogyManifest {
  name: string;
  description: string;
  praxisCompatible: string; // semver range
  publishedAt: number;
  authors: string[];
}

export interface TeachingStrategy {
  id: StrategyId;
  name: string;
  description: string;
  applicability: {
    conceptKinds: string[];
    bloomsLevels: string[];
    cognitiveLoad: "low" | "medium" | "high";
  };
  promptFragment: string;
  citations: Citation[];
}

export interface StudyTechnique {
  id: TechniqueId;
  name: string;
  description: string;
  uiAffordances: string[];
  curriculum: { lessons: TechniqueLesson[] };
  citations: Citation[];
}

export interface TechniqueLesson {
  id: string;
  title: string;
  body: string;
  practicePromptIds: string[];
}

export type MetacognitivePromptTrigger =
  | "pre-reading"
  | "post-reading"
  | "pre-quiz"
  | "post-error"
  | "session-end";

export interface MetacognitivePrompt {
  id: string;
  trigger: MetacognitivePromptTrigger;
  template: string;
}
```

**Acceptance Criteria**:
- [ ] `ConceptGraph.source` is restricted to `"canonical" | "extracted" | "hybrid"`
- [ ] `Concept.embedding` is optional and documented as Phase-5 forward-compat
- [ ] `PedagogyPack.signature` is `string` (Phase 14 specifies the scheme)
- [ ] `MetacognitivePromptTrigger` is the named union (used by mode prompt injection)

---

### Unit 8: Client RPC types and barrel

**File**: `packages/core/src/types/client.ts`

```typescript
import type { TimeRange, Timestamp } from "./common.js";
import type {
  CourseId,
  ConceptId,
  GateId,
  SessionId,
  StudentId,
} from "./ids.js";
import type {
  ConceptMapDrawing,
  Course,
  DraftCourse,
  Flashcard,
  Gate,
  Note,
} from "./artifacts.js";
import type { EngineEvent } from "./engine.js";
import type {
  AffectiveModel,
  EpisodicEvent,
  MemoryExport,
  Misconception,
  ProceduralModel,
  StudentModel,
} from "./memory.js";

export interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsService;
  author: AuthoringService;
  memory: MemoryService;
  config: ConfigService;
}

export interface SessionService {
  start(opts: { courseId: CourseId; modeId: string }): Promise<SessionHandle>;
  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent>;
  end(sessionId: SessionId): Promise<SessionSummary>;
  active(): Promise<SessionHandle | null>;
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId: CourseId;
  modeId: string;
  startedAt: Timestamp;
}

export interface SessionSummary {
  sessionId: SessionId;
  endedAt: Timestamp;
  unlockedGates: GateId[];
  newMisconceptions: number;
  reflection?: string;
}

export interface ArtifactsService {
  course(id: CourseId): Promise<Course>;
  courses(): Promise<Course[]>;
  gates(courseId: CourseId): Promise<Gate[]>;
  progress(): Promise<ProgressSnapshot>;
  flashcards(opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]>;
  notes(opts?: { courseId?: CourseId }): Promise<Note[]>;
  conceptMaps(courseId?: CourseId): Promise<ConceptMapDrawing[]>;
}

export interface ProgressSnapshot {
  studentId: StudentId;
  courseProgress: Array<{
    courseId: CourseId;
    masteredConceptCount: number;
    inProgressConceptCount: number;
    lockedConceptCount: number;
    nextRecommended?: { kind: "lesson" | "quiz" | "review"; id: string };
  }>;
  recentUnlocks: Array<{ gateId: GateId; at: Timestamp }>;
}

export interface AuthoringService {
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;
}

export interface CreateCourseInput {
  title: string;
  subject: string;
  gradeLevel: string;
  authorRole: "parent" | "teacher" | "self-directed";
}

export interface FileRef {
  path: string;
  filename: string;
  mimeType: string;
}

export interface BootstrapOpts {
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}

export interface MemoryService {
  studentModel(): Promise<StudentModel>;
  misconceptions(): Promise<Misconception[]>;
  procedural(): Promise<ProceduralModel>;
  affective(): Promise<AffectiveModel>;
  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent>;
  export(): Promise<MemoryExport>;
  delete(opts: { confirm: true }): Promise<void>;
}

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
}
```

**File**: `packages/core/src/types/index.ts`

```typescript
export type * from "./common.js";
export * from "./ids.js"; // exports `brandId` runtime helper
export type * from "./engine.js";
export type * from "./tool.js";
export type * from "./mode.js";
export type * from "./artifacts.js";
export type * from "./memory.js";
export type * from "./concept-graph.js";
export type * from "./pedagogy.js";
export type * from "./client.js";
```

**Implementation Notes**:
- `ids.ts` is the only module exporting a runtime value (`brandId`). Everything else is `export type *`.
- `MemoryService.delete({ confirm: true })` is the type-level footgun guard documented in `CONTRACT.md`.
- `SessionService.send` returns `AsyncIterable<EngineEvent>` — same shape as `Engine.run` so the transport can stream-forward without re-wrapping.

**Acceptance Criteria**:
- [ ] `import type { PraxisClient } from "@praxis/core/types"` resolves
- [ ] `ConfigService.isLocked()` returns `Promise<boolean>`
- [ ] `MemoryService.delete` requires `{ confirm: true }` literal type — `{ confirm: false }` should be a type error
- [ ] Every type from Units 3–8 is re-exported through the barrel

---

### Unit 9: Drizzle schema — artifacts

**File**: `packages/artifacts/src/schema.ts`

```typescript
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    gradeLevel: text("grade_level").notNull(),
    sourceJson: text("source_json", { mode: "json" }).notNull(),       // CourseSource
    conceptGraphId: text("concept_graph_id").notNull(),
    thresholdsJson: text("thresholds_json", { mode: "json" }).notNull(), // ThresholdConfig
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("courses_student_idx").on(t.studentId),
  }),
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull(),
    conceptIdsJson: text("concept_ids_json", { mode: "json" }).notNull(),
    referencesJson: text("references_json", { mode: "json" }).notNull(),
    suggestedStrategy: text("suggested_strategy").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
  },
  (t) => ({
    courseIdx: index("lessons_course_idx").on(t.courseId),
  }),
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["quiz", "homework", "exam"] }).notNull(),
    title: text("title").notNull(),
    itemsJson: text("items_json", { mode: "json" }).notNull(),
    conceptIdsJson: text("concept_ids_json", { mode: "json" }).notNull(),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    gradeJson: text("grade_json", { mode: "json" }),
  },
  (t) => ({
    courseIdx: index("assignments_course_idx").on(t.courseId),
  }),
);

export const gates = sqliteTable(
  "gates",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    guardsJson: text("guards_json", { mode: "json" }).notNull(),                  // GateTarget
    prerequisitesJson: text("prerequisites_json", { mode: "json" }).notNull(),    // GateId[]
    successCriteriaJson: text("success_criteria_json", { mode: "json" }).notNull(),
    stateJson: text("state_json", { mode: "json" }).notNull(),                    // GateState
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    courseIdx: index("gates_course_idx").on(t.courseId),
  }),
);

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id"),
    front: text("front").notNull(),
    back: text("back").notNull(),
    reviewStateJson: text("review_state_json", { mode: "json" }).notNull(),
    sourceJson: text("source_json", { mode: "json" }).notNull(),
    nextReviewAt: integer("next_review_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentDueIdx: index("flashcards_student_due_idx").on(t.studentId, t.nextReviewAt),
    conceptIdx: index("flashcards_concept_idx").on(t.conceptId),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    contextJson: text("context_json", { mode: "json" }).notNull(),
    format: text("format", { enum: ["cornell", "feynman", "free", "outline", "sketch"] }).notNull(),
    body: text("body"),
    sketchSceneJson: text("sketch_scene_json", { mode: "json" }),
    linksJson: text("links_json", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("notes_student_idx").on(t.studentId),
  }),
);

export const conceptMapDrawings = sqliteTable(
  "concept_map_drawings",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    courseId: text("course_id"),
    sceneJson: text("scene_json", { mode: "json" }).notNull(),
    conceptLinksJson: text("concept_links_json", { mode: "json" }).notNull(),
    divergencesJson: text("divergences_json", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentCourseIdx: index("concept_maps_student_course_idx").on(t.studentId, t.courseId),
  }),
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
    manifestJson: text("manifest_json", { mode: "json" }).notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
  },
  (t) => ({
    studentIdx: index("documents_student_idx").on(t.studentId),
  }),
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    locatorJson: text("locator_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    documentIdx: index("document_chunks_doc_idx").on(t.documentId, t.chunkIndex),
  }),
);

/**
 * Aggregate export so the DB module can spread all artifact tables into the
 * Drizzle schema map.
 */
export const artifactsSchema = {
  courses,
  lessons,
  assignments,
  gates,
  flashcards,
  notes,
  conceptMapDrawings,
  documents,
  documentChunks,
};
```

**Implementation Notes**:
- Complex nested structures (`CourseSource`, `ThresholdConfig`, `GateState`, etc.) are stored as JSON columns rather than normalized into separate tables. This trades query flexibility for schema simplicity — early phases benefit; if we later need to query inside these blobs, we'll add normalized columns alongside.
- `text({ enum: [...] })` constrains the value at the type level (Drizzle's `$inferSelect` types narrow to the union).
- Foreign keys cascade on delete to keep the DB clean when courses are removed.
- Indexes target the queries we expect: lookup by student, by course, by due date for flashcards.
- `documentChunks` is added now (Phase 1) even though Phase 5 fills it — keeping all v1 tables in the initial schema means no future migration just to add a table that's already implied.

**Acceptance Criteria**:
- [ ] All artifact tables exist after `pnpm db:migrate`
- [ ] `artifactsSchema` exports every table (verified by `Object.keys(artifactsSchema).length === 9`)
- [ ] Cascade delete: deleting a course removes its lessons, assignments, gates
- [ ] Indexes exist (verified via `pnpm db:show`)

---

### Unit 10: Drizzle schema — memory

**File**: `packages/memory/src/schema.ts`

```typescript
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    courseId: text("course_id"),
    modeId: text("mode_id").notNull(),
    engineId: text("engine_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentTimeIdx: index("sessions_student_time_idx").on(t.studentId, t.startedAt),
  }),
);

export const episodicEvents = sqliteTable(
  "episodic_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    engineId: text("engine_id").notNull(),
    modeId: text("mode_id").notNull(),
    turnIndex: integer("turn_index").notNull(),
    eventJson: text("event_json", { mode: "json" }).notNull(), // EngineEvent
    artifactSnapshotIdsJson: text("artifact_snapshot_ids_json", { mode: "json" }),
    redactedAt: integer("redacted_at", { mode: "timestamp_ms" }), // soft-delete projection-only
  },
  (t) => ({
    sessionTimeIdx: index("episodic_session_time_idx").on(t.sessionId, t.ts),
    studentTimeIdx: index("episodic_student_time_idx").on(t.studentId, t.ts),
  }),
);

export const studentMastery = sqliteTable(
  "student_mastery",
  {
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id").notNull(),
    pKnown: integer("p_known_milli").notNull(),               // 0..1000 (millified)
    uncertainty: integer("uncertainty_milli").notNull(),
    effectivePKnown: integer("effective_p_known_milli").notNull(),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp_ms" }),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(), // EventId[]
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: { columns: [t.studentId, t.conceptId], primaryKey: true } as const,
    studentIdx: index("mastery_student_idx").on(t.studentId),
  }),
);

export const proceduralStrategies = sqliteTable(
  "procedural_strategies",
  {
    studentId: text("student_id").notNull(),
    strategyId: text("strategy_id").notNull(),
    preferenceMilli: integer("preference_milli").notNull(),  // -1000..1000
    evidenceCount: integer("evidence_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: { columns: [t.studentId, t.strategyId], primaryKey: true } as const,
  }),
);

export const affectiveSamples = sqliteTable(
  "affective_samples",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    source: text("source", { enum: ["model-inferred", "explicit-checkin"] }).notNull(),
    engagementMilli: integer("engagement_milli").notNull(),
    frustrationMilli: integer("frustration_milli").notNull(),
    confidenceMilli: integer("confidence_milli").notNull(),
  },
  (t) => ({
    studentTimeIdx: index("affect_student_time_idx").on(t.studentId, t.ts),
  }),
);

export const misconceptions = sqliteTable(
  "misconceptions",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id").notNull(),
    description: text("description").notNull(),
    errorForm: text("error_form").notNull(),
    remediationJson: text("remediation_json", { mode: "json" }).notNull(),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(),
    status: text("status", { enum: ["active", "remediated", "manually-cleared"] }).notNull(),
    firstObservedAt: integer("first_observed_at", { mode: "timestamp_ms" }).notNull(),
    lastObservedAt: integer("last_observed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("misconceptions_student_idx").on(t.studentId),
    conceptIdx: index("misconceptions_concept_idx").on(t.conceptId),
  }),
);

export const memorySchema = {
  sessions,
  episodicEvents,
  studentMastery,
  proceduralStrategies,
  affectiveSamples,
  misconceptions,
};
```

**Implementation Notes**:
- Probability fields use a "milli" integer encoding (`pKnown * 1000`, integer 0..1000) rather than SQLite REAL. Integers compare exactly and avoid float drift across migrations. Repositories convert to/from `number` in 0..1.
- `episodic_events.redacted_at` is the soft-delete mechanism — projections can be deleted, but the immutable episodic log is preserved structurally with redacted text. Phase 1 just defines the column; Phase 7 wires up redaction on memory delete.
- Composite PKs for `student_mastery` and `procedural_strategies` are expressed via the `(t) => ({ pk })` helper — Drizzle's preferred pattern for SQLite composite keys.
- `sessions` is a Phase 1 addition (not directly in CONTRACT) — episodic events FK to it for cascading and for session-scoped queries. The `Session` is implicit in the architecture; making it explicit in the schema is cleaner.

**Acceptance Criteria**:
- [ ] All six memory tables created
- [ ] Composite PKs work: inserting twice with same `(studentId, conceptId)` errors
- [ ] `episodic_events.redacted_at` column exists and defaults to NULL
- [ ] Cascade: deleting a session removes its episodic events (test in Unit 13)

---

### Unit 11: Drizzle schema — curriculum (concept graph)

**File**: `packages/curriculum/src/schema.ts`

```typescript
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const conceptGraphs = sqliteTable(
  "concept_graphs",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["canonical", "extracted", "hybrid"] }).notNull(),
    standardsBody: text("standards_body"),
    standardsVersion: text("standards_version"),
    name: text("name").notNull(),
    version: text("version").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
);

export const concepts = sqliteTable(
  "concepts",
  {
    id: text("id").primaryKey(),
    graphId: text("graph_id").notNull().references(() => conceptGraphs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    aliasesJson: text("aliases_json", { mode: "json" }).notNull(),
    standardsTagsJson: text("standards_tags_json", { mode: "json" }).notNull(),
    // embedding column intentionally omitted — Phase 5 adds sqlite-vec virtual table.
  },
  (t) => ({
    graphNameIdx: index("concepts_graph_name_idx").on(t.graphId, t.name),
  }),
);

export const prerequisiteEdges = sqliteTable(
  "prerequisite_edges",
  {
    fromId: text("from_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
    toId: text("to_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
    strengthMilli: integer("strength_milli").notNull(),  // 0..1000
    source: text("source", { enum: ["canonical", "extracted", "manual"] }).notNull(),
  },
  (t) => ({
    pk: { columns: [t.fromId, t.toId], primaryKey: true } as const,
    fromIdx: index("edges_from_idx").on(t.fromId),
    toIdx: index("edges_to_idx").on(t.toId),
  }),
);

export const curriculumSchema = {
  conceptGraphs,
  concepts,
  prerequisiteEdges,
};
```

**Implementation Notes**:
- `prerequisite_edges` PK is `(fromId, toId)` — at most one edge between two concepts (strength + source overwrite, not multi-edge).
- Standards refs are split into two columns instead of JSON for indexability if we ever need standards-tagged queries.
- `embedding` column omitted — see Unit 7 note. Phase 5 adds a `concept_embeddings` virtual table linked by `conceptId`.

**Acceptance Criteria**:
- [ ] Three curriculum tables created
- [ ] Prerequisite edge PK enforces uniqueness on `(fromId, toId)`
- [ ] Cascade: deleting a concept removes its incoming and outgoing edges

---

### Unit 12: Core schema (config), DB module, and migration tooling

**Files**:
- `packages/core/src/schema.ts`
- `packages/core/src/db/index.ts`
- `packages/core/src/db/all-schemas.ts`
- `packages/core/src/db/migrate.ts`
- `packages/core/src/db/show.ts`
- `packages/core/src/db/paths.ts`
- `drizzle.config.ts` (project root)

**`packages/core/src/schema.ts`**:

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const configKv = sqliteTable("config_kv", {
  key: text("key").primaryKey(),
  valueJson: text("value_json", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const lockState = sqliteTable("lock_state", {
  installId: text("install_id").primaryKey(),
  hashedCode: text("hashed_code"),  // null when unlocked
  salt: text("salt").notNull(),
  setAt: integer("set_at", { mode: "timestamp_ms" }),
});

export const promptOverrides = sqliteTable("prompt_overrides", {
  modeId: text("mode_id").notNull(),
  fragmentId: text("fragment_id").notNull(),
  override: text("override").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({
  pk: { columns: [t.modeId, t.fragmentId], primaryKey: true } as const,
}));

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
};
```

**`packages/core/src/db/all-schemas.ts`**:

```typescript
import { artifactsSchema } from "@praxis/artifacts/schema";
import { memorySchema } from "@praxis/memory/schema";
import { curriculumSchema } from "@praxis/curriculum/schema";
import { coreSchema } from "../schema.js";

/** The single Drizzle schema map merged from every domain package. */
export const schema = {
  ...coreSchema,
  ...artifactsSchema,
  ...memorySchema,
  ...curriculumSchema,
} as const;

export type Schema = typeof schema;
```

**`packages/core/src/db/paths.ts`**:

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the on-disk SQLite path. Honors PRAXIS_DB_PATH for tests and dev;
 * falls back to a per-OS app data directory.
 */
export function resolveDbPath(): string {
  const override = process.env.PRAXIS_DB_PATH;
  if (override) return override;

  if (process.env.NODE_ENV !== "production") {
    return join(process.cwd(), ".praxis", "dev.db");
  }

  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Praxis", "praxis.db");
    case "win32":
      return join(process.env.APPDATA ?? homedir(), "Praxis", "praxis.db");
    default:
      return join(homedir(), ".local", "share", "praxis", "praxis.db");
  }
}
```

**`packages/core/src/db/index.ts`**:

```typescript
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { schema, type Schema } from "./all-schemas.js";
import { resolveDbPath } from "./paths.js";

export type PraxisDb = BetterSQLite3Database<Schema>;

let cached: { sqlite: Database.Database; db: PraxisDb; path: string } | null = null;

export interface OpenDbOptions {
  path?: string;
  readonly?: boolean;
}

/** Open (or return cached) Drizzle database. Idempotent within a process. */
export function openDb(opts: OpenDbOptions = {}): { db: PraxisDb; path: string } {
  if (cached && !opts.path) return { db: cached.db, path: cached.path };

  const path = opts.path ?? resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path, { readonly: opts.readonly ?? false });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  if (!opts.path) cached = { sqlite, db, path };
  return { db, path };
}

/** Close the cached connection. Test-only. */
export function closeDb(): void {
  if (cached) {
    cached.sqlite.close();
    cached = null;
  }
}

export { schema } from "./all-schemas.js";
export type { Schema } from "./all-schemas.js";
export { resolveDbPath } from "./paths.js";
```

**`packages/core/src/db/migrate.ts`**:

```typescript
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "node:path";
import { openDb } from "./index.js";

export interface MigrateOptions {
  path?: string;
  migrationsFolder?: string;
}

/**
 * Apply all pending migrations to the database.
 * Migrations are generated by drizzle-kit into the `drizzle/` folder.
 */
export function runMigrations(opts: MigrateOptions = {}): { applied: number; path: string } {
  const { db, path } = openDb({ path: opts.path });
  const folder = opts.migrationsFolder ?? join(process.cwd(), "drizzle");
  drizzleMigrate(db, { migrationsFolder: folder });
  return { applied: -1, path }; // drizzle's migrator does not return count; -1 signals "applied"
}
```

**`packages/core/src/db/show.ts`**:

```typescript
import { openDb } from "./index.js";

export interface TableInfo {
  name: string;
  rowCount: number;
}

/** Return all user tables and their row counts. Used by `pnpm db:show`. */
export function listTables(opts: { path?: string } = {}): TableInfo[] {
  const { db } = openDb({ path: opts.path });
  // Drizzle exposes the underlying better-sqlite3 connection via the run-time client.
  // Use raw SQL because we want SQLite metadata, not Drizzle table state.
  const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return tables.map(({ name }) => {
    const row = sqlite.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
    return { name, rowCount: row.c };
  });
}
```

**`drizzle.config.ts`** (root):

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./packages/core/src/schema.ts",
    "./packages/artifacts/src/schema.ts",
    "./packages/memory/src/schema.ts",
    "./packages/curriculum/src/schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.PRAXIS_DB_PATH ?? "./.praxis/dev.db",
  },
});
```

**`scripts/migrate.ts`**:

```typescript
#!/usr/bin/env tsx
import { runMigrations } from "@praxis/core/db";

const result = runMigrations();
console.log(`Migrations applied. Database at ${result.path}`);
```

**`scripts/db-show.ts`**:

```typescript
#!/usr/bin/env tsx
import { listTables } from "@praxis/core/db/show";

const tables = listTables();
if (tables.length === 0) {
  console.log("No tables. Run `pnpm db:migrate` first.");
  process.exit(0);
}
console.log("Tables:");
for (const t of tables) {
  console.log(`  ${t.name.padEnd(30)} rows=${t.rowCount}`);
}
```

**Implementation Notes**:
- `openDb` enables WAL journal mode and foreign keys — these are SQLite defaults that aren't on by default; we set them on every connection.
- The cached connection is single-process. The Electron main process holds it; renderer processes go through IPC.
- `runMigrations` does not return the applied-migration count because Drizzle's `migrate()` is void. We return `-1` as a sentinel; success is signaled by absence of throw.
- `listTables` uses raw SQL via the underlying better-sqlite3 client because we want SQLite catalog data, not Drizzle's typed query interface. The `$client` access is documented in Drizzle's better-sqlite3 driver but typed as `unknown`-ish — the `as unknown as { $client: Database }` cast is the documented pattern.
- `drizzle.config.ts` lists every schema file; `drizzle-kit generate` reads them all to produce one combined migration.
- The `migrations folder` (`./drizzle`) is checked in. Generated SQL is reviewable.

**Acceptance Criteria**:
- [ ] `pnpm db:migrate` creates the SQLite file at the resolved path and applies all migrations
- [ ] After migration, `pnpm db:show` lists every table from artifacts + memory + curriculum + core schemas (29 tables total: 9 artifacts + 6 memory + 3 curriculum + 3 core + 8 from `documentChunks`/`sessions`/etc. — exact count verified in Unit 13 tests)
- [ ] WAL mode is enabled (`sqlite.pragma("journal_mode")` returns `"wal"`)
- [ ] Foreign keys are enforced (`sqlite.pragma("foreign_keys")` returns `1`)
- [ ] `runMigrations` is idempotent — running twice does not error

---

### Unit 13: Seed script

**File**: `scripts/seed.ts`

```typescript
#!/usr/bin/env tsx
import { v7 as uuidv7 } from "uuid";
import { openDb } from "@praxis/core/db";
import { courses } from "@praxis/artifacts/schema";
import { sessions, episodicEvents } from "@praxis/memory/schema";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";

const { db } = openDb();

const studentId = "student-seed";
const graphId = uuidv7();
const conceptId = uuidv7();
const courseId = uuidv7();
const sessionId = uuidv7();
const eventId = uuidv7();
const now = Date.now();

db.transaction((tx) => {
  tx.insert(conceptGraphs).values({
    id: graphId,
    source: "canonical",
    name: "Seed Graph",
    version: "0.0.1",
    createdAt: new Date(now),
  }).run();

  tx.insert(concepts).values({
    id: conceptId,
    graphId,
    name: "Seed Concept",
    description: "Demo concept inserted by scripts/seed.ts",
    aliasesJson: [],
    standardsTagsJson: [],
  }).run();

  tx.insert(courses).values({
    id: courseId,
    studentId,
    title: "Seed Course",
    subject: "demo",
    gradeLevel: "6-8",
    sourceJson: { kind: "authored", authorRole: "self-directed" },
    conceptGraphId: graphId,
    thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }).run();

  tx.insert(sessions).values({
    id: sessionId,
    studentId,
    courseId,
    modeId: "teach",
    engineId: "direct.anthropic",
    startedAt: new Date(now),
  }).run();

  tx.insert(episodicEvents).values({
    id: eventId,
    sessionId,
    studentId,
    ts: new Date(now),
    engineId: "direct.anthropic",
    modeId: "teach",
    turnIndex: 0,
    eventJson: { type: "model_message", content: "Hello from seed." },
  }).run();
});

console.log(`Seeded: student=${studentId} course=${courseId} session=${sessionId}`);
```

**Implementation Notes**:
- Wrapped in a single transaction so partial failures don't leave the DB in a half-seeded state.
- Uses UUID v7 for time-sortable IDs.
- The seed creates one of each "core" entity type so smoke tests can verify the schema accepts realistic shapes.

**Acceptance Criteria**:
- [ ] `pnpm tsx scripts/seed.ts` succeeds after `pnpm db:migrate`
- [ ] After seeding, `pnpm db:show` reports `courses=1`, `sessions=1`, `episodic_events=1`, `concepts=1`, `concept_graphs=1`
- [ ] Re-running the script fails with a primary-key violation (idempotency is *not* required for seed)

---

### Unit 14: Smoke tests

**File**: `tests/foundation.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb } from "@praxis/core/db";
import { listTables } from "@praxis/core/db/show";
import { runMigrations } from "@praxis/core/db/migrate";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("foundation: migration + schema discovery", () => {
  it("opens a fresh database and applies migrations", () => {
    const result = runMigrations({ path: dbPath });
    expect(result.path).toBe(dbPath);
  });

  it("lists every expected table after migration", () => {
    runMigrations({ path: dbPath });
    const tables = listTables({ path: dbPath }).map((t) => t.name).sort();

    // Spot-check a representative subset from each domain
    expect(tables).toContain("courses");
    expect(tables).toContain("lessons");
    expect(tables).toContain("gates");
    expect(tables).toContain("episodic_events");
    expect(tables).toContain("student_mastery");
    expect(tables).toContain("misconceptions");
    expect(tables).toContain("concept_graphs");
    expect(tables).toContain("concepts");
    expect(tables).toContain("prerequisite_edges");
    expect(tables).toContain("config_kv");
    expect(tables).toContain("lock_state");
  });

  it("enables WAL mode and foreign keys", () => {
    const { db } = openDb({ path: dbPath });
    const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
    expect((sqlite.pragma("journal_mode") as Array<{ journal_mode: string }>)[0].journal_mode).toBe("wal");
    expect((sqlite.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0].foreign_keys).toBe(1);
  });

  it("cascades episodic delete when a session is deleted", async () => {
    runMigrations({ path: dbPath });
    const { db } = openDb({ path: dbPath });
    const { sessions, episodicEvents } = await import("@praxis/memory/schema");
    const { eq } = await import("drizzle-orm");

    const sessionId = "test-session";
    const now = new Date();

    db.insert(sessions).values({
      id: sessionId,
      studentId: "test-student",
      modeId: "teach",
      engineId: "direct",
      startedAt: now,
    }).run();

    db.insert(episodicEvents).values({
      id: "test-event",
      sessionId,
      studentId: "test-student",
      ts: now,
      engineId: "direct",
      modeId: "teach",
      turnIndex: 0,
      eventJson: { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
    }).run();

    db.delete(sessions).where(eq(sessions.id, sessionId)).run();

    const remaining = db.select().from(episodicEvents).where(eq(episodicEvents.sessionId, sessionId)).all();
    expect(remaining).toHaveLength(0);
  });
});
```

**Per-package smoke test** (`packages/core/src/__tests__/index.test.ts`, similar in each package):

```typescript
import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "../index.js";

describe("@praxis/core stub", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@praxis/core");
  });
});
```

For `@praxis/core` specifically, also include a type-import smoke test:

**File**: `packages/core/src/__tests__/types.test-d.ts`

```typescript
import { expectTypeOf } from "vitest";
import type { Engine, Mode, Course, EpisodicEvent, PraxisClient } from "../types/index.js";
import { brandId } from "../types/ids.js";
import type { CourseId } from "../types/ids.js";

// Compile-time type tests; runtime is no-op.
expectTypeOf<Engine>().toHaveProperty("run");
expectTypeOf<Mode>().toHaveProperty("promptFragments");
expectTypeOf<Course>().toHaveProperty("thresholds");
expectTypeOf<EpisodicEvent>().toHaveProperty("event");
expectTypeOf<PraxisClient>().toHaveProperty("session");

const id: CourseId = brandId<"CourseId">("550e8400-e29b-71d4-a716-446655440000");
expectTypeOf(id).toMatchTypeOf<CourseId>();
```

**Implementation Notes**:
- Tests use a tmp dir + `PRAXIS_DB_PATH` env var to avoid touching the dev DB.
- Drizzle's `delete(...).where(...)` requires the `eq` helper from `drizzle-orm` — imported in-test to keep the test file self-contained.
- The `expectTypeOf` test is a `.test-d.ts` file (vitest convention for type-only tests). It compiles but does not run; type errors fail the build.
- Each per-package smoke test imports `PACKAGE_NAME` from `index.ts` to verify the package's module resolution works through the workspace.

**Acceptance Criteria**:
- [ ] `pnpm test` runs all tests and exits 0
- [ ] Foundation test discovers ≥ 20 tables (sanity check on schema completeness)
- [ ] WAL + foreign-keys assertions pass
- [ ] Cascade test passes
- [ ] Per-package smoke test passes for all 9 packages
- [ ] `tsc --noEmit` accepts the `.test-d.ts` file (compile-time type assertions hold)

---

## Implementation Order

Build in this sequence to resolve dependencies:

1. **Unit 1** — Monorepo skeleton, root tooling, conventions. *Establishes the project shell.*
2. **Unit 2** — Package stubs. *9 packages exist and compile.*
3. **Unit 3** — Common types (`common.ts`, `ids.ts`). *No dependencies on other types.*
4. **Unit 4** — Engine, Tool, Mode types. *Depends on Unit 3.*
5. **Unit 5** — Artifact types. *Depends on Units 3–4.*
6. **Unit 6** — Memory types. *Depends on Units 3–5 (uses `EngineEvent` from Unit 4).*
7. **Unit 7** — Concept-graph and pedagogy types. *Depends on Unit 3.*
8. **Unit 8** — Client RPC types and barrel. *Depends on Units 3–7.*
9. **Unit 9** — Artifacts schema. *Depends on Unit 2's package stub.*
10. **Unit 10** — Memory schema. *Depends on Unit 2.*
11. **Unit 11** — Curriculum schema. *Depends on Unit 2.*
12. **Unit 12** — Core schema, DB module, migration tooling. *Depends on Units 9–11 for `all-schemas.ts` aggregation.*
13. **Unit 13** — Seed script. *Depends on Unit 12.*
14. **Unit 14** — Smoke tests. *Depends on all prior units.*

Units 4–8 (types) and Units 9–11 (schemas) can each be built in parallel within their group. Otherwise sequential.

---

## Testing

### Unit Tests

Test files are colocated where natural:

- `tests/foundation.test.ts` — full integration (migrate, table discovery, pragmas, cascades)
- `packages/<pkg>/src/__tests__/index.test.ts` — package-stub smoke test (one per package)
- `packages/core/src/__tests__/types.test-d.ts` — compile-time type assertions

### Test Approach

- **Foundation test** (`tests/foundation.test.ts`) is the primary verification surface for Phase 1. It exercises the entire Phase 1 deliverable: migration, schema discovery, pragmas, cascade. If this passes, Phase 1 is essentially complete.
- **Per-package smoke tests** prove the workspace plumbing — each package builds, exports its identity constant, and is reachable through pnpm's resolution.
- **Type tests** (`*.test-d.ts`) prove the TypeScript public surface holds. Type errors fail the build, not just runtime — so these "tests" are checks that the type module compiles cleanly.

### Test isolation

Every DB-touching test uses `mkdtempSync` + `PRAXIS_DB_PATH` to operate on a fresh temp database. `closeDb()` is called in `afterEach` to release the cached connection. No test reads or writes the dev DB at `./.praxis/dev.db`.

---

## Verification Checklist

Run these in order on a clean clone after implementation:

- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes (project references resolve, all types compile under strict mode)
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm db:generate` produces a migration in `drizzle/` (run once after schemas land)
- [ ] `pnpm db:migrate` creates `.praxis/dev.db` and applies migrations without error
- [ ] `pnpm db:show` lists every expected table with row counts
- [ ] `pnpm tsx scripts/seed.ts` succeeds and `pnpm db:show` shows seeded rows
- [ ] `pnpm test` runs all tests and exits 0
- [ ] `pnpm db:reset && pnpm db:migrate` cleanly recreates the database

If all ten checks pass, Phase 1 is complete and Phase 2 can begin.
