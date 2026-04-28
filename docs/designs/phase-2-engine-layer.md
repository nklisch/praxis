# Design: Phase 2 — Engine Layer + Vertical-Slice Backend

## Overview

This phase wires the agent loop. After Phase 2, a Node script can run a full tutor turn end-to-end against any of three engines — Claude Code (primary), Codex, or Direct (Vercel AI SDK) — and the transcript persists to SQLite as immutable episodic events. Same input through any of the three adapters produces an equivalent normalized event stream (final text + tool-call sequence). A minimal `teach` mode and a tool-dispatch shell with two test tools (`echo`, `now`) exercise the registry path; real tools (math, code sandbox, retrieval) land in Phase 4.

**What ships:**

- `@praxis/tools`: `InProcessToolRegistry` (the concrete `ToolRegistry`) plus two test tools.
- `@praxis/curriculum`: a `teach` mode definition with prompt fragments, plus brief composition.
- `@praxis/core` additions: engine config (read/write through `config_kv`), `SessionRunner` (orchestrates a turn and persists episodic events).
- `@praxis/engines`: three adapters (`claude-code`, `codex`, `direct.<provider>`), an in-process MCP tool bridge (used by Claude Code + Codex adapters), an engine factory, and a JSON-Schema-to-Zod helper.
- `scripts/run-session.ts`: CLI entry point for the test checkpoint.
- `scripts/db-episodic.ts`: dumps recent episodic events.
- Conformance test suite + per-adapter mocked-SDK tests + integration test that exercises the full path end-to-end with a fake engine.

**What does not ship (later phases):**

- Real tools (math, code sandbox, retrieval) — Phase 4+.
- Mid-session indexers / projections — Phase 7.
- Multi-mode beyond `teach` — Phase 8.
- IPC transport / UI — Phase 3.

## Scope and assumptions

- **Engine roster:** all three adapters ship in this phase per the productization invariant (removing CLI adapters cannot break the hosted Direct path). Direct ships with four provider variants registered as distinct engine IDs: `direct.anthropic`, `direct.openai`, `direct.google`, `direct.ollama`. Only `direct.anthropic` is exercised by the Phase 2 test checkpoint script; the rest are smoke-tested only.
- **Codex tool dispatch via in-process MCP:** Codex SDK does not accept JS function tools — only MCP servers. We bridge the Praxis `ToolRegistry` through a stdio MCP server spawned via `@nklisch/claude-cli-sdk`'s `startToolServer` helper. The same handle is reusable by both Claude Code (which supports it natively) and Codex (passed via `CodexOptions.config.mcp_servers`).
- **Engine selection via `config_kv` + env override:** the Phase 1 `config_kv` table is the persistent store under key `"engine"`. Env vars (`PRAXIS_ENGINE`, `PRAXIS_API_KEY`, etc.) override at read time without writing. CLI flags on the test script override env. Defaults: `claude-code` engine, no API key (Claude Code uses CLI subscription).
- **Conformance bar:** "same normalized event shape" means the concatenated `model_message` text contains expected substrings, the ordered `tool_call` sequence (toolName, arg shape) matches, and a `final` event with usage is emitted. Streaming granularity (deltas vs whole items) is implementation detail and not asserted.
- **Engine `kind`:** Claude Code and Codex are `looped` (the SDK runs the loop internally and we project events). Direct is `single-shot` (we drive the loop via `streamText` + `stopWhen: stepCountIs(N)`).
- **`@nklisch/claude-cli-sdk` linkage:** referenced via pnpm `link:../../../claude-cli-sdk` from `packages/engines/`. This resolves to `/Users/nathanklisch/workspace/claude-cli-sdk` outside the elite-tutor repo per ROADMAP.
- **Contract addition (additive, minor bump):** `ToolDefinitionSummary` gains an optional `inputSchemaNative?: unknown` field. `InProcessToolRegistry` populates it with the original Zod schema; engine adapters can consume it when available, falling back to JSON-Schema-to-Zod conversion when not. This avoids forcing every `ToolRegistry` implementation to surface Zod, while letting Phase 2 adapters benefit from it.
- **Authentication boundary:** Claude Code adapter relies on a pre-authenticated `claude` CLI on the host. Codex adapter relies on either a logged-in `codex` CLI or `CODEX_API_KEY` env var. Direct adapter requires the corresponding provider env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) or, for Ollama, no key but a running local server.
- **Studentless dev session:** the test script uses a fixed `studentId = "default-student"` (UUID generated once and persisted to `config_kv` under `"default_student_id"`). Multi-student selection lands much later.

## Dependency direction (Phase 2 update)

```
@praxis/engines
  ├─ runtime: @nklisch/claude-cli-sdk, @openai/codex-sdk, ai, @ai-sdk/anthropic,
  │           @ai-sdk/openai, @ai-sdk/google, ollama-ai-provider-v2, zod
  └─ type-only: @praxis/core/types

@praxis/tools
  ├─ runtime: zod
  └─ type-only: @praxis/core/types

@praxis/curriculum (Phase 2 additions)
  └─ type-only: @praxis/core/types  (plus existing drizzle-orm for schema)

@praxis/core (Phase 2 additions)
  ├─ runtime: @praxis/artifacts, @praxis/memory, @praxis/curriculum (existing); zod, uuid
  └─ Note: still does NOT depend on @praxis/engines or @praxis/tools at runtime.
           SessionRunner accepts Engine and ToolRegistry as constructor parameters
           (dependency injection from the script / future host).

scripts/run-session.ts
  └─ runtime: @praxis/core, @praxis/curriculum, @praxis/engines, @praxis/tools
     (only the script wires across the boundary)
```

The `scripts/` layer is the single place where `@praxis/core`, `@praxis/engines`, `@praxis/tools`, and `@praxis/curriculum` come together. Inside packages, the rule from CLAUDE.md holds: domain packages and engines depend only on `@praxis/core/types`.

---

## Implementation Units

### Unit 1: Type contract additive update

**File**: `packages/core/src/types/engine.ts`

Modify `ToolDefinitionSummary` to add an optional native schema slot. Strictly additive — no existing field changes.

```typescript
export interface ToolDefinitionSummary {
  name: string;
  description: string;
  inputSchemaJson: unknown; // JSON Schema serialization (always present)
  /**
   * Optional native input schema in the implementation's preferred form.
   * For InProcessToolRegistry this is the original `z.ZodType<unknown>` instance.
   * Engine adapters that need typed schemas (Claude Code SDK MCP, etc.) consume
   * this when present and fall back to JSON-Schema-to-Zod conversion otherwise.
   */
  inputSchemaNative?: unknown;
  tier: "deterministic" | "grounded" | "model-derived";
}
```

**Implementation Notes**:
- This is the only contract change in Phase 2. Update `docs/CONTRACT.md` to reflect it.
- Existing `types.test-d.ts` should pass unchanged because the field is optional.

**Acceptance Criteria**:
- [ ] `ToolDefinitionSummary.inputSchemaNative` is an optional `unknown` field.
- [ ] No existing types/tests break.
- [ ] `docs/CONTRACT.md` `Tool definition format` section is updated to document the field.

---

### Unit 2: `@praxis/tools` — InProcessToolRegistry + test tools

**Files**:
- `packages/tools/package.json`
- `packages/tools/src/index.ts`
- `packages/tools/src/registry.ts`
- `packages/tools/src/test-tools/echo.ts`
- `packages/tools/src/test-tools/now.ts`
- `packages/tools/src/test-tools/index.ts`
- `packages/tools/src/__tests__/registry.test.ts`
- `packages/tools/src/__tests__/test-tools.test.ts`

**`packages/tools/package.json`**:

```json
{
  "name": "@praxis/tools",
  "version": "0.2.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./test-tools": "./src/test-tools/index.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@praxis/core": "workspace:*",
    "zod": "^4.0.0"
  }
}
```

**`packages/tools/src/index.ts`**:

```typescript
export { InProcessToolRegistry, type InProcessToolRegistryOptions } from "./registry.js";
export { jsonSchemaFromZod } from "./registry.js";
export const PACKAGE_NAME = "@praxis/tools" as const;
```

**`packages/tools/src/registry.ts`**:

```typescript
import { z } from "zod";
import type {
  ToolDefinition,
  ToolContext,
  ToolDefinitionSummary,
  ToolRegistry,
  ToolResult,
} from "@praxis/core/types";

export interface InProcessToolRegistryOptions {
  /** Tool definitions registered into this registry (Zod-schema-typed). */
  tools: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /** Per-session context passed to every tool handler. */
  context: ToolContext;
}

/**
 * Concrete in-process implementation of `ToolRegistry`. Holds the Zod-typed
 * `ToolDefinition` set behind the JSON-Schema-friendly `ToolRegistry` surface.
 * Engine adapters that need the original Zod schema may read it via
 * `summary.inputSchemaNative` (typed as `unknown` on the contract; checked via
 * `instanceof z.ZodType` at the call site).
 */
export class InProcessToolRegistry implements ToolRegistry {
  private readonly tools: Map<string, ToolDefinition<z.ZodType, z.ZodType>>;
  private readonly summaries: ToolDefinitionSummary[];
  private readonly context: ToolContext;

  constructor(opts: InProcessToolRegistryOptions) {
    this.context = opts.context;
    this.tools = new Map();
    this.summaries = [];
    for (const tool of opts.tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" registered twice`);
      }
      this.tools.set(tool.name, tool);
      this.summaries.push({
        name: tool.name,
        description: tool.description,
        inputSchemaJson: jsonSchemaFromZod(tool.input),
        inputSchemaNative: tool.input,
        tier: tool.tier,
      });
    }
  }

  list(): ToolDefinitionSummary[] {
    return this.summaries;
  }

  async dispatch(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: { code: "tool.not_found", message: `Unknown tool: ${name}`, recoverable: false },
      };
    }
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "tool.invalid_args",
          message: `Args failed validation for tool "${name}": ${parsed.error.message}`,
          recoverable: true,
        },
      };
    }
    try {
      const value = await tool.handler(parsed.data, this.context);
      return { ok: true, value, tier: tool.tier };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        error: { code: "tool.handler_threw", message, recoverable: false },
      };
    }
  }
}

