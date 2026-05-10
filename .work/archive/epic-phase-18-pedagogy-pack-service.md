---
id: epic-phase-18-pedagogy-pack-service
kind: story
stage: done
tags: [content]
parent: epic-phase-18-pedagogy-pack
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `PedagogyPackService` + tools + services wiring

## Scope

Build the service that loads, validates, and serves a pedagogy pack from disk;
expose its reads through five `pedagogy.*` tools; and wire the service into
the `buildServices` composition root so every call site that currently passes
`pedagogyPack: null` (six call sites today) gets the real service.

The pack JSON content itself is the **separate** sibling story
`epic-phase-18-pedagogy-pack-v1-content`. To unblock this story, the service
implements an empty-pack fallback: if no pack file is found, the service
returns empty arrays from every accessor, the tools degrade to "no
strategies / techniques / prompts available" responses, and tests assert
that path explicitly. When the v1 content lands in the sibling story, the
service starts returning real data without code changes here.

## Units

### Unit 1: `PedagogyPackService` port

**File**: `packages/core/src/types/tool.ts` (replace the `unknown` placeholder
on `ToolServices.pedagogyPack` at line 140 with the new interface)

```typescript
export interface PedagogyPackService {
  /** Returns the loaded pack, or `null` if no pack is available at runtime. */
  current(): PedagogyPack | null;

  /** All teaching strategies in the loaded pack (empty if no pack). */
  listStrategies(): readonly TeachingStrategy[];

  /** Lookup a teaching strategy by id. Returns `null` if no pack or unknown id. */
  getStrategy(id: StrategyId): TeachingStrategy | null;

  /** All study techniques in the loaded pack (empty if no pack). */
  listTechniques(): readonly StudyTechnique[];

  /** Lookup a study technique by id. Returns `null` if no pack or unknown id. */
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

Methods are synchronous because the pack is loaded once at boot and held in
memory (~50 KB upper bound for v1; no I/O on read). This mirrors how
canonical packs work post-import.

**Acceptance**:
- [ ] `ToolServices.pedagogyPack` is typed as `PedagogyPackService` (no
      `unknown`).
- [ ] All six `pedagogyPack: null` call sites still typecheck (using `null`
      is permitted at the call site since the field is required but tests
      may opt out — adjust the type to `PedagogyPackService | null` if
      simpler than chasing every test stub; document the choice in the
      story body).
- [ ] No production code reads the field as `null` — only test stubs.

### Unit 2: Zod schema + JSON validation

**File**: `packages/curriculum/src/pedagogy/schema.ts`

Mirror `packages/curriculum/src/packs/schema.ts`. One Zod schema per type in
`packages/core/src/types/pedagogy.ts`:

```typescript
import { z } from "zod";
// re-export from @praxis/core where helpful

export const CitationSchema = z.object({
  source: z.string().min(1),
  url: z.string().url().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().int().optional(),
});

export const TeachingStrategySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  applicability: z.object({
    conceptKinds: z.array(z.string()).default([]),
    bloomsLevels: z.array(z.string()).default([]),
    cognitiveLoad: z.enum(["low", "medium", "high"]),
  }),
  promptFragment: z.string().min(1),
  citations: z.array(CitationSchema).default([]),
});

export const StudyTechniqueSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  uiAffordances: z.array(z.string()).default([]),
  curriculum: z.object({
    lessons: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        practicePromptIds: z.array(z.string()).default([]),
      }),
    ),
  }),
  citations: z.array(CitationSchema).default([]),
});

export const MetacognitivePromptSchema = z.object({
  id: z.string().min(1),
  trigger: z.enum([
    "pre-reading",
    "post-reading",
    "pre-quiz",
    "post-error",
    "session-end",
  ]),
  template: z.string().min(1),
});

