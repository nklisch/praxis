# Pattern: Kind-Adapter Registry

When a discriminated-union domain object (`AssignmentItem.kind`, `EngineEvent.type`) needs per-variant handlers, expose the variants as a single `Record<UnionKind, Adapter>` returned by a `buildXxxRegistry()` factory. TypeScript's exhaustiveness check on the Record type forces every variant to have a registered adapter — adding a new union member that lacks a Record entry is a compile error.

## Rationale

Without the Record, dispatch tends to be a long `switch` (or worse, scattered `if (kind === "foo")` checks) that the type system can't audit. Centralizing dispatch in one Record-typed map both compresses the dispatch site (`registry[item.kind].grade(...)`) and makes the contract "every kind needs a handler" structural, not a comment. The `buildXxxRegistry()` factory shape is what `service-deps-injection` consumers use — the registry is built once at startup and passed in via deps.

## Examples

### Example 1: grader registry

**File**: `packages/core/src/services/graders/registry.ts:27`

```ts
export function buildGraderRegistry(): Record<AssignmentItem["kind"], ItemGrader> {
  return {
    "single-choice": new SingleChoiceGrader(),
    "multi-select": new MultiSelectGrader(),
    "short-answer": new ShortAnswerGrader(),
    math: new MathGrader(),
    code: new CodeGrader(),
    "free-response": new FreeResponseGrader(),
    numerical: new NumericalGrader(),
    matching: new MatchingGrader(),
    ordering: new OrderingGrader(),
    "two-tier": new TwoTierGrader(),
    "structured-question": new StructuredQuestionGrader(),
  };
}
```

### Example 2: Adapter implementing the port

**File**: `packages/core/src/services/graders/short-answer-grader.ts:11`

```ts
export class ShortAnswerGrader implements ItemGrader {
  readonly kind = "short-answer" as const;
  async grade({ item, response, ctx }): Promise<GraderResult> { /* ... */ }
}
```

### Example 3: Port type with discriminated `kind` field

**File**: `packages/core/src/services/graders/types.ts:72`

```ts
export interface ItemGrader {
  readonly kind: AssignmentItem["kind"];
  grade(input: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult>;
}
```

`IndexerOrchestratorImpl` in `packages/core/src/services/indexers/orchestrator.ts:43` uses a similar pattern via `ReadonlyArray<Indexer>` keyed by `schedule: "post-turn" | "session-end"`, fanning out at runtime. The `Mode → toolNames` filter in `engine-session-manager.ts` is conceptually similar but uses an array filter rather than a Record.

## When to Use

- A discriminated union has 4+ variants and per-variant logic that's stable in shape (same input → same output shape per variant).
- Adding a new variant should be a guided compile error, not a silent "default" branch.
- The variants are stateless or share construction (here: each grader is a new-no-args class instance).

## When NOT to Use

- The dispatch is one-shot or tightly coupled to the caller — a local `switch` exhaustiveness check is fine.
- Variants have wildly different inputs/outputs — a Record forces a single Adapter shape and that constraint hurts more than it helps.

## Common Violations

- Using `Record<string, Adapter>` instead of `Record<Union["kind"], Adapter>` — drops the exhaustiveness guarantee.
- Scattering `switch (item.kind)` blocks in callers instead of `registry[item.kind].method(...)` — duplicates the dispatch and lets new variants leak through `default:` branches.
- Mutating the registry at runtime (registering new graders dynamically) — keep the registry frozen after construction.
