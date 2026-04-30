# Refactor Plan: Post-Phase-12 Cleanup

> Scope: 12 phases of working code reviewed end-to-end (foundation → engine layer → verification → RAG → bootstrap → adaptive memory → multi-mode assessment → gates/progress → knowledge graph → configure/authoring → workspace/notes/flashcards). One refactor pass before Phase 13 lands new structure.

## Overview

Three explore agents swept the monorepo for duplicate logic, missing abstractions, and pattern inconsistencies after the post-phase-4 sweep. The codebase is in good structural health — the post-phase-4 cleanup stuck (the `useTempDb` helper, the `noopLogger` factory in `tests/helpers/mocks.ts`, the `engineError` helper, and the `kind`-vs-`type` discriminator doc are all in active use), and Phase 11/12 code largely follows the documented patterns.

The new findings cluster around three themes: (1) one real correctness bug in two authoring tools' Zod schemas, (2) one boundary violation in a Phase-7 client that pre-dates the type-only rule, and (3) a wave of structural duplication produced by Phase 11/12 (UI hooks, service refetch-or-throw, end-to-end test scaffolding).

**Real findings to act on:**

| # | Finding | Files affected | LOC saved | Risk |
|---|---|---|---|---|
| 1 | `gate.create` / `gate.edit` Zod schemas bypass discriminated-union validation; `gate.create` is missing `topic` and `course-completion` variants entirely | 2 production files | (correctness fix) | Low |
| 2 | `@praxis/client/services/memory-client.ts` runtime-imports `brandId` from `@praxis/core/types` — violates the type-only client boundary | 1 production file | 0 | Low |
| 3 | `noopLogger` defined inline in 4-5 end-to-end tests despite the shared helper already existing in `tests/helpers/mocks.ts` | 4-5 test files | ~30 | Low |
| 4 | `postWriteFetch` (write → re-fetch → throw-if-missing) duplicated 8-9× across 3 services with inconsistent error wording | 3 service files | ~25 | Low |
| 5 | `useResource(loader)` boilerplate (`setLoading/setError/try/catch/finally + useEffect`) duplicated across 8 React hooks | 8 hook files | ~80 | Low-Medium |
| 6 | `makeCtx` `ToolContext` test scaffolding duplicated 12+ times with identical null-skeleton + service-stub shape | 12+ test files | ~250 | Low |

**Findings explicitly NOT actioned** (re-evaluated against post-phase-4 reasoning):

- **`BridgedEngineSession` base class extraction** — re-evaluated. The bridged session shape is shared by exactly 2 adapters (Claude Code + Codex); `direct/` uses a different multi-turn approach; `mcp/` is a tool-bridge utility, not a 4th adapter. Still 2 sites = below the 3+ threshold. Phase 4 reasoning still holds; defer.
- **`defineTool<I, O>(def)` factory** — re-evaluated with 37+ tools now. The `ToolDefinition<typeof InputSchema, typeof OutputSchema>` annotation already enforces the shape structurally; a factory is still pure indirection.
- **`OkBase` / shared `ok: z.literal(true)` schema** — 31 callsites, but each is one explicit line that aids readability. Same reasoning that rejected `compactObject({...})` in phase 4 applies: explicit > terse for schema shapes the model reads.
- **Generic IPC client builder for `*-client.ts`** — channel maps and method delegation are intentionally narrow; structural similarity only, no behavioral duplication.
- **`NoteEditorShell` shared component** — only the outer `<div className={styles.editor}>` is structurally common; cornell/feynman/outline/free interiors diverge.
- **`buildServices()` factory for `ServiceDeps`** — same reasoning as phase 4; `ServiceDeps` is a flat DI container with one composition site.

Total estimated work: **7 small commits**, each independently verifiable. No public API breakage. No test suite rewrites — tests adapt to import the helpers.

---

## Refactor Steps

### Step 1: Fix `gate.create` and `gate.edit` Zod schemas to use real discriminated unions