export const PedagogyPackSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    signature: z.string(), // reserved — see Design Decisions on signing.
    manifest: z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      praxisCompatible: z.string().min(1),
      publishedAt: z.number().int(),
      authors: z.array(z.string()).min(1),
    }),
    strategies: z.array(TeachingStrategySchema).default([]),
    studyTechniques: z.array(StudyTechniqueSchema).default([]),
    metacognitivePrompts: z.array(MetacognitivePromptSchema).default([]),
  })
  .superRefine((pack, ctx) => {
    // Cross-validate: every metacognitive prompt's id is unique within the pack.
    const seen = new Set<string>();
    for (const p of pack.metacognitivePrompts) {
      if (seen.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metacognitivePrompts"],
          message: `duplicate prompt id: ${p.id}`,
        });
      }
      seen.add(p.id);
    }
    // Same uniqueness check for strategy ids and technique ids.
  });
```

**Acceptance**:
- [ ] Schema parses a synthetic-but-valid pack without warnings.
- [ ] Schema rejects a pack with duplicate strategy / technique / prompt ids.
- [ ] Schema rejects a pack with empty `manifest.authors`.
- [ ] Default-empty arrays let a minimal pack (just `version`, `signature`,
      `manifest`) parse successfully — supports incremental authoring.

### Unit 3: `PedagogyPackServiceImpl`

**File**: `packages/curriculum/src/pedagogy/pedagogy-pack-service.ts`

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Logger,
  MetacognitivePrompt,
  MetacognitivePromptTrigger,
  PedagogyPack,
  PedagogyPackService,
  StrategyId,
  StudyTechnique,
  TeachingStrategy,
  TechniqueId,
} from "@praxis/core/types";
import { PedagogyPackSchema } from "./schema.js";

export interface PedagogyPackServiceDeps {
  log: Logger;
  /**
   * Filesystem path to the pedagogy pack JSON. Defaults to a path resolved
   * relative to this file's location (`../../pedagogy/v1.json`). When the
   * file is missing, the service operates in empty-pack mode — every
   * accessor returns empty (or null for getters).
   */
  packPath?: string;
}

export class PedagogyPackServiceImpl implements PedagogyPackService {
  private readonly pack: PedagogyPack | null;
  private readonly strategiesById: Map<StrategyId, TeachingStrategy>;
  private readonly techniquesById: Map<TechniqueId, StudyTechnique>;

  constructor(deps: PedagogyPackServiceDeps) {
    this.pack = loadPack(deps);
    this.strategiesById = new Map(
      (this.pack?.strategies ?? []).map((s) => [s.id, s] as const),
    );
    this.techniquesById = new Map(
      (this.pack?.studyTechniques ?? []).map((t) => [t.id, t] as const),
    );
  }

  current(): PedagogyPack | null {
    return this.pack;
  }
  listStrategies(): readonly TeachingStrategy[] {
    return this.pack?.strategies ?? [];
  }
  getStrategy(id: StrategyId): TeachingStrategy | null {
    return this.strategiesById.get(id) ?? null;
  }
  listTechniques(): readonly StudyTechnique[] {
    return this.pack?.studyTechniques ?? [];
  }
  getTechnique(id: TechniqueId): StudyTechnique | null {
    return this.techniquesById.get(id) ?? null;
  }
  listMetacognitivePrompts(opts?: {
    trigger?: MetacognitivePromptTrigger;
  }): readonly MetacognitivePrompt[] {
    const all = this.pack?.metacognitivePrompts ?? [];
    return opts?.trigger ? all.filter((p) => p.trigger === opts.trigger) : all;
  }
}

function loadPack(deps: PedagogyPackServiceDeps): PedagogyPack | null {
  const path = deps.packPath ?? defaultPackPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      deps.log.info("pedagogy.pack_absent", { path });
      return null;
    }
    deps.log.warn("pedagogy.pack_read_failed", {
      path,
      err: String(err),
    });
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    deps.log.error("pedagogy.pack_invalid_json", { path, err: String(err) });
    return null;
  }
  const result = PedagogyPackSchema.safeParse(parsedJson);
  if (!result.success) {
    deps.log.error("pedagogy.pack_invalid_shape", {
      path,
      issues: result.error.issues,
    });
    return null;
  }
  deps.log.info("pedagogy.pack_loaded", {
    version: result.data.version,
    strategies: result.data.strategies.length,
    techniques: result.data.studyTechniques.length,
    prompts: result.data.metacognitivePrompts.length,
  });
  return result.data;
}

function defaultPackPath(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return join(dir, "..", "..", "pedagogy", "v1.json");
}
```

