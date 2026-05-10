# Design: Phase 17 — Item Type Expansion + Inline Quick Checks

## Overview

Two related but separable axes ship in this phase:

1. **Item type expansion** — `AssignmentItem` grows from five kinds (multiple-choice / short-answer / free-response / math / code) to nine, with a `requireReasoning` modifier on choice kinds. Each new kind gets a grader and an item-card renderer. Existing data is migrated.

2. **Inline quick checks** — a new `quick_check.*` tool family the tutor uses *during* a teach session for formative checks-for-understanding. Quick checks render an interactive card *inside the chat thread* (not in an assignment tab), block on student input, and resolve the tool call with the student's response. They are ephemeral — captured in the episodic transcript, never persisted to `assignments`.

The two ship together because the new item kinds (single-choice, multi-select, matching, ordering, etc.) are the building blocks of both surfaces — an `AssignmentItemCard` renderer and a `<QuickCheckCard>` in chat both consume the same item shape.

### Why now

Phase 16 made assessments first-class (modalities per mode, parent-child session loop, course-scoped scaffolding). But Phase 16 left the *content* of items unchanged — the item palette is functionally what shipped in Phase 8. A tutor today has a 5-kind toolbox and no way to check understanding without authoring a full assignment that spawns a tab. Both gaps are now load-bearing:

- **Pedagogy.** Two-tier diagnostic items, choice-with-reasoning, and matching are some of the most evidence-backed formats for surfacing misconceptions and building schemas. Without them, the assessment loop is correct but shallow.
- **Flow.** A check-for-understanding mid-explanation should feel like a tap on the shoulder, not a context switch. The current "create an assignment, open a tab, work through it, submit, return" loop is fine for graded work and wrong for "did that land?"

### What's in scope

1. **Schema rename + extension** of `AssignmentItem` discriminated union:
   - Rename `multiple-choice` → `single-choice` (existing kind, single correct option). Migration rewrites stored items.
   - Add `multi-select` — multiple correct options, partial-credit grader.
   - Add `numerical` — value + tolerance + optional units + significant figures.
   - Add `matching` — two columns, correct pair set.
   - Add `ordering` — items + correct order.
   - Add `two-tier` — answer + reason combo, with each reason option mapped to a misconception id.
2. **`requireReasoning` modifier** on `single-choice`, `multi-select`, and `two-tier`. When set, an explanatory `reasoningRubric: Rubric` is also required. The grader blends the deterministic selection grade with a rubric grade on the reasoning text — same blending math as today's `workRubric`.
3. **Per-kind graders** in `packages/core/src/services/graders/`. The grader registry is the single source of truth.
4. **UI item-card renderers** in `<AssignmentItemCard>`. Drag-and-drop for matching and ordering, with a pick-from-dropdown fallback rendered behind a "use keyboard" toggle.
5. **`AssignmentItemSchema`** Zod discriminated union extended; tool inputs auto-pick up the new kinds.
6. **`quick_check.*` tool family** — five tools the tutor calls inline:
   - `quick_check.single_choice({ prompt, options, correctIndex? })`
   - `quick_check.multi_select({ prompt, options, correctIndices? })`
   - `quick_check.short_answer({ prompt })`
   - `quick_check.matching({ prompt, left, right, correctPairs? })`
   - `quick_check.confidence({ prompt, scale })`
