# Pattern: Discriminated-Union Dispatch

Discriminated unions use a `type` (events/streams) or `kind` (domain objects) field as a switch discriminator. TypeScript narrows the type inside each `case`, eliminating casts. Convention: `type` for streamed events; `kind` for stored/transmitted domain object variants.

## Rationale

Exhaustive switch on a discriminated union is TypeScript's primary mechanism for safe runtime dispatch over heterogeneous data. Adding a new variant to the union causes all non-exhaustive switches to fail compilation, catching missing handlers at the type level.

## Examples

### Example 1: `mapVercelPart` — streaming events use `type`
**File**: `packages/engines/src/direct/events.ts`
```typescript
switch (p.type) {  // EngineEvent.type field
  case "text-delta":  return { type: "model_message", content: String(p.delta), partial: true };
  case "text-end":    return { type: "model_message", content: state.textBuf, partial: false };
  case "tool-call":   return { type: "tool_call", toolName: String(p.toolName), ... };
  case "finish":      return { type: "final", usage: { ... } };
  default:            return null;  // non-projected events — lifecycle noise
}
```

### Example 2: `gradeMathTool.handler` — domain input uses `kind`
**File**: `packages/tools/src/math/grade-math.ts:160`
```typescript
switch (args.kind) {  // gradeMathInput.kind field (Zod discriminatedUnion)
  case "check_solution":   return buildCheckSolutionOutput(await sympy.checkSolution(...));
  case "solve_equation":   return buildSolveEquationOutput(await sympy.solveEquation(...));
  case "simplify":         return buildSimplifyOutput(await sympy.simplify(...));
  case "check_equivalent": return buildCheckEquivalentOutput(await sympy.checkEquivalent(...));
}
// TypeScript requires exhaustive coverage — omitting a case is a compile error
```

### Example 3: Zod discriminated union schema for tool input
**File**: `packages/tools/src/math/grade-math.ts:36`
```typescript
export const gradeMathInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("check_solution"), equation: z.string(), variable: z.string(), proposedValue: z.string(), isLatex: z.boolean().optional() }),
  z.object({ kind: z.literal("solve_equation"), equation: z.string(), variable: z.string(), isLatex: z.boolean().optional() }),
  z.object({ kind: z.literal("simplify"), expression: z.string(), isLatex: z.boolean().optional() }),
  z.object({ kind: z.literal("check_equivalent"), expression1: z.string(), expression2: z.string(), isLatex: z.boolean().optional() }),
]);
```

## When to Use

- **`type` field**: events flowing through an `AsyncIterable<EngineEvent>` or IPC stream — `EngineEvent`, `IpcStreamMessage`
- **`kind` field**: persisted/transmitted domain object variants — tool inputs, artifact source types, gate states, success criteria
- `z.discriminatedUnion("kind", [...])` for Zod tool inputs — the model sees the discriminator in the JSON schema and can pick the right variant

## When NOT to Use

- Don't use a discriminated union where a simpler overloaded function would do
- Don't mix `type` and `kind` within the same domain layer — pick one per domain boundary

## Common Violations

- Using string comparison instead of `switch`: `if (event.type === "model_message")` chains are harder to exhaust and TypeScript won't warn on missing cases
- Missing `as const` on literal discriminators in manual return objects: `kind: "check_solution" as const` is required when TypeScript can't infer the literal from context (e.g., inside a function body with a broad return type)
- Omitting the `default` case in event mappers — while tool handlers should be exhaustive, event mappers over SDK events (which may add new event types) should have a `default: return null` for forward compat