**Acceptance**:
- [ ] `new PedagogyPackServiceImpl({ log })` with no pack file returns
      empty arrays / null, and logs `pedagogy.pack_absent` once.
- [ ] Same constructor with a pointer to a valid synthetic pack returns
      its content correctly across all accessors.
- [ ] Invalid-JSON and shape-mismatched pack files result in `null`
      pack and an error log; the service still operates (empty mode).
- [ ] Lookup by id is O(1) via the Map indexes.

### Unit 4: Five `pedagogy.*` read-only tools

**Files**: `packages/tools/src/pedagogy/{index,list-strategies,get-strategy,list-techniques,get-technique,list-metacognitive-prompts}.ts`

All five tools share a tiny shape — they call `ctx.services.pedagogyPack`
methods and pass through the result. Tier `"deterministic"`, no `effects`,
matching the `quick-check` short-answer reference shape.

```typescript
// list-strategies.ts
const InputSchema = z.object({});
const OutputSchema = z.object({
  strategies: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(),
    applicability: z.object({
      conceptKinds: z.array(z.string()),
      bloomsLevels: z.array(z.string()),
      cognitiveLoad: z.enum(["low", "medium", "high"]),
    }),
    promptFragment: z.string(),
  })),
});
export const pedagogyListStrategiesTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "pedagogy.list_strategies",
  description: "List all teaching strategies in the active pedagogy pack…",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(_args, ctx) {
    const strategies = ctx.services.pedagogyPack.listStrategies();
    // Strip citations from the wire shape — they're an authoring concern,
    // not something the model needs in its response shape.
    return { strategies: strategies.map(stripCitations) };
  },
};
```

The five tools:
- `pedagogy.list_strategies` — full strategy list (without citations on
  the wire to keep results compact).
- `pedagogy.get_strategy` — `{ id }` → strategy or `{ kind: "not_found" }`.
- `pedagogy.list_techniques` — technique list (with `uiAffordances`).
- `pedagogy.get_technique` — `{ id }` → technique with curriculum lessons.
- `pedagogy.list_metacognitive_prompts` — `{ trigger?: ... }` → prompt list.

A barrel `packages/tools/src/pedagogy/index.ts` re-exports all five plus
a `PEDAGOGY_TOOLS` array, mirroring `course/index.ts`'s `COURSE_TOOLS`.

**Acceptance**:
- [ ] Each tool dispatches through the registry and returns the expected
      shape on a populated synthetic pack.
- [ ] Each tool returns the empty case gracefully on a no-pack service.
- [ ] `pedagogy.get_strategy` with an unknown id returns
      `{ kind: "not_found" }` (mirrors existing `kind: "not_found"`
      patterns from notes/draft tools).

### Unit 5: services.ts wiring

**Files**:
- `packages/desktop/electron/main/services.ts` — instantiate
  `PedagogyPackServiceImpl` and add to the returned `Services` shape.
- `packages/core/src/services/session-service.ts` — replace the `null`
  pedagogyPack at line ~645 with the real service.
- All test stubs (`packages/curriculum/src/bootstrap/__tests__/explorer.test.ts`,
  `packages/tools/src/__tests__/registry.test.ts`,
  `packages/tools/src/__tests__/test-tools.test.ts`,
  `packages/tools/src/math/__tests__/grade-math.test.ts`,
  `packages/tools/src/sandbox/__tests__/code-sandbox.test.ts`) — pass an
  empty-mode `PedagogyPackServiceImpl` instance instead of `null`.

The simplest path is to keep the field required (non-null) on
`ToolServices.pedagogyPack` and ship a helper like
`makeEmptyPedagogyPackService()` for tests that don't care about the
content. That keeps production code free of `null` checks.