/**
 * Convert a Zod schema to JSON Schema using Zod 4's built-in `z.toJSONSchema()`.
 * Centralized here so engine adapters can rely on a single conversion path.
 */
export function jsonSchemaFromZod(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { unrepresentable: "any" });
}
```

**`packages/tools/src/test-tools/echo.ts`**:

```typescript
import { z } from "zod";
import type { ToolDefinition } from "@praxis/core/types";

export const echoInput = z.object({
  text: z.string().describe("The text to echo back."),
});
export const echoOutput = z.object({
  echoed: z.string(),
});

export const echoTool: ToolDefinition<typeof echoInput, typeof echoOutput> = {
  name: "test.echo",
  description:
    "Returns the input text wrapped in `{echoed}`. Used for engine conformance testing only.",
  input: echoInput,
  output: echoOutput,
  tier: "deterministic",
  effects: ["none"],
  async handler({ text }) {
    return { echoed: text };
  },
};
```

**`packages/tools/src/test-tools/now.ts`**:

```typescript
import { z } from "zod";
import type { ToolDefinition } from "@praxis/core/types";

export const nowInput = z.object({}).describe("No arguments.");
export const nowOutput = z.object({
  iso: z.string(),
  epochMs: z.number(),
});

export const nowTool: ToolDefinition<typeof nowInput, typeof nowOutput> = {
  name: "test.now",
  description: "Returns the current server time in ISO 8601 and epoch ms.",
  input: nowInput,
  output: nowOutput,
  tier: "deterministic",
  effects: ["none"],
  async handler() {
    const epochMs = Date.now();
    return { iso: new Date(epochMs).toISOString(), epochMs };
  },
};
```

**`packages/tools/src/test-tools/index.ts`**:

```typescript
export { echoTool, echoInput, echoOutput } from "./echo.js";
export { nowTool, nowInput, nowOutput } from "./now.js";
```

**Implementation Notes**:
- Validation runs inside `dispatch` using the Zod schema. Result errors use the `tool.*` code namespace.
- `jsonSchemaFromZod` uses Zod 4's native `z.toJSONSchema` (no third-party converter dep). The `unrepresentable: "any"` option keeps unknown shapes valid rather than throwing.
- The registry is single-session: caller constructs one per session with the resolved `ToolContext`. The constructor throws on duplicate tool names — fail-fast per implementation principles.

**Acceptance Criteria**:
- [ ] `new InProcessToolRegistry({ tools: [echoTool, nowTool], context })` succeeds.
- [ ] `registry.list()` returns 2 summaries with `inputSchemaJson` and `inputSchemaNative` populated.
- [ ] `registry.dispatch("test.echo", { text: "hi" })` returns `{ ok: true, value: { echoed: "hi" }, tier: "deterministic" }`.
- [ ] `registry.dispatch("test.echo", { wrong: 1 })` returns `{ ok: false, error: { code: "tool.invalid_args", recoverable: true, ... } }`.
- [ ] `registry.dispatch("missing", {})` returns `{ ok: false, error: { code: "tool.not_found", ... } }`.
- [ ] Constructing with two tools sharing a name throws synchronously.

---

### Unit 3: `@praxis/curriculum` — `teach` mode + brief composition

**Files**:
- `packages/curriculum/package.json` (update — add `@praxis/core` dep)
- `packages/curriculum/src/index.ts` (update exports)
- `packages/curriculum/src/modes/index.ts`
- `packages/curriculum/src/modes/teach.ts`
- `packages/curriculum/src/modes/fragments/preamble.ts`
- `packages/curriculum/src/modes/fragments/role.ts`
- `packages/curriculum/src/modes/fragments/principles.ts`
- `packages/curriculum/src/modes/fragments/constraints.ts`
- `packages/curriculum/src/modes/fragments/postamble.ts`
- `packages/curriculum/src/brief/compose.ts`
- `packages/curriculum/src/__tests__/teach-mode.test.ts`
- `packages/curriculum/src/__tests__/compose.test.ts`

**`packages/curriculum/package.json`** (relevant additions):

```json
{
  "name": "@praxis/curriculum",
  "version": "0.2.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./modes": "./src/modes/index.ts",
    "./brief": "./src/brief/compose.ts"
  },
  "dependencies": {
    "@praxis/core": "workspace:*",
    "drizzle-orm": "^0.36.0"
  }
}
```

**`packages/curriculum/src/modes/fragments/principles.ts`** (the non-customizable verification principle):

```typescript
import type { PromptFragment } from "@praxis/core/types";

/**
 * The graded grounding hierarchy. NOT customizable — defending the verification
 * principle is non-negotiable. Customization comes through other fragments.
 */
export const principlesFragment: PromptFragment = {
  id: "principles.graded-grounding",
  position: "principles",
  customizable: false,
  template: `Source authority, in this order:
1. The student's own course material (when retrieved via tools).
2. Deterministic computation (math via sympy, code via sandbox).
3. Cited external search (when retrieval tools are available).
4. Curated pedagogy research (when pedagogy-pack tools are available).
5. Your model knowledge (always declared as such).

When you lean on (5) where (1)–(4) could plausibly apply but aren't available, say so explicitly.`,
};
```

**`packages/curriculum/src/modes/fragments/preamble.ts`**:

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const preambleFragment: PromptFragment = {
  id: "preamble.default",
  position: "preamble",
  customizable: true,
  template: `You are an AI tutor running inside Praxis. Your job is to produce learning, not to maximize the student's comfort. Withhold answers until effort is established. Scaffold rather than solve.`,
};
```

**`packages/curriculum/src/modes/fragments/role.ts`**:

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const roleFragment: PromptFragment = {
  id: "role.tutor",
  position: "role",
  customizable: true,
  template: `You are a patient, curious tutor. You are willing to be wrong, willing to wait, and willing to ask the student to try first.`,
};
```

**`packages/curriculum/src/modes/fragments/constraints.ts`**:

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const constraintsFragment: PromptFragment = {
  id: "constraints.productive-struggle",
  position: "constraints",
  customizable: true,
  template: `Productive struggle is teaching's tool. When the student says "just tell me," respond with a scaffold or a smaller question. Do not bypass effort.`,
};
```

**`packages/curriculum/src/modes/fragments/postamble.ts`**:

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const postambleFragment: PromptFragment = {
  id: "postamble.tools",
  position: "postamble",
  customizable: false,
  template: `When tools are available, prefer them over your own knowledge for any claim a tool can verify. Tool calls are visible to the student; use them transparently.`,
};
```

**`packages/curriculum/src/modes/teach.ts`**:

```typescript
import type { Mode } from "@praxis/core/types";
import { preambleFragment } from "./fragments/preamble.js";
import { roleFragment } from "./fragments/role.js";
import { principlesFragment } from "./fragments/principles.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { postambleFragment } from "./fragments/postamble.js";

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [], // Phase 2: no real tools registered to teach mode yet.
  uiSurface: "chat",
};
```

**`packages/curriculum/src/modes/index.ts`**:

```typescript
import type { Mode } from "@praxis/core/types";
import { teachMode } from "./teach.js";

const MODE_REGISTRY: ReadonlyMap<string, Mode> = new Map([[teachMode.id, teachMode]]);

export function getMode(id: string): Mode | undefined {
  return MODE_REGISTRY.get(id);
}

export function requireMode(id: string): Mode {
  const mode = MODE_REGISTRY.get(id);
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}

export function listModes(): readonly Mode[] {
  return [...MODE_REGISTRY.values()];
}

export { teachMode } from "./teach.js";
```

**`packages/curriculum/src/brief/compose.ts`**:

```typescript
import type { Brief, BriefContext, GenerationParams, Mode, PromptFragment } from "@praxis/core/types";

export interface ComposeBriefInput {
  mode: Mode;
  userMessage: string;
  context?: Partial<BriefContext>;
  /** Map of fragment ID → override text (from configure-mode customization). */
  overrides?: ReadonlyMap<string, string>;
  generation?: GenerationParams;
  maxSteps?: number;
}

const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble",
  "role",
  "principles",
  "tools",
  "context",
  "constraints",
  "postamble",
];

/**
 * Assemble a Brief by ordering and joining the mode's prompt fragments,
 * applying customization overrides where allowed. Throws if an override
 * targets a non-customizable fragment.
 */
export function composeBrief(input: ComposeBriefInput): Brief {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue; // Tolerate stale overrides (the fragment might have been removed).
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const sortedByPosition = [...input.mode.promptFragments].sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  const sections = sortedByPosition.map((f) => overrides.get(f.id) ?? f.template);
  return {
    systemPrompt: sections.join("\n\n"),
    userMessage: input.userMessage,
    context: {
      retrievedChunks: input.context?.retrievedChunks ?? [],
      studentSummary: input.context?.studentSummary,
      artifactRefs: input.context?.artifactRefs ?? [],
    },
    maxSteps: input.maxSteps,
    generation: input.generation,
  };
}
```

**Implementation Notes**:
- The fragment registry pattern is the foundation for prompt customization (Phase 11). `customizable: false` is enforced at compose time.
- `FRAGMENT_ORDER` is a single source of truth for fragment ordering. Modes don't need to declare order explicitly.
- `composeBrief` is a pure function — no I/O, no globals. All inputs explicit. Easy to test.

**Acceptance Criteria**:
- [ ] `getMode("teach")` returns the teach mode.
- [ ] `getMode("nonexistent")` returns undefined; `requireMode("nonexistent")` throws.
- [ ] `composeBrief({ mode: teachMode, userMessage: "hi" })` returns a Brief whose `systemPrompt` contains the preamble, role, principles, constraints, and postamble templates joined in order.
- [ ] Overriding a customizable fragment substitutes the template; overriding `principles.graded-grounding` throws.
- [ ] `composeBrief` returned `Brief.context` has empty arrays for `retrievedChunks` and `artifactRefs` when no context is provided.

