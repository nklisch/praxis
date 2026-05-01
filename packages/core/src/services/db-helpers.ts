import type { Logger } from "../types/index.js";

/**
 * Read a row that was just written, throwing with consistent context if it
 * comes back null. Use after `db.insert(...).run()` or `db.update(...).run()`
 * to round-trip the persisted state. Optional logger emits a "ghost-write"
 * warning when the row is missing — a signal that something went seriously
 * wrong with the write.
 */
export async function loadOrThrow<T>(
  fetch: () => Promise<T | null>,
  ctx: {
    entity: string;
    op: "create" | "update" | "delete" | "review" | "override";
    id: string;
    log?: Logger;
  },
): Promise<T> {
  const row = await fetch();
  if (row === null) {
    ctx.log?.warn("ghost-write detected", {
      entity: ctx.entity,
      op: ctx.op,
      id: ctx.id,
    });
    throw new Error(`${ctx.entity} not found after ${ctx.op}: ${ctx.id}`);
  }
  return row;
}