**Acceptance**:
- [ ] `pnpm typecheck` clean — no `pedagogyPack: null` left anywhere.
- [ ] `buildServices` returns a `Services` whose `pedagogyPack` is a
      working service (empty-mode in dev when no pack file is bundled).
- [ ] All affected tests still pass with the empty-mode helper.

### Unit 6: Tests

**Files**:
- `packages/curriculum/src/pedagogy/__tests__/pedagogy-pack-service.test.ts`
  — service-level tests:
  - empty-pack mode returns empty arrays / null
  - invalid-json file → empty mode + error log
  - shape-mismatch file → empty mode + error log
  - valid synthetic pack → all accessors return correct content
  - `listMetacognitivePrompts({ trigger })` filters correctly
- `packages/tools/src/pedagogy/__tests__/*.test.ts` (one per tool, kept
  small) — happy path + empty-pack path + (where relevant) unknown-id
  path.

Acceptance for the test suite as a whole:
- [ ] Coverage for both empty-mode and populated-mode paths.
- [ ] Synthetic-pack fixtures live under `__tests__/fixtures/` and are
      reused across tests.

## Acceptance criteria (story)

- [ ] `pnpm --filter @praxis/curriculum test` green for the new pedagogy
      tests.
- [ ] `pnpm --filter @praxis/tools test` green for the new tool tests.
- [ ] `pnpm typecheck && pnpm test` green at the closing commit.
- [ ] No regressions in the lint count.
- [ ] `pedagogyPack: null` is removed from every call site (tests use the
      empty-mode helper).

## Implementation notes

### Files created

- `packages/curriculum/src/pedagogy/schema.ts` — Zod schemas for `PedagogyPack`, `TeachingStrategy`, `StudyTechnique`, `MetacognitivePrompt`, `Citation`, with `superRefine` uniqueness cross-validation on strategy/technique/prompt ids.
- `packages/curriculum/src/pedagogy/pedagogy-pack-service.ts` — `PedagogyPackServiceImpl` + `PedagogyPackServiceDeps` + `makeEmptyPedagogyPackService` test helper. Loads JSON at boot, validates via Zod, holds in memory; falls back to empty-pack mode on absent/invalid file.
- `packages/curriculum/src/pedagogy/index.ts` — barrel re-exporting service, schemas, and helper.
- `packages/curriculum/src/pedagogy/__tests__/pedagogy-pack-service.test.ts` — 25 tests covering empty-pack, invalid-JSON, shape-mismatch, valid synthetic pack, and trigger filtering.
- `packages/curriculum/src/pedagogy/__tests__/fixtures/synthetic-pack.json` — 2 strategies, 1 technique, 2 metacognitive prompts (pre-reading + post-error triggers).
- `packages/curriculum/pedagogy/.gitkeep` — tracks the content directory before v1.json lands.
- `packages/tools/src/pedagogy/list-strategies.ts` — `pedagogy.list_strategies` tool.
- `packages/tools/src/pedagogy/get-strategy.ts` — `pedagogy.get_strategy` tool; returns `{ kind: "not_found" }` on unknown id.
- `packages/tools/src/pedagogy/list-techniques.ts` — `pedagogy.list_techniques` tool.
- `packages/tools/src/pedagogy/get-technique.ts` — `pedagogy.get_technique` tool with full curriculum lessons; returns `{ kind: "not_found" }` on unknown id.
- `packages/tools/src/pedagogy/list-metacognitive-prompts.ts` — `pedagogy.list_metacognitive_prompts` tool with optional trigger filter.
- `packages/tools/src/pedagogy/index.ts` — barrel + `PEDAGOGY_TOOLS` array.
- `packages/tools/src/pedagogy/__tests__/helpers.ts` — inline empty/filled pack helpers (no curriculum dep in tools tests).
- `packages/tools/src/pedagogy/__tests__/list-strategies.test.ts` — 4 tests.
- `packages/tools/src/pedagogy/__tests__/get-strategy.test.ts` — 4 tests.
- `packages/tools/src/pedagogy/__tests__/list-techniques.test.ts` — 4 tests.
- `packages/tools/src/pedagogy/__tests__/get-technique.test.ts` — 4 tests.
- `packages/tools/src/pedagogy/__tests__/list-metacognitive-prompts.test.ts` — 7 tests.