---

### Unit 4: `@praxis/core` — engine config

**Files**:
- `packages/core/src/config/engine-config.ts`
- `packages/core/src/config/schema.ts`
- `packages/core/src/config/index.ts`
- `packages/core/package.json` (export `./config`)
- `packages/core/src/__tests__/engine-config.test.ts`

**`packages/core/src/config/schema.ts`**:

```typescript
import { z } from "zod";

export const ENGINE_IDS = [
  "claude-code",
  "codex",
  "direct.anthropic",
  "direct.openai",
  "direct.google",
  "direct.ollama",
] as const;

export const EngineIdSchema = z.enum(ENGINE_IDS);
export type EngineId = z.infer<typeof EngineIdSchema>;

export const EngineConfigSchema = z.object({
  engineId: EngineIdSchema,
  /** Model identifier. Optional — adapters apply sensible defaults. */
  model: z.string().optional(),
  /** Provider API key. Read from env first; this is a fallback / explicit value. */
  apiKey: z.string().optional(),
  /** Override the provider base URL (Codex baseUrl, Ollama host, etc.). */
  baseUrl: z.string().url().optional(),
  /** Reasoning effort hint (Claude Code, Codex). */
  effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { engineId: "claude-code" };
```

**`packages/core/src/config/engine-config.ts`**:

```typescript
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";
import {
  DEFAULT_ENGINE_CONFIG,
  EngineConfigSchema,
  EngineIdSchema,
  type EngineConfig,
  type EngineId,
} from "./schema.js";

const CONFIG_KEY = "engine";

/**
 * Read the resolved engine config: stored value (if any) merged with defaults,
 * then environment overrides applied. Validation throws on malformed stored data.
 *
 * Environment overrides:
 * - PRAXIS_ENGINE → engineId
 * - PRAXIS_MODEL → model
 * - PRAXIS_API_KEY → apiKey  (also: provider-specific keys are read by adapters)
 * - PRAXIS_BASE_URL → baseUrl
 * - PRAXIS_EFFORT → effort
 */
export function readEngineConfig(db: PraxisDb): EngineConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<EngineConfig> | undefined;
  const merged: EngineConfig = EngineConfigSchema.parse({
    ...DEFAULT_ENGINE_CONFIG,
    ...stored,
  });
  return applyEnvOverrides(merged);
}

export function writeEngineConfig(db: PraxisDb, config: EngineConfig): void {
  const validated = EngineConfigSchema.parse(config);
  db.insert(configKv)
    .values({
      key: CONFIG_KEY,
      valueJson: validated,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
    })
    .run();
}

function applyEnvOverrides(base: EngineConfig): EngineConfig {
  const env = process.env;
  const candidate: EngineConfig = { ...base };
  if (env.PRAXIS_ENGINE) candidate.engineId = EngineIdSchema.parse(env.PRAXIS_ENGINE);
  if (env.PRAXIS_MODEL) candidate.model = env.PRAXIS_MODEL;
  if (env.PRAXIS_API_KEY) candidate.apiKey = env.PRAXIS_API_KEY;
  if (env.PRAXIS_BASE_URL) candidate.baseUrl = env.PRAXIS_BASE_URL;
  if (env.PRAXIS_EFFORT) {
    candidate.effort = EngineConfigSchema.shape.effort.unwrap().parse(env.PRAXIS_EFFORT);
  }
  return candidate;
}

/** Provider-specific env key for a given engine. */
export function providerApiKeyEnvName(engineId: EngineId): string | undefined {
  switch (engineId) {
    case "direct.anthropic":
      return "ANTHROPIC_API_KEY";
    case "direct.openai":
      return "OPENAI_API_KEY";
    case "direct.google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "codex":
      return "CODEX_API_KEY";
    case "claude-code":
    case "direct.ollama":
      return undefined;
  }
}
```

**`packages/core/src/config/index.ts`**:

```typescript
export {
  readEngineConfig,
  writeEngineConfig,
  providerApiKeyEnvName,
} from "./engine-config.js";
export {
  EngineConfigSchema,
  EngineIdSchema,
  ENGINE_IDS,
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
  type EngineId,
} from "./schema.js";
```

**`packages/core/package.json` exports update**:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./db": "./src/db/index.ts",
    "./db/show": "./src/db/show.ts",
    "./db/migrate": "./src/db/migrate.ts",
    "./schema": "./src/schema.ts",
    "./config": "./src/config/index.ts",
    "./session": "./src/session/index.ts"
  }
}
```

**Implementation Notes**:
- `configKv.valueJson` is typed as `text(..., { mode: "json" })` — Drizzle handles serialization. Read returns `unknown`, parsed via Zod.
- Env overrides are read at *every* `readEngineConfig` call — no caching. Test scripts can change env between runs without restart.
- `providerApiKeyEnvName` is a single source of truth for which env var holds the API key for each engine; the run-session script and Direct adapter both consume it.

**Acceptance Criteria**:
- [ ] First call to `readEngineConfig(db)` on an empty DB returns `{ engineId: "claude-code" }`.
- [ ] After `writeEngineConfig(db, { engineId: "direct.anthropic", model: "claude-sonnet-4-5" })`, a subsequent read returns those values.
- [ ] Setting `PRAXIS_ENGINE=codex` causes `readEngineConfig` to return `engineId: "codex"` regardless of stored value.
- [ ] Setting `PRAXIS_ENGINE=garbage` causes `readEngineConfig` to throw a Zod validation error.
- [ ] `providerApiKeyEnvName("direct.anthropic")` returns `"ANTHROPIC_API_KEY"`; `providerApiKeyEnvName("claude-code")` returns `undefined`.

---

### Unit 5: `@praxis/core` — SessionRunner + episodic persistence

**Files**:
- `packages/core/src/session/runner.ts`
- `packages/core/src/session/episodic.ts`
- `packages/core/src/session/index.ts`
- `packages/core/src/__tests__/session-runner.test.ts`
- `packages/core/src/__tests__/episodic.test.ts`

**`packages/core/src/session/episodic.ts`**:

```typescript
import { v7 as uuidv7 } from "uuid";
import type { EngineEvent } from "../types/engine.js";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import type { PraxisDb } from "../db/index.js";

export interface AppendEpisodicInput {
  db: PraxisDb;
  sessionId: string;
  studentId: string;
  engineId: string;
  modeId: string;
  turnIndex: number;
  event: EngineEvent;
  ts?: Date;
}

/** Append a single episodic event. Returns the generated event ID. */
export function appendEpisodic(input: AppendEpisodicInput): string {
  const id = uuidv7();
  input.db
    .insert(episodicEvents)
    .values({
      id,
      sessionId: input.sessionId,
      studentId: input.studentId,
      ts: input.ts ?? new Date(),
      engineId: input.engineId,
      modeId: input.modeId,
      turnIndex: input.turnIndex,
      eventJson: input.event,
    })
    .run();
  return id;
}

export interface CreateSessionInput {
  db: PraxisDb;
  studentId: string;
  modeId: string;
  engineId: string;
  courseId?: string;
}

/** Insert a new session row. Returns the generated session ID. */
export function createSession(input: CreateSessionInput): string {
  const id = uuidv7();
  input.db
    .insert(sessions)
    .values({
      id,
      studentId: input.studentId,
      modeId: input.modeId,
      engineId: input.engineId,
      courseId: input.courseId,
      startedAt: new Date(),
    })
    .run();
  return id;
}

export function endSession(db: PraxisDb, sessionId: string): void {
  db.update(sessions).set({ endedAt: new Date() }).where(/* sessions.id eq sessionId */).run();
  // Note: actual `eq(sessions.id, sessionId)` import done in implementation; pseudo here for brevity.
}
```

**`packages/core/src/session/runner.ts`**:

```typescript
import type {
  Brief,
  Engine,
  EngineEvent,
  Mode,
  ToolRegistry,
} from "../types/index.js";
import type { PraxisDb } from "../db/index.js";
import { appendEpisodic, createSession, endSession } from "./episodic.js";

export interface SessionRunnerOptions {
  db: PraxisDb;
  studentId: string;
  mode: Mode;
  engine: Engine;
  tools: ToolRegistry;
  courseId?: string;
}

export interface RunTurnOptions {
  brief: Brief;
  /** Existing session ID; if omitted a new session is created. */
  sessionId?: string;
  turnIndex?: number;
}

export interface RunTurnResult {
  sessionId: string;
  turnIndex: number;
  events: EngineEvent[];
  finalEvent?: Extract<EngineEvent, { type: "final" }>;
  error?: Extract<EngineEvent, { type: "error" }>;
}

/**
 * Orchestrates one turn end-to-end: creates (or reuses) a session, runs the
 * engine against the brief, intercepts every event, persists each as an
 * immutable episodic row, and yields the same events to the caller for UI use.
 *
 * Persistence is fire-and-forget per event (synchronous SQLite write). On a
 * write failure we emit an `error` event to the consumer but continue draining
 * the engine — losing the transcript is bad, but losing the rest of the answer
 * is worse.
 */
export class SessionRunner {
  constructor(private readonly opts: SessionRunnerOptions) {}