7. **Human-in-the-loop tool dispatch** — the in-process registry grows a pending-call mechanism so tool handlers can `await` UI input. Streaming IPC channel `praxis.quickCheck.events.<callId>` and a `praxis.quickCheck.resolve` handler complete the loop.
8. **`<QuickCheckCard>`** rendered inline as a synthetic message bubble in the chat thread. Student answers; resolution flows back through IPC; tool_result completes; tutor narrates response.
9. **Teach mode prompt** updates explaining when to reach for a `quick_check` (formative, single-question, doesn't break flow) vs. `assignment.create` (summative, lesson-scoped, gradeable).
10. **Migration** rewrites existing `assignments.items_json` blobs to use `"single-choice"` instead of `"multiple-choice"`. Praxis has no production users — a one-shot SQL update inside the migration is fine.

### What's out of scope (Tier 3 — future enhancements)

- `fill-in-blank` (cloze) — functionally a constrained `short-answer`.
- `categorize` (drag into named buckets) — superset of `matching`, deferred until matching's UX is proven.
- `highlight-in-text` (select-the-phrase) — interesting but pedagogically narrow; needs reading-passage UX scaffolding.
- `sketch-answer` (rubric-graded drawing) — sketches are already attachable to math items; promoting to a full kind is a later step.
- `hotspot` (click-region on image) — niche; defer until there's a course that needs it.
- `confidence-rated` as a modifier on assignment items — the standalone `quick_check.confidence` tool covers the formative case for now.
- Calibration / metacognitive scoring (using confidence ratings to detect overconfidence). Data shape supports it; UI affordance deferred.

---

## Architectural overview

### Item taxonomy

```
single-choice         pick one
multi-select          pick all that apply
short-answer          type a short string; deterministic match
free-response         long-form prose; rubric-graded
math                  symbolic equation answer; sympy-checked
code                  function or program; sandbox-tested
numerical (NEW)       value + units + tolerance + sig-figs
matching (NEW)        pair items between two columns
ordering (NEW)        sequence steps in correct order
two-tier (NEW)        answer + reason for the answer
```

Modifiers (orthogonal to kind):

```
requireReasoning      on single-choice, multi-select, two-tier
                       student also writes a justification, rubric-graded
workRubric            (existing) on math, code
                       student shows their work, partial-credit graded
```

### Two surfaces share the item palette

```
                           ┌─────────────────────────────┐
                           │   AssignmentItem (shared)   │
                           │   discriminated union       │
                           └─────────────────────────────┘
                              ▲                       ▲
                              │                       │
            ┌─────────────────┴─────────┐  ┌──────────┴──────────────────┐
            │  Assignment-tab surface   │  │  Inline chat surface         │
            │                            │  │                               │
            │  Tutor: assignment.create  │  │  Tutor: quick_check.<kind>   │
            │  → persists row in         │  │  → ephemeral; tool-call       │
            │    assignments table       │  │    pends until UI resolves   │
            │  → renders in              │  │  → renders <QuickCheckCard>  │
            │    AssignmentItemCard      │  │    inline in chat thread     │
            │  → student submits whole   │  │  → student answers single    │
            │    assignment              │  │    item, resolves tool       │
            │  → grade persisted         │  │  → no DB persistence         │
            │  → notification to parent  │  │    (lives in episodic only)  │
            └────────────────────────────┘  └───────────────────────────────┘
```

The two surfaces use the same Zod schemas for item input and the same UI primitives for individual question rendering.

### Quick-check lifecycle (human-in-the-loop dispatch)

```
1. Tutor model emits tool_call: quick_check.single_choice({ prompt, options })
                                          │
2. Engine adapter passes to               ▼
   InProcessToolRegistry.dispatch(name, args, callId)
                                          │
3. Handler calls a new                    ▼
   ctx.services.quickCheck.await(callId, item)
                                          │
4. quickCheck service                     ▼
   - Inserts pending entry in in-memory map keyed by callId.
   - Emits ActivityItem (kind: quick_check.pending) — NOT for activity rail
     display, but as a typed channel renderer subscribes to.
   - Returns a Promise that resolves when resolve(callId, answer) is called.
                                          │
5. UI renderer (in chat thread)           ▼
   - Subscribes to praxis.quickCheck.events stream.
   - On pending event with callId in this session: render <QuickCheckCard>
     as a synthetic message bubble in the chat thread.
                                          │
6. Student answers                        ▼
   - <QuickCheckCard> calls
     client.quickCheck.resolve(callId, answer).
                                          │
7. IPC handler                            ▼
   - Forwards to quickCheckService.resolve(callId, answer).
   - The pending Promise resolves.
                                          │
8. Tool handler returns answer            ▼
   to the registry, which returns it as the tool_result to the engine.
                                          │
9. Engine emits tool_result               ▼
   event into the conversation; tutor narrates response in same turn.
```

Resolution is **append-only to the conversation**: the tool_call event is already in episodic; the tool_result event lands when the student answers. No magic state across turns. If the student dismisses the card without answering (or closes the tab), the tool resolves with `{ kind: "abandoned" }` after a configurable timeout (default: forever — quick checks wait patiently).

---

## Implementation Units

### Unit 1: Schema rename + extension

**File**: `packages/core/src/types/artifacts.ts`

```typescript
export type AssignmentItem =
  | SingleChoiceItem
  | MultiSelectItem
  | ShortAnswerItem
  | FreeResponseItem
  | MathItem
  | CodeItem
  | NumericalItem      // NEW
  | MatchingItem       // NEW
  | OrderingItem       // NEW
  | TwoTierItem;       // NEW

export interface SingleChoiceItem {
  kind: "single-choice";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  // NEW: optional reasoning modifier
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;  // blends selection vs reasoning when both present
  authoredBy?: "tutor" | "configurator";
}

export interface MultiSelectItem {
  kind: "multi-select";
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndices: number[];   // ≥1, sorted ascending
  requireReasoning?: boolean;
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface NumericalItem {
  kind: "numerical";
  id: string;
  prompt: string;
  expectedValue: number;
  /** Absolute tolerance, |x - expected| ≤ tol. Default 0. */
  tolerance?: number;
  /** Optional units; case-insensitive exact-string match. */
  expectedUnits?: string;
  /** When set, requires student answer to round to this many sig figs. */
  significantFigures?: number;
  workRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

export interface MatchingItem {
  kind: "matching";
  id: string;
  prompt: string;
  /** Items in the left column, in display order. */
  leftItems: Array<{ id: string; text: string }>;
  /** Items in the right column, in display order. */
  rightItems: Array<{ id: string; text: string }>;
  /** Correct pairs as (leftId, rightId). One-to-one by default. */
  correctPairs: Array<{ leftId: string; rightId: string }>;
  authoredBy?: "tutor" | "configurator";
}

export interface OrderingItem {
  kind: "ordering";
  id: string;
  prompt: string;
  /** Items shown in shuffled order to the student. Each has a stable id. */
  items: Array<{ id: string; text: string }>;
  /** Correct sequence as an array of item ids. */
  correctOrder: string[];
  authoredBy?: "tutor" | "configurator";
}

export interface TwoTierItem {
  kind: "two-tier";
  id: string;
  prompt: string;                  // tier-1 question
  options: string[];               // tier-1 options
  correctOptionIndex: number;      // tier-1 correct
  reasonPrompt: string;            // tier-2 question, e.g. "why did you pick that?"
  reasonOptions: string[];         // tier-2 options (the "reasons")
  correctReasonIndex: number;      // tier-2 correct reason index
  /**
   * Maps each reason option index to a misconception id (or null when the
   * option is "correct" or "no clear misconception"). Used to seed
   * misconception memory on wrong tier-2 selections.
   */
  misconceptionByReasonIndex: Array<string | null>;
  requireReasoning?: boolean;      // optional free-text reasoning ON TOP of the two-tier structure
  reasoningRubric?: Rubric;
  primaryWeight?: number;
  authoredBy?: "tutor" | "configurator";
}

// Unchanged: ShortAnswerItem, FreeResponseItem, MathItem, CodeItem
```

**Implementation notes**:
- `requireReasoning` lives only on `SingleChoiceItem`, `MultiSelectItem`, and `TwoTierItem`. Not all kinds — short-answer is *already* free-text; reasoning would be redundant. Free-response is reasoning. Math and code use `workRubric`.
- The reasoning text travels in the existing `AssignmentResponse.work` field (or a new `reasoning` field if we want to keep them separable — small choice). Recommendation: reuse `work` to avoid schema churn; the grader can tell the difference because `requireReasoning` lives on the item.
- `MatchingItem` allows non-bijective pairings *only* when explicitly designed (e.g., one right-side answer pairs to two left-side items). v1 keeps it strict 1:1; we can relax later.
- `TwoTierItem.misconceptionByReasonIndex` aligns reasons to the misconception memory layer. When a student picks reason index 2 and that index maps to misconception `mc-flip-inequality-on-divide`, the grader emits a misconception evidence event automatically — closing the loop with Phase 7's misconception memory.

**File**: `packages/tools/src/assignment/item-schema.ts`

Extend `AssignmentItemSchema` Zod discriminated union with the new variants. Use `z.discriminatedUnion("kind", [...])` per the project's `discriminated-union-dispatch` pattern.

**Acceptance criteria**:
- [ ] All nine kinds compile under strict mode.
- [ ] `AssignmentItemSchema` parses each kind's happy path.
- [ ] `requireReasoning: true` without `reasoningRubric` is a Zod refine error.
- [ ] `MatchingItem.correctPairs` references only `leftItems[].id` and `rightItems[].id` (refine).
- [ ] `OrderingItem.correctOrder` is a permutation of `items[].id` (refine).
- [ ] `TwoTierItem.misconceptionByReasonIndex.length === reasonOptions.length` (refine).

---

### Unit 2: Migration

**File**: `drizzle/00XX_phase17_item_types.sql` (auto-generated)

The schema itself doesn't change — items are stored as JSON. But we need to rewrite stored data:

```sql
-- Rewrite kind: "multiple-choice" → "single-choice" inside items_json blobs.
-- Same for assignment_responses if any kind is encoded there (it isn't today,
-- but defensive grep confirms).
UPDATE assignments
SET items_json = json_replace(
    items_json,
    '$[#].kind',  -- pseudocode; SQLite json_replace doesn't support array map; use a function
    ...
)
WHERE items_json LIKE '%"multiple-choice"%';
```

SQLite doesn't have a native JSON array map. Pragmatic approach: a one-shot Node script invoked by the migration runner that reads each row, parses, rewrites, writes back. Wire it into the migration via a custom step — see existing migrations for prior art (e.g. concept-graph migrations may have similar shape).

**Implementation notes**:
- The migration is idempotent: re-running it on already-migrated data is a no-op.
- Keep the old `"multiple-choice"` string as an accepted alias in the Zod schema for one transition period? No — Praxis has no production users. Hard cut. The schema rejects `"multiple-choice"`; if someone has a stale assignment, it errors loudly.

**Acceptance criteria**:
- [ ] After migration, no row in `assignments` has `kind: "multiple-choice"` in its items.
- [ ] Existing single-choice assignments load and grade correctly post-migration.
- [ ] Re-running `pnpm db:migrate` is idempotent.

---

### Unit 3: Per-kind graders

**Files**: `packages/core/src/services/graders/`

```
single-choice-grader.ts       (rename from multiple-choice-grader.ts)
multi-select-grader.ts        NEW
numerical-grader.ts           NEW
matching-grader.ts            NEW
ordering-grader.ts            NEW
two-tier-grader.ts            NEW
```

**Multi-select grading** — Jaccard similarity for partial credit:

```typescript
function gradeMultiSelect(item: MultiSelectItem, response: { selectedIndices: number[] }): GraderResult {
  const correct = new Set(item.correctOptionIndices);
  const selected = new Set(response.selectedIndices);
  const intersection = [...selected].filter(i => correct.has(i)).length;
  const union = new Set([...correct, ...selected]).size;
  const score = union === 0 ? 0 : intersection / union;
  return {
    score,
    feedback: composeMultiSelectFeedback(correct, selected),
    tier: "deterministic",
  };
}
```

**Numerical grading** — value within tolerance, units match (case-insensitive exact), sig-figs check optional:

```typescript
function gradeNumerical(item: NumericalItem, response: { value: number; units?: string }): GraderResult {
  const tol = item.tolerance ?? 0;
  const valueOk = Math.abs(response.value - item.expectedValue) <= tol;
  const unitsOk = !item.expectedUnits ||
                  (response.units?.toLowerCase() === item.expectedUnits.toLowerCase());
  const sigFigsOk = !item.significantFigures ||
                    countSigFigs(response.value) === item.significantFigures;
  // ...
}
```

**Matching grading** — fraction of correct pairs:

```typescript
function gradeMatching(item: MatchingItem, response: { pairs: Array<{ leftId, rightId }> }): GraderResult {
  const correctSet = new Set(item.correctPairs.map(p => `${p.leftId}|${p.rightId}`));
  const correctCount = response.pairs.filter(p => correctSet.has(`${p.leftId}|${p.rightId}`)).length;
  const score = item.correctPairs.length === 0 ? 0 : correctCount / item.correctPairs.length;
  // ...
}
```

**Ordering grading** — fraction of correct positions:

```typescript
function gradeOrdering(item: OrderingItem, response: { order: string[] }): GraderResult {
  if (response.order.length !== item.correctOrder.length) {
    return { score: 0, feedback: "ordering must include every item exactly once", tier: "deterministic" };
  }
  const matches = response.order.filter((id, i) => id === item.correctOrder[i]).length;
  const score = matches / item.correctOrder.length;
  // ...
}
```

**Two-tier grading** — both must be correct for full credit; tier-1-only is half:

```typescript
function gradeTwoTier(item: TwoTierItem, response: { tier1Index: number; tier2Index: number }): GraderResult {
  const tier1Ok = response.tier1Index === item.correctOptionIndex;
  const tier2Ok = response.tier2Index === item.correctReasonIndex;
  const score = tier1Ok && tier2Ok ? 1.0 : tier1Ok ? 0.5 : 0;

  // Misconception evidence — if tier 2 is wrong, emit a misconception event keyed by
  // the reason option's misconception id. The grader returns the id; the assignment
  // service writes the misconception evidence as a side effect.
  const misconceptionId = !tier2Ok ? item.misconceptionByReasonIndex[response.tier2Index] : null;
  return {
    score,
    feedback: composeTwoTierFeedback(item, tier1Ok, tier2Ok),
    tier: "deterministic",
    misconceptionId,  // new field on GraderResult
  };
}
```

**`requireReasoning` blending** — when set on any choice kind:

```typescript
async function gradeWithReasoning<I extends SingleChoiceItem | MultiSelectItem | TwoTierItem>(
  item: I,
  response: AssignmentResponse,
  ctx: GraderContext,
): Promise<GraderResult> {
  const baseGrader = registry[item.kind];
  const baseResult = await baseGrader.grade({ item, response, ctx });

  if (!item.requireReasoning || !response.work || response.work.trim() === "") {
    return baseResult;
  }

  const reasoningResult = await runRubricAgent({
    item,
    rubric: item.reasoningRubric!,  // refined: present when requireReasoning is true
    text: response.work,
    source: "reasoning-rubric",
    ctx,
  });
  const primaryWeight = item.primaryWeight ?? 0.5;
  return blendDeterministicAndWorkRubric(baseResult, reasoningResult, primaryWeight);
}
```

Reuses the existing `blendDeterministicAndWorkRubric` helper from the `workRubric` flow. Same blending math, different name on the rubric source.

**Implementation notes**:
- `GraderResult` grows an optional `misconceptionId?: string` field. The assignment service writes a misconception evidence event when present.
- All new graders are tier `deterministic`. The reasoning rubric agent is tier `rubric-agent` and only runs when `requireReasoning` is set.

**Acceptance criteria**:
- [ ] Each grader has a unit test covering happy path + at least one degenerate case.
- [ ] Multi-select Jaccard returns 0.5 when student picks 1 correct + 1 wrong out of 2 correct.
- [ ] Two-tier with wrong tier-2 produces a misconception evidence event with the right id.
- [ ] `requireReasoning` blending reuses `blendDeterministicAndWorkRubric` behaviour.

---

### Unit 4: AssignmentItemCard renderers

**File**: `packages/ui/src/components/assignment-item-card.tsx`

Add a renderer per kind. Pattern: a single `<AssignmentItemCard>` switch on `item.kind`, dispatching to per-kind subcomponents:

```typescript
function AssignmentItemCard({ item, response, onChange, locked }: Props) {
  switch (item.kind) {
    case "single-choice":  return <SingleChoiceItemBody {...} />;
    case "multi-select":   return <MultiSelectItemBody {...} />;
    case "short-answer":   return <ShortAnswerItemBody {...} />;
    case "free-response":  return <FreeResponseItemBody {...} />;
    case "math":           return <MathItemBody {...} />;
    case "code":           return <CodeItemBody {...} />;
    case "numerical":      return <NumericalItemBody {...} />;     // NEW
    case "matching":       return <MatchingItemBody {...} />;       // NEW
    case "ordering":       return <OrderingItemBody {...} />;       // NEW
    case "two-tier":       return <TwoTierItemBody {...} />;        // NEW
  }
}
```

**MultiSelect** — checkbox list with submitted state styling.

**Numerical** — two inputs: value (numeric) and units (text, only when `expectedUnits` is set).

**Matching** — two columns side by side. Drag-and-drop primary: student drags a left item onto a right item, drawing a line between them (SVG overlay). Pick-from-dropdown fallback: each left item has a dropdown listing all right items. Both surfaces produce the same `{ leftId, rightId }[]` response payload.

The fallback toggle: a small "use keyboard" button in the card corner switches between modes. Default to drag-and-drop on devices with pointer events; fall back to dropdowns on touch / when reduced-motion is set.

**Ordering** — vertical list of items shown in shuffled order. Drag-and-drop primary (reorder by dragging a row up/down). Up/Down buttons per row as keyboard fallback.

**TwoTier** — two stacked questions. Student picks tier-1 first; tier-2 reveals only after tier-1 is selected (so they don't see the "trap" reasons before committing). After both selected and (optionally) reasoning typed, the card shows "submit" the same as any item.

**`requireReasoning` rendering** — a textarea below the choice control, labeled "explain your thinking". Required for submission validation in the assignment surface; the work text travels in `AssignmentResponse.work`.

**Implementation notes**:
- Use `dnd-kit/core` (already in the project's UI stack? — verify; if not, evaluate `@dnd-kit/core` vs. a simpler hand-rolled pointer handler. Drag-and-drop is the kind of thing where a battle-tested library is worth the dep weight, especially for accessibility.)
- The matching SVG overlay sizes to its container; lines redraw on scroll/resize.
- Locked state (post-submit) freezes interactivity; correct/incorrect feedback overlays on each item.
- Editorial: no emojis; use the existing ornament glyphs (`°`, `·`, `⌖`) for status; lowercase labels.

**Acceptance criteria**:
- [ ] Each new kind renders without console errors when given a valid item.
- [ ] Drag-and-drop matching produces the right pair set when dragged correctly.
- [ ] Keyboard fallback for matching: tab into a left item, press space, arrow to a right item, press space — pair recorded.
- [ ] TwoTier hides tier-2 until tier-1 is answered.
- [ ] `requireReasoning` textarea blocks submission until non-empty when the modifier is set.

---

### Unit 5: `quick_check.*` tools — human-in-the-loop dispatch infrastructure

**File**: `packages/core/src/services/quick-check-service.ts` (NEW)

```typescript
export interface QuickCheckService {
  /**
   * Register a pending quick check; emit pending event; await resolution.
   * Returns the student's answer (kind-specific shape) when resolved.
   */
  await<T>(input: {
    callId: string;
    sessionId: SessionId;
    item: AssignmentItem;
    timeoutMs?: number;  // default Infinity
  }): Promise<QuickCheckAnswer>;

  /**
   * Resolve a pending quick check. Called by IPC handler when student submits.
   * Throws if callId isn't pending.
   */
  resolve(input: { callId: string; answer: QuickCheckAnswer }): void;

  /**
   * Cancel a pending quick check (e.g. session ended). The awaiting handler
   * gets a { kind: "abandoned" } answer.
   */
  cancel(callId: string): void;

  /** Subscribe to pending/resolved events for renderer dispatch. */
  subscribe(listener: QuickCheckListener): () => void;
}

export type QuickCheckAnswer =
  | { kind: "single-choice"; selectedIndex: number }
  | { kind: "multi-select"; selectedIndices: number[] }
  | { kind: "short-answer"; text: string }
  | { kind: "matching"; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: "confidence"; rating: number }
  | { kind: "abandoned" };

export type QuickCheckEvent =
  | { kind: "pending"; callId: string; sessionId: SessionId; item: AssignmentItem }
  | { kind: "resolved"; callId: string; answer: QuickCheckAnswer };
```

**File**: `packages/tools/src/quick-check/single-choice.ts` and friends

```typescript
const InputSchema = z.object({
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  /** When set, used for grader feedback after the student answers. Optional —
   *  formative checks don't require a "correct" answer. */
  correctIndex: z.number().int().nonnegative().optional(),
});

const OutputSchema = z.object({
  selectedIndex: z.number().int().nonnegative(),
  correct: z.boolean().optional(),  // only present when correctIndex is set
});

export const quickCheckSingleChoiceTool: ToolDefinition = {
  name: "quick_check.single_choice",
  description: "Ask the student a single-choice question inline in chat. Renders an interactive card; blocks until the student answers. Use for formative checks-for-understanding mid-explanation; for graded work, use assignment.create instead.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = ctx.toolCallId;  // see Phase 16 design discussion of why this is hard
    const item: SingleChoiceItem = {
      kind: "single-choice",
      id: callId,  // ephemeral; reuse callId as item id
      prompt: args.prompt,
      options: args.options,
      correctOptionIndex: args.correctIndex ?? -1,
    };
    const answer = await ctx.services.quickCheck.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });
    if (answer.kind === "abandoned") {
      return { selectedIndex: -1 };  // model interprets as "didn't answer"
    }
    if (answer.kind !== "single-choice") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }
    return {
      selectedIndex: answer.selectedIndex,
      ...(args.correctIndex !== undefined && {
        correct: answer.selectedIndex === args.correctIndex,
      }),
    };
  },
};
```

**Note on `ctx.toolCallId`**: Phase 16 design dropped this requirement because the dispatch path didn't have a clean way to get the call_id. For Phase 17 quick_check tools, we *do* need a stable per-call id. Options:

- (a) Generate one in the handler (`uuidv7()`), use it as both the registry key and the UI render key. Engine adapter doesn't need to know the engine's call_id.
- (b) Properly thread the engine's call_id through dispatch (the cross-cutting change Phase 16 deferred).

(a) is the pragmatic choice — the model never needs to know our internal callId; it just sees the tool result. The engine's call_id stays internal to the adapter. Use option (a).

**File**: `packages/desktop/electron/main/ipc-server.ts`

Add IPC handlers:

```typescript
// streaming pending events
handle("praxis.quickCheck.events.start", (event, streamId: string) => {
  const channel = `praxis.quickCheck.events.${streamId}`;
  const unsub = quickCheckService.subscribe((evt) => {
    sendToRenderer(event, channel, evt);
  });
  // unsub on cancel — see existing streaming pattern in praxis.session.send.start
});

handle("praxis.quickCheck.resolve", (_event, input: { callId: string; answer: QuickCheckAnswer }) => {
  quickCheckService.resolve(input);
});
```

**Acceptance criteria**:
- [ ] `quickCheckService.await` resolves with the answer when `resolve` is called.
- [ ] `await` resolves with `{ kind: "abandoned" }` when `cancel` is called.
- [ ] Subscribers receive `pending` and `resolved` events in order.
- [ ] IPC stream delivers pending events to a connected renderer.
- [ ] All five `quick_check.*` tools dispatch correctly under fakes.

---

### Unit 6: `<QuickCheckCard>` inline renderer

**File**: `packages/ui/src/components/quick-check-card.tsx` (NEW)

A QuickCheck event arrives over the IPC stream. The chat surface mounts a subscriber:

```typescript
// In TeachChatTabBody (or a new useQuickCheck hook):
useQuickCheckBridge(session.sessionId, {
  onPending: (callId, item) => {
    // Append a synthetic message to the chat log:
    appendMessage({
      role: "system",
      kind: "quick-check",
      callId,
      item,
    });
  },
  onResolved: (callId) => {
    markQuickCheckResolved(callId);
  },
});
```

The chat log's message-rendering switch grows a `quick-check` case that renders `<QuickCheckCard>` inline. The card uses the existing `<AssignmentItemCard>` body subcomponents for each kind — single-source-of-truth for item rendering. After the student submits via the card, the card calls `client.quickCheck.resolve({ callId, answer })` and locks itself.

**Visual design**: A QuickCheckCard sits inline as a message bubble but distinct from chat messages — a thin border, a discreet "tutor asked" tag, the item body, a submit button. Not a modal, not a tab. Locked state after answer shows green-on-correct / amber-on-incorrect with the correct answer revealed (when `correctIndex` was provided).

**Implementation notes**:
- The synthetic system message lives in the chat log array but never goes to episodic. The tool_call and tool_result events that bracket it ARE in episodic.
- If the user navigates away from the tab mid-quick-check, the card persists (per `tab-body-isolation` pattern — tabs use `display:none`, not unmount). When they come back, the card is still pending.
- Multiple in-flight quick checks per session: each gets its own card. Order: top-down by callId.

**Acceptance criteria**:
- [ ] When a `pending` event fires, a `<QuickCheckCard>` appears in the chat log.
- [ ] Submitting the card resolves the IPC call, the card locks, and the tutor's response appears in the next assistant turn.
- [ ] Abandoning the card (close tab → never resolve) leaves the conversation in a consistent state; the next user message kicks the model and the abandoned tool resolves with `{ kind: "abandoned" }`.

---

### Unit 7: Teach mode prompt

**File**: `packages/curriculum/src/modes/fragments/role.ts`

Extend the role fragment to teach the tutor when to use which surface:

```text
Two ways to ask the student something:

quick_check.* — formative, single-question, inline in the current conversation.
Use when: checking understanding mid-explanation, after a worked example, before
introducing a new concept. The student answers without leaving the conversation.
You see the answer in the same turn and react.

assignment.create — summative, lesson-scoped, gradeable, opens its own tab.
Use when: a homework set, a quiz over a lesson's concepts, a unit exam.
Authoring an assignment opens a new tab automatically; the student takes it
asynchronously and the result flows back to you as a system note.

Default to quick_check for formative work; reserve assignment.create for things
the student should do as their own deliberate practice.
```

Plus a short note on item kinds:

```text
Item kinds at your disposal (both surfaces):
- single-choice: pick one of N options
- multi-select: pick all that apply
- short-answer: typed answer matched against accepted strings
- numerical: a number (with optional units / tolerance / sig-figs)
- matching: pair items between two columns
- ordering: put steps in correct sequence
- two-tier: answer + reason; the reason options map to misconceptions
- math: symbolic equation solving
- code: write and run a snippet
- free-response: long-form prose; rubric-graded

For checks that reveal HOW a student is thinking (not just whether they got it),
prefer two-tier or single-choice with requireReasoning: true.
```

**Acceptance criteria**:
- [ ] Tutor's first quick_check call in a fresh teach session uses an item kind aligned with the pedagogical context (qualitative — track in manual smoke).
- [ ] Tutor doesn't reach for assignment.create when a quick_check would do.

---

### Unit 8: Documentation

**Files**:
- `docs/CONTRACT.md` — extend the `AssignmentItem` discriminated union spec with the new kinds, document the `requireReasoning` modifier, add `QuickCheckAnswer` types.
- `docs/SPEC.md` — describe the human-in-the-loop tool dispatch pattern; note the new `quick_check.*` tool family.
- `docs/UX.md` — visual treatment of each item kind, drag-and-drop matching/ordering accessibility fallback, inline QuickCheckCard.
- `docs/CURRICULUM.md` — pedagogical rationale: when to use single-choice vs two-tier vs short-answer; when quick_check vs assignment.create.
- `docs/ROADMAP.md` — entry already added in this PR.

The doc edits land alongside implementation, not before.

---

## Implementation Order

1. **Unit 1** — schema rename + extension (types only; existing graders break, fix them).
2. **Unit 2** — migration. Run on dev DB.
3. **Unit 3** — graders. Tests first; implementation second.
4. **Unit 5** — QuickCheckService + IPC plumbing. Independent of UI.
5. **Unit 6** — QuickCheckCard. Reuses item-body subcomponents from Unit 4 — so split: Unit 4 ships the per-kind body components first, Unit 6 wires them into both AssignmentItemCard and QuickCheckCard.
6. **Unit 4** — AssignmentItemCard renderers. (Or interleave with Unit 6 — they share the per-kind body components.)
7. **Unit 7** — teach mode prompt updates.
8. **Unit 8** — doc edits.

Practical split for parallel agents (post-design):
- Agent A: schema + migration + graders + service infrastructure (Units 1-3, 5).
- Agent B: UI item bodies + AssignmentItemCard + QuickCheckCard (Units 4, 6).
- Agent C: tools + prompt + doc edits (Units 7, 8, plus the `quick_check.*` tool definitions).

---

## Testing

- Unit tests for each grader, including degenerate inputs (empty selections, off-by-one orderings).
- A small DB integration test confirming migration rewrites `multiple-choice` → `single-choice` and idempotency.
- An IPC integration test confirming `quickCheckService.await` round-trips through the IPC bridge.
- A UI smoke for each new item body.
- Reasoning blending: cover `requireReasoning: true` + present work + correct selection produces a blended score; cover `requireReasoning: true` + missing work returns deterministic-only result.
- Two-tier misconception evidence: verify the misconception event lands when tier-2 is wrong with a non-null mapping.

---

## Verification Checklist

```
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate    # confirm migration is committed
pnpm db:reset       # full reset + re-migrate to confirm idempotency
```

Manual smoke:
1. Open a teach session.
2. Ask a question that warrants checking understanding ("does that make sense?").
3. Verify the tutor calls `quick_check.single_choice` and a card appears inline.
4. Answer; verify the tutor narrates the response in the same turn.
5. Author a full assignment with one item of each new kind via the configurator.
6. Take the assignment as a student; verify each item renders, accepts input, and grades correctly.
7. For a two-tier item, deliberately pick a wrong reason whose `misconceptionByReasonIndex` is non-null; submit; verify a misconception evidence event lands.

---

## Out of scope (future enhancements)

- Tier-3 item kinds: fill-in-blank, categorize, highlight-in-text, sketch-answer, hotspot.
- Confidence-rating modifier on assignment items (the standalone `quick_check.confidence` tool covers the formative case).
- Calibration / metacognitive scoring derived from confidence ratings.
- Non-bijective matching (one right-side answer pairs to multiple left-side items).
- Time-limited quick checks (timeout-based abandonment with per-tool defaults).
- Multi-turn item authoring assistance (model helping the configurator write good distractors).
