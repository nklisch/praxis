# Pattern: Mode-Based Tool Scoping

A `Mode`'s `toolNames: string[]` field declares which tools are available in that mode. `SessionServiceImpl` filters `ServiceDeps.toolDefinitions` by this list before constructing `InProcessToolRegistry`. If `toolNames === []`, all available tools are registered (backward compat).

## Rationale

Different modes have different capabilities: `exam` mode excludes `model-derived` grading tools; `study-skills` mode has workspace tools; `teach` mode has math/code verification. The mode defines the capability surface; the framework enforces it by limiting what the engine's tool registry exposes.

## Examples

### Example 1: `teach` mode declares its tools
**File**: `packages/curriculum/src/modes/teach.ts:9`
```typescript
export const teachMode: Mode = {
  id: "teach",
  toolNames: ["grade_math", "code_sandbox"],  // only these tools visible to the agent
  promptFragments: [preambleFragment, roleFragment, principlesFragment, toolsFragment, constraintsFragment, postambleFragment],
  // ...
};
```

### Example 2: `SessionServiceImpl.openActive` — filtering and registry construction
**File**: `packages/core/src/services/session-service.ts:247`
```typescript
const enabledNames = new Set(args.mode.toolNames);
const enabledTools =
  enabledNames.size === 0
    ? this.deps.toolDefinitions      // [] means "all available" — backward compat
    : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));

const tools = new InProcessToolRegistry({ tools: enabledTools, context: toolContext });
const handle = await engine.open({ systemPrompt, tools, ... });
```

### Example 3: Tool definitions registered in `buildServices`
**File**: `packages/desktop/electron/main/services.ts:31`
```typescript
const toolDefinitions = [gradeMathTool, codeSandboxTool];
// teachMode.toolNames = ["grade_math", "code_sandbox"]
// → both are registered when openActive runs for a teach session
// Future modes may have subsets of this list
```

## When to Use

- When adding a new tool: add the `ToolDefinition` to `deps.toolDefinitions` in `buildServices` AND add its name to every mode that should expose it
- When creating a new mode: list only the tools that are appropriate for that mode's use case

## When NOT to Use

- Don't rely on `toolNames === []` for new modes — explicitly list the tools even if the list is long; the empty-means-all behavior exists only for Phase 3 backward compat and may be removed

## Common Violations

- Registering a tool in `toolDefinitions` but not adding it to any `mode.toolNames` — the tool will never be available to any agent (filtered out for all modes with explicit lists)
- Adding a tool to a mode's prompt fragment description but not to `toolNames` — the agent will think the tool exists but it won't be callable; always keep `toolNames` and prompt descriptions in sync