  /** Run a single turn. Yields events as they arrive; resolves to a RunTurnResult. */
  async *runTurn(input: RunTurnOptions): AsyncGenerator<EngineEvent, RunTurnResult> {
    const sessionId =
      input.sessionId ??
      createSession({
        db: this.opts.db,
        studentId: this.opts.studentId,
        modeId: this.opts.mode.id,
        engineId: this.opts.engine.id,
        courseId: this.opts.courseId,
      });
    const turnIndex = input.turnIndex ?? 0;
    const events: EngineEvent[] = [];
    let finalEvent: Extract<EngineEvent, { type: "final" }> | undefined;
    let errorEvent: Extract<EngineEvent, { type: "error" }> | undefined;

    for await (const event of this.opts.engine.run(input.brief, this.opts.tools)) {
      events.push(event);
      try {
        appendEpisodic({
          db: this.opts.db,
          sessionId,
          studentId: this.opts.studentId,
          engineId: this.opts.engine.id,
          modeId: this.opts.mode.id,
          turnIndex,
          event,
        });
      } catch (cause) {
        const writeError: EngineEvent = {
          type: "error",
          error: {
            code: "episodic.write_failed",
            message: cause instanceof Error ? cause.message : String(cause),
            recoverable: false,
            cause,
          },
        };
        yield writeError;
        // Do NOT persist the write-failure event itself (would loop). Keep draining.
      }
      if (event.type === "final") finalEvent = event;
      if (event.type === "error") errorEvent = event;
      yield event;
    }
    if (this.opts.mode.onTurnEnd) {
      await this.opts.mode.onTurnEnd(events, { brief: input.brief });
    }
    return { sessionId, turnIndex, events, finalEvent, error: errorEvent };
  }

  /** Mark a session ended. Idempotent. */
  endSession(sessionId: string): void {
    endSession(this.opts.db, sessionId);
  }
}
```

**`packages/core/src/session/index.ts`**:

```typescript
export { SessionRunner, type SessionRunnerOptions, type RunTurnOptions, type RunTurnResult } from "./runner.js";
export { appendEpisodic, createSession, endSession } from "./episodic.js";
```

**Implementation Notes**:
- `SessionRunner` accepts `Engine` and `ToolRegistry` as constructor params — pure DI. No import of `@praxis/engines` or `@praxis/tools`. The script wires concrete instances together.
- `runTurn` is an async generator: yields events to the caller, and the return value carries the summary. This lets the script `for await` to print streaming output and still get a `RunTurnResult`.
- Episodic write failure is non-fatal — yield an error event but keep draining. Losing transcript fidelity is bad; losing the rest of the assistant's response is worse.
- `mode.onTurnEnd` hook is invoked once after the engine drains, with the full event list. Phase 2 has no implementation; placeholder for Phase 8+.

**Acceptance Criteria**:
- [ ] `runTurn` against a fake engine that emits 3 events writes 3 rows to `episodic_events` with correct `session_id`, `engine_id`, `mode_id`, `turn_index`, `event_json`.
- [ ] `runTurn` returns a `RunTurnResult` with `events.length === 3`, `finalEvent` set (when present), and `sessionId` matching the inserted session row.
- [ ] When `appendEpisodic` throws (simulated by a closed DB), the runner emits an additional `error` event and keeps draining the engine.
- [ ] Reusing `sessionId` across two `runTurn` calls writes both turns under the same `session_id`.
- [ ] `endSession` sets `ended_at` on the session row.

---

### Unit 6: `@praxis/engines` — package shell, factory, types

**Files**:
- `packages/engines/package.json`
- `packages/engines/src/index.ts`
- `packages/engines/src/factory.ts`
- `packages/engines/src/types.ts`
- `packages/engines/src/util/json-schema-to-zod.ts`
- `packages/engines/src/util/event-id.ts`
- `packages/engines/src/__tests__/factory.test.ts`
- `packages/engines/src/__tests__/json-schema-to-zod.test.ts`

**`packages/engines/package.json`**:

```json
{
  "name": "@praxis/engines",
  "version": "0.2.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./claude-code": "./src/claude-code/index.ts",
    "./codex": "./src/codex/index.ts",
    "./direct": "./src/direct/index.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@praxis/core": "workspace:*",
    "@nklisch/claude-cli-sdk": "link:../../../claude-cli-sdk",
    "@openai/codex-sdk": "^0.125.0",
    "ai": "^6.0.168",
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/openai": "^3.0.53",
    "@ai-sdk/google": "^3.0.64",
    "ollama-ai-provider-v2": "^1.0.0",
    "uuid": "^10.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/uuid": "^10.0.0"
  }
}
```

**`packages/engines/src/index.ts`**:

```typescript
export { createEngine, type CreateEngineInput } from "./factory.js";
export { ClaudeCodeEngine } from "./claude-code/adapter.js";
export { CodexEngine } from "./codex/adapter.js";
export { DirectEngine, type DirectProvider } from "./direct/adapter.js";
export const PACKAGE_NAME = "@praxis/engines" as const;
```

**`packages/engines/src/types.ts`**:

```typescript
import type { Logger } from "@praxis/core/types";

export interface EngineDeps {
  log: Logger;
}
```

**`packages/engines/src/factory.ts`**:

```typescript
import type { Engine } from "@praxis/core/types";
import type { EngineConfig, EngineId } from "@praxis/core/config";
import { ClaudeCodeEngine } from "./claude-code/adapter.js";
import { CodexEngine } from "./codex/adapter.js";
import { DirectEngine } from "./direct/adapter.js";
import type { EngineDeps } from "./types.js";

export interface CreateEngineInput {
  config: EngineConfig;
  deps: EngineDeps;
}

/**
 * Build an Engine instance for the given config. Synchronous: returns the
 * adapter; the adapter performs side-effecting setup (subprocess spawn,
 * MCP server start) lazily inside `run()` so construction is cheap and
 * health() can probe without committing resources.
 */
export function createEngine({ config, deps }: CreateEngineInput): Engine {
  const id: EngineId = config.engineId;
  switch (id) {
    case "claude-code":
      return new ClaudeCodeEngine({ config, deps });
    case "codex":
      return new CodexEngine({ config, deps });
    case "direct.anthropic":
      return new DirectEngine({ config, deps, provider: "anthropic" });
    case "direct.openai":
      return new DirectEngine({ config, deps, provider: "openai" });
    case "direct.google":
      return new DirectEngine({ config, deps, provider: "google" });
    case "direct.ollama":
      return new DirectEngine({ config, deps, provider: "ollama" });
  }
}
```

**`packages/engines/src/util/json-schema-to-zod.ts`** (a small, intentionally-narrow converter for the schemas Phase 2 actually generates from Zod via `z.toJSONSchema`):

```typescript
import { z } from "zod";

/**
 * Convert a JSON Schema produced by Zod 4's `z.toJSONSchema()` back into a
 * Zod schema. Narrow scope — handles object/string/number/integer/boolean/
 * array, optionals (via property absence in `required`), and `null`. Anything
 * unrecognized falls back to `z.unknown()`. This is sufficient for our test
 * tools and for any tool authored with the conventional Zod 4 JSON Schema
 * output. NOT a general-purpose converter.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType<unknown> {
  if (!schema || typeof schema !== "object") return z.unknown();
  const s = schema as Record<string, unknown>;
  const type = s.type;
  if (type === "object") {
    const props = (s.properties as Record<string, unknown> | undefined) ?? {};
    const required = new Set((s.required as string[] | undefined) ?? []);
    const shape: Record<string, z.ZodType<unknown>> = {};
    for (const [key, value] of Object.entries(props)) {
      const inner = jsonSchemaToZod(value);
      shape[key] = required.has(key) ? inner : inner.optional();
    }
    return z.object(shape);
  }
  if (type === "array") return z.array(jsonSchemaToZod(s.items));
  if (type === "string") return z.string();
  if (type === "number") return z.number();
  if (type === "integer") return z.number().int();
  if (type === "boolean") return z.boolean();
  if (type === "null") return z.null();
  return z.unknown();
}
```

**`packages/engines/src/util/event-id.ts`**:

```typescript
import { v7 as uuidv7 } from "uuid";

/** Generate a stable callId for tool_call/tool_result pairing when the SDK doesn't provide one. */
export function newCallId(): string {
  return uuidv7();
}
```

**Implementation Notes**:
- `createEngine` exhaustiveness is checked by TypeScript: removing a case fails compilation because the switch doesn't cover the union.
- `jsonSchemaToZod` lives in engines (not tools or core) because it exists solely to re-shape contract data into a form a particular SDK demands. The tools package round-trips Zod → JSON Schema; engines round-trip JSON Schema → Zod when needed.

**Acceptance Criteria**:
- [ ] `createEngine({ config: { engineId: "claude-code" }, deps })` returns a `ClaudeCodeEngine` with `id === "claude-code"`.
- [ ] `createEngine` for each `EngineId` returns an `Engine` whose `id` matches.
- [ ] `jsonSchemaToZod(z.toJSONSchema(z.object({ text: z.string() })))` produces a schema that parses `{ text: "x" }` and rejects `{ text: 1 }`.

---

### Unit 7: MCP tool bridge

**Files**:
- `packages/engines/src/mcp/tool-bridge.ts`
- `packages/engines/src/mcp/types.ts`
- `packages/engines/src/__tests__/tool-bridge.test.ts`

**`packages/engines/src/mcp/types.ts`**:

```typescript
import type { ToolRegistry } from "@praxis/core/types";

export interface ToolBridgeHandle {
  /** MCP server stdio command. */
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Server name that will appear as `mcp__<serverName>__<toolName>` to the model. */
  serverName: string;
  /** Tool names exposed (without the `mcp__<server>__` prefix). */
  toolNames: string[];
  /** Stop the server. Idempotent. */
  close(): Promise<void>;
}

export interface StartToolBridgeInput {
  registry: ToolRegistry;
  /** Logical server name, used in MCP routing. Default: "praxis". */
  serverName?: string;
}
```

**`packages/engines/src/mcp/tool-bridge.ts`**:

```typescript
import { z } from "zod";
import { startToolServer, tool, type ToolDefinition as CCToolDefinition } from "@nklisch/claude-cli-sdk";
import type { ToolDefinitionSummary, ToolRegistry } from "@praxis/core/types";
import { jsonSchemaToZod } from "../util/json-schema-to-zod.js";
import type { StartToolBridgeInput, ToolBridgeHandle } from "./types.js";

/**
 * Spawn an in-process stdio MCP server that exposes every tool in `registry`.
 * Used by the Claude Code adapter and the Codex adapter — both pass the
 * resulting `{ command, args, env }` to their SDK as an MCP server config.
 *
 * Implementation note: we reuse the Claude Code SDK's `startToolServer` helper
 * (which itself wraps @modelcontextprotocol/sdk) so we don't maintain a second
 * MCP server implementation. Tool dispatch routes back through the Praxis
 * `ToolRegistry.dispatch` — single source of truth.
 */
