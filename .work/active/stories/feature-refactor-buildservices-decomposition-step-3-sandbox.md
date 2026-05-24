---
id: feature-refactor-buildservices-decomposition-step-3-sandbox
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Extract `buildSandboxServices()`

## Brief

Extract the Python/JS sandbox construction block into
`packages/desktop/electron/main/services/build-sandbox-services.ts`.

These services form a coherent unit: `PyodideHost` → `PyodideSymPyService` +
`PyodideLanguageSandbox`; `QuickJsLanguageSandbox`; `CodeSandboxImpl` wrapping
both language sandboxes; the resulting `codeSandboxTool`. They have no dependencies
on other domain services or on `db`.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 217–226:

```ts
const pyodide = new PyodideHost({ packages: ["sympy"] });
const sympy = new PyodideSymPyService(pyodide);
const sandbox = new CodeSandboxImpl({
  adapters: [new QuickJsLanguageSandbox(), new PyodideLanguageSandbox(pyodide)],
});
const codeSandboxTool = createCodeSandboxTool(sandbox);
```

## Target state

New file `packages/desktop/electron/main/services/build-sandbox-services.ts`:

```ts
import { gradeMathTool, PyodideSymPyService } from "@praxis/tools/math";
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
  const sandbox = new CodeSandboxImpl({
    adapters: [new QuickJsLanguageSandbox(), new PyodideLanguageSandbox(pyodide)],
  });
  const codeSandboxTool = createCodeSandboxTool(sandbox);
  return { pyodide, sympy, sandbox, codeSandboxTool };
}
```

`buildServices()` calls `buildSandboxServices()` (no args) early, before DB construction
if desired (no ordering constraint with DB). `pyodide` is also returned in the final
`Services` object so main.ts can preload it — pass it through unchanged.

## Implementation notes

- No `log` parameter needed (none of these constructors require a logger).
- `codeSandboxTool` is added to `toolDefinitions` later in `buildServices()` — remains
  exactly the same after extraction; the value is just destructured from the factory result.
- `pyodide` is exposed on the top-level `Services` for preloading; wire it through by
  including it in the returned `Services` return value (already part of the destructure).

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `PyodideHost`, `PyodideSymPyService`,
  `CodeSandboxImpl`, `QuickJsLanguageSandbox`, `PyodideLanguageSandbox`, or calls
  `createCodeSandboxTool`.
- `buildSandboxServices` is the single construction site.

## Risk

Low — no side-effects at construction time (Pyodide WASM loads lazily on first call),
no inter-service dependencies.
Rollback: revert the new file and restore the four inline lines in `buildServices()`.

## Implementation notes

- Created `packages/desktop/electron/main/services/build-sandbox-services.ts` (27 lines).
- Omitted the unused `gradeMathTool` import that appeared in the story's target-state snippet — `gradeMathTool` is not constructed here; only the four sandbox-related values are returned.
- Retained the QuickJS comment from `services.ts` for context.
- `pnpm typecheck` and `pnpm --filter @praxis/desktop test` both pass (520 tests, 34 files).
