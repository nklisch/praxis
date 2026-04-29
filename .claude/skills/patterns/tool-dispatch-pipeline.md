# Pattern: Tool Dispatch Pipeline

A tool call routes: **model calls tool → adapter maps to (name, args, callId) → `registry.dispatch(name, args)` → Zod validation → `handler(parsed.data, ToolContext)` → `ToolResult`**. The same `registry.dispatch` path is used regardless of which engine adapter is running.

## Rationale

All engines use the same `InProcessToolRegistry` via the `ToolRegistry` interface. Adapters can't call handlers directly — they route through `dispatch()`. This keeps tool implementations engine-agnostic: `grade_math` doesn't know or care whether the model is running on Claude Code, Codex, or Direct.

## Examples

### Example 1: `InProcessToolRegistry.dispatch` — Zod validation + handler call
**File**: `packages/tools/src/registry.ts:52`
```typescript
async dispatch(name: string, args: unknown): Promise<ToolResult> {
  const tool = this.tools.get(name);
  if (!tool) {
    return { ok: false, error: { code: "tool.not_found", message: `Unknown tool: ${name}`, recoverable: false } };
  }
  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: { code: "tool.invalid_args", message: `...${parsed.error.message}`, recoverable: true } };
  }
  try {
    const value = await tool.handler(parsed.data, this.context);
    return { ok: true, value, tier: tool.tier };
  } catch (cause) {
    return { ok: false, error: { code: "tool.handler_threw", message: String(cause), recoverable: false } };
  }
}
```

### Example 2: `toVercelTools` — Direct adapter wraps dispatch in Vercel `tool({ execute })`
**File**: `packages/engines/src/direct/tool-conversion.ts:10`
```typescript
export function toVercelTools(registry: ToolRegistry): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const summary of registry.list()) {
    out[summary.name] = tool({
      description: summary.description,
      inputSchema: jsonSchema(summary.inputSchemaJson as object),
      execute: async (input: unknown) => {
        const result = await registry.dispatch(summary.name, input);
        if (result.ok) return result.value;
        throw Object.assign(new Error(result.error.message), { code: result.error.code });
      },
    });
  }
  return out;
}
```

### Example 3: MCP tool bridge — routes tool calls from Claude Code / Codex back to `dispatch`
**File**: `packages/engines/src/mcp/tool-bridge.ts`
```typescript
function buildSdkTool(summary: ToolDefinitionSummary, registry: ToolRegistry): CCToolDefinition {
  const inputSchema = resolveInputSchema(summary);  // Zod or JSON→Zod
  return tool(summary.name, summary.description, inputSchema,
    async (input: unknown) => {
      const result = await registry.dispatch(summary.name, input);  // same dispatch path
      if (result.ok) return { success: true, content: JSON.stringify(result.value) };
      return { success: false, error: result.error.message };
    });
}
```

### Example 4: `gradeMathTool.handler` — a concrete tool calling a service via `ToolContext`
**File**: `packages/tools/src/math/grade-math.ts`
```typescript
async handler(args, ctx: ToolContext) {
  const sympy = ctx.services.sympy;  // injected at registry construction time
  switch (args.kind) {
    case "check_solution":
      return buildCheckSolutionOutput(
        await sympy.checkSolution({ equation: args.equation, variable: args.variable, ... }),
      );
    // ...
  }
}
```

## When to Use

- **Defining a new tool**: implement `ToolDefinition<Input, Output>` with a Zod `input` schema and a `handler(args, ctx)` that uses `ctx.services.*` for external services
- **Adding a tool to a mode**: add its name to `mode.toolNames` and add the ToolDefinition to `deps.toolDefinitions` in `desktop/electron/main/services.ts`

## When NOT to Use

- Don't call `handler` directly in tests — go through `registry.dispatch(name, args)` to exercise validation
- Don't bypass `ToolRegistry` to call tools from adapters — all tool execution must route through the registry

## Common Violations

- Returning a raw throw from `handler` — the registry catches throws and wraps as `{ ok: false, error: { code: "tool.handler_threw" } }`; if the error needs a specific code, return `{ ok: false, error: {...} }` rather than throwing
- Registering tools not in `mode.toolNames` — `SessionServiceImpl` filters `toolDefinitions` by `mode.toolNames`; a tool not listed in the mode's toolNames won't be registered in the session's registry