export async function startToolBridge(input: StartToolBridgeInput): Promise<ToolBridgeHandle> {
  const serverName = input.serverName ?? "praxis";
  const summaries = input.registry.list();
  const sdkTools: CCToolDefinition[] = summaries.map((summary) =>
    buildSdkTool(summary, input.registry),
  );

  const handle = await startToolServer(sdkTools);
  return {
    command: handle.command,
    args: handle.args,
    env: handle.env,
    serverName,
    toolNames: summaries.map((s) => s.name),
    close: () => handle.close(),
  };
}

function buildSdkTool(
  summary: ToolDefinitionSummary,
  registry: ToolRegistry,
): CCToolDefinition {
  const inputSchema = resolveInputSchema(summary);
  return tool(
    summary.name,
    summary.description,
    inputSchema,
    async (input: unknown) => {
      const result = await registry.dispatch(summary.name, input);
      if (result.ok) {
        return { success: true, content: JSON.stringify(result.value) };
      }
      return { success: false, error: result.error.message };
    },
  );
}

function resolveInputSchema(summary: ToolDefinitionSummary): z.ZodType<unknown> {
  if (summary.inputSchemaNative instanceof z.ZodType) {
    return summary.inputSchemaNative;
  }
  return jsonSchemaToZod(summary.inputSchemaJson);
}
```

**Implementation Notes**:
- We prefer the original Zod schema (`summary.inputSchemaNative`) when available — it preserves descriptions, refinements, and defaults. We fall back to `jsonSchemaToZod` for registries (potentially future) that don't surface a native Zod schema.
- `startToolServer` from `@nklisch/claude-cli-sdk` returns `{ command, args, env, tempDir, close }`. Our `ToolBridgeHandle` re-exposes the subset needed for MCP server config + adds a `serverName` for routing.
- Both Claude Code and Codex see tools as `mcp__<serverName>__<toolName>`. Conformance assertions on tool-call sequences must account for the prefix on those engines (we strip it in the event mapper, so events emit the bare `toolName`).

**Acceptance Criteria**:
- [ ] `startToolBridge({ registry })` returns a handle with non-empty `command`, `args`, `env`, and `toolNames` matching `registry.list().map(s => s.name)`.
- [ ] `handle.close()` is idempotent and exits cleanly.
- [ ] When the bridge handler is invoked by an MCP client, dispatch routes through `registry.dispatch` (asserted via spy in the test that wraps a registry with mocked `dispatch`).

---

### Unit 8: Direct adapter (Vercel AI SDK)

**Files**:
- `packages/engines/src/direct/adapter.ts`
- `packages/engines/src/direct/providers.ts`
- `packages/engines/src/direct/events.ts`
- `packages/engines/src/direct/tool-conversion.ts`
- `packages/engines/src/direct/index.ts`
- `packages/engines/src/__tests__/direct.test.ts`

**`packages/engines/src/direct/providers.ts`**:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";
import type { EngineConfig } from "@praxis/core/config";

export type DirectProvider = "anthropic" | "openai" | "google" | "ollama";

const DEFAULT_MODELS: Record<DirectProvider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-5",
  google: "gemini-2.5-flash",
  ollama: "llama3.2",
};

/**
 * Resolve the LanguageModel for a Direct provider. API keys are NOT passed
 * via SDK constructor — each provider's SDK reads its own env var (or the
 * default for the provider). The Praxis script is responsible for setting
 * the env before invoking createEngine. For Ollama, baseUrl picks the host.
 */
export function resolveModel(provider: DirectProvider, config: EngineConfig): LanguageModel {
  const modelId = config.model ?? DEFAULT_MODELS[provider];
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
    case "ollama": {
      const ollama = createOllama({ baseURL: config.baseUrl });
      return ollama(modelId);
    }
  }
}
```

**`packages/engines/src/direct/tool-conversion.ts`**:

```typescript
import { jsonSchema, tool, type Tool } from "ai";
import type { ToolRegistry } from "@praxis/core/types";

/**
 * Convert the Praxis ToolRegistry into a record suitable for `streamText({ tools })`.
 * Each Vercel `tool` wraps a call to `registry.dispatch`. The Vercel SDK runs the
 * `execute` function automatically inside its agentic loop and feeds the result back
 * to the model.
 */
export function toVercelTools(registry: ToolRegistry): Record<string, Tool> {
  const summaries = registry.list();
  const out: Record<string, Tool> = {};
  for (const summary of summaries) {
    out[summary.name] = tool({
      description: summary.description,
      inputSchema: jsonSchema(summary.inputSchemaJson as object),
      execute: async (input: unknown) => {
        const result = await registry.dispatch(summary.name, input);
        if (result.ok) return result.value;
        // Throw so Vercel SDK emits a tool-error event we can map.
        const err = new Error(result.error.message);
        (err as Error & { code?: string }).code = result.error.code;
        throw err;
      },
    });
  }
  return out;
}
```

**`packages/engines/src/direct/events.ts`**:

```typescript
import type { EngineEvent, ToolResult } from "@praxis/core/types";

/**
 * Map a Vercel AI SDK `fullStream` part into the normalized EngineEvent.
 * Returns null for parts that don't translate (start, start-step, etc.).
 *
 * Per the conformance bar, deltas are emitted as `model_message` with
 * `partial: true`. The completing `text-end` is emitted as `partial: false`
 * with the full accumulated text so consumers wanting the final string don't
 * need to reassemble.
 */
export function mapVercelPart(
  part: unknown,
  state: { textBuf: string },
): EngineEvent | null {
  // Defensive: the SDK's part shape is a discriminated union. We narrow by `type`.
  if (!part || typeof part !== "object" || !("type" in part)) return null;
  const p = part as Record<string, unknown> & { type: string };
  switch (p.type) {
    case "text-delta": {
      const delta = String(p.delta ?? "");
      state.textBuf += delta;
      return { type: "model_message", content: delta, partial: true };
    }
    case "text-end": {
      const full = state.textBuf;
      state.textBuf = "";
      return { type: "model_message", content: full, partial: false };
    }
    case "reasoning-delta":
      return { type: "thinking", content: String(p.delta ?? "") };
    case "tool-call":
      return {
        type: "tool_call",
        toolName: String(p.toolName),
        args: p.input,
        callId: String(p.toolCallId),
      };
    case "tool-result": {
      const result: ToolResult = {
        ok: true,
        value: p.output,
        tier: "deterministic", // Tier is not knowable from SDK; default + framework can re-tier from registry.
      };
      return { type: "tool_result", callId: String(p.toolCallId), result };
    }
    case "tool-error": {
      const result: ToolResult = {
        ok: false,
        error: {
          code: "tool.execute_failed",
          message: String((p.error as Error | undefined)?.message ?? "unknown"),
          recoverable: false,
        },
      };
      return { type: "tool_result", callId: String(p.toolCallId), result };
    }
    case "error":
      return {
        type: "error",
        error: {
          code: "engine.stream_error",
          message: String((p.error as Error | undefined)?.message ?? "unknown"),
          recoverable: false,
        },
      };
    case "finish":
      return {
        type: "final",
        usage: {
          inputTokens: Number((p.totalUsage as { inputTokens?: number } | undefined)?.inputTokens ?? 0),
          outputTokens: Number((p.totalUsage as { outputTokens?: number } | undefined)?.outputTokens ?? 0),
        },
      };
    default:
      return null;
  }
}
```

**`packages/engines/src/direct/adapter.ts`**:

```typescript
import { streamText, stepCountIs } from "ai";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { resolveModel, type DirectProvider } from "./providers.js";
import { toVercelTools } from "./tool-conversion.js";
import { mapVercelPart } from "./events.js";

export interface DirectEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
  provider: DirectProvider;
}

export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;
  private readonly opts: DirectEngineOptions;

  constructor(opts: DirectEngineOptions) {
    this.opts = opts;
    this.id = `direct.${opts.provider}`;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const model = resolveModel(this.opts.provider, this.opts.config);
    const result = streamText({
      model,
      system: brief.systemPrompt,
      messages: [{ role: "user", content: brief.userMessage }],
      tools: toVercelTools(tools),
      stopWhen: stepCountIs(brief.maxSteps ?? 8),
      temperature: brief.generation?.temperature,
      maxTokens: brief.generation?.maxTokens,
    });
    const state = { textBuf: "" };
    for await (const part of result.fullStream) {
      const event = mapVercelPart(part, state);
      if (event) yield event;
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: false, contextWindow: 200_000 },
    };
  }
}
```

**`packages/engines/src/direct/index.ts`**:

```typescript
export { DirectEngine, type DirectEngineOptions } from "./adapter.js";
export { type DirectProvider } from "./providers.js";
```

**Implementation Notes**:
- `kind: "single-shot"` per CONTRACT — the framework drives loop sentinel via `stepCountIs`. The adapter doesn't manage messages array between steps because the SDK does that internally during the loop.
- The Direct adapter's tool tier is forced to `"deterministic"` in the result — accurate tier comes from the registry summary at episodic-read time. Worth noting: a future refinement could pass tier through `tool.metadata`.
- `health()` returns truthy without probing — Phase 2 doesn't verify provider creds. A real probe (small ping call) is a Phase 3 follow-up.

**Acceptance Criteria**:
- [ ] `new DirectEngine({ config, deps, provider: "anthropic" }).id === "direct.anthropic"`.
- [ ] `run` against a mocked `streamText` (vi.mock the `ai` module) returns an AsyncIterable that emits `model_message` (partial), `model_message` (full), `tool_call`, `tool_result`, `final` events given a canned `fullStream`.
- [ ] Tool dispatch invokes `registry.dispatch` (verified via spy).
- [ ] When a mocked `tool-error` part arrives, the adapter emits `tool_result` with `ok: false`.

