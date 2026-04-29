import { openDb } from "@praxis/core/db";
import type { ServiceDeps } from "@praxis/core/services";
import { ConfigServiceImpl, SessionServiceImpl } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
import { IsolatedVmHost, PyodideHost } from "@praxis/tools/runtime";
import { codeSandboxTool, LocalCodeSandbox } from "@praxis/tools/sandbox";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  pyodide: PyodideHost; // exposed so main can preload it
}

export function buildServices(dbPath: string): Services {
  const { db } = openDb({ path: dbPath });

  const log = {
    debug: (msg: string, meta?: object) => console.debug("[praxis]", msg, meta ?? ""),
    info: (msg: string, meta?: object) => console.info("[praxis]", msg, meta ?? ""),
    warn: (msg: string, meta?: object) => console.warn("[praxis]", msg, meta ?? ""),
    error: (msg: string, meta?: object) => console.error("[praxis]", msg, meta ?? ""),
  };

  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const jsHost = new IsolatedVmHost();
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(jsHost, pyodide);

  const modes = new Map([[teachMode.id, teachMode]]);
  const toolDefinitions = [gradeMathTool, codeSandboxTool];

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
    toolServices: { sympy, sandbox },
  };

  return {
    session: new SessionServiceImpl(deps),
    config: new ConfigServiceImpl(deps),
    pyodide,
  };
}
