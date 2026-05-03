import type { Timestamp } from "./common.js";
import type { StudentId } from "./ids.js";

/** SHA-256 hex of the tldraw snapshot JSON. Content-addressed sketch identity. */
export type SketchId = string & { readonly __brand: "SketchId" };

export interface SketchSummary {
  readonly id: SketchId;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Timestamp;
}

export interface Sketch extends SketchSummary {
  /** The tldraw snapshot JSON, parsed. Opaque to core — consumers treat as unknown. */
  readonly snapshot: unknown;
  /** PNG bytes of the rendered drawing. */
  readonly image: Buffer;
}

export interface SketchService {
  /**
   * Idempotent upload. Computes id = sha256(JSON.stringify(snapshot)); returns
   * existing summary if already stored. PNG bytes are written to the FsSketchStore.
   */
  put(input: {
    studentId: StudentId;
    snapshot: unknown;
    image: Buffer;
    width: number;
    height: number;
  }): Promise<SketchSummary>;

  /** Read full sketch (snapshot + image bytes). Throws if id is unknown. */
  get(sketchId: SketchId): Promise<Sketch>;

  /** Read summary only — no image bytes. Returns null if id is unknown; never throws. */
  getSummary(sketchId: SketchId): Promise<SketchSummary | null>;
}