---

### Unit 9: Claude Code adapter

**Files**:
- `packages/engines/src/claude-code/adapter.ts`
- `packages/engines/src/claude-code/events.ts`
- `packages/engines/src/claude-code/index.ts`
- `packages/engines/src/__tests__/claude-code.test.ts`

**`packages/engines/src/claude-code/events.ts`**:

```typescript
import type { EngineEvent, ToolResult } from "@praxis/core/types";

/**
 * Strip the `mcp__<serverName>__` prefix that the Claude Code SDK applies to
 * MCP-served tools. Bare tool names match what consumers (and the conformance
 * suite) expect.
 */
export function stripMcpPrefix(toolName: string, serverName: string): string {
  const prefix = `mcp__${serverName}__`;
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}

export interface MapStreamEventInput {
  serverName: string;
}

/**
 * Map a Claude Code SDK StreamEvent to a Praxis EngineEvent. Returns null
 * for events with no useful projection (system.init, rate_limit_event we
 * choose to surface as warnings via the log instead).
 */
export function mapClaudeCodeEvent(
  event: unknown,
  ctx: MapStreamEventInput,
): EngineEvent | null {
  if (!event || typeof event !== "object" || !("type" in event)) return null;
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "system":
      return null; // init / metadata; not part of the normalized stream.
    case "assistant": {
      const delta = (e.delta as string | undefined) ?? "";
      const text = (e.text as string | undefined) ?? "";
      // Prefer delta when present; fall back to full text.
      if (delta) return { type: "model_message", content: delta, partial: true };
      return { type: "model_message", content: text, partial: false };
    }
    case "tool_use":
      return {
        type: "tool_call",
        toolName: stripMcpPrefix(String(e.toolName), ctx.serverName),
        args: e.toolInput,
        callId: String(e.toolId),
      };
    case "tool_result": {
      const isError = Boolean(e.isError);
      const content = String(e.content ?? "");
      const result: ToolResult = isError
        ? {
            ok: false,
            error: { code: "tool.sdk_reported_error", message: content, recoverable: false },
          }
        : { ok: true, value: tryParseJson(content), tier: "deterministic" };
      return { type: "tool_result", callId: String(e.toolId ?? ""), result };
    }
    case "result": {
      const usage = (e.usage as Record<string, number> | undefined) ?? {};
      return {
        type: "final",
        usage: {
          inputTokens: Number(usage.inputTokens ?? 0),
          outputTokens: Number(usage.outputTokens ?? 0),
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
        },
      };
    }
    case "rate_limit_event":
      return {
        type: "error",
        error: {
          code: "engine.rate_limited",
          message: `Rate limited; resets at ${(e.rateLimitInfo as { resetsAt?: number } | undefined)?.resetsAt}`,
          recoverable: true,
        },
      };
    default:
      return null;
  }
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
```

**`packages/engines/src/claude-code/adapter.ts`**:

```typescript
import { createConversation } from "@nklisch/claude-cli-sdk";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { startToolBridge, type ToolBridgeHandle } from "../mcp/tool-bridge.js";
import { mapClaudeCodeEvent } from "./events.js";

export interface ClaudeCodeEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;
  private readonly opts: ClaudeCodeEngineOptions;

  constructor(opts: ClaudeCodeEngineOptions) {
    this.opts = opts;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const bridge: ToolBridgeHandle | null =
      tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
    try {
      const conv = createConversation({
        model: this.modelHint(),
        maxTurns: brief.maxSteps,
        systemPrompt: brief.systemPrompt,
        mcpServers: bridge
          ? {
              [bridge.serverName]: {
                type: "stdio",
                command: bridge.command,
                args: bridge.args,
                env: bridge.env,
              },
            }
          : {},
      });
      try {
        const turn = conv.send(brief.userMessage);
        for await (const event of turn) {
          const mapped = mapClaudeCodeEvent(event, { serverName: bridge?.serverName ?? "praxis" });
          if (mapped) yield mapped;
        }
        const result = await turn.result;
        // The SDK's `result` event flows through the stream; if it didn't, synthesize a final.
        // (Defensive: most cases yield via the stream.)
        if (!result.resultEvent) {
          yield {
            type: "final",
            usage: { inputTokens: 0, outputTokens: 0 },
          };
        }
      } finally {
        await conv.close().catch(() => {});
      }
    } finally {
      if (bridge) await bridge.close().catch(() => {});
    }
  }

  private modelHint(): "haiku" | "sonnet" | "opus" | undefined {
    const m = this.opts.config.model;
    if (!m) return undefined;
    if (m.includes("haiku")) return "haiku";
    if (m.includes("opus")) return "opus";
    if (m.includes("sonnet")) return "sonnet";
    return undefined;
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: true, contextWindow: 200_000 },
    };
  }
}
```

**`packages/engines/src/claude-code/index.ts`**:

```typescript
export { ClaudeCodeEngine, type ClaudeCodeEngineOptions } from "./adapter.js";
```

**Implementation Notes**:
- The adapter starts the MCP bridge ONLY if the registry has tools. Empty registry skips the bridge (cheaper, avoids subprocess spawn).
- `try/finally` guarantees both the conversation and the bridge are closed even when the stream throws.
- `modelHint` is a heuristic — the Claude Code SDK accepts only `haiku|sonnet|opus`, not full model IDs. We map by substring.

**Acceptance Criteria**:
- [ ] `new ClaudeCodeEngine({ config, deps }).id === "claude-code"` and `.kind === "looped"`.
- [ ] `run` against a mocked `createConversation` (vi.mock) iterates a canned StreamEvent sequence and emits the expected EngineEvent sequence.
- [ ] When the canned stream includes a `tool_use` for `mcp__praxis__test.echo`, the emitted `tool_call.toolName === "test.echo"` (prefix stripped).
- [ ] `bridge.close()` and `conv.close()` are called even when the stream throws midway.
- [ ] When `tools.list().length === 0`, the bridge is NOT started (assert via spy).

---

### Unit 10: Codex adapter

**Files**:
- `packages/engines/src/codex/adapter.ts`
- `packages/engines/src/codex/events.ts`
- `packages/engines/src/codex/index.ts`
- `packages/engines/src/__tests__/codex.test.ts`

**`packages/engines/src/codex/events.ts`**:

```typescript
import type { EngineEvent, ToolResult } from "@praxis/core/types";
import { newCallId } from "../util/event-id.js";

interface MapState {
  /** Maps Codex item index → synthesized callId for tool_call/tool_result pairing. */
  toolCallIds: Map<number, string>;
}

export function newMapState(): MapState {
  return { toolCallIds: new Map() };
}

export interface MapCodexEventInput {
  serverName: string;
}

/**
 * Map a Codex ThreadEvent into one or more EngineEvents. Codex emits
 * coarse-grained items (no per-token deltas), so item.completed for
 * agent_message yields a single non-partial model_message. mcp_tool_call
 * items emit a tool_call followed by a tool_result derived from the same item.
 */
export function mapCodexEvent(
  event: unknown,
  ctx: MapCodexEventInput,
  state: MapState,
  itemIndex: { value: number },
): EngineEvent[] {
  if (!event || typeof event !== "object" || !("type" in event)) return [];
  const e = event as Record<string, unknown> & { type: string };
  switch (e.type) {
    case "thread.started":
    case "turn.started":
    case "item.started":
    case "item.updated":
      return [];
    case "item.completed":
      return mapItemCompleted(e.item, ctx, state, itemIndex);
    case "turn.completed": {
      const usage = (e.usage as Record<string, number> | undefined) ?? {};
      return [
        {
          type: "final",
          usage: {
            inputTokens: Number(usage.input_tokens ?? 0),
            outputTokens: Number(usage.output_tokens ?? 0),
            cacheReadTokens: Number(usage.cached_input_tokens ?? 0),
          },
        },
      ];
    }
    case "turn.failed":
    case "error":
      return [
        {
          type: "error",
          error: {
            code: "engine.turn_failed",
            message: String(((e.error as { message?: string } | undefined) ?? e).message ?? "unknown"),
            recoverable: false,
          },
        },
      ];
    default:
      return [];
  }
}

function mapItemCompleted(
  itemUnknown: unknown,
  ctx: MapCodexEventInput,
  state: MapState,
  itemIndex: { value: number },
): EngineEvent[] {
  if (!itemUnknown || typeof itemUnknown !== "object" || !("type" in itemUnknown)) return [];
  const item = itemUnknown as Record<string, unknown> & { type: string };
  const idx = itemIndex.value++;
  switch (item.type) {
    case "agent_message":
      return [{ type: "model_message", content: String(item.text ?? ""), partial: false }];
    case "reasoning":
      return [{ type: "thinking", content: String(item.text ?? "") }];
    case "mcp_tool_call": {
      const server = String(item.server ?? "");
      if (server !== ctx.serverName) return []; // Built-in or other-server tools are framework-invisible in Phase 2.
      const toolName = String(item.tool ?? "");
      const args = item.arguments ?? {};
      const callId = newCallId();
      state.toolCallIds.set(idx, callId);
      const events: EngineEvent[] = [{ type: "tool_call", toolName, args, callId }];
      const status = String(item.status ?? "");
      if (status === "completed") {
        const error = item.error as { message?: string } | undefined;
        const result: ToolResult = error
          ? { ok: false, error: { code: "tool.codex_error", message: String(error.message ?? "unknown"), recoverable: false } }
          : { ok: true, value: item.result, tier: "deterministic" };
        events.push({ type: "tool_result", callId, result });
      }
      return events;
    }
    default:
      return [];
  }
}
```

**`packages/engines/src/codex/adapter.ts`**:

