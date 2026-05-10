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
   * Filesystem path to the pedagogy pack JSON. When omitted, defaults to a path
   * resolved relative to this file: `../../pedagogy/v1.json` (i.e.
   * `packages/curriculum/pedagogy/v1.json`). When the file is absent, the
   * service operates in empty-pack mode — every accessor returns empty arrays
   * or null; a single info log is emitted at construction.
   */
  packPath?: string;
}

/**
 * `PedagogyPackServiceImpl` — reads and validates a pedagogy pack JSON from
 * disk at construction; serves its contents synchronously through read-only
 * accessors. In-memory Map indexes provide O(1) lookup by id.
 *
 * Empty-pack fallback: when the pack file is absent or fails validation, the
 * service silently operates with empty arrays / null returns. This decouples
 * the engineering story (service + plumbing) from the content-authoring story
 * (v1 pack JSON) so both can land independently.
 */
export class PedagogyPackServiceImpl implements PedagogyPackService {
  private readonly pack: PedagogyPack | null;
  private readonly strategiesById: Map<string, TeachingStrategy>;
  private readonly techniquesById: Map<string, StudyTechnique>;

  constructor(deps: PedagogyPackServiceDeps) {
    this.pack = loadPack(deps);
    this.strategiesById = new Map(
      (this.pack?.strategies ?? []).map((s) => [s.id as string, s]),
    );
    this.techniquesById = new Map(
      (this.pack?.studyTechniques ?? []).map((t) => [t.id as string, t]),
    );
  }

  current(): PedagogyPack | null {
    return this.pack;
  }

  listStrategies(): readonly TeachingStrategy[] {
    return this.pack?.strategies ?? [];
  }

  getStrategy(id: StrategyId): TeachingStrategy | null {
    return this.strategiesById.get(id as string) ?? null;
  }

  listTechniques(): readonly StudyTechnique[] {
    return this.pack?.studyTechniques ?? [];
  }

  getTechnique(id: TechniqueId): StudyTechnique | null {
    return this.techniquesById.get(id as string) ?? null;
  }

  listMetacognitivePrompts(opts?: {
    trigger?: MetacognitivePromptTrigger;
  }): readonly MetacognitivePrompt[] {
    const all = this.pack?.metacognitivePrompts ?? [];
    return opts?.trigger ? all.filter((p) => p.trigger === opts.trigger) : all;
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function loadPack(deps: PedagogyPackServiceDeps): PedagogyPack | null {
  const path = deps.packPath ?? defaultPackPath();

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      deps.log.info("pedagogy.pack_absent", { path });
      return null;
    }
    deps.log.warn("pedagogy.pack_read_failed", { path, err: String(err) });
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

  // The Zod schema validates structure; branded ids (StrategyId, TechniqueId)
  // are nominal wrappers over string — safe to cast here because the schema
  // already enforced the string constraint.
  // biome-ignore lint/suspicious/noExplicitAny: Zod output→PedagogyPack brand cast
  return result.data as unknown as PedagogyPack;
}

function defaultPackPath(): string {
  // __dirname equivalent for ESM: resolve relative to this compiled file.
  // In dev (praxis-source condition), import.meta.url points to the .ts file;
  // the relative path climbs out of src/pedagogy → src → (package root) →
  // sibling pedagogy/ directory.
  const dir = dirname(fileURLToPath(import.meta.url));
  return join(dir, "..", "..", "pedagogy", "v1.json");
}

// ─── test helper ──────────────────────────────────────────────────────────────

/**
 * Returns a no-op `PedagogyPackServiceImpl` that operates in empty-pack mode.
 * Use in test stubs where the pedagogy pack content is irrelevant to the test.
 */
export function makeEmptyPedagogyPackService(): PedagogyPackService {
  const noop: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => noop,
  };
  // Pass a path that will not exist so the service enters empty-pack mode
  // without touching the filesystem in unexpected ways.
  return new PedagogyPackServiceImpl({
    log: noop,
    packPath: "/dev/null/pedagogy-pack-does-not-exist.json",
  });
}
