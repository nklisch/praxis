# Design: Phase 4 — Verification Tools (Math + Code Sandbox)

## Overview

Phase 4 gives the tutor its first real grounding tools: `grade_math` (symbolic math via sympy in Pyodide) and `code_sandbox` (JS via `isolated-vm`, Python via Pyodide). Both run **in-process** in the Electron main process — no Python install required, no remote services, no API keys for sandboxing. Tools register with the `teach` mode and dispatch through every engine adapter via the existing MCP bridge / Vercel `tool({execute})` paths.

This is also where Phase 1's placeholder `ToolServices` fields (`sympy`, `sandbox`) become concrete. We add `SymPyService` and `CodeSandbox` interfaces to `@praxis/core/types`, populate them in `ServiceDeps`, and `SessionServiceImpl` threads them into every `ToolContext` so tool handlers call `ctx.services.sympy.solveEquation(...)` directly.

After Phase 4: ask the tutor "is `2x + 5 = 11` solved by x = 4?" → it calls `grade_math` → gets `{ correct: false, expectedSolutions: ["3"] }` → explains. The same exchange works against any of the three engines because tool dispatch is engine-agnostic (Phase 2 contract).

**What ships:**

- `SymPyService` and `CodeSandbox` interfaces in `@praxis/core/types/tool.ts`; `ToolServices.sympy`/`.sandbox` typed concretely
- `ServiceDeps.toolServices: { sympy, sandbox }` populated by the desktop host
- `SessionServiceImpl` filters `toolDefinitions` by `mode.toolNames` and populates `ToolContext.services` from `deps.toolServices`
- `@praxis/tools/runtime/pyodide-host.ts` — singleton lazy-loaded Pyodide instance with sympy package
- `@praxis/tools/runtime/isolated-vm-host.ts` — `isolated-vm` wrapper with timeout + output capture
- `@praxis/tools/math/sympy-service.ts` — `PyodideSymPyService` implements `SymPyService`
- `@praxis/tools/sandbox/sandbox-service.ts` — `LocalCodeSandbox` implements `CodeSandbox` (JS via isolated-vm, Python via Pyodide)
- `@praxis/tools/math/grade-math.ts` — `gradeMathTool` ToolDefinition (discriminated union: `check_solution` | `solve_equation` | `simplify` | `check_equivalent`)
- `@praxis/tools/sandbox/code-sandbox.ts` — `codeSandboxTool` ToolDefinition
- `@praxis/tools/math/latex-verify.ts` — verification round-trip helper (parse LaTeX, normalize, validate equivalence)
- `teach` mode updated: `toolNames: ["grade_math", "code_sandbox"]`; new postamble-tool prompt fragment briefly describing the two tools
- Desktop service wiring: construct `PyodideHost` + `IsolatedVmHost` + `LocalCodeSandbox` + `PyodideSymPyService`; register `gradeMathTool` + `codeSandboxTool`
- `scripts/run-session.ts` updated: registers the production tools (drops echo/now from the production path)
- Tests: per-tool unit tests with mock services; one integration test with real Pyodide marked slow

**What does not ship (later phases):**

- Vision OCR for handwritten math (Phase 13) — `latex-verify` exposes the helper but no vision integration yet
- Tool-call rendering in the chat UI (currently silent in Phase 3; UI improvements deferred)
- `code_sandbox` student-injected hardening (Phase 8 when submissions land — escalation path documented below)
- Per-tool effects-based audit logging (Phase 7+)
- Real Marker ingestion via separate Python subprocess (Phase 5)

## Scope and assumptions

- **Pyodide is the Python runtime.** Single npm package (`pyodide`), loaded once into the Electron main process, used for both sympy (grade_math) and code_sandbox Python. No system Python required. Cold load ~3-5 seconds; subsequent calls are fast. Loaded eagerly at app startup so the first tool call has no perceived latency.
- **`isolated-vm` is the JS runtime** for `code_sandbox`. Active maintenance as of April 2026 (v6.1.x). True V8 isolate boundary — guest code has no access to `require`, `fs`, `net`, `process`, etc. unless host explicitly bridges. CPU timeout via `script.run({ timeout })`. Memory cap via `memoryLimit`.
- **`isolated-vm` requires native build for Electron.** Add `@electron/rebuild` as a postinstall in `@praxis/desktop` so the native binding rebuilds against Electron's Node ABI. Prebuilts cover macOS ARM64, Linux x64/ARM64/musl, Windows x64.
- **Threat model**: tutor-controlled code. The agent decides what code to run (math grading, demonstration code). The student doesn't directly inject code in Phase 4 (that comes with submissions in Phase 8). So the threat is "agent hallucinates a bad expression / infinite loop / accidental fs write" — both Pyodide and isolated-vm fully prevent that by design. **Phase 8 escalation path documented**: if student-injected code becomes a use case, evaluate `node --permission` subprocess (Node 24 stable) or Deno sidecar.
- **Per-tool DI via `ToolContext.services`** (per the agreed contract update). Tool handlers call `ctx.services.sympy.checkSolution(...)` and `ctx.services.sandbox.run(...)`. No factory functions; tools are plain `ToolDefinition`s.
- **Mode-based tool filtering**: `SessionServiceImpl` filters `deps.toolDefinitions` by `mode.toolNames` before constructing `InProcessToolRegistry`. This was effectively skipped in Phase 3 (all tools always registered); Phase 4 enforces the mode contract properly.
- **No Python sidecar package in Phase 4.** Pyodide is an npm dep; nothing lives in `python/`. Phase 5 will introduce `python/praxis-cli/` (or whatever name) for Marker because Marker is too heavy for Pyodide.
- **Tool result tier**: both `grade_math` and `code_sandbox` are `tier: "deterministic"` per CONTRACT — sympy's symbolic computation is mathematically certain, code execution is algorithmically certain per input. Effects: `["external.code-exec"]` for both.
- **Pyodide timeout caveat**: Pyodide has no built-in CPU timeout; we wrap calls in `Promise.race(call, timeoutPromise)`. A timed-out call's Python keeps running until it hits a checkpoint. Acceptable for Phase 4 (tutor-controlled code); a future improvement uses Pyodide's interrupt buffer (`setInterruptBuffer` + `SharedArrayBuffer`) for real interruption.

## Dependency direction (Phase 4)

No new direction violations. The new pieces:

```
@praxis/tools                               (Phase 4 additions)
  ├─ runtime: pyodide, isolated-vm, zod
  └─ type-only: @praxis/core/types          (existing)

@praxis/core/types/tool.ts                  (Phase 4 additions)
  └─ adds SymPyService + CodeSandbox interfaces (no new deps)

@praxis/core/services                       (Phase 4 additions)
  └─ ServiceDeps.toolServices populated; SessionServiceImpl reads it
     (still in the Phase 3 dependency exception — unchanged)

@praxis/desktop/electron/main/services.ts   (Phase 4 additions)
  └─ runtime: @praxis/tools (already imported in Phase 3 for test-tools)
     constructs PyodideHost + IsolatedVmHost + services + tools

@praxis/curriculum/modes/teach.ts           (Phase 4 additions)
  └─ toolNames: ["grade_math", "code_sandbox"]
     postamble fragment describes the two tools to the agent
```

---

## Implementation Units

### Unit 1: Type contract additions for tool services

**File**: `packages/core/src/types/tool.ts` (modified)

Replace the loose `unknown` placeholders for `sympy` and `sandbox` with concrete interfaces. Other Phase placeholders stay `unknown` until their phase lands.