```typescript
import { Codex } from "@openai/codex-sdk";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import type { EngineDeps } from "../types.js";
import { startToolBridge, type ToolBridgeHandle } from "../mcp/tool-bridge.js";
import { mapCodexEvent, newMapState } from "./events.js";

export interface CodexEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class CodexEngine implements Engine {
  readonly id = "codex";
  readonly kind = "looped" as const;
  private readonly opts: CodexEngineOptions;

  constructor(opts: CodexEngineOptions) {
    this.opts = opts;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const bridge: ToolBridgeHandle | null =
      tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
    try {
      const codex = new Codex({
        apiKey: this.opts.config.apiKey,
        baseUrl: this.opts.config.baseUrl,
        config: bridge
          ? {
              mcp_servers: {
                [bridge.serverName]: {
                  command: bridge.command,
                  args: bridge.args,
                  env: bridge.env,
                },
              },
            }
          : undefined,
      });
      const thread = codex.startThread({
        model: this.opts.config.model,
        modelReasoningEffort: this.opts.config.effort,
        approvalPolicy: "never",
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
      });
      const userMessage = `${brief.systemPrompt}\n\n---\n\nUser: ${brief.userMessage}`;
      const { events } = await thread.runStreamed(userMessage);
      const state = newMapState();
      const itemIndex = { value: 0 };
      for await (const event of events) {
        const mapped = mapCodexEvent(event, { serverName: bridge?.serverName ?? "praxis" }, state, itemIndex);
        for (const m of mapped) yield m;
      }
    } finally {
      if (bridge) await bridge.close().catch(() => {});
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: true, nativeMCP: true, contextWindow: 128_000 },
    };
  }
}
```

**`packages/engines/src/codex/index.ts`**:

```typescript
export { CodexEngine, type CodexEngineOptions } from "./adapter.js";
```

**Implementation Notes**:
- Codex doesn't accept a separate system prompt — we prepend it to the user message with a delimiter. Tutoring prompts are short relative to typical Codex inputs, so this is fine for Phase 2. A cleaner approach is `additionalDirectories` with a system file, deferred.
- `approvalPolicy: "never"` and `sandboxMode: "read-only"` keep the Codex agent from trying to mutate the developer's filesystem during tutoring sessions (Codex is a coding agent by default — read-only sandbox makes it safe to drive).
- `skipGitRepoCheck: true` prevents Codex from refusing to run when invoked outside a git repo (the Praxis test script may run anywhere).
- Tool calls from non-Praxis servers (Codex's built-in shell, etc.) are silently dropped from the framework view in Phase 2. They still happen inside Codex; we just don't surface them to episodic. A later phase can opt-in.

**Acceptance Criteria**:
- [ ] `new CodexEngine({ config, deps }).id === "codex"` and `.kind === "looped"`.
- [ ] `run` against a mocked `Codex` (vi.mock) emits `model_message` for an `agent_message` item, `tool_call` + `tool_result` for an `mcp_tool_call` item with `server === "praxis"`, and a `final` event on `turn.completed`.
- [ ] An `mcp_tool_call` with a server other than `praxis` does not emit any events.
- [ ] Bridge is closed in the `finally` block even on stream error.

---

### Unit 11: Run-session script + episodic dump script

**Files**:
- `scripts/run-session.ts`
- `scripts/db-episodic.ts`
- `package.json` (root — add `script:run-session` and `db:episodic` scripts)

**`package.json` root scripts addition**:

```json
{
  "scripts": {
    "script:run-session": "tsx scripts/run-session.ts",
    "db:episodic": "tsx scripts/db-episodic.ts"
  }
}
```

**`scripts/run-session.ts`** (full implementation):

```typescript
import { parseArgs } from "node:util";
import { v7 as uuidv7 } from "uuid";
import { openDb } from "@praxis/core/db";
import {
  readEngineConfig,
  writeEngineConfig,
  EngineIdSchema,
  type EngineConfig,
} from "@praxis/core/config";
import { SessionRunner } from "@praxis/core/session";
import { teachMode } from "@praxis/curriculum/modes";
import { composeBrief } from "@praxis/curriculum/brief";
import { createEngine } from "@praxis/engines";
import { InProcessToolRegistry } from "@praxis/tools";
import { echoTool, nowTool } from "@praxis/tools/test-tools";
import type { Logger, ToolContext } from "@praxis/core/types";

const consoleLogger: Logger = {
  debug: (m, f) => console.debug(`[debug] ${m}`, f ?? {}),
  info: (m, f) => console.info(`[info] ${m}`, f ?? {}),
  warn: (m, f) => console.warn(`[warn] ${m}`, f ?? {}),
  error: (m, f) => console.error(`[error] ${m}`, f ?? {}),
};

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      engine: { type: "string" },
      model: { type: "string" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
      "no-tools": { type: "boolean", default: false },
      "max-steps": { type: "string" },
    },
    allowPositionals: true,
  });
  const userMessage = positionals.join(" ").trim();
  if (!userMessage) {
    console.error("usage: pnpm script:run-session [--engine=<id>] [--no-tools] \"<user message>\"");
    process.exit(1);
  }

  const { db } = openDb();
  const stored = readEngineConfig(db);
  const config: EngineConfig = {
    ...stored,
    engineId: values.engine ? EngineIdSchema.parse(values.engine) : stored.engineId,
    model: values.model ?? stored.model,
    apiKey: values["api-key"] ?? stored.apiKey,
    baseUrl: values["base-url"] ?? stored.baseUrl,
  };

  const studentId = uuidv7(); // Phase 2: ephemeral student per script run.
  const sessionId = uuidv7();
  const toolContext: ToolContext = {
    studentId: studentId as ToolContext["studentId"],
    sessionId: sessionId as ToolContext["sessionId"],
    services: {
      memory: null,
      artifacts: null,
      vectorStore: null,
      sandbox: null,
      sympy: null,
      pedagogyPack: null,
    },
    log: consoleLogger,
  };
  const tools = new InProcessToolRegistry({
    tools: values["no-tools"] ? [] : [echoTool, nowTool],
    context: toolContext,
  });

  const engine = createEngine({ config, deps: { log: consoleLogger } });
  const brief = composeBrief({
    mode: teachMode,
    userMessage,
    maxSteps: values["max-steps"] ? Number.parseInt(values["max-steps"], 10) : undefined,
  });

  const runner = new SessionRunner({
    db,
    studentId,
    mode: teachMode,
    engine,
    tools,
  });

  console.log(`# Engine: ${config.engineId}`);
  console.log(`# Session: ${sessionId}`);
  console.log("---");

  const turn = runner.runTurn({ brief });
  for (;;) {
    const next = await turn.next();
    if (next.done) {
      console.log("\n---");
      console.log(`# events: ${next.value.events.length}`);
      console.log(`# final usage: ${JSON.stringify(next.value.finalEvent?.usage ?? {})}`);
      runner.endSession(next.value.sessionId);
      break;
    }
    renderEvent(next.value);
  }
}

