import { PyodideSymPyService } from "@praxis/tools/math";
import {
  PyodideHost,
  PyodideLanguageSandbox,
  QuickJsLanguageSandbox,
} from "@praxis/tools/runtime";
import { CodeSandboxImpl, createCodeSandboxTool } from "@praxis/tools/sandbox";

export interface SandboxServices {
  pyodide: PyodideHost;
  sympy: PyodideSymPyService;
  sandbox: CodeSandboxImpl;
  codeSandboxTool: ReturnType<typeof createCodeSandboxTool>;
}

export function buildSandboxServices(): SandboxServices {
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const sympy = new PyodideSymPyService(pyodide);
  // QuickJS (WASM) replaces isolated-vm for JavaScript. No native binding,
  // no ABI dance, no forked worker needed. Each run() creates a fresh
  // QuickJSRuntime + Context (~2-5ms) — same cost order as before.
  const sandbox = new CodeSandboxImpl({
    adapters: [new QuickJsLanguageSandbox(), new PyodideLanguageSandbox(pyodide)],
  });
  const codeSandboxTool = createCodeSandboxTool(sandbox);
  return { pyodide, sympy, sandbox, codeSandboxTool };
}