**Priority**: High
**Risk**: Low (handler bodies don't need to change once Zod parses correctly)
**Files**:
- Modified: `packages/tools/src/authoring/gate/create.ts`
- Modified: `packages/tools/src/authoring/gate/edit.ts`
- New: `packages/tools/src/authoring/gate/schema.ts` (shared `GateTargetSchema` + `SuccessCriteriaSchema`)

**Current State**:

```typescript
// packages/tools/src/authoring/gate/create.ts:7-22
const InputSchema = z.object({
  courseId: z.string().min(1),
  guards: z
    .object({
      kind: z.enum(["lesson", "concept"]),         // ← missing "topic", "course-completion"
      lessonId: z.string().optional(),
      conceptId: z.string().optional(),
    }),
  prerequisites: z.array(z.string().min(1)),
  successCriteria: z.unknown(),                    // ← Zod validation skipped entirely
});

// packages/tools/src/authoring/gate/create.ts:38-50 (handler)
async handler(args, ctx) {
  const courseId = brandId<"CourseId">(args.courseId);
  const prerequisites = args.prerequisites.map((id) => brandId<"GateId">(id));
  const guards = args.guards as GateTarget;        // ← cast bypasses validation
  // biome-ignore lint/suspicious/noExplicitAny: SuccessCriteria is a complex union; Zod record shape passes through
  const successCriteria = args.successCriteria as any as SuccessCriteria;  // ← bug
  // ...
}
```

The `GateTarget` and `SuccessCriteria` types are textbook `kind` discriminated unions in `packages/core/src/types/artifacts.ts:214-225`:

```typescript
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
```

Two consequences of the current schemas:
1. **`gate.create` cannot create `topic` or `course-completion` gates at all** — the `z.enum(["lesson", "concept"])` rejects them.
2. **`successCriteria` is unvalidated** — the model can pass any object shape and it slips through to the DB write, where it fails at deserialization time. The triple-cast `as any as SuccessCriteria` makes this invisible to the type system.

**Target State**:

```typescript
// packages/tools/src/authoring/gate/schema.ts (NEW)
import { z } from "zod";

/**
 * Shared Zod schemas for gate-authoring tools. Mirrors `GateTarget` and
 * `SuccessCriteria` from @praxis/core/types/artifacts. Co-located here so
 * gate.create and gate.edit stay in lockstep.
 */

export const GateTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("concept"),
    conceptId: z.string().min(1).describe("Concept ID this gate guards."),
  }),
  z.object({
    kind: z.literal("lesson"),
    lessonId: z.string().min(1).describe("Lesson ID this gate guards."),
  }),
  z.object({
    kind: z.literal("topic"),
    topicId: z.string().min(1).describe("Topic ID this gate guards."),
  }),
  z.object({
    kind: z.literal("course-completion"),
  }),
]);

// SuccessCriteria is recursive (and/or contain arrays of SuccessCriteria),
// so we need z.lazy + an explicit z.ZodType<SuccessCriteria> annotation.
import type { SuccessCriteria } from "@praxis/core/types";

export const SuccessCriteriaSchema: z.ZodType<SuccessCriteria> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("mastery-threshold"),
      conceptIds: z.array(z.string().min(1)),
      minScore: z.number().min(0).max(1),
    }),
    z.object({
      kind: z.literal("exam-pass"),
      assignmentId: z.string().min(1),
      minScore: z.number().min(0).max(1),
    }),
    z.object({
      kind: z.literal("and"),
      criteria: z.array(SuccessCriteriaSchema),
    }),
    z.object({
      kind: z.literal("or"),
      criteria: z.array(SuccessCriteriaSchema),
    }),
  ]),
);
```

```typescript
// packages/tools/src/authoring/gate/create.ts (MIGRATED)
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { GateTargetSchema, SuccessCriteriaSchema } from "./schema.js";

const InputSchema = z.object({
  courseId: z.string().min(1).describe("The course this gate belongs to."),
  guards: GateTargetSchema.describe("What this gate guards (concept, lesson, topic, or course-completion)."),
  prerequisites: z
    .array(z.string().min(1))
    .describe("Gate IDs that must be unlocked before this gate can be evaluated."),
  successCriteria: SuccessCriteriaSchema.describe("Success criteria object."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  gateId: z.string(),
  courseId: z.string(),
});

export const gateCreateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "gate.create",
  description:
    "Create a new gate with initial locked state. Specify what it guards (lesson, concept, topic, or course-completion), prerequisite gates, and success criteria. Writes are logged to the configurator audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const courseId = brandId<"CourseId">(args.courseId);
    const prerequisites = args.prerequisites.map((id) => brandId<"GateId">(id));
    // args.guards and args.successCriteria are now structurally validated by Zod.
    // The brand cast is required because Zod can't produce branded ids; this is
    // a one-shot cast at the schema/domain boundary, not a validation bypass.
    const result = await ctx.services.authoring.createGate({
      courseId,
      guards: args.guards as GateTarget,
      prerequisites,
      successCriteria: args.successCriteria,
    });
    return { ok: true, gateId: result.id, courseId };
  },
};
```

```typescript
// packages/tools/src/authoring/gate/edit.ts (MIGRATED)
import type { GateTarget, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { SuccessCriteriaSchema } from "./schema.js";

const InputSchema = z.object({
  gateId: z.string().min(1),
  patch: z.object({
    prerequisites: z.array(z.string().min(1)).optional(),
    successCriteria: SuccessCriteriaSchema.optional(),
  }),
  reason: z.string().optional(),
});

// ... handler body simplifies — no `as any as SuccessCriteria` cast needed.
```

**Implementation Notes**:

- `GateTargetSchema` brands inside the handler (not in the schema) — Zod 4 cannot directly produce `ConceptId & string` etc., and we don't want to import the brand mechanism into a Zod schema file. Single `as` cast at the handler boundary is the right tradeoff.
- `SuccessCriteriaSchema` uses `z.lazy()` because of the recursive `and`/`or` variants. The explicit `z.ZodType<SuccessCriteria>` annotation gives Zod the recursion hint and ensures the schema's inferred type matches the domain type exactly. If the inferred shape drifts from `SuccessCriteria`, this annotation will produce a compile error.
- A new colocated test `packages/tools/src/authoring/gate/__tests__/schema.test.ts` is required: 4 GateTarget shapes parse; one bad shape rejects; 2 valid SuccessCriteria shapes parse (one nested `and`); one invalid rejects.
- The `// biome-ignore lint/suspicious/noExplicitAny` comments disappear from both files, because the schemas now produce typed values.

**Acceptance Criteria**:
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean — no `noExplicitAny` ignores remain in `gate/create.ts` or `gate/edit.ts`.
- [ ] `pnpm test` passes — including a new `gate/__tests__/schema.test.ts` covering all 4 `GateTarget` variants and at least one nested `and`/`or` `SuccessCriteria`.
- [ ] `gate.create({ guards: { kind: "topic", topicId: "..." }, ... })` succeeds end-to-end (was previously rejected at validation).
- [ ] `gate.create({ guards: { kind: "course-completion" }, ... })` succeeds.
- [ ] `gate.create({ successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: "not a number" }, ... })` is rejected by Zod (was previously accepted and failed at DB write).

---

### Step 2: Move `brandId` runtime import out of `@praxis/client/src/services/memory-client.ts`

**Priority**: High
**Risk**: Low (single file, no behavioral change)
**Files**:
- Modified: `packages/client/src/services/memory-client.ts`
- New (optional): `packages/client/src/util/brand.ts`

**Current State**:

```typescript
// packages/client/src/services/memory-client.ts:16
import { brandId } from "@praxis/core/types";       // ← runtime import
```

CLAUDE.md dependency direction:

```
@praxis/client → (type-only @praxis/core/types)
```

`brandId` is a runtime function exported from `packages/core/src/types/ids.ts:34`. Importing it as a value from `@praxis/client` violates the type-only boundary. (No other client file does this — it's the only Phase-7-era violation that survived to today.) The function itself is a one-line identity cast: `(s: string) => s as T & string`. The boundary issue is exclusively about runtime coupling, not behavior.

**Target State** (option A — preferred — replace with local cast):

```typescript
// packages/client/src/services/memory-client.ts
import type {
  AffectiveModel,
  ConceptId,
  ConceptMastery,
  EpisodicEvent,
  MemoryClientService,
  MemoryExport,
  Misconception,
  ProceduralModel,
  SessionId,
  StrategyId,
  StrategyPreference,
  StudentId,
  StudentModel,
  Timestamp,
  TimeRange,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

// Local one-line brand helper. `@praxis/client` is a type-only dependent of
// `@praxis/core/types`; we can't import the runtime `brandId` function. The
// cast is identical — branded ids are nominal compile-time tags with no
// runtime representation.
const asId = <T extends string>(s: string): T & string => s as T & string;

// then replace each `brandId<"StudentId">(x)` with `asId<"StudentId">(x)` etc.
```

**Target State** (option B — if `asId` ever gets a second client caller):

```typescript
// packages/client/src/util/brand.ts (NEW)
/**
 * Local brand helper for the client package. `@praxis/client` is a
 * type-only dependent of `@praxis/core/types`, so the runtime `brandId`
 * function cannot be imported across the boundary.
 */
export const asId = <T extends string>(s: string): T & string => s as T & string;
```

Then `import { asId } from "../util/brand.js"`.

**Implementation Notes**:

- Use option A unless a second client file appears that needs the helper. The post-phase-4 plan correctly preferred inline-when-rare over micro-utility files; same applies here.
- Look at every call site in the file (there are ~10) and replace `brandId<"X">(y)` with `asId<"X">(y)`. The signature is identical.
- `Timestamp` is already imported as a type — use the named import, not the inline `import("@praxis/core/types").Timestamp` syntax that this file currently uses on lines 50, 108, 118.
- The companion test file `packages/client/src/__tests__/assignments-client.test.ts` also imports `brandId` at runtime. Tests don't ship — strictly speaking they're outside the type-only rule's intent. Leave them alone unless step 6 (`makeToolContext` extraction) ends up consolidating client tests too.

**Acceptance Criteria**:
- [ ] `packages/client/src/services/memory-client.ts` contains zero non-`type` imports of `@praxis/core/types`.
- [ ] No other file in `packages/client/src/services/**` imports values (vs types) from `@praxis/core/types`.
- [ ] Existing `packages/client/src/__tests__/memory-client.test.ts` (or equivalent) passes unchanged.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass.

---

### Step 3: Migrate end-to-end tests to import `noopLogger` from `tests/helpers/mocks.ts`

**Priority**: Medium
**Risk**: Low (tests-only)
**Files**:
- Modified: `tests/mastery-end-to-end.test.ts`
- Modified: `tests/misconception-end-to-end.test.ts`
- Modified: `tests/exam-end-to-end.test.ts`
- Modified: `tests/adaptive-routing-end-to-end.test.ts`
- (Spot-check: `tests/configure-end-to-end.test.ts`, `tests/quiz-end-to-end.test.ts`, `tests/gates-end-to-end.test.ts`, `tests/pack-import-end-to-end.test.ts`, `tests/notes-flashcards-end-to-end.test.ts` — migrate any that match)

**Current State** (4 nearly-identical inline definitions):

```typescript
// tests/mastery-end-to-end.test.ts:46
const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
// ...used at lines 132, 169, 203, 241, 246, 253, 263, 270.

// tests/adaptive-routing-end-to-end.test.ts:85
const noopLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
```

The shared `noopLogger()` already exists at `tests/helpers/mocks.ts:39` and is correctly typed as `Logger`. `tests/textbook-rag-end-to-end.test.ts` already uses it as `noopLogger()` (the function form). The phase-4 plan added it specifically to consolidate this duplication — the consolidation just wasn't applied to phases 6+ tests.

**Target State**:

```typescript
// tests/mastery-end-to-end.test.ts (MIGRATED)
import { noopLogger } from "./helpers/mocks.js";

// (drop the inline `const noopLogger = { ... }` definition)
// The downstream call sites change from `log: noopLogger` to `log: noopLogger()`
// — note the parens. The helper is a factory that returns a fresh Logger.
```

**Implementation Notes**:

- The shared helper is a factory (`function noopLogger(): Logger`), not a constant. Each call site that does `log: noopLogger` becomes `log: noopLogger()`. This is the same calling convention the migrated `tests/textbook-rag-end-to-end.test.ts` already uses.
- Cache `const log = noopLogger();` once per `describe()` block when the same logger reference is reused 5+ times in that block — saves micro-allocations (though irrelevant for correctness).
- Spot-check the additional test files listed above. If they don't define their own `noopLogger` (some may already import it), no change needed.
- Do not touch `packages/**/src/**/__tests__/*.ts` for this step — the inline definitions in per-package tests would require the long `../../../../tests/helpers/mocks.js` import path, but they're scattered across 11 files and a separate sweep is cleaner. Defer to step 6 (`makeToolContext` extraction) which can fold the logger into the tool-context helper.

**Acceptance Criteria**:
- [ ] `tests/{mastery,misconception,exam,adaptive-routing}-end-to-end.test.ts` contain zero inline `const noopLogger = { ... }` definitions.
- [ ] Each migrated file has `import { noopLogger } from "./helpers/mocks.js"` at the top.
- [ ] `pnpm test` passes — same test counts.
- [ ] `pnpm typecheck` and `pnpm lint` clean.

---

### Step 4: Extract `loadOrThrow` helper for service write-then-refetch pattern

**Priority**: Medium
**Risk**: Low
**Files**:
- New: `packages/core/src/services/db-helpers.ts`
- Modified: `packages/core/src/services/notes-service.ts` (2 call sites)
- Modified: `packages/core/src/services/flashcards-service.ts` (3 call sites)
- Modified: `packages/core/src/services/artifacts-service.ts` (5 call sites)

**Current State** (10 inline copies across 3 services with inconsistent error wording):

```typescript
// notes-service.ts:111-113 (create)
const result = await this.get({ studentId: input.studentId, noteId: brandId<"NoteId">(id) });
if (!result) throw new Error("note disappeared after insert");
return result;

// notes-service.ts:134-135 (update)
const updated = await this.get({ studentId: input.studentId, noteId: input.noteId });
if (!updated) throw new Error("note disappeared after update");

// flashcards-service.ts:67-68 (create)
if (!created) throw new Error("flashcard disappeared after insert");

// flashcards-service.ts:94 (update)
if (!updated) throw new Error(`flashcard not found: ${input.flashcardId}`);  // ← different wording

// flashcards-service.ts:205 (review)
if (!updated) throw new Error("flashcard disappeared after review");

// artifacts-service.ts:438 (updateCourse)
if (!result) throw new Error(`Course not found after update: ${input.courseId}`);  // ← yet another wording

// artifacts-service.ts:471 (createLesson)
if (!row) throw new Error(`Failed to retrieve lesson after create: ${id}`);

// artifacts-service.ts:500, 565, 592, 645 — 4 more variants, all worded differently.
```

The semantic intent is identical: "we just wrote this row; if the read-back returns nothing, something's catastrophically wrong — throw with enough context to debug." The inconsistent wording makes log analysis harder and the duplication makes adding observability (e.g., a metric for "ghost write" anomalies) require touching 10 files.

**Target State**:

```typescript
// packages/core/src/services/db-helpers.ts (NEW)
import type { Logger } from "@praxis/core/types";

/**
 * Read a row that was just written, throwing with consistent context if it
 * comes back null. Use after `db.insert(...).run()` or `db.update(...).run()`
 * to round-trip the persisted state. Optional logger lets callers attach a
 * "ghost write" metric without changing call shape.
 */
export async function loadOrThrow<T>(
  fetch: () => Promise<T | null>,
  ctx: { entity: string; op: "create" | "update" | "delete" | "review"; id: string; log?: Logger },
): Promise<T> {
  const row = await fetch();
  if (row === null) {
    ctx.log?.warn("ghost-write detected", {
      entity: ctx.entity,
      op: ctx.op,
      id: ctx.id,
    });
    throw new Error(`${ctx.entity} not found after ${ctx.op}: ${ctx.id}`);
  }
  return row;
}
```

```typescript
// notes-service.ts (MIGRATED)
import { loadOrThrow } from "./db-helpers.js";

// create:
return loadOrThrow(
  () => this.get({ studentId: input.studentId, noteId: brandId<"NoteId">(id) }),
  { entity: "note", op: "create", id, log: this.deps.log },
);

// update:
return loadOrThrow(
  () => this.get({ studentId: input.studentId, noteId: input.noteId }),
  { entity: "note", op: "update", id: input.noteId, log: this.deps.log },
);
```

```typescript
// artifacts-service.ts (MIGRATED for courses; same pattern for lessons + gates)
const result = await loadOrThrow(
  () => this.course(input.courseId),
  { entity: "course", op: "update", id: input.courseId, log: this.deps.log },
);
return result;
```

**Implementation Notes**:

- Place the helper in `packages/core/src/services/db-helpers.ts`. It's services-internal (consumed by service implementations), not part of the type contract — keep it out of `@praxis/core/types`.
- The `op` parameter is a small enum to keep error/log messages structured. Add `"override"` to the enum if the gate-override code path joins the helper.
- Optional `log` keeps the helper's call sites simple in tests where `deps.log` may not be set; production `ServiceDeps` always wires a logger.
- The helper is generic over `T` — both `Note | null` (from `notes-service.get`) and the row-then-`rowToLesson` pattern in `artifacts-service` migrate, but the latter requires a small refactor to unify on a `() => Promise<T | null>` interface (move the `rowToLesson` mapping inside the closure passed to `loadOrThrow`). Don't try to add a "row mapper" parameter — keeps the helper from growing knobs.
- This step does NOT change any error-throwing semantics — same throw, same `Error` type, just consistent message format.

**Acceptance Criteria**:
- [ ] No `if (!.*) throw new Error(.*disappeared.*after\|.*not found after\|.*Failed to retrieve.*after.*)` inline patterns remain in `packages/core/src/services/{notes,flashcards,artifacts}-service.ts`.
- [ ] All migrated call sites produce error messages of the form `"<entity> not found after <op>: <id>"`.
- [ ] A new test file `packages/core/src/services/__tests__/db-helpers.test.ts` covers: returns row when found; throws with formatted message when null; logs `ghost-write` when logger provided.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass.

---

### Step 5: Extract `useResource(loader)` hook + migrate UI hooks

**Priority**: Medium
**Risk**: Low-Medium (touches UI rendering — verify with existing hook tests)
**Files**:
- New: `packages/ui/src/hooks/use-resource.ts`
- New: `packages/ui/src/hooks/__tests__/use-resource.test.ts`
- Modified: `packages/ui/src/hooks/use-notes.ts`
- Modified: `packages/ui/src/hooks/use-flashcards.ts`
- Modified: `packages/ui/src/hooks/use-documents.ts`
- Modified: `packages/ui/src/hooks/use-courses.ts`
- Modified: `packages/ui/src/hooks/use-packs.ts`
- Modified: `packages/ui/src/hooks/use-course-detail.ts`
- Modified: `packages/ui/src/hooks/use-course-gates.ts`
- Modified: `packages/ui/src/hooks/use-due-cards.ts`

**Current State** (8 hooks all carry the same load-on-mount machinery):

```typescript
// packages/ui/src/hooks/use-notes.ts:29-55 (representative)
export function useNotes(opts: UseNotesOptions = {}): UseNotesResult {
  const client = usePraxisClient();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.notes.list({ /* ... */ });
      setNotes(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, opts.courseId, opts.lessonId, opts.format, opts.limit]);

  useEffect(() => { refresh(); }, [refresh]);

  // ...mutations layered on top
}
```

The `setLoading/setError/try/catch/finally + useEffect(refresh)` block is identical (modulo the loader body and dep list) in 8 hooks. The pattern was even commented in `use-notes.ts:27` as "Pattern matches useCourses" — which is the textbook signal that an abstraction is overdue.

**Target State**:

```typescript
// packages/ui/src/hooks/use-resource.ts (NEW)
import { useCallback, useEffect, useState } from "react";

export interface UseResourceResult<T> {
  /** Latest loaded value. `undefined` until the first successful load. */
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Re-run the loader. Caller decides when to call (e.g., after a mutation). */
  refresh: () => Promise<void>;
  /**
   * Imperatively set the data. Use for optimistic updates after mutations
   * (e.g., remove a deleted item from the list without a roundtrip).
   */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Hook for loading an async resource with loading/error state and a refresh
 * callback. Loads on mount; re-runs whenever the loader's identity changes
 * (caller controls this via deps in their useCallback).
 *
 * Usage:
 *   const loader = useCallback(() => client.notes.list({ courseId }), [client, courseId]);
 *   const { data, loading, error, refresh, setData } = useResource(loader);
 */
export function useResource<T>(loader: () => Promise<T>): UseResourceResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setDataExternal = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      setData((prev) =>
        typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next,
      );
    },
    [],
  );

  return { data, loading, error, refresh, setData: setDataExternal };
}
```

```typescript
// packages/ui/src/hooks/use-notes.ts (MIGRATED)
import { useCallback } from "react";
import { useResource } from "./use-resource.js";
import { usePraxisClient } from "../context/client-context.js";
// ... existing imports ...

export function useNotes(opts: UseNotesOptions = {}): UseNotesResult {
  const client = usePraxisClient();

  const loader = useCallback(
    () =>
      client.notes.list({
        ...(opts.courseId !== undefined && { courseId: opts.courseId }),
        ...(opts.lessonId !== undefined && { lessonId: opts.lessonId }),
        ...(opts.format !== undefined && { format: opts.format }),
        ...(opts.limit !== undefined && { limit: opts.limit }),
      }),
    [client, opts.courseId, opts.lessonId, opts.format, opts.limit],
  );

  const { data: notes = [], loading, error, refresh, setData } = useResource(loader);

  const createNote = useCallback(/* ... */);
  const deleteNote = useCallback(
    async (noteId: NoteId): Promise<void> => {
      await client.notes.delete(noteId);
      setData((prev) => (prev ?? []).filter((n) => n.id !== noteId));
    },
    [client, setData],
  );

  return { notes, loading, error, refresh, createNote, deleteNote };
}
```

**Implementation Notes**:

- Migration shape per hook: extract the loader into a `useCallback`, pass to `useResource`, layer mutation actions on top using `setData` for optimistic updates and `refresh` for full re-fetches.
- `useDueCards` is the trickiest — its loader returns `[count, list]` from a `Promise.all`. Ship as `useResource<{ count: number; list: Flashcard[] }>` returning a single object; consumer destructures.
- `useCourses` performs a fire-and-forget secondary fetch for newly-unlocked counts. Keep that as a separate `useEffect` triggered by `data` becoming non-empty, OR pull it into the loader as `Promise.all` of [courses, then per-course unlocked-count fetches]. Option A keeps the current behavior (counts populate after courses render). Pick A.
- `useCourseGates` has the most complex loader (3 reads); same pattern applies.
- A small unit test for `useResource` itself (`__tests__/use-resource.test.ts`) — uses `@testing-library/react` `renderHook`. Cases: loads on mount; sets loading then unsets; surfaces error.message; `refresh` re-runs the loader; `setData` updates the value optimistically.
- Migrate one hook first, run its existing test, commit. Then sweep the remaining 7 in a single follow-up commit (each is mechanical once the pattern is set). This step is **two commits**, not one.

**Acceptance Criteria** (per commit):
- [ ] `pnpm test` passes — including each migrated hook's existing test file (`__tests__/use-notes.test.ts`, etc.) without modification.
- [ ] No migrated hook contains `setLoading(true); setError(null); try {` blocks anymore.
- [ ] `useResource` itself has a colocated test covering load-on-mount, error capture, refresh, optimistic setData.
- [ ] Each migrated hook file shrinks by 10-20 lines.
- [ ] `pnpm typecheck` and `pnpm lint` clean.

---

### Step 6: Extract `makeToolContext()` test helper into `tests/helpers/`

**Priority**: Medium
**Risk**: Low (tests-only)
**Files**:
- New: `tests/helpers/tool-context.ts`
- Modified: 12+ test files under `packages/tools/src/**/__tests__/*.test.ts`

**Current State**:

12+ tool tests each declare a local `makeCtx()` factory that fills in `studentId`, `sessionId`, a `log` stub (often re-inventing `noopLogger`), and a flat object of service stubs where unused services are `null as any` or `{} as any`. Representative excerpt from `packages/tools/src/notes/__tests__/create.test.ts:10-43`:

```typescript
function makeCtx(overrides?: Partial<Pick<ToolContext, "services">>): ToolContext {
  const studentId = brandId<"StudentId">("student-test");
  const noteId = brandId<"NoteId">("note-1");

  const notesMock = { create: vi.fn().mockResolvedValue(/* ... */), update: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn(), fromSessionSummary: vi.fn() };

  return {
    studentId,
    sessionId: brandId<"SessionId">("session-1"),
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    services: {
      notes: notesMock,
      // biome-ignore lint/suspicious/noExplicitAny: other services not needed
      ...({} as any),
    },
    ...(overrides ?? {}),
  } as unknown as ToolContext;
}
```

The `as unknown as ToolContext` cast at the bottom and `{} as any` filler in `services` are smells: every test pays a typecheck escape hatch to construct a `ToolContext` whose unused half it doesn't care about.

**Target State**:

```typescript
// tests/helpers/tool-context.ts (NEW)
import { vi } from "vitest";
import type { ToolContext, ToolServices } from "@praxis/core/types";

/**
 * Build a `ToolContext` for tool-handler unit tests. Populates a noop logger,
 * fixed `studentId`/`sessionId` brands (`student-test` / `session-test`), and
 * a `services` proxy that returns a typed `vi.fn()` for any property access.
 * Override specific services (or the whole top-level fields) via the optional
 * arg.
 *
 * Usage:
 *   const ctx = makeToolContext({
 *     services: { notes: { create: vi.fn().mockResolvedValue(noteFixture) } },
 *   });
 *   await tool.handler(args, ctx);
 *
 * The proxy means `ctx.services.somethingNeverUsed.method(...)` returns a
 * `vi.fn()` (not undefined), so adding a service to `ToolServices` later
 * never breaks existing tests that don't touch the new service.
 */
import { brandId } from "@praxis/core/types";

export interface MakeToolContextOptions {
  studentId?: string;
  sessionId?: string;
  services?: Partial<ToolServices>;
  /** Override `log`; default is a `vi.fn()` quad. */
  log?: ToolContext["log"];
}

export function makeToolContext(opts: MakeToolContextOptions = {}): ToolContext {
  const services = new Proxy(opts.services ?? {}, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      // Auto-stub: return a recursive proxy that lazily yields vi.fn() for any method.
      return new Proxy(
        {},
        {
          get: () => vi.fn(),
        },
      );
    },
  }) as ToolServices;

  return {
    studentId: brandId<"StudentId">(opts.studentId ?? "student-test"),
    sessionId: brandId<"SessionId">(opts.sessionId ?? "session-test"),
    log: opts.log ?? { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    services,
  };
}
```

```typescript
// packages/tools/src/notes/__tests__/create.test.ts (MIGRATED)
import { describe, expect, it, vi } from "vitest";
import { brandId } from "@praxis/core/types";
import type { NoteBody } from "@praxis/core/types";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { createNoteTool } from "../create.js";

describe("createNoteTool", () => {
  it("calls notes.create with validated args and returns noteId", async () => {
    const noteId = brandId<"NoteId">("note-1");
    const ctx = makeToolContext({
      services: {
        notes: {
          // biome-ignore lint/suspicious/noExplicitAny: minimal mock surface for this test
          create: vi.fn().mockResolvedValue({ id: noteId /* ... */ }) as any,
          update: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn(), fromSessionSummary: vi.fn(),
        },
      },
    });

    const body: NoteBody = { kind: "free", text: "hello" };
    const result = await createNoteTool.handler({ format: "free", body }, ctx);
    expect(result.ok).toBe(true);
  });
});
```

**Implementation Notes**:

- The `Proxy`-based services object is the key technique: any service method called by the tool that the test didn't explicitly stub silently returns a `vi.fn()`. This eliminates the `{} as any` filler entirely. If a tool unexpectedly reaches into a service the test didn't intend to mock, the test still doesn't crash — but the assertion that "tool called X" forces explicit stubbing where it matters.
- For tests that DO want strict undefined-on-unused (rare), pass an explicit non-proxy `services` and the proxy fallback is bypassed for those keys.
- The helper file lives at `tests/helpers/tool-context.ts` to mirror the `useTempDb` and `noopLogger` precedent in `tests/helpers/`. Per-package test imports use `../../../../../tests/helpers/tool-context.js` (5 levels because `packages/tools/src/{subdir}/__tests__/` is 5 deep). Same pattern as `useTempDb`.
- Migrate **one test file first**, run it, commit. Then sweep the remaining 11+ in a follow-up commit. This step is **two commits**.
- Do NOT delete the per-test fixture builders that construct rich domain objects (e.g., `makeNote(...)`, `makeFlashcard(...)`) — only delete the `makeCtx`/`makeContext` that builds the `ToolContext` itself.
- Remove inline `noopLogger` definitions in the same edits.

**Acceptance Criteria** (per commit):
- [ ] No test file under `packages/tools/src/**/__tests__/` defines a local `function makeCtx`/`function makeContext` (modulo non-tool-context test fixtures).
- [ ] No test file under `packages/tools/src/**/__tests__/` casts `as unknown as ToolContext`.
- [ ] No test file under `packages/tools/src/**/__tests__/` writes `{} as any` for `services` filler.
- [ ] `pnpm test` passes — same test counts before and after.
- [ ] `pnpm typecheck` and `pnpm lint` clean.

---

### Step 7: Document `useResource` + `loadOrThrow` patterns in `.claude/skills/patterns/`

**Priority**: Low
**Risk**: Trivial (docs-only, zero code changes)
**Files**:
- New: `.claude/skills/patterns/use-resource-hook.md`
- New: `.claude/skills/patterns/load-or-throw.md`
- Modified: `.claude/skills/patterns/SKILL.md`
- Modified: `.claude/rules/patterns.md`

**Current State**: After Step 4 and Step 5 ship, the `useResource` and `loadOrThrow` patterns will exist in code and be used by 8 hooks + 3 services respectively, but the patterns directory will not yet describe them. New code may rebuild the inline boilerplate without knowing the helpers exist.

**Target State**: Each pattern gets a 50-line `.md` following the structure of the existing 12 pattern files (`engine-session-lifecycle.md`, `temp-db-test-helper.md`, etc.). Sections: heading, when to use, signature, example, common violations.

The two new entries are added to `.claude/skills/patterns/SKILL.md` in the appropriate categories:

```markdown
### Configuration and data patterns
- [config-kv-store.md] (existing)
- [mode-tool-scoping.md] (existing)
- [service-deps-injection.md] (existing)
- [load-or-throw.md] — `loadOrThrow(fetch, ctx)` after `db.insert/update/delete`; consistent ghost-write error format

### UI patterns (NEW SECTION)
- [use-resource-hook.md] — `useResource(loader)` for load-on-mount + refresh/error/loading state; layer mutations on top
```

And to `.claude/rules/patterns.md` (the dense index):

```markdown
## UI patterns
- **use-resource-hook**: `useResource(loader)` returns `{ data, loading, error, refresh, setData }`; load-on-mount via useEffect; layer mutations on top; never inline the `setLoading/try/catch/finally` block → [use-resource-hook.md]

## Service patterns (renamed section if needed)
- **load-or-throw**: After `.insert()/.update().run()`, call `loadOrThrow(() => this.get(...), { entity, op, id, log })` to round-trip — never inline the if-null-throw → [load-or-throw.md]
```

**Implementation Notes**:

- Run this step LAST, after both step 4 and step 5 land. The patterns docs reference the actual helper signatures; finalize them once.
- Each new pattern doc follows the structure of an existing one — copy `temp-db-test-helper.md` as the template; it's the closest in spirit (helper + import path + before/after example).

**Acceptance Criteria**:
- [ ] `.claude/skills/patterns/use-resource-hook.md` and `.claude/skills/patterns/load-or-throw.md` exist with 4 sections each (when, signature, example, violations).
- [ ] `.claude/skills/patterns/SKILL.md` lists both new patterns under appropriate categories.
- [ ] `.claude/rules/patterns.md` index includes both new patterns with one-line summaries.
- [ ] No code changes — `pnpm typecheck/lint/test` are unaffected.

---

## Implementation Order

Recommended order is by **risk × dependency**. Step numbers (#) match the section above.

| Order | Step | Reason |
|---|---|---|
| 1 | **Step 1** — Gate Zod discriminated unions | Correctness fix. Ship first because it unblocks creating `topic`/`course-completion` gates and removes a `as any as SuccessCriteria` cast that hides validation bypass. Zero downstream dependencies. |
| 2 | **Step 2** — `brandId` runtime import fix | Single-file boundary fix. Mechanical. Independent. |
| 3 | **Step 3** — `noopLogger` test migration | Pure cleanup; abstraction already exists. Independent of all production code. |
| 4 | **Step 4** — `loadOrThrow` helper + 3 service migrations | Touches 3 service files; small surface; standardizes ghost-write error format. Independent. |
| 5 | **Step 5a** — `useResource` extraction + first hook migrate (`use-notes`) | Establishes the pattern. Existing hook test verifies behavior. |
| 6 | **Step 5b** — Sweep remaining 7 hooks | Mechanical once 5a lands. |
| 7 | **Step 6a** — `makeToolContext` extraction + first migrate (e.g., `notes/__tests__/create.test.ts`) | Establishes the helper. Tests-only. |
| 8 | **Step 6b** — Sweep remaining 11+ tool tests | Mechanical once 6a lands. |
| 9 | **Step 7** — Pattern docs | Run last so the helper signatures are final. |

Each step is a single commit (5b and 6b each become one commit too — sweeping the remaining files). After each commit, run `pnpm typecheck && pnpm lint && pnpm test` to verify before moving on.

Total: **9 commits**.

---

## Out of scope (rejected)

The explore phase surfaced these but they didn't earn their place in the plan. Some are re-evaluations of phase-4 rejections; others are new items that don't clear the bar.

| Idea | Why rejected |
|---|---|
| `BridgedEngineSession` abstract base for Claude Code + Codex sessions | Re-evaluated post-phase-12. Bridged shape is shared by exactly 2 adapters; `direct/` is genuinely different; `mcp/` is a tool-bridge utility, not a 4th adapter. Phase-4 decision (defer to 4th looped engine) still holds. |
| `defineTool<I, O>(def)` factory | Re-evaluated post-phase-12 with 37+ tool definitions. The explicit `ToolDefinition<typeof InputSchema, typeof OutputSchema>` annotation already enforces the shape structurally. A factory adds indirection without payoff; phase-4 reasoning unchanged. |
| `OkBase` shared `z.object({ ok: z.literal(true) })` extended by all tool outputs | 31 callsites, but each `ok: z.literal(true)` is a single explicit line that aids model-readability of the output schema. Same reasoning that rejected `compactObject({...})` in phase 4: explicit > terse for schema shapes the SDK transmits. |
| Generic IPC client builder (`createClient<T>(transport, channels)`) | `*-client.ts` files have narrow, well-defined surfaces. The constructor + invoke-delegation is structural similarity only — there's no behavior to share. Adding a builder hides the channel map without reducing real complexity. |
| `NoteEditorShell` shared component for the 4 note-editor variants | Only the outer `<div className={styles.editor}>` is structurally common. The cornell/feynman/outline/free interiors diverge immediately (Cornell = multi-column; Outline = recursive list; Free = single textarea). A shell would absorb a wrapper and nothing else. |
| `buildServices()` factory for `ServiceDeps` | `ServiceDeps` is a flat DI container with one composition site (Electron main + a handful of test setups). A factory just relocates the wiring; phase-4 reasoning unchanged. |
| Branded id constructor / `brand<T>()` helper consolidation | `brandId` already exists in `@praxis/core/types/ids.ts`. The Step-2 fix (replace runtime import in `memory-client.ts` with a one-line local `asId`) is the targeted action. No broader consolidation needed. |
| Drizzle CRUD factory (`createCrud(table, schema)`) | Each domain table has distinct columns, JSON serializers, and per-row mappers (`rowToNote`, `rowToFlashcard`, `rowToLesson`). A generic CRUD would hide more than it absorbs. Hand-rolled CRUD is the right tradeoff. |
| Test fixture builder for "course with N lessons + a gate" | Integration tests that need this scenario hand-build it because the assertion shape varies (gate-evaluation tests assert different fields than course-detail tests). Premature abstraction. |