function renderEvent(event: import("@praxis/core/types").EngineEvent): void {
  switch (event.type) {
    case "model_message":
      process.stdout.write(event.content);
      break;
    case "tool_call":
      console.log(`\n[tool_call] ${event.toolName} ${JSON.stringify(event.args)}`);
      break;
    case "tool_result":
      console.log(`[tool_result] ${JSON.stringify(event.result)}`);
      break;
    case "thinking":
      // Quiet by default; uncomment to surface model reasoning.
      // process.stderr.write(`[thinking] ${event.content}`);
      break;
    case "error":
      console.error(`\n[error] ${event.error.code}: ${event.error.message}`);
      break;
    case "final":
      // Handled in the done branch.
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**`scripts/db-episodic.ts`** (dumps recent episodic events grouped by session):

```typescript
import { openDb } from "@praxis/core/db";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { desc } from "drizzle-orm";

const { db } = openDb({ readonly: true });
const recentSessions = db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(10).all();

for (const sess of recentSessions) {
  console.log(`\n## Session ${sess.id}  (${sess.engineId} / ${sess.modeId})  ${sess.startedAt.toISOString()}`);
  const events = db
    .select()
    .from(episodicEvents)
    .where(/* eq(episodicEvents.sessionId, sess.id) */ undefined as never) // import eq in real impl
    .orderBy(episodicEvents.ts)
    .all();
  for (const e of events) {
    const ev = e.eventJson as { type: string };
    console.log(`  [${e.ts.toISOString()}]  turn=${e.turnIndex}  ${ev.type}`);
  }
}
```

**Implementation Notes**:
- The script uses `parseArgs` from Node's stdlib — no CLI-framework dep.
- `studentId` is ephemeral per run in Phase 2. A persistent default student is a Phase 3 concern.
- The render loop favors stdout writes for `model_message` so streaming feels natural at the terminal; `process.stdout.write` doesn't add newlines.
- `--no-tools` flag is provided so we can exercise the "tool-less teach" path explicitly (matches the Phase 2 test checkpoint scope).

**Acceptance Criteria**:
- [ ] `pnpm script:run-session "Hello"` (with Claude CLI authenticated locally) prints a streamed assistant response, then summary lines.
- [ ] `pnpm script:run-session --engine=direct.anthropic --api-key=$ANTHROPIC_API_KEY "Hello"` runs through the Direct adapter.
- [ ] After running, `pnpm db:episodic` shows the session and its events ordered chronologically.
- [ ] Without an authenticated CLI / API key, the script prints a useful error (the engine's own error message) and exits non-zero.

---

### Unit 12: Engine conformance test suite

**Files**:
- `tests/engine-conformance.test.ts`
- `tests/helpers/mock-cc-stream.ts`
- `tests/helpers/mock-codex-stream.ts`
- `tests/helpers/mock-vercel-stream.ts`

**`tests/engine-conformance.test.ts`** (structure):

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Brief, EngineEvent } from "@praxis/core/types";
import { InProcessToolRegistry } from "@praxis/tools";
import { echoTool } from "@praxis/tools/test-tools";
import { ClaudeCodeEngine } from "@praxis/engines/claude-code";
import { CodexEngine } from "@praxis/engines/codex";
import { DirectEngine } from "@praxis/engines/direct";
// Mock helpers:
import { mockClaudeCodeForScenario } from "./helpers/mock-cc-stream.js";
import { mockCodexForScenario } from "./helpers/mock-codex-stream.js";
import { mockVercelForScenario } from "./helpers/mock-vercel-stream.js";

const SCENARIO_BRIEF: Brief = {
  systemPrompt: "You are a tutor. Be brief.",
  userMessage: "Use the test.echo tool with text 'hello' and then say 'done'.",
  context: { retrievedChunks: [], artifactRefs: [] },
};

interface NormalizedTurn {
  text: string;
  toolCalls: Array<{ toolName: string; args: unknown }>;
  hasFinal: boolean;
}

async function collect(stream: AsyncIterable<EngineEvent>): Promise<NormalizedTurn> {
  let text = "";
  const toolCalls: NormalizedTurn["toolCalls"] = [];
  let hasFinal = false;
  for await (const event of stream) {
    if (event.type === "model_message" && event.partial === false) text += event.content;
    if (event.type === "model_message" && event.partial === true) text += event.content;
    if (event.type === "tool_call") toolCalls.push({ toolName: event.toolName, args: event.args });
    if (event.type === "final") hasFinal = true;
  }
  // Coalesce: prefer final text. If both deltas and final present, the final overwrites is wrong;
  // dedupe by stripping deltas if a non-partial appeared. Implementation detail: we accumulate
  // deltas, then the final non-partial replaces the buffer.
  return { text, toolCalls, hasFinal };
}

describe("Engine conformance", () => {
  let registry: InProcessToolRegistry;
  beforeEach(() => {
    registry = new InProcessToolRegistry({
      tools: [echoTool],
      context: stubToolContext(),
    });
  });

  it("Claude Code adapter produces normalized turn", async () => {
    mockClaudeCodeForScenario(); // sets up vi.mock("@nklisch/claude-cli-sdk")
    const engine = new ClaudeCodeEngine({ config: { engineId: "claude-code" }, deps: { log: noopLogger } });
    const turn = await collect(engine.run(SCENARIO_BRIEF, registry));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });

  it("Codex adapter produces normalized turn", async () => {
    mockCodexForScenario();
    const engine = new CodexEngine({ config: { engineId: "codex" }, deps: { log: noopLogger } });
    const turn = await collect(engine.run(SCENARIO_BRIEF, registry));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });

  it("Direct adapter produces normalized turn", async () => {
    mockVercelForScenario();
    const engine = new DirectEngine({
      config: { engineId: "direct.anthropic" },
      deps: { log: noopLogger },
      provider: "anthropic",
    });
    const turn = await collect(engine.run(SCENARIO_BRIEF, registry));
    expect(turn.text).toContain("done");
    expect(turn.toolCalls).toEqual([{ toolName: "test.echo", args: { text: "hello" } }]);
    expect(turn.hasFinal).toBe(true);
  });
});
```

**Mock helper pattern** — each helper uses `vi.mock` at module level to substitute the underlying SDK with a fixture that emits a deterministic event sequence representing the same scenario (assistant text + one tool call + final).

**Implementation Notes**:
- Mocks live OUTSIDE the engines package because `vi.mock` hoists to the top of the file; centralizing per-test-file is cleaner than importing helpers that call `vi.mock`.
- The mock functions install the mock and seed the canned events at the same time. Pattern: `vi.doMock("...", () => ({ ... }))` for runtime control.
- The conformance suite intentionally tests behavior, not implementation — same scenario, three engines, same normalized output.
- The test does NOT actually start the MCP bridge (the mocked SDK never invokes a real tool dispatch). The bridge is unit-tested separately in Unit 7.

**Acceptance Criteria**:
- [ ] All three "produces normalized turn" tests pass against deterministic mocks.
- [ ] If any adapter regresses (e.g., wrong tool-call name due to MCP-prefix bug), the corresponding test fails with a clear `toEqual` diff.
- [ ] The shared collect/assert logic is identical across the three tests — adding a fourth engine in the future is one new test that reuses the helpers.

---

## Implementation Order

Order resolves dependencies:

1. **Unit 1** — `ToolDefinitionSummary.inputSchemaNative` field on the contract. Everything else depends on this being available.
2. **Unit 2** — `@praxis/tools` (InProcessToolRegistry + test tools). Used by Units 7, 8, 9, 10, 11, 12.
3. **Unit 3** — `@praxis/curriculum` (teach mode + composeBrief). Used by Unit 11.
4. **Unit 4** — `@praxis/core` engine config. Used by Units 6, 11.
5. **Unit 5** — `@praxis/core` SessionRunner. Used by Unit 11.
6. **Unit 6** — `@praxis/engines` package shell, factory, JSON-Schema-to-Zod. Used by Units 7, 8, 9, 10, 11, 12.
7. **Unit 7** — MCP tool bridge. Used by Units 9, 10.
8. **Unit 8** — Direct adapter (no bridge needed; simplest of the three).
9. **Unit 9** — Claude Code adapter.
10. **Unit 10** — Codex adapter.
11. **Unit 11** — Run-session script + episodic dump script.
12. **Unit 12** — Conformance suite (all three adapters must exist before this can pass).

Units 1–6 can be implemented sequentially. Units 7–10 can be parallelized after 6 (each adapter is isolated). Units 11–12 close the phase.

---

## Testing

### Per-unit tests (collocated)

| Test file | What it tests |
|---|---|
| `packages/tools/src/__tests__/registry.test.ts` | InProcessToolRegistry: list, dispatch happy path, validation failure, missing tool, duplicate registration throw. |
| `packages/tools/src/__tests__/test-tools.test.ts` | `test.echo` and `test.now` handlers return correct shapes. |
| `packages/curriculum/src/__tests__/teach-mode.test.ts` | teach mode has expected fragment IDs, registry getMode/requireMode behavior. |
| `packages/curriculum/src/__tests__/compose.test.ts` | composeBrief: ordering, override application, override-of-non-customizable throws, default context. |
| `packages/core/src/__tests__/engine-config.test.ts` | read default, write+read round-trip, env override, env validation failure, providerApiKeyEnvName. |
| `packages/core/src/__tests__/episodic.test.ts` | createSession returns ID, appendEpisodic writes correct row, endSession sets endedAt. |
| `packages/core/src/__tests__/session-runner.test.ts` | runTurn against fake engine: writes N episodic rows, returns RunTurnResult, episodic-write failure emits error event. |
| `packages/engines/src/__tests__/factory.test.ts` | createEngine returns correct subclass per engineId; coverage for all 6 IDs. |
| `packages/engines/src/__tests__/json-schema-to-zod.test.ts` | round-trip: zod → JSON → zod for object/string/number/array/optional. |
| `packages/engines/src/__tests__/tool-bridge.test.ts` | startToolBridge returns command/args/env; dispatch routes to registry (spy); close is idempotent. |
| `packages/engines/src/__tests__/direct.test.ts` | Mocked `streamText`: emits expected EngineEvent sequence; tool error mapped; tool dispatch routes through registry. |
| `packages/engines/src/__tests__/claude-code.test.ts` | Mocked `createConversation`: emits expected EngineEvents; MCP prefix stripped from tool names; bridge skipped when no tools. |
| `packages/engines/src/__tests__/codex.test.ts` | Mocked `Codex`: agent_message → model_message; mcp_tool_call from praxis server emits tool_call+tool_result; non-praxis-server tool calls are dropped; turn.completed emits final. |

### Integration tests (root `tests/`)

| Test file | What it tests |
|---|---|
| `tests/engine-conformance.test.ts` | All three adapters against the same mocked-SDK scenario produce equivalent NormalizedTurn (final text contains expected substring; tool-call sequence matches; final emitted). |
| `tests/full-turn-with-fake-engine.test.ts` | End-to-end: real DB (temp dir) + InProcessToolRegistry + composeBrief + SessionRunner + a hand-written FakeEngine that emits a canned EngineEvent sequence. Asserts: episodic rows persisted, session row created, RunTurnResult correct. |

### Database test isolation

Per CLAUDE.md, all DB tests must:
- Set `PRAXIS_DB_PATH` env var to a vitest temp dir before `openDb()` (use `vi.stubEnv`).
- Run `runMigrations({ path })` in `beforeEach` and `closeDb()` in `afterEach`.
- Never touch `.praxis/dev.db`.

### CI posture

- `pnpm typecheck && pnpm lint && pnpm test` is the per-commit gate.
- The conformance suite uses mocked SDKs — no network calls in CI. Real-engine smoke tests (against Claude CLI / Anthropic API) are the test-checkpoint script run, not in CI.

---

## Verification Checklist

After all units land, the following commands must succeed:

```bash
# Existing Phase 1 gates still green
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm db:reset

# Phase 2 test checkpoint (per ROADMAP.md)
pnpm script:run-session "Explain photosynthesis briefly"                        # default: claude-code
pnpm script:run-session --engine=codex "Explain photosynthesis briefly"          # if codex CLI installed
pnpm script:run-session --engine=direct.anthropic --api-key=$ANTHROPIC_API_KEY \
    "Explain photosynthesis briefly"

pnpm db:episodic                                                                 # shows three sessions
pnpm test tests/engine-conformance.test.ts                                       # passes for all three adapters
```

All three sessions appear in `pnpm db:episodic` with at least one `model_message` event each, and (when tools are enabled) tool_call events from the test scenario. The conformance suite passes against mocked SDKs in CI without any API keys.

---

## Out of scope (defer)

- Real provider health probes (small ping calls). Phase 3.
- Mid-session indexer projections. Phase 7.
- Persistent default-student selection. Phase 3 (when UI lands).
- Surfacing Codex's built-in tool calls (shell, file ops) into episodic. Future opt-in.
- A non-narrow, general-purpose JSON-Schema-to-Zod converter. Replace with a library (`json-schema-to-zod` npm) when a real tool's schema needs more than the narrow subset.
- Multi-turn conversation persistence (conversation history threaded into Brief). The Phase 2 SessionRunner accepts `turnIndex` but doesn't yet read prior turns; Phase 3 wires history into `composeBrief.context.studentSummary`.
