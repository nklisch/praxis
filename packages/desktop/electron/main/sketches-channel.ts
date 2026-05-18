import type { Logger, SketchId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the sketches service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.sketches.put        — saves a sketch (image encoded as base64)
 *   praxis.sketches.get        — returns sketch with image as base64
 *   praxis.sketches.getSummary — returns sketch summary metadata
 */
export function registerSketchesHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  const sketchPutSchema = z.object({
    snapshot: z.unknown(),
    imageBase64: z.string().min(1, "imageBase64"),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  });

  handle(
    "praxis.sketches.put",
    handleEnvelope("praxis.sketches.put", log, sketchPutSchema, async (opts) => {
      const studentId = getStudentId(services);
      const image = Buffer.from(opts.imageBase64, "base64");
      return services.sketches.put({
        studentId,
        snapshot: opts.snapshot,
        image,
        width: opts.width,
        height: opts.height,
      });
    }),
  );

  const sketchIdSchema = z.string().min(1, "sketchId");

  handle(
    "praxis.sketches.get",
    handleEnvelope("praxis.sketches.get", log, sketchIdSchema, async (sketchId) => {
      const sketch = await services.sketches.get(sketchId as SketchId);
      // Encode image as base64 for IPC transport — Electron IPC can't send raw Buffers reliably.
      return {
        id: sketch.id,
        snapshot: sketch.snapshot,
        width: sketch.width,
        height: sketch.height,
        createdAt: sketch.createdAt,
        imageBase64: sketch.image.toString("base64"),
      };
    }),
  );

  handle(
    "praxis.sketches.getSummary",
    handleEnvelope("praxis.sketches.getSummary", log, sketchIdSchema, async (sketchId) => {
      return services.sketches.getSummary(sketchId as SketchId);
    }),
  );
}
