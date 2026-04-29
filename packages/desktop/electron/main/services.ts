import { openDb } from "@praxis/core/db";
import type { ServiceDeps } from "@praxis/core/services";
import { ConfigServiceImpl, SessionServiceImpl } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { echoTool, nowTool } from "@praxis/tools/test-tools";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
}

export function buildServices(dbPath: string): Services {
  const { db } = openDb({ path: dbPath });

  const log = {
    debug: (msg: string, meta?: object) => console.debug("[praxis]", msg, meta ?? ""),
    info: (msg: string, meta?: object) => console.info("[praxis]", msg, meta ?? ""),
    warn: (msg: string, meta?: object) => console.warn("[praxis]", msg, meta ?? ""),
    error: (msg: string, meta?: object) => console.error("[praxis]", msg, meta ?? ""),
  };

  const modes = new Map([[teachMode.id, teachMode]]);
  const toolDefinitions = [echoTool, nowTool];

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
  };

  return {
    session: new SessionServiceImpl(deps),
    config: new ConfigServiceImpl(deps),
  };
}