### Files modified

- `packages/core/src/types/tool.ts` — added `PedagogyPackService` interface; replaced `pedagogyPack: unknown` with `pedagogyPack: PedagogyPackService`; added imports from `./pedagogy.js` and `TechniqueId` from `./ids.js`.
- `packages/core/src/services/types.ts` — added `PedagogyPackService` to `ServiceDeps.toolServices`.
- `packages/core/src/services/session-service.ts` — replaced `pedagogyPack: null` with `pedagogyPack: this.deps.toolServices.pedagogyPack`.
- `packages/desktop/electron/main/services.ts` — imported `PedagogyPackServiceImpl`; instantiated `pedagogyPackService`; added to `Services` shape, `toolServices`, and return object.
- `packages/curriculum/package.json` — added `./pedagogy` export path.
- `packages/tools/package.json` — added `./pedagogy` export path.
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` — replaced `pedagogyPack: null` with `makeEmptyPedagogyPackService()` (relative import from pedagogy service).
- `packages/tools/src/__tests__/test-tools.test.ts` — replaced `pedagogyPack: null` with inline empty stub.
- `packages/tools/src/__tests__/registry.test.ts` — replaced `pedagogyPack: null` with inline empty stub.
- `packages/tools/src/math/__tests__/grade-math.test.ts` — replaced `pedagogyPack: null` with inline empty stub.
- `packages/tools/src/sandbox/__tests__/code-sandbox.test.ts` — replaced `pedagogyPack: null` with inline empty stub.

### Discrepancies between design and final implementation

1. **Citation schema shape**: Unit 2 in the story body showed `{source, url, authors, year}` for `CitationSchema`. The existing `Citation` TS type in `@praxis/core/types/common.ts` is `{source, locator?, text?}`. Used the existing type — single source of truth wins. The `CitationSchema` matches the existing TS interface exactly.
2. **Tools test helper**: The design suggested `makeEmptyPedagogyPackService` from `@praxis/curriculum/pedagogy`. The tools package has no runtime or dev dep on curriculum. Rather than add that dep (which would also require a tsconfig reference change), the tools tests use an inline 6-line object literal stub and a slightly larger `makeFilledPedagogyPackService` built from typed literals. The curriculum tests use the real `PedagogyPackServiceImpl` via relative import. Functionality is equivalent.
3. **Branded type cast**: `PedagogyPackSchema` output is `string` for ids, but `PedagogyPack` uses branded `StrategyId`/`TechniqueId`. The `loadPack` function casts via `as unknown as PedagogyPack` with a comment explaining the validation guarantee. This is the standard pattern for Zod-to-branded-type conversions in the codebase.
4. **PEDAGOGY_TOOLS not yet wired into services.ts tool list**: The story scope covers service plumbing and tool definitions; the `PEDAGOGY_TOOLS` array is ready but not yet added to `toolDefinitions` in `services.ts`. That wiring belongs in the mode-tool-scoping work once the v1 content lands (modes need to declare which pedagogy tools are available). Added as a note here; not a blocker for review.

### Verification results

- `pnpm --filter @praxis/curriculum test`: 207 tests, 20 files — all passed (including 25 new pedagogy tests).
- `pnpm --filter @praxis/tools test`: 444 tests, 58 files — all passed (including 19 new pedagogy tool tests).
- `pnpm --filter @praxis/core test`: 558 tests, 60 files — all passed.
- `pnpm --filter @praxis/desktop test`: 60 tests, 6 files — all passed.
- `pnpm typecheck`: clean (all 10 packages).
- `pnpm lint`: 30 total errors — same set of pre-existing errors (claude-cli-sdk, client tests, root tests). Zero errors in files created or modified by this story.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- `pedagogy-pack-service.ts:125-126` carries a `// biome-ignore lint/suspicious/noExplicitAny`
  comment, but the cast on the next line is `as unknown as PedagogyPack` —
  no `any` keyword involved. The suppression is dead and should be removed
  or rewritten to explain the brand cast.
