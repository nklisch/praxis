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

/**
 * Fan out an event to a collection of subscribers with per-listener error
 * isolation. A throwing listener is logged with `${component}.listener_threw`
 * and does NOT prevent later listeners from receiving the event.
 *
 * Use inside a service's private `emit(event)` method to consolidate the
 * shared listener-loop scaffolding.
 */
export function notifyListeners<E>(
  listeners: Iterable<(event: E) => void>,
  event: E,
  log: Logger,
  component: string,
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      log.warn(`${component}.listener_threw`, { err: String(err) });
    }
  }
}
