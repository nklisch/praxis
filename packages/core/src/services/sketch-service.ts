import { createHash } from "node:crypto";
import { sketches } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type { SketchStore } from "../sketch/index.js";
import type {
  Logger,
  Sketch,
  SketchId,
  SketchService,
  SketchSummary,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface SketchServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly store: SketchStore;
}

type SketchRow = typeof sketches.$inferSelect;

function rowToSummary(row: SketchRow): SketchSummary {
  return {
    id: brandId<"SketchId">(row.id),
    width: row.width,
    height: row.height,
    createdAt: (row.createdAt instanceof Date
      ? row.createdAt.getTime()
      : row.createdAt) as Timestamp,
  };
}

export class SketchServiceImpl implements SketchService {
  constructor(private readonly deps: SketchServiceDeps) {}

  async put(input: {
    studentId: StudentId;
    snapshot: unknown;
    image: Buffer;
    width: number;
    height: number;
  }): Promise<SketchSummary> {
    const snapshotJson = JSON.stringify(input.snapshot);
    const id = createHash("sha256").update(snapshotJson).digest("hex");

    // Idempotent: if row already exists, return its summary without writing again.
    const existing = this.deps.db.select().from(sketches).where(eq(sketches.id, id)).get();
    if (existing) {
      return rowToSummary(existing);
    }

    // Persist the PNG to the filesystem store.
    const imagePath = await this.deps.store.put(id, input.image);

    // Persist the metadata row.
    const now = new Date();
    this.deps.db
      .insert(sketches)
      .values({
        id,
        studentId: input.studentId,
        snapshotJson: input.snapshot,
        imagePath,
        width: input.width,
        height: input.height,
        createdAt: now,
      })
      .run();

    return {
      id: brandId<"SketchId">(id),
      width: input.width,
      height: input.height,
      createdAt: now.getTime() as Timestamp,
    };
  }

  async get(sketchId: SketchId): Promise<Sketch> {
    const row = this.deps.db.select().from(sketches).where(eq(sketches.id, sketchId)).get();
    if (!row) {
      throw new Error(`SketchService.get: sketch not found: ${sketchId}`);
    }

    const image = await this.deps.store.get(row.imagePath);

    return {
      ...rowToSummary(row),
      snapshot: row.snapshotJson,
      image,
    };
  }

  async getSummary(sketchId: SketchId): Promise<SketchSummary | null> {
    try {
      const row = this.deps.db.select().from(sketches).where(eq(sketches.id, sketchId)).get();
      return row ? rowToSummary(row) : null;
    } catch {
      // getSummary never throws — return null on any unexpected error.
      return null;
    }
  }
}