```typescript
import type { z } from "zod";
import type { Logger } from "./common.js";
import type { SessionId, StudentId } from "./ids.js";

export type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  input: I;
  output: O;
  tier: "deterministic" | "grounded" | "model-derived";
  effects: ReadonlyArray<EffectKind>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  memory: unknown;       // → Phase 7
  artifacts: unknown;    // → Phase 6
  vectorStore: unknown;  // → Phase 5
  sandbox: CodeSandbox;  // ← Phase 4
  sympy: SymPyService;   // ← Phase 4
  pedagogyPack: unknown; // → Phase 14
}

// ─── SymPyService ────────────────────────────────────────────────────────────

export interface SymPyService {
  /**
   * Check whether a proposed value satisfies an equation.
   * Returns the actual solution(s) for context regardless of correctness.
   */
  checkSolution(input: SymPyCheckSolutionInput): Promise<SymPyCheckSolutionResult>;

  /** Solve an equation for one variable; return all solutions (real + complex). */
  solveEquation(input: SymPySolveEquationInput): Promise<SymPySolveEquationResult>;

  /** Algebraic simplification of an expression. */
  simplify(input: SymPySimplifyInput): Promise<SymPySimplifyResult>;

  /** Check whether two expressions are mathematically equivalent. */
  checkEquivalent(input: SymPyCheckEquivalentInput): Promise<SymPyCheckEquivalentResult>;

  /**
   * Parse a LaTeX expression into sympy-canonical form. Returns the parsed
   * sympy expression as a string and a normalized LaTeX rendering. Used by
   * the verification round-trip helper.
   */
  parseLatex(input: SymPyParseLatexInput): Promise<SymPyParseLatexResult>;
}

export interface SymPyCheckSolutionInput {
  /** Equation in standard math notation, e.g. "2*x + 5 = 11" or LaTeX "2x + 5 = 11". */
  equation: string;
  variable: string;
  proposedValue: string;
  /** When true, treat `equation` as LaTeX; otherwise sympy-style infix. Default: false. */
  isLatex?: boolean;
}

export interface SymPyCheckSolutionResult {
  correct: boolean;
  proposedValue: string;
  expectedSolutions: string[];
  /** When the parser couldn't read the input cleanly. */
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySolveEquationInput {
  equation: string;
  variable: string;
  isLatex?: boolean;
}

export interface SymPySolveEquationResult {
  solutions: string[];
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPySimplifyInput {
  expression: string;
  isLatex?: boolean;
}

export interface SymPySimplifyResult {
  simplified: string;
  /** LaTeX rendering of the simplified form. */
  simplifiedLatex: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyCheckEquivalentInput {
  expression1: string;
  expression2: string;
  isLatex?: boolean;
}

export interface SymPyCheckEquivalentResult {
  equivalent: boolean;
  /** sympy expression form of (expression1 - expression2) simplified — useful for diagnostics. */
  difference?: string;
  needsHumanReview?: boolean;
  parseError?: string;
}

export interface SymPyParseLatexInput {
  latex: string;
}

export interface SymPyParseLatexResult {
  /** The parsed sympy expression as a string (e.g. "2*x + 5"). */
  sympyExpression: string;
  /** Normalized LaTeX rendering (sympy's LaTeX printer output). */
  normalizedLatex: string;
  parseError?: string;
}

// ─── CodeSandbox ─────────────────────────────────────────────────────────────

export interface CodeSandbox {
  run(input: CodeSandboxInput): Promise<CodeSandboxResult>;
}

export interface CodeSandboxInput {
  language: "javascript" | "python";
  code: string;
  /** Optional stdin string. Only meaningful for Python; ignored for JS. */
  stdin?: string;
  /** Wall-clock timeout. Default: 5000ms. Max enforced: 30000ms. */
  timeoutMs?: number;
  /** Memory cap for JS (isolated-vm). Default 128MB. Ignored for Python. */
  memoryLimitMb?: number;
}

export interface CodeSandboxResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout or crash); other = explicit exit code (rare). */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Set when stdout or stderr was truncated to fit the output limit (default 1MB each). */
  truncated?: { stdout: boolean; stderr: boolean };
}
```

**Implementation Notes**:
- All result types include optional `needsHumanReview` and `parseError` — when sympy can't parse the input cleanly, the tool returns these instead of a confident answer. The agent then reads the error and either retries with corrected input or surfaces "I couldn't parse that expression — could you double-check?" to the student.
- `SymPyCheckEquivalentResult.difference` is for diagnostics — when `equivalent: false`, the agent can show the student "the two expressions differ by X". Phase 4 may leave this undefined; future polish.
- `CodeSandboxResult.truncated` is informational so the agent can tell the student "your script printed too much; here are the first 1MB of stdout".
- The contract addition is **purely additive** — existing code referencing `ToolServices.sympy` (typed `unknown`) gets a stricter type, but no existing code dereferences it (Phase 4 is the first consumer).

**Acceptance Criteria**:
- [ ] `SymPyService` and `CodeSandbox` interfaces compile with all listed methods.
- [ ] `ToolServices.sympy: SymPyService` and `ToolServices.sandbox: CodeSandbox` typecheck.
- [ ] Existing Phase 1-3 code that references `ToolServices` (only `SessionServiceImpl` so far, where it builds an empty placeholder) typechecks unchanged.

---

### Unit 2: `PyodideHost` — singleton lazy-loaded Pyodide

**Files**:
- `packages/tools/src/runtime/pyodide-host.ts` (new)
- `packages/tools/src/runtime/__tests__/pyodide-host.test.ts` (new — minimal; real Pyodide load is integration-tested separately)

**`packages/tools/src/runtime/pyodide-host.ts`**:

```typescript
import type { PyodideInterface } from "pyodide";
import { loadPyodide } from "pyodide";

export interface PyodideHostOptions {
  /** Packages to preload. Defaults to ["sympy"]. */
  packages?: string[];
  /** Override pyodide's indexURL — useful for tests pointing at a fixture. */
  indexURL?: string;
}

/**
 * Singleton manager for a Pyodide interpreter loaded into this Node process.
 * Loads lazily on first `get()`. Subsequent calls return the same instance.
 *
 * Thread-safety / concurrency: Pyodide runs on the host's JS event loop —
 * concurrent `runPythonAsync` calls are serialized by Pyodide itself.
 * Callers that need parallelism should not expect it from a single host.
 */
export class PyodideHost {
  private instance: PyodideInterface | null = null;
  private loadPromise: Promise<PyodideInterface> | null = null;
  private readonly packages: string[];
  private readonly indexURL: string | undefined;

  constructor(opts: PyodideHostOptions = {}) {
    this.packages = opts.packages ?? ["sympy"];
    if (opts.indexURL !== undefined) this.indexURL = opts.indexURL;
  }

  /** Return the Pyodide instance, loading it on first call. */
  async get(): Promise<PyodideInterface> {
    if (this.instance) return this.instance;
    if (!this.loadPromise) {
      this.loadPromise = this.loadInternal();
    }
    this.instance = await this.loadPromise;
    return this.instance;
  }

  /** Eagerly load — call from app startup so the first tool call has no latency. */
  async preload(): Promise<void> {
    await this.get();
  }

  private async loadInternal(): Promise<PyodideInterface> {
    const py = await loadPyodide(
      this.indexURL !== undefined ? { indexURL: this.indexURL } : undefined,
    );
    if (this.packages.length > 0) {
      await py.loadPackage(this.packages);
    }
    return py;
  }

  /**
   * Run Python with a wall-clock timeout. Output goes to the supplied buffers
   * via Pyodide's setStdout/setStderr. Note: timeout via Promise.race does NOT
   * actually interrupt the running Python — the Python keeps running until the
   * next checkpoint. Accept this for Phase 4 (tutor-controlled inputs).
   */
  async runPython(opts: PyodideRunOptions): Promise<PyodideRunResult> {
    const py = await this.get();
    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];
    py.setStdout({ batched: (s) => stdoutBuffer.push(s) });
    py.setStderr({ batched: (s) => stderrBuffer.push(s) });

    const start = Date.now();
    let timedOut = false;

    try {
      await Promise.race([
        py.runPythonAsync(opts.code),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new PyodideTimeoutError(`Python execution exceeded ${opts.timeoutMs}ms`));
          }, opts.timeoutMs),
        ),
      ]);
      return {
        stdout: stdoutBuffer.join(""),
        stderr: stderrBuffer.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
      };
    } catch (err) {
      if (timedOut || err instanceof PyodideTimeoutError) {
        return {
          stdout: stdoutBuffer.join(""),
          stderr: stderrBuffer.join(""),
          durationMs: Date.now() - start,
          timedOut: true,
        };
      }
      // Python error — Pyodide writes the traceback to stderr already.
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        stdout: stdoutBuffer.join(""),
        stderr: `${stderrBuffer.join("")}\n${errMsg}`,
        durationMs: Date.now() - start,
        timedOut: false,
        pythonError: errMsg,
      };
    } finally {
      py.setStdout({});
      py.setStderr({});
    }
  }
}

export interface PyodideRunOptions {
  code: string;
  timeoutMs: number;
}

export interface PyodideRunResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  pythonError?: string;
}

export class PyodideTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PyodideTimeoutError";
  }
}
```

