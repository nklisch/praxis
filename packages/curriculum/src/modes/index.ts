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