- `makeEmptyPedagogyPackService` (curriculum impl) uses path
  `/dev/null/pedagogy-pack-does-not-exist.json` to trigger empty-mode.
  That path produces ENOTDIR rather than ENOENT, so it hits the
  `warn`-level `pedagogy.pack_read_failed` branch instead of the
  `info`-level `pedagogy.pack_absent` branch. Test stubs use a noop
  logger so no output, but the semantic is slightly off; a sentinel
  (`packPath === ""` short-circuits to null pack) would be cleaner.
- `get-strategy.ts:43` and `helpers.ts:41,53` use inline
  `import("@praxis/core/types").StrategyId` type syntax. A normal
  `import type { StrategyId } from "@praxis/core/types"` at the top of
  the file reads cleaner than the inline form.
- `Services.pedagogyPack` in `desktop/electron/main/services.ts:151` is
  typed as the concrete `PedagogyPackServiceImpl` while `ToolServices.pedagogyPack`
  uses the interface. Other services in the same file mix both styles, so
  this is consistent with house practice — flagging only because the
  interface form is the long-term direction.

**Notes**:
- Targeted suite green: `pnpm --filter @praxis/curriculum test` 220
  passed (21 files); `pnpm --filter @praxis/tools test` reports 444
  passed at the implementation commit. Repo-wide `pnpm test` green at
  HEAD with 2056 passed / 15 skipped.
- `pnpm typecheck` clean. Lint at 4 errors (down from 22 baseline at
  the feature-design commit) — the `lint:fix` follow-up commit
  `925e847` cleaned up auto-fixable issues across the repo. Zero new
  errors introduced by this story's files.
- Foundation-doc alignment: `docs/CONTRACT.md:228` already asserted
  `pedagogyPack: PedagogyPackService` while code carried `unknown`.
  This story closes that drift. No new drift introduced.
- Two intentional design deviations documented in the story body:
  Citation schema (use existing TS type, not the story sketch) and
  tools-test-helper location (inline rather than imported from
  `@praxis/curriculum` to avoid a runtime dep). Both are reasonable.
- The `PEDAGOGY_TOOLS` array exists but isn't yet wired into
  `services.ts` `toolDefinitions`. That belongs in the mode-tool-scoping
  for `metacognitive-prompts` / `coach-mode` features. Not a blocker.
- Capability check: a fresh service instance loads the synthetic fixture
  correctly, returns expected counts and lookups; empty-mode round-trips
  cleanly; tools dispatch through the registry on both states. The
  foundation is in place for the v1 content sibling story to land.

What's now possible: every Phase 18 feature that depends on the pedagogy
pack (`procedural-memory`, `metacognitive-prompts`, `coach-mode`) has a
working `PedagogyPackService` to consume. The service is empty-mode
today; once `epic-phase-18-pedagogy-pack-v1-content` lands, accessors
will return real strategies / techniques / prompts without further
service-layer changes.

## Re-review (2026-05-10)

**Verdict**: Approve

User reopened phase 18 items (done → review) to re-run reviews. Fresh pass
through the implementation:

- `pnpm --filter @praxis/curriculum test`: 323 tests / 25 files — green.
- `pnpm --filter @praxis/tools test`: 439 passed / 14 skipped — green.
- `pnpm typecheck`: clean across all 10 packages.
- Re-walked schema, service impl, and all 5 tool definitions. Empty-pack
  fallback still operates correctly; `superRefine` uniqueness checks
  cover strategy / technique / prompt ids; 5 tools dispatch through the
  registry with consistent `kind: "not_found"` shape.
- No new blockers or important findings. The 4 nits identified in the
  first review (dead biome-ignore at line 125, ENOTDIR vs ENOENT in
  empty-mode test path at line 156, inline `import("...").StrategyId`
  type syntax in `get-strategy.ts:43` and `helpers.ts`, concrete impl
  vs interface typing in `desktop/.../services.ts:151`) all persist —
  intentional since they were nit-tier and not parked as items.

Approved on the same grounds as the first review; advancing to done.