**Implementation Notes**:
- Single instance per Node process. The desktop main process owns one. `SessionServiceImpl` doesn't construct it — it receives it via `ServiceDeps.toolServices.sympy` (which holds a reference to the host).
- `preload()` is a fire-and-forget call from desktop's `app.whenReady()` so the user's first session doesn't pay the cold-start cost.
- `runPython` resets stdout/stderr handlers on each call so concurrent callers (which Pyodide serializes anyway) don't cross-contaminate buffers. This is defensive; in practice, `await runPython` is the usage.
- The `pythonError` field on `PyodideRunResult` is set when Python raises an exception. Distinct from `timedOut`.

**Acceptance Criteria**:
- [ ] `new PyodideHost()` doesn't load anything — instance is `null`.
- [ ] `host.get()` triggers load on first call; subsequent calls return the cached instance.
- [ ] `host.preload()` is equivalent to `await host.get()`.
- [ ] Concurrent `host.get()` calls share the same load promise (don't double-load).
- [ ] `host.runPython({ code: "print(1+1)", timeoutMs: 5000 })` returns `{ stdout: "2\n", ... timedOut: false }` (integration test, slow).
- [ ] `host.runPython({ code: "while True: pass", timeoutMs: 100 })` returns `timedOut: true`.

---

### Unit 3: `IsolatedVmHost` — `isolated-vm` wrapper for JS execution

**Files**:
- `packages/tools/src/runtime/isolated-vm-host.ts` (new)
- `packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts` (new — full unit tests; isolated-vm doesn't need preload)

```typescript
import ivm from "isolated-vm";

export interface IsolatedVmRunOptions {
  code: string;
  timeoutMs: number;
  memoryLimitMb: number;
  /** Max bytes to capture from stdout/stderr each. Default 1_000_000 (1MB). */
  outputLimitBytes?: number;
}

export interface IsolatedVmRunResult {
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
  truncated: { stdout: boolean; stderr: boolean };
  /** Caught error from guest code (uncaught exceptions). Distinct from timeout. */
  guestError?: string;
}

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

/**
 * Execute JS code in a fresh V8 isolate. Each call creates a new Isolate +
 * Context — cheap (~2-5ms per call). Exposes only `console.{log,error,warn}`
 * to the guest; no `require`, `process`, `fs`, `net`, `fetch`, `globalThis.*`
 * beyond the supplied console.
 *
 * Console output is captured via a host-side reference function. Stdout =
 * console.log + console.warn; stderr = console.error.
 */
export class IsolatedVmHost {
  async run(opts: IsolatedVmRunOptions): Promise<IsolatedVmRunResult> {
    const limit = opts.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;

    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const truncated = { stdout: false, stderr: false };

    const isolate = new ivm.Isolate({ memoryLimit: opts.memoryLimitMb });
    let context: ivm.Context | null = null;

    const start = Date.now();
    try {
      context = await isolate.createContext();
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Bridge console to host buffers via reference function.
      const logFn = new ivm.Reference((...args: unknown[]) => {
        const line = `${args.map(stringifyForLog).join(" ")}\n`;
        const bytes = Buffer.byteLength(line, "utf8");
        if (stdoutBytes + bytes > limit) {
          truncated.stdout = true;
          return;
        }
        stdoutBytes += bytes;
        stdoutChunks.push(line);
      });
      const errFn = new ivm.Reference((...args: unknown[]) => {
        const line = `${args.map(stringifyForLog).join(" ")}\n`;
        const bytes = Buffer.byteLength(line, "utf8");
        if (stderrBytes + bytes > limit) {
          truncated.stderr = true;
          return;
        }
        stderrBytes += bytes;
        stderrChunks.push(line);
      });
      await jail.set("__praxisLog", logFn);
      await jail.set("__praxisErr", errFn);

      const setupScript = `
        const console = {
          log: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          warn: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          error: (...args) => __praxisErr.applySync(undefined, args, { arguments: { copy: true } }),
          info: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
          debug: (...args) => __praxisLog.applySync(undefined, args, { arguments: { copy: true } }),
        };
      `;
      const setupCompiled = await isolate.compileScript(setupScript);
      await setupCompiled.run(context);

      const userCompiled = await isolate.compileScript(opts.code);
      await userCompiled.run(context, { timeout: opts.timeoutMs });

      return {
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
        exitCode: 0,
        truncated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // isolated-vm throws "Script execution timed out" on timeout.
      if (message.includes("Script execution timed out")) {
        return {
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          durationMs: Date.now() - start,
          timedOut: true,
          exitCode: null,
          truncated,
        };
      }
      return {
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        durationMs: Date.now() - start,
        timedOut: false,
        exitCode: 1,
        truncated,
        guestError: message,
      };
    } finally {
      if (context) {
        try { context.release(); } catch { /* ignore */ }
      }
      try { isolate.dispose(); } catch { /* ignore */ }
    }
  }
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
```

**Implementation Notes**:
- A **fresh isolate per call** is intentional — guarantees zero state leakage between calls. Isolate creation is cheap (~2-5ms).
- Only `console.{log,warn,error,info,debug}` is bridged into the guest. No `require`, `import`, `process`, `globalThis.fetch`, etc. The guest cannot access the host's filesystem or network even by accident.
- Output capture uses `ivm.Reference` so the host function is callable from inside the isolate. `applySync` with `{ arguments: { copy: true } }` deep-copies arguments into the host context — necessary because the isolate's V8 references can't escape directly.
- `outputLimitBytes` defaults to 1MB. When exceeded, output is truncated and `truncated.stdout/stderr` flips. Keeps a runaway loop from filling Node's heap.
- Memory limit (`memoryLimit` option on Isolate) is enforced by V8 — guest hits the cap, isolate is terminated.

**Acceptance Criteria**:
- [ ] `host.run({ code: "console.log(1+1)", timeoutMs: 1000, memoryLimitMb: 128 })` returns `{ stdout: "2\n", exitCode: 0, ... }`.
- [ ] `console.error("nope")` writes to stderr.
- [ ] Code throwing an uncaught exception sets `exitCode: 1`, `guestError: <message>`, no `timedOut`.
- [ ] `code: "while(true){}"` with `timeoutMs: 100` returns `timedOut: true, exitCode: null` within ~150ms.
- [ ] Code attempting `require("fs")` throws ReferenceError inside the guest (asserted via captured stderr).
- [ ] Code attempting `process.exit()` throws ReferenceError (no `process` in guest).
- [ ] 2MB of `console.log("x".repeat(2_000_000))` truncates and sets `truncated.stdout: true`.

---

### Unit 4: `PyodideSymPyService` — `SymPyService` impl

**Files**:
- `packages/tools/src/math/sympy-service.ts` (new)
- `packages/tools/src/math/__tests__/sympy-service.test.ts` (new — uses real Pyodide; slow tag)

The service holds a `PyodideHost` and serializes sympy operations into Python scripts that print JSON to stdout. The TS side parses the JSON and returns typed results.

```typescript
import type {
  SymPyCheckEquivalentInput,
  SymPyCheckEquivalentResult,
  SymPyCheckSolutionInput,
  SymPyCheckSolutionResult,
  SymPyParseLatexInput,
  SymPyParseLatexResult,
  SymPyService,
  SymPySimplifyInput,
  SymPySimplifyResult,
  SymPySolveEquationInput,
  SymPySolveEquationResult,
} from "@praxis/core/types";
import type { PyodideHost } from "../runtime/pyodide-host.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class PyodideSymPyService implements SymPyService {
  constructor(private readonly host: PyodideHost) {}

  async checkSolution(input: SymPyCheckSolutionInput): Promise<SymPyCheckSolutionResult> {
    const code = buildScript("check_solution", {
      equation: input.equation,
      variable: input.variable,
      proposed_value: input.proposedValue,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "check_solution") as SymPyCheckSolutionResult;
  }

  async solveEquation(input: SymPySolveEquationInput): Promise<SymPySolveEquationResult> {
    const code = buildScript("solve_equation", {
      equation: input.equation,
      variable: input.variable,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "solve_equation") as SymPySolveEquationResult;
  }

  async simplify(input: SymPySimplifyInput): Promise<SymPySimplifyResult> {
    const code = buildScript("simplify", {
      expression: input.expression,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "simplify") as SymPySimplifyResult;
  }

  async checkEquivalent(input: SymPyCheckEquivalentInput): Promise<SymPyCheckEquivalentResult> {
    const code = buildScript("check_equivalent", {
      expression1: input.expression1,
      expression2: input.expression2,
      is_latex: input.isLatex ?? false,
    });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "check_equivalent") as SymPyCheckEquivalentResult;
  }

  async parseLatex(input: SymPyParseLatexInput): Promise<SymPyParseLatexResult> {
    const code = buildScript("parse_latex", { latex: input.latex });
    const result = await this.host.runPython({ code, timeoutMs: DEFAULT_TIMEOUT_MS });
    return parseScriptResult(result, "parse_latex") as SymPyParseLatexResult;
  }
}

/**
 * Build a Python script that imports sympy, dispatches to the requested op,
 * and prints a JSON result to stdout. The TS side captures stdout and parses.
 *
 * This generator is intentionally small and deterministic — every op gets the
 * same boilerplate so the TS parser knows the contract. Args are interpolated
 * via JSON encoding (no shell injection risk because there's no shell).
 */
function buildScript(op: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  return `
import json
import sympy
from sympy.parsing.sympy_parser import parse_expr

ARGS = json.loads(${JSON.stringify(argsJson)})

def parse_input_expr(s, is_latex):
    if is_latex:
        from sympy.parsing.latex import parse_latex as _pl
        return _pl(s)
    return parse_expr(s, transformations="all")

def parse_equation(s, is_latex):
    if "=" in s and not is_latex:
        lhs, rhs = s.split("=", 1)
        return sympy.Eq(parse_input_expr(lhs, False), parse_input_expr(rhs, False))
    if is_latex:
        return parse_input_expr(s, True)
    return sympy.Eq(parse_input_expr(s, False), 0)

def op_check_solution(args):
    eq = parse_equation(args["equation"], args["is_latex"])
    var = sympy.Symbol(args["variable"])
    proposed = parse_input_expr(args["proposed_value"], False)
    sols = sympy.solve(eq, var)
    sol_strs = [str(s) for s in sols]
    correct = any(sympy.simplify(s - proposed) == 0 for s in sols)
    return {
        "correct": correct,
        "proposedValue": str(proposed),
        "expectedSolutions": sol_strs,
    }

def op_solve_equation(args):
    eq = parse_equation(args["equation"], args["is_latex"])
    var = sympy.Symbol(args["variable"])
    sols = sympy.solve(eq, var)
    return {"solutions": [str(s) for s in sols]}

def op_simplify(args):
    expr = parse_input_expr(args["expression"], args["is_latex"])
    s = sympy.simplify(expr)
    return {"simplified": str(s), "simplifiedLatex": sympy.latex(s)}

def op_check_equivalent(args):
    e1 = parse_input_expr(args["expression1"], args["is_latex"])
    e2 = parse_input_expr(args["expression2"], args["is_latex"])
    diff = sympy.simplify(e1 - e2)
    return {"equivalent": diff == 0, "difference": str(diff)}

def op_parse_latex(args):
    expr = parse_input_expr(args["latex"], True)
    return {
        "sympyExpression": str(expr),
        "normalizedLatex": sympy.latex(expr),
    }

OPS = {
    "check_solution": op_check_solution,
    "solve_equation": op_solve_equation,
    "simplify": op_simplify,
    "check_equivalent": op_check_equivalent,
    "parse_latex": op_parse_latex,
}

try:
    out = OPS[${JSON.stringify(op)}](ARGS)
    print(json.dumps({"ok": True, "result": out}))
except Exception as e:
    print(json.dumps({"ok": False, "error": {"type": type(e).__name__, "message": str(e)}}))
`.trim();
}

interface ScriptOk { ok: true; result: Record<string, unknown> }
interface ScriptErr { ok: false; error: { type: string; message: string } }

function parseScriptResult(
  pyResult: { stdout: string; stderr: string; timedOut: boolean; pythonError?: string },
  op: string,
): Record<string, unknown> {
  if (pyResult.timedOut) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `sympy ${op} timed out`,
    };
  }
  if (pyResult.pythonError) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: pyResult.pythonError,
    };
  }
  const lastLine = pyResult.stdout.trim().split("\n").pop() ?? "";
  let parsed: ScriptOk | ScriptErr;
  try {
    parsed = JSON.parse(lastLine) as ScriptOk | ScriptErr;
  } catch {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `Could not parse sympy output: ${lastLine}`,
    };
  }
  if (!parsed.ok) {
    return {
      ...emptyResultFor(op),
      needsHumanReview: true,
      parseError: `${parsed.error.type}: ${parsed.error.message}`,
    };
  }
  return parsed.result;
}

function emptyResultFor(op: string): Record<string, unknown> {
  switch (op) {
    case "check_solution": return { correct: false, proposedValue: "", expectedSolutions: [] };
    case "solve_equation": return { solutions: [] };
    case "simplify": return { simplified: "", simplifiedLatex: "" };
    case "check_equivalent": return { equivalent: false };
    case "parse_latex": return { sympyExpression: "", normalizedLatex: "" };
    default: return {};
  }
}
```

**Implementation Notes**:
- The Python script is generated as a string from TS. Args go in via JSON (safe — no shell, no eval). The Python side `json.loads` them and dispatches.
- Last line of stdout is the JSON result. If sympy itself printed during execution, it gets ignored (we only parse the last line). Keeps the contract simple.
- `sympy.parsing.latex.parse_latex` requires the `antlr4-python3-runtime` package. **Verify at implementation time** that Pyodide's sympy package includes this; if not, the `parseLatex` op needs a fallback (e.g., raise NotImplementedError, surface as parseError).
- Errors from sympy (parse failures, etc.) become `needsHumanReview: true` + `parseError` rather than throwing. The agent can then retry or surface to the student.
- Single timeout (`DEFAULT_TIMEOUT_MS = 10_000`) is generous; sympy ops are usually <100ms. Adjust if needed.

**Acceptance Criteria** (slow integration tests with real Pyodide, marked with `.slow` or skipped in fast CI):
- [ ] `service.checkSolution({ equation: "2*x + 5 = 11", variable: "x", proposedValue: "3" })` returns `{ correct: true, proposedValue: "3", expectedSolutions: ["3"] }`.
- [ ] Same call with `proposedValue: "4"` returns `{ correct: false, proposedValue: "4", expectedSolutions: ["3"] }`.
- [ ] `service.solveEquation({ equation: "x**2 - 4 = 0", variable: "x" })` returns `{ solutions: ["-2", "2"] }` (or `["2", "-2"]` — order may vary).
- [ ] `service.simplify({ expression: "(x+1)**2 - x**2 - 1" })` returns `{ simplified: "2*x", ... }`.
- [ ] `service.checkEquivalent({ expression1: "(x+1)**2", expression2: "x**2 + 2*x + 1" })` returns `{ equivalent: true, difference: "0" }`.
- [ ] Bad input (e.g., `equation: "garbage"`) returns `{ correct: false, ..., needsHumanReview: true, parseError: <message> }` (no throw).

---

### Unit 5: `LocalCodeSandbox` — `CodeSandbox` impl

**Files**:
- `packages/tools/src/sandbox/sandbox-service.ts` (new)
- `packages/tools/src/sandbox/__tests__/sandbox-service.test.ts` (new — JS tests fast, Python tests slow)

```typescript
import type { CodeSandbox, CodeSandboxInput, CodeSandboxResult } from "@praxis/core/types";
import type { IsolatedVmHost } from "../runtime/isolated-vm-host.js";
import type { PyodideHost } from "../runtime/pyodide-host.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_MB = 128;

export class LocalCodeSandbox implements CodeSandbox {
  constructor(
    private readonly jsHost: IsolatedVmHost,
    private readonly pyHost: PyodideHost,
  ) {}

  async run(input: CodeSandboxInput): Promise<CodeSandboxResult> {
    const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const memoryLimitMb = input.memoryLimitMb ?? DEFAULT_MEMORY_MB;

    if (input.language === "javascript") {
      const r = await this.jsHost.run({ code: input.code, timeoutMs, memoryLimitMb });
      return {
        stdout: r.stdout,
        stderr: r.guestError ? `${r.stderr}\n${r.guestError}` : r.stderr,
        exitCode: r.exitCode,
        timedOut: r.timedOut,
        durationMs: r.durationMs,
        ...(r.truncated.stdout || r.truncated.stderr ? { truncated: r.truncated } : {}),
      };
    }

    // python
    const code = wrapPythonWithStdin(input.code, input.stdin);
    const r = await this.pyHost.runPython({ code, timeoutMs });
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.timedOut ? null : r.pythonError ? 1 : 0,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
    };
  }
}

/** Inject stdin as sys.stdin for the user's Python code. */
function wrapPythonWithStdin(userCode: string, stdin: string | undefined): string {
  if (!stdin) return userCode;
  const stdinJson = JSON.stringify(stdin);
  return `
import sys, io
sys.stdin = io.StringIO(${stdinJson})
${userCode}
`.trim();
}
```

**Implementation Notes**:
- Stdin is only meaningful for Python (the JS isolate has no stdin concept). Documented in the type.
- For JS: `guestError` is appended to stderr — the agent sees the error message in the stderr buffer.
- Exit code translation: timed out = `null`, JS uncaught = `1`, Python exception = `1`, success = `0`.
- Truncation flag passed through only when actually truncated (cleaner result object).

**Acceptance Criteria**:
- [ ] `sandbox.run({ language: "javascript", code: "console.log(2+2)" })` returns `{ stdout: "4\n", exitCode: 0, ... }`.
- [ ] `sandbox.run({ language: "javascript", code: "throw new Error('oops')" })` returns `{ exitCode: 1, stderr: contains "oops", ... }`.
- [ ] `sandbox.run({ language: "javascript", code: "while(true){}", timeoutMs: 100 })` returns `{ timedOut: true, exitCode: null, ... }`.
- [ ] `sandbox.run({ language: "python", code: "print(2+2)" })` returns `{ stdout: "4\n", exitCode: 0, ... }` (slow).
- [ ] `sandbox.run({ language: "python", code: "import sys; print(sys.stdin.read())", stdin: "hi" })` returns `{ stdout: "hi\n", ... }` (slow).
- [ ] `sandbox.run({ language: "python", code: "while True: pass", timeoutMs: 100 })` returns `{ timedOut: true, ... }` (slow).
- [ ] `timeoutMs` clamped to `MAX_TIMEOUT_MS` (test by passing `60_000`, observe actual timeout used internally — exposed via durationMs upper bound).

---

### Unit 6: `gradeMathTool` — ToolDefinition

**Files**:
- `packages/tools/src/math/grade-math.ts` (new)
- `packages/tools/src/math/__tests__/grade-math.test.ts` (new — uses mock SymPyService)

```typescript
import { z } from "zod";
import type { ToolDefinition, ToolContext } from "@praxis/core/types";

const checkSolutionInput = z.object({
  kind: z.literal("check_solution"),
  equation: z.string().describe(
    "Equation to check, e.g. '2*x + 5 = 11' (sympy notation) or '2x + 5 = 11' (LaTeX, set isLatex: true)",
  ),
  variable: z.string().describe("Variable to check, e.g. 'x'"),
  proposedValue: z.string().describe("Proposed value, e.g. '3'"),
  isLatex: z.boolean().optional().describe("True if equation is LaTeX-formatted"),
});

const solveEquationInput = z.object({
  kind: z.literal("solve_equation"),
  equation: z.string(),
  variable: z.string(),
  isLatex: z.boolean().optional(),
});

const simplifyInput = z.object({
  kind: z.literal("simplify"),
  expression: z.string(),
  isLatex: z.boolean().optional(),
});

const checkEquivalentInput = z.object({
  kind: z.literal("check_equivalent"),
  expression1: z.string(),
  expression2: z.string(),
  isLatex: z.boolean().optional(),
});

export const gradeMathInput = z.discriminatedUnion("kind", [
  checkSolutionInput,
  solveEquationInput,
  simplifyInput,
  checkEquivalentInput,
]);

const checkSolutionOutput = z.object({
  kind: z.literal("check_solution"),
  correct: z.boolean(),
  proposedValue: z.string(),
  expectedSolutions: z.array(z.string()),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const solveEquationOutput = z.object({
  kind: z.literal("solve_equation"),
  solutions: z.array(z.string()),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const simplifyOutput = z.object({
  kind: z.literal("simplify"),
  simplified: z.string(),
  simplifiedLatex: z.string(),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

const checkEquivalentOutput = z.object({
  kind: z.literal("check_equivalent"),
  equivalent: z.boolean(),
  difference: z.string().optional(),
  needsHumanReview: z.boolean().optional(),
  parseError: z.string().optional(),
});

export const gradeMathOutput = z.discriminatedUnion("kind", [
  checkSolutionOutput,
  solveEquationOutput,
  simplifyOutput,
  checkEquivalentOutput,
]);

export const gradeMathTool: ToolDefinition<typeof gradeMathInput, typeof gradeMathOutput> = {
  name: "grade_math",
  description: `Symbolic math via sympy. Use this for ANY arithmetic, algebra, or equation work — never trust your own arithmetic for grading.

Operations:
- check_solution: verify a proposed value satisfies an equation. Returns the actual solution(s) for context.
- solve_equation: solve an equation for one variable, return all solutions.
- simplify: algebraic simplification of an expression.
- check_equivalent: check if two expressions are mathematically equal.

If parse_error or needs_human_review is set, the input couldn't be parsed cleanly — surface this to the student and ask for clarification rather than guessing.`,
  input: gradeMathInput,
  output: gradeMathOutput,
  tier: "deterministic",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const sympy = ctx.services.sympy;
    switch (args.kind) {
      case "check_solution": {
        const r = await sympy.checkSolution({
          equation: args.equation,
          variable: args.variable,
          proposedValue: args.proposedValue,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "check_solution" as const,
          correct: r.correct,
          proposedValue: r.proposedValue,
          expectedSolutions: r.expectedSolutions,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "solve_equation": {
        const r = await sympy.solveEquation({
          equation: args.equation,
          variable: args.variable,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "solve_equation" as const,
          solutions: r.solutions,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "simplify": {
        const r = await sympy.simplify({
          expression: args.expression,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "simplify" as const,
          simplified: r.simplified,
          simplifiedLatex: r.simplifiedLatex,
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
      case "check_equivalent": {
        const r = await sympy.checkEquivalent({
          expression1: args.expression1,
          expression2: args.expression2,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        });
        return {
          kind: "check_equivalent" as const,
          equivalent: r.equivalent,
          ...(r.difference !== undefined && { difference: r.difference }),
          ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
          ...(r.parseError !== undefined && { parseError: r.parseError }),
        };
      }
    }
  },
};
```

**Implementation Notes**:
- Discriminated unions on `kind` keep the agent honest — it must pick an op and supply the right fields. The JSON Schema generated from the Zod discriminated union surfaces this clearly to the model.
- Description emphasizes "never trust your own arithmetic for grading" — this is the verification principle made literal at the tool level.
- The handler dispatches per `kind`; per-op result shapes match the SymPyService output but with the `kind` discriminator added.

**Acceptance Criteria** (with mock `ctx.services.sympy`):
- [ ] `gradeMathTool.handler({ kind: "check_solution", equation: "...", variable: "x", proposedValue: "3" }, ctx)` calls `ctx.services.sympy.checkSolution(...)` and returns the result with `kind: "check_solution"`.
- [ ] Same for `solve_equation`, `simplify`, `check_equivalent`.
- [ ] `isLatex` is forwarded only when defined (verified by spy on the mock).
- [ ] `needsHumanReview` and `parseError` from the service propagate to the tool result.
- [ ] Zod input validation rejects malformed args (e.g., missing `variable` for `check_solution`).

---

### Unit 7: `codeSandboxTool` — ToolDefinition

**Files**:
- `packages/tools/src/sandbox/code-sandbox.ts` (new)
- `packages/tools/src/sandbox/__tests__/code-sandbox.test.ts` (new — uses mock CodeSandbox)

```typescript
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@praxis/core/types";

export const codeSandboxInput = z.object({
  language: z.enum(["javascript", "python"]).describe(
    "Language to execute. Use python for scientific work; javascript for quick numeric or string operations.",
  ),
  code: z.string().describe("Source code to execute. Print results to stdout."),
  stdin: z.string().optional().describe("Optional stdin string. Only meaningful for Python."),
  timeoutMs: z.number().int().positive().max(30_000).optional().describe(
    "Wall-clock timeout in ms. Default 5000, max 30000.",
  ),
});

export const codeSandboxOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  durationMs: z.number(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }).optional(),
});

export const codeSandboxTool: ToolDefinition<typeof codeSandboxInput, typeof codeSandboxOutput> = {
  name: "code_sandbox",
  description: `Run JavaScript or Python in a sandboxed environment. No filesystem, no network. Output captured from stdout/stderr.

Use cases:
- Demonstrate an algorithm to the student step-by-step (print intermediate values).
- Verify a numeric computation that's too messy for grade_math.
- Run a small simulation or example.

DO NOT use for grading math — use grade_math instead (deterministic, citable).
Default timeout: 5 seconds. Max: 30 seconds. Max output per stream: 1MB.`,
  input: codeSandboxInput,
  output: codeSandboxOutput,
  tier: "deterministic",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    return ctx.services.sandbox.run({
      language: args.language,
      code: args.code,
      ...(args.stdin !== undefined && { stdin: args.stdin }),
      ...(args.timeoutMs !== undefined && { timeoutMs: args.timeoutMs }),
    });
  },
};
```

**Acceptance Criteria** (with mock `ctx.services.sandbox`):
- [ ] `codeSandboxTool.handler({ language: "javascript", code: "..." }, ctx)` calls `ctx.services.sandbox.run(...)` once.
- [ ] Optional fields (`stdin`, `timeoutMs`) only included when defined.
- [ ] Result passed through unchanged.
- [ ] Zod input validation rejects `timeoutMs > 30_000`.
- [ ] Zod input validation rejects unsupported language (e.g., `"ruby"`).

---

### Unit 8: LaTeX verification round-trip helper

**File**: `packages/tools/src/math/latex-verify.ts` (new)
**Test**: `packages/tools/src/math/__tests__/latex-verify.test.ts`

```typescript
import type { SymPyService } from "@praxis/core/types";

export interface LatexVerifyInput {
  /** The LaTeX as read from the student's work (e.g., from vision OCR). */
  latex: string;
}

export interface LatexVerifyResult {
  /** True if sympy successfully parsed the LaTeX. */
  parsed: boolean;
  /** sympy's normalized form of the input — e.g. "2*x + 5". */
  sympyExpression?: string;
  /** sympy's LaTeX rendering of the parsed form — should match the input modulo formatting. */
  normalizedLatex?: string;
  /** When true, the round-trip (LaTeX → sympy → LaTeX) yielded a substantially different form. */
  roundTripDivergent?: boolean;
  parseError?: string;
}

/**
 * Verification round-trip: parse LaTeX → sympy → re-render LaTeX, then compare.
 *
 * Used by Phase 13 vision OCR: when the model reads handwriting into LaTeX,
 * we run this helper to confirm sympy can parse what was read. If sympy
 * normalizes to a substantially different LaTeX, the OCR likely got something
 * wrong and the answer should not be confidently graded — surface as
 * `needs_human_review` to the agent.
 *
 * Phase 4 ships the helper; Phase 13 wires it into the vision OCR path.
 * Also useful right now for any tool needing a sympy-side validation of
 * user-supplied LaTeX before grading.
 */
export async function verifyLatex(input: LatexVerifyInput, sympy: SymPyService): Promise<LatexVerifyResult> {
  const r = await sympy.parseLatex({ latex: input.latex });
  if (r.parseError) {
    return {
      parsed: false,
      ...(r.parseError !== undefined && { parseError: r.parseError }),
    };
  }
  const divergent = !looselyEquivalent(input.latex, r.normalizedLatex);
  return {
    parsed: true,
    sympyExpression: r.sympyExpression,
    normalizedLatex: r.normalizedLatex,
    ...(divergent && { roundTripDivergent: true }),
  };
}

/**
 * Strip whitespace, lowercase, drop common formatting variants — a coarse
 * "did sympy preserve the meaning?" check. Not perfect; agents reading the
 * round-trip should treat `roundTripDivergent: true` as a warning, not proof
 * of error.
 */
function looselyEquivalent(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/\\,/g, "")
    .replace(/\\!/g, "")
    .replace(/\\\\/g, "")
    .toLowerCase();
}
```

**Implementation Notes**:
- Pure function — takes `SymPyService` directly, not `ToolContext`. Callable from anywhere with a sympy service.
- The "loose equivalence" check is intentionally coarse. It exists to catch obvious OCR errors ("2x" vs "Zx"), not to be a strict equivalence proof (sympy itself does that via `checkEquivalent`).

**Acceptance Criteria** (with mocked sympy):
- [ ] `verifyLatex({ latex: "2x + 5" }, sympy)` where sympy returns `{ sympyExpression: "2*x + 5", normalizedLatex: "2 x + 5" }` → `{ parsed: true, ..., roundTripDivergent: false }` (whitespace ignored).
- [ ] When sympy returns `parseError` → `{ parsed: false, parseError: ... }`.
- [ ] When normalized LaTeX is substantially different → `roundTripDivergent: true`.

---

### Unit 9: `ServiceDeps.toolServices` + mode-based filtering in `SessionServiceImpl`

**Files**:
- `packages/core/src/services/types.ts` (modified)
- `packages/core/src/services/session-service.ts` (modified)
- `packages/core/src/__tests__/session-service.test.ts` (extended)

**`packages/core/src/services/types.ts`**:

```typescript
import type { z } from "zod";
import type { CodeSandbox, Engine, Logger, Mode, SymPyService, ToolDefinition } from "../types/index.js";
import type { PraxisDb } from "../db/index.js";
import type { EngineConfig } from "../config/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Concrete tool services injected into ToolContext for handlers. Only the
   * services concrete in the current phase are required; the rest of
   * ToolContext.services stays `unknown`/null until later phases land.
   */
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
  };
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
```

**`packages/core/src/services/session-service.ts`** — modified `openActive`:

```typescript
private async openActive(args: {
  sessionId: string;
  engineId: string;
  mode: Mode;
  studentId: string;
  priorTurns: ConversationTurn[];
}): Promise<ActiveEntry> {
  const engineConfig = readEngineConfig(this.deps.db);
  const factory = this.deps.engineFactory ?? ((c, d) => createEngine({ config: c, deps: d }));
  const engine = factory(engineConfig, { log: this.deps.log });

  const systemPrompt = composeSystemPrompt({ mode: args.mode });

  const toolContext: ToolContext = {
    studentId: args.studentId as ToolContext["studentId"],
    sessionId: args.sessionId as ToolContext["sessionId"],
    services: {
      memory: null,
      artifacts: null,
      vectorStore: null,
      sandbox: this.deps.toolServices.sandbox,
      sympy: this.deps.toolServices.sympy,
      pedagogyPack: null,
    },
    log: this.deps.log,
  };

  // Phase 4: filter toolDefinitions by mode.toolNames.
  const enabledNames = new Set(args.mode.toolNames);
  const enabledTools =
    enabledNames.size === 0
      ? this.deps.toolDefinitions    // empty array means "all available" for backward compat
      : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));

  const tools = new InProcessToolRegistry({
    tools: enabledTools,
    context: toolContext,
  });

  const handle = await engine.open({
    systemPrompt,
    tools,
    ...(args.priorTurns.length > 0 && { priorTurns: args.priorTurns }),
  });

  const entry: ActiveEntry = {
    sessionId: args.sessionId,
    engineId: args.engineId,
    mode: args.mode,
    handle,
    engine,
  };
  this.active.set(args.sessionId, entry);
  return entry;
}
```

**Implementation Notes**:
- `mode.toolNames === []` keeps Phase 3 behavior (all available) for backward compat — matters because `teach` mode's old default was `[]`. Phase 4 sets explicit names for `teach`.
- ToolContext now references real `sympy` and `sandbox` services. Tests that don't need them can pass minimal mocks (e.g., `{ checkSolution: vi.fn(), ... }`).
- The change is **mostly additive** — existing tests pass mock `ServiceDeps` that include `toolServices` (mock or real).

**Acceptance Criteria**:
- [ ] `SessionServiceImpl` typechecks with the new `toolServices` field on `ServiceDeps`.
- [ ] When a mode has `toolNames: ["grade_math"]` and `deps.toolDefinitions` includes both `gradeMathTool` and `codeSandboxTool`, only `grade_math` is registered.
- [ ] When `mode.toolNames === []`, all tools are registered (backward-compat).
- [ ] `ToolContext.services.sympy` and `.sandbox` are passed to handlers (verified by spying on a mock service).

---

### Unit 10: Mode wiring — `teach` mode tool names + tool prompt fragment

**Files**:
- `packages/curriculum/src/modes/teach.ts` (modified)
- `packages/curriculum/src/modes/fragments/tools.ts` (new)
- `packages/curriculum/src/__tests__/teach-mode.test.ts` (extended)

**`packages/curriculum/src/modes/fragments/tools.ts`**:

```typescript
import type { PromptFragment } from "@praxis/core/types";

/**
 * Brief tool-availability note woven into the tools position. The detailed
 * per-tool docs come from each tool's `description` (visible to the model
 * via the engine's tool-registration JSON schema). This fragment just orients
 * the agent toward using them.
 */
export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
```

**`packages/curriculum/src/modes/teach.ts`** (modified):

```typescript
import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { roleFragment } from "./fragments/role.js";
import { toolsFragment } from "./fragments/tools.js";

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    toolsFragment,        // NEW
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: ["grade_math", "code_sandbox"],   // CHANGED from []
  uiSurface: "chat",
};
```

**Acceptance Criteria**:
- [ ] `teachMode.toolNames` equals `["grade_math", "code_sandbox"]`.
- [ ] `teachMode.promptFragments` includes `toolsFragment` between principles and constraints.
- [ ] `composeSystemPrompt({ mode: teachMode })` includes the tools fragment template.

---

### Unit 11: Desktop service wiring + Pyodide preload

**File**: `packages/desktop/electron/main/services.ts` (modified)
**File**: `packages/desktop/electron/main/index.ts` (modified — preload pyodide on app ready)

**`packages/desktop/electron/main/services.ts`**:

```typescript
import { openDb } from "@praxis/core/db";
import type { ServiceDeps } from "@praxis/core/services";
import { ConfigServiceImpl, SessionServiceImpl } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { gradeMathTool } from "@praxis/tools/math";
import { codeSandboxTool } from "@praxis/tools/sandbox";
import { PyodideHost } from "@praxis/tools/runtime";
import { IsolatedVmHost } from "@praxis/tools/runtime";
import { PyodideSymPyService } from "@praxis/tools/math";
import { LocalCodeSandbox } from "@praxis/tools/sandbox";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  pyodide: PyodideHost;  // exposed so main can preload it
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
```

**`packages/desktop/electron/main/index.ts`** (additions, omitted file otherwise unchanged):

```typescript
app.whenReady().then(async () => {
  applyMigrations();
  services = buildServices(resolveDbPath());
  registerIpcHandlers({ services, getWindow: () => mainWindow });

  // Preload pyodide in the background so the first tool call is snappy.
  // Failure is non-fatal — the first call will surface any error.
  services.pyodide.preload().catch((err) => {
    services?.config !== undefined && console.warn("[praxis] pyodide preload failed:", err);
  });

  mainWindow = createMainWindow();
  // ... rest unchanged
});
```

**`packages/desktop/package.json`** — add `isolated-vm`, `pyodide`, postinstall:

```json
{
  "scripts": {
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.electron.json",
    "test": "vitest run",
    "dev": "electron-vite dev",
    "start": "electron-vite preview",
    "postinstall": "electron-rebuild -f -w isolated-vm"
  },
  "dependencies": {
    "@praxis/client": "workspace:*",
    "@praxis/core": "workspace:*",
    "@praxis/curriculum": "workspace:*",
    "@praxis/tools": "workspace:*",
    "@praxis/ui": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "electron": "^41.3.0",
    "electron-vite": "^5.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0"
  }
}
```

**`packages/tools/package.json`** — add `pyodide` and `isolated-vm`:

```json
{
  "dependencies": {
    "@praxis/core": "workspace:*",
    "isolated-vm": "^6.1.0",
    "pyodide": "^0.27.0",
    "zod": "^4.0.0"
  }
}
```

**`packages/tools/src/index.ts`** — add new exports:

```typescript
export { InProcessToolRegistry, type InProcessToolRegistryOptions } from "./registry.js";
export { jsonSchemaFromZod } from "./registry.js";
export { gradeMathTool, gradeMathInput, gradeMathOutput } from "./math/grade-math.js";
export { codeSandboxTool, codeSandboxInput, codeSandboxOutput } from "./sandbox/code-sandbox.js";
export { PyodideSymPyService } from "./math/sympy-service.js";
export { LocalCodeSandbox } from "./sandbox/sandbox-service.js";
export { PyodideHost, type PyodideHostOptions } from "./runtime/pyodide-host.js";
export { IsolatedVmHost } from "./runtime/isolated-vm-host.js";
export { verifyLatex, type LatexVerifyInput, type LatexVerifyResult } from "./math/latex-verify.js";
export const PACKAGE_NAME = "@praxis/tools" as const;
```

Add subpath exports for the imports in services.ts:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./test-tools": "./src/test-tools/index.ts",
    "./math": "./src/math/index.ts",
    "./sandbox": "./src/sandbox/index.ts",
    "./runtime": "./src/runtime/index.ts"
  }
}
```

