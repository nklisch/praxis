import type { Logger } from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import type { ToolBridgeHandle } from "../mcp/types.js";

/**
 * Close an optional tool bridge, swallowing errors with a warn log.
 * Used by adapter close() implementations to avoid duplicating the
 * try/catch shape per adapter.
 */
export async function closeBridgeIfPresent(
  bridge: ToolBridgeHandle | null | undefined,
  log: Logger,
  component: string,
): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.close();
  } catch (err) {
    log.warn(`${component}.tool_bridge_close_failed`, { err: serializeError(err) });
  }
}
