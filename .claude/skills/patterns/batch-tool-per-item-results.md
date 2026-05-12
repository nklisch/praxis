# Pattern: Batch tool with per-item results

A "batch" course-mutation tool takes an array of items, processes each independently against a service, never aborts on per-item failure, and returns `{ ok: boolean, results: ({ ok: true, ...id } | { ok: false, ...id, reason })[] }` where the top-level `ok` is the AND of all per-item `ok` values. The model spends one tool step regardless of array length and learns from per-item `reason` strings which items failed without losing the successes.

## Rationale

The bootstrap explorer agent has a tight step budget (`maxSteps`, default 200). Calling one tool per concept / edge / lesson burns steps fast. The batch tools collapse N service calls into one model step while preserving per-item observability — failures don't abort the rest, and the model sees each item's outcome in the result so it can correct on the next call. This shape is distinct from the documented `tool-dispatch-pipeline` (which describes registry → handler → ToolResult) and from `discriminated-union-dispatch` (which describes the `kind` switch inside a single-shape tool). It is a Zod-output convention plus a handler loop.

## Examples

### Example 1: `course.draft_add_concepts` — defines the shape

**File**: `packages/tools/src/course/draft-add-concepts.ts:20`
```typescript
const OutputSchema = z.object({
  /** True iff every concept in the batch was added successfully. */
  ok: z.boolean(),
  /** Total concept count on the draft after the batch. */
  conceptCount: z.number().int(),
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), name: z.string() }),
      z.object({ ok: z.literal(false), name: z.string(), reason: z.string() }),
    ]),
  ),
});
```

The handler loop at `packages/tools/src/course/draft-add-concepts.ts:62`:
```typescript
let allOk = true;
for (const c of args.concepts) {
  const r = await ctx.services.bootstrap.addConcept({ draftId, name: c.name, description: c.description });
  if (r.ok) {
    lastConceptCount = r.conceptCount;
    results.push({ ok: true, name: c.name });
  } else {
    allOk = false;
    results.push({ ok: false, name: c.name, reason: r.reason });
  }
}
return { ok: allOk, conceptCount: lastConceptCount, results };
```

### Example 2: `course.draft_add_edges` — same shape, different identifying key

**File**: `packages/tools/src/course/draft-add-edges.ts:26`
```typescript
const OutputSchema = z.object({
  ok: z.boolean(),
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), fromName: z.string(), toName: z.string() }),
      z.object({ ok: z.literal(false), fromName: z.string(), toName: z.string(), reason: z.string() }),
    ]),
  ),
});
```

The per-item identifying key here is the `(fromName, toName)` pair instead of `name`. Contract: include enough identifying fields per result so the caller can correlate without an index lookup.

### Example 3: `course.draft_add_lessons` and `course.draft_add_lesson_assessments`

**File**: `packages/tools/src/course/draft-add-lessons.ts:41`
```typescript
const OutputSchema = z.object({
  ok: z.boolean(),
  /** Total lesson count on the draft after the batch. */
  lessonCount: z.number().int(),
  results: z.array(
    z.union([
      z.object({ ok: z.literal(true), title: z.string(), lessonIndex: z.number().int() }),
      z.object({ ok: z.literal(false), title: z.string(), reason: z.string() }),
    ]),
  ),
});
```

**File**: `packages/tools/src/course/draft-add-lesson-assessments.ts:29` — same shape with `draftAssessmentId` in the success variant.

## When to Use

- New tool that performs N independent mutations against the same draft / aggregate and where the model would otherwise loop N times
- Per-item validation that the model could correct (unknown concept name, duplicate edge, missing reference) — the per-item `reason` is the feedback signal
- Tool description should call out "Costs one step regardless of array length" so the model picks the batch over the singleton

## When NOT to Use

- The operation is genuinely atomic (all-or-nothing) — use a single-shape tool with `z.discriminatedUnion("ok", [...])` instead (see `draft-set-assessment-plan.ts:10`)
- Per-item operations have ordering side-effects the model needs to control mid-batch (rare — almost always the array order is enough)
- Single mutation — wrap as a non-batch tool with the discriminated-union output

## Common Violations

- Returning `[Promise<ToolResult>]` from `Promise.all` instead of sequential `await` — order preservation matters for tools like `draft_add_lessons` (lessons are appended in declared order); use a `for ... of` await loop, not parallel
- Returning the first failure as a top-level `{ ok: false, reason }` instead of per-item results — that loses information about which items succeeded and forces the model to retry the whole batch
- Forgetting the no-draftId fallback at the head of the handler — every batch tool should map missing draft to per-item failures (see `draft-add-concepts.ts:48`), not a top-level throw
- Using `z.discriminatedUnion("ok", [...])` at the top level — it can't carry both success and failure items at once. The top-level `ok` is a rollup boolean; per-item `ok` is the union discriminator. Keep them distinct.