With small `index.ts` re-exports per subpath.

**Implementation Notes**:
- `electron-rebuild -f -w isolated-vm` rebuilds only `isolated-vm`'s native binding against Electron's Node ABI. Add to postinstall so devs and CI both get a working build.
- Pyodide doesn't need rebuild — it's pure WASM + JS.
- `services.pyodide.preload()` is fire-and-forget — failure logs but doesn't crash app startup. The first tool call will surface any real load error.

**Acceptance Criteria**:
- [ ] `buildServices(dbPath)` constructs `PyodideHost`, `IsolatedVmHost`, `PyodideSymPyService`, `LocalCodeSandbox` and wires them into `ServiceDeps.toolServices`.
- [ ] Returned `Services` includes `pyodide` so main can preload.
- [ ] `pnpm --filter @praxis/desktop install` runs `electron-rebuild` for `isolated-vm` (verify by checking `node_modules/isolated-vm/build/Release/isolated_vm.node` modification time against Electron's ABI).
- [ ] `pnpm dev` starts; `pyodide.preload()` runs in background; chat works.

---

### Unit 12: `scripts/run-session.ts` update

**File**: `scripts/run-session.ts` (modified)

Switch from echo/now test tools to the production tools so the CLI can exercise grade_math and code_sandbox end-to-end.

```typescript
// imports — replace test-tools with production tools
import { gradeMathTool } from "@praxis/tools/math";
import { codeSandboxTool } from "@praxis/tools/sandbox";
import { PyodideHost, IsolatedVmHost, PyodideSymPyService, LocalCodeSandbox } from "@praxis/tools";

// ... in main():
const pyodide = new PyodideHost({ packages: ["sympy"] });
const jsHost = new IsolatedVmHost();
const sympy = new PyodideSymPyService(pyodide);
const sandbox = new LocalCodeSandbox(jsHost, pyodide);

const toolContext: ToolContext = {
  studentId,
  sessionId,
  services: {
    memory: null,
    artifacts: null,
    vectorStore: null,
    sandbox,
    sympy,
    pedagogyPack: null,
  },
  log: consoleLogger,
};

const tools = new InProcessToolRegistry({
  tools: values["no-tools"] ? [] : [gradeMathTool, codeSandboxTool],
  context: toolContext,
});

// ... rest unchanged
```

**Implementation Notes**:
- The CLI now triggers Pyodide load on first call. Cold start ~3-5s before the first response. Document in the help string.
- `--no-tools` flag still works — registers no tools, agent runs without verification.

**Acceptance Criteria**:
- [ ] `pnpm script:run-session "what is 2+2"` (with claude-code engine, CLI authenticated) returns a response that calls `grade_math` (asserted by checking `pnpm db:episodic` shows a tool_call event for `grade_math`).
- [ ] `pnpm script:run-session --no-tools "what is 2+2"` runs without tools registered.

---

### Unit 13: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts` | unit, fast | full coverage of IsolatedVmHost behavior (timeout, output capture, guest errors, truncation, no-require, no-process). |
| `packages/tools/src/runtime/__tests__/pyodide-host.test.ts` | unit, mostly | `host.get()` lazy-load contract via vi.mock("pyodide"); singleton behavior; concurrent get(). Real-pyodide test marked `.skip` or via env flag. |
| `packages/tools/src/math/__tests__/sympy-service.test.ts` | integration, slow | Real Pyodide. Covers all 5 ops with valid + invalid input. Marked slow; run with `pnpm test --include "**/sympy-service.test.ts"` or full suite. |
| `packages/tools/src/math/__tests__/grade-math.test.ts` | unit, fast | gradeMathTool handler with mock SymPyService — dispatch per kind, optional fields forwarded, errors propagated. |
| `packages/tools/src/math/__tests__/latex-verify.test.ts` | unit, fast | verifyLatex with mock sympy — parsed/error/divergent paths. |
| `packages/tools/src/sandbox/__tests__/sandbox-service.test.ts` | unit/integration | JS via real isolated-vm (fast, ~10ms per test). Python tests via real pyodide marked slow. |
| `packages/tools/src/sandbox/__tests__/code-sandbox.test.ts` | unit, fast | codeSandboxTool with mock CodeSandbox — dispatch + Zod validation. |
| `packages/core/src/__tests__/session-service.test.ts` (extended) | unit, fast | mode-based tool filtering: when mode.toolNames is non-empty, only listed tools register. ToolContext.services populated from deps.toolServices. |
| `packages/curriculum/src/__tests__/teach-mode.test.ts` (extended) | unit, fast | toolsFragment included; toolNames matches expected. |

For tests requiring real Pyodide: gate with `process.env.PRAXIS_RUN_SLOW_TESTS === "1"` so they're opt-in. CI runs them on a separate slow lane.

---

## Implementation Order

1. **Unit 1** — Type contract additions (foundation).
2. **Unit 2** — `PyodideHost` (no internal deps).
3. **Unit 3** — `IsolatedVmHost` (no internal deps; can parallelize with Unit 2).
4. **Unit 4** — `PyodideSymPyService` (depends on Units 1, 2).
5. **Unit 5** — `LocalCodeSandbox` (depends on Units 1, 2, 3).
6. **Unit 6** — `gradeMathTool` (depends on Unit 1; can parallelize with Unit 4).
7. **Unit 7** — `codeSandboxTool` (depends on Unit 1; can parallelize with Unit 5).
8. **Unit 8** — `verifyLatex` helper (depends on Unit 1).
9. **Unit 9** — `ServiceDeps` + `SessionServiceImpl` updates (depends on Unit 1).
10. **Unit 10** — `teach` mode wiring (depends on Units 6, 7).
11. **Unit 11** — Desktop service wiring + electron-rebuild postinstall (depends on Units 4, 5, 6, 7, 9).
12. **Unit 12** — `scripts/run-session.ts` update (depends on Units 6, 7, 9).
13. **Unit 13** — Tests (interspersed throughout).

Units 1-3 can land first as a foundation. Units 4-7 form a parallelizable batch (each depends only on 1 and one of 2/3). Units 9-12 close.

---

## Verification

```bash
pnpm install                          # rebuilds isolated-vm against Electron ABI
pnpm typecheck
pnpm lint
pnpm test                             # 137 existing + ~40 fast new (integration/slow gated)
pnpm desktop:build                    # produces out/ with isolated-vm native binding bundled
pnpm dev                              # opens Electron; pyodide loads in background
```

**Manual M1+ walkthrough**:

1. `pnpm dev` → window opens.
2. Type "Is `2x + 5 = 11` solved by x = 4?" → wait for first response (~3-5s if pyodide cold; otherwise <2s).
3. Tutor calls `grade_math` with `{ kind: "check_solution", equation: "2*x + 5 = 11", variable: "x", proposedValue: "4" }`.
4. Tool returns `{ correct: false, expectedSolutions: ["3"] }`.
5. Tutor explains: "No, x = 4 doesn't satisfy the equation. Substituting: 2(4) + 5 = 13, not 11. The actual solution is x = 3."
6. `pnpm db:episodic` shows a `tool_call` event with `toolName: "grade_math"` and a `tool_result` event with the sympy result.
7. Switch engine in Settings to `direct.anthropic` → ask "factor x^2 - 9" → tutor calls `grade_math` (or `code_sandbox`) → same tool dispatch behavior across the new engine.
8. Test code_sandbox: "Show me a quick JS function that prints the first 10 fibonacci numbers" → tutor calls `code_sandbox` → returns stdout with the numbers.

---

## Out of scope (defer)

- Vision OCR for handwritten math (Phase 13). `verifyLatex` is the seam.
- Hardened sandboxing for student-injected code (Phase 8 with submissions). Escalation path: `node --permission` subprocess (Node 24 stable) or Deno sidecar.
- Pyodide interrupt-buffer for true Python timeout (current Phase 4 uses Promise.race; Python keeps running after timeout). Not a blocker for tutor-controlled inputs.
- Per-tool effects-based audit logging.
- Real-time pyodide load progress in the UI (currently silent background load; first call may be slow if user beats preload).
- Plotting / visualization tools (`plot_function`, `render_diagram`). Phase 4 spec mentions them; they live in `@praxis/tools` future units.
- Code sandbox network access (intentional: no fetch, no http).

## Notes for the implementer

- **`isolated-vm` Electron rebuild**: the postinstall hook runs `electron-rebuild -f -w isolated-vm`. If the dev workstation doesn't have Python build tools (node-gyp deps), this can fail loudly. Document in README; verify on a clean clone before committing.
- **Pyodide `parse_latex`**: depends on `antlr4-python3-runtime`. In Pyodide, this may or may not be auto-included with sympy. If not, load it explicitly: `await py.loadPackage(["sympy", "antlr4-python3-runtime"])`. Verify on first integration test.
- **Pyodide cold start in tests**: gate slow tests with `PRAXIS_RUN_SLOW_TESTS=1`. CI's fast lane runs only mock-based tests; the slow lane runs Pyodide ones.
- **Bundle size**: pyodide ships ~50MB of WASM. electron-vite's main process build externalizes it; the WASM files live in `node_modules/pyodide/`. Packaging (Phase 15) ensures they ship in the installer.
- **`exactOptionalPropertyTypes: true`**: omit optional fields in returned objects, never assign `undefined`. Spread pattern is in the design's example handlers.
- **`verbatimModuleSyntax: true`**: type-only imports use `import type`. Biome enforces.
- **Conventions**: ESM, `.js` import extensions, kebab-case files, tests in `src/__tests__/`.
