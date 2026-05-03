# Design: Language Sandbox Registry — QuickJS replaces isolated-vm

## Overview

Replace the broken `isolated-vm` JavaScript sandbox with `quickjs-emscripten` (WASM, no native binding) and reshape the surrounding code as a **per-language registry** so future coding-lesson languages (Ruby, Lua, SQL, …) plug in as adapters without touching the core dispatch.

Praxis ships two languages today through `LocalCodeSandbox`:
- JavaScript via `IsolatedVmHost` — uses native `isolated-vm@6.1.2`. Prebuilds cover ABI 127 + 137 only; Electron 41's V8 reports ABI 145, so the binding fails to load. The sandbox feature is non-functional in packaged builds and 8+ test files carry `vi.mock("isolated-vm", ...)` workarounds.
- Python via `PyodideHost` — WASM-based, works fine.

The fix is two-part:

1. **Replace the JS adapter** with `QuickJsLanguageSandbox` backed by `quickjs-emscripten@^0.32.0`. WASM = no native binding = no ABI dance, no rebuild step, no test mocks. Multi-platform out of the box.
2. **Reshape `LocalCodeSandbox` as a registry** of `LanguageSandbox` adapters. Adding a language becomes a new file plus one wiring line in the composition root. The `code_sandbox` tool's input enum is **derived from the registry's `availableLanguages`**, so the agent-facing schema stays in lockstep with what's actually wired up — single source of truth.

### What ships in this phase

- `LanguageSandbox` port in `@praxis/core/types`.
- `CodeSandboxImpl` registry replacing `LocalCodeSandbox`.
- `QuickJsLanguageSandbox` adapter (replaces `IsolatedVmHost`).
- `PyodideLanguageSandbox` adapter (thin wrapper over existing `PyodideHost`).
- `code_sandbox` tool's Zod input schema derived from registry.
- All `isolated-vm`-related code, dependency, build config, and test mocks deleted.

### Out of scope (deliberately deferred)

- New language adapters beyond JS + Python — the design specifies the shape so future ones are 30-line additions, but this design ships only the swap and the abstraction.
- Multi-threading inside the sandbox — QuickJS is single-threaded by design; multi-threading sandboxed user code is a bigger feature.
- Network/filesystem access for sandboxed code — still none, same as today.

---

## Architectural overview

```
PORT (in @praxis/core/types)
  CodeSandbox          — what tools consume (existing, unchanged shape)
  CodeSandboxInput     — existing, language: string (was union literal)
  CodeSandboxResult    — existing, unchanged
  LanguageSandbox      — NEW: per-language adapter contract
                         { language, displayName, supportsStdin, run(opts) }

REGISTRY (in @praxis/tools/sandbox)
  CodeSandboxImpl      — replaces LocalCodeSandbox.
                         constructor(adapters: ReadonlyArray<LanguageSandbox>)
                         exposes `availableLanguages: readonly string[]`
                         dispatches CodeSandbox.run by input.language

ADAPTERS (per language, in @praxis/tools/runtime/)
  QuickJsLanguageSandbox  ← quickjs-emscripten WASM (replaces IsolatedVmHost)
  PyodideLanguageSandbox  ← thin wrapper over existing PyodideHost

TOOL (in @praxis/tools/sandbox)
  codeSandboxTool      — Zod input enum derived from registry's
                         `availableLanguages` at registration time.

WIRING (composition root)
  buildServices() constructs the adapters and the registry,
  passes the registry into ServiceDeps.toolServices.sandbox,
  uses sandbox.availableLanguages to build the codeSandboxTool input schema.

DELETED
  packages/tools/src/runtime/isolated-vm-host.ts
  packages/tools/src/runtime/isolated-vm-worker.ts
  packages/tools/src/runtime/isolated-vm-worker-client.ts
  packages/tools/src/sandbox/sandbox-service.ts (LocalCodeSandbox)
  isolated-vm dependency from @praxis/tools and @praxis/desktop
  EXTERNAL_THIRD_PARTY entry in electron.vite.config.ts
  electron-builder exclusion line for isolated-vm in packages/desktop/package.json
  vi.mock("isolated-vm", ...) blocks in 8 test files
  isolatedVmStubFactory + related helper code in tests/helpers/mocks.ts
  packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts
  package export "./runtime/isolated-vm-worker" in @praxis/tools/package.json
```

This mirrors the existing `IngestorRegistry` pattern (`packages/tools/src/runtime/ingestion/registry.ts`) — which uses the same shape: a registry takes a fixed set of adapters at construction, exposes a `select` API by mime-type, and dispatches. Same pattern, different domain.

---

## Implementation Units

### Unit 1: `LanguageSandbox` port

**File**: `packages/core/src/types/tool.ts` (modify — extend the existing `CodeSandbox` section)

```typescript
// ─── CodeSandbox ─────────────────────────────────────────────────────────────

/**
 * High-level sandbox port consumed by `code_sandbox` and other tools.
 * Implemented by `CodeSandboxImpl` (a registry of `LanguageSandbox`
 * adapters). Dispatches `input.language` to the matching adapter.
 */
export interface CodeSandbox {
  run(input: CodeSandboxInput): Promise<CodeSandboxResult>;
  /** Languages this sandbox can dispatch — drives the tool's Zod enum. */
  readonly availableLanguages: readonly string[];
}

export interface CodeSandboxInput {
  /**
   * Language identifier. Must be one of `availableLanguages` on the active
   * `CodeSandbox`; the high-level tool's Zod enum is derived from that set,
   * so by the time we get here `language` is already validated.
   */
  language: string;
  code: string;
  /** Optional stdin string. Adapters that don't support stdin ignore it. */
  stdin?: string;
  /** Wall-clock timeout. Default 5000ms; max enforced 30000ms. */
  timeoutMs?: number;
  /** Memory cap in megabytes. Adapters that don't support a cap ignore it. */
  memoryLimitMb?: number;
}

export interface CodeSandboxResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout or crash); other = explicit exit code. */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Set when stdout or stderr was truncated to fit the output limit (default 1MB each). */
  truncated?: { stdout: boolean; stderr: boolean };
}

/**
 * Per-language sandbox adapter. Each language Praxis supports gets one.
 * Adapters are constructed in the composition root and handed to
 * `CodeSandboxImpl` as a fixed array. There is no runtime registration.
 *
 * Conventions:
 * - `language` is a stable identifier matching what tools and the agent
 *   speak ("javascript", "python"). Lowercase, no aliases.
 * - `displayName` is for UI / error messages ("JavaScript", "Python").
 * - `supportsStdin` advertises whether `run({ stdin })` is meaningful.
 *   Adapters that return false MUST ignore (not throw on) stdin input.
 * - `run` resolves with a normalized result. Adapters never throw for
 *   guest-code errors or timeouts — those become fields on the result.
 *   They MAY throw for adapter-internal failures (engine init failures,
 *   invariant violations) — `CodeSandboxImpl` translates those into a
 *   result with `exitCode: null` and the error in `stderr`.
 */
export interface LanguageSandbox {
  readonly language: string;
  readonly displayName: string;
  readonly supportsStdin: boolean;
  run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult>;
}

export interface LanguageSandboxRunOptions {
  code: string;
  /** Effective wall-clock timeout (already clamped by `CodeSandboxImpl`). */
  timeoutMs: number;
  /** Effective memory cap MB (clamped by `CodeSandboxImpl`); ignored by some adapters. */
  memoryLimitMb: number;
  /** Already-vetted stdin string; only passed when `supportsStdin === true`. */
  stdin?: string;
  /** Max bytes captured per stream. Default 1_000_000. */
  outputLimitBytes?: number;
}

export interface LanguageSandboxRunResult {
  stdout: string;
  stderr: string;
  /** 0 = success; null = killed (timeout / crash); other = explicit exit code. */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  truncated: { stdout: boolean; stderr: boolean };
  /** Caught error from guest code (uncaught exception). Distinct from timeout. */
  guestError?: string;
}
```

**Implementation Notes**:
- `CodeSandbox.availableLanguages` is added to the existing port. Consumers that don't care about it (most tools) keep working.
- `LanguageSandbox` and its options/result are siblings of `CodeSandbox` in the same file — they're all sandbox-domain types. Don't split into a sub-module; this section already groups all sandbox types.
- `language: string` (not a union literal) on `CodeSandboxInput` because the SSOT moved to the registry; the literal would drift. The Zod enum is generated at registration (Unit 6).
- `LanguageSandboxRunResult.truncated` is **not** optional here (unlike on `CodeSandboxResult`) — every adapter must report it, the registry decides whether to omit it from the high-level result.

**Acceptance Criteria**:
- [ ] All five interfaces exported from `@praxis/core/types`.
- [ ] `CodeSandbox.availableLanguages` is `readonly string[]`.
- [ ] Pre-existing test files that import `CodeSandbox`, `CodeSandboxInput`, `CodeSandboxResult` continue to compile.

---

### Unit 2: `CodeSandboxImpl` registry

**File**: `packages/tools/src/sandbox/code-sandbox-impl.ts` (new — replaces `sandbox-service.ts`)

```typescript
import type {
  CodeSandbox,
  CodeSandboxInput,
  CodeSandboxResult,
  LanguageSandbox,
} from "@praxis/core/types";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_MB = 128;
const DEFAULT_OUTPUT_LIMIT_BYTES = 1_000_000;

export interface CodeSandboxImplOptions {
  /**
   * Adapters keyed by `language`. Order is irrelevant. The first adapter
   * for a given language wins; duplicates throw at construction.
   */
  adapters: ReadonlyArray<LanguageSandbox>;
}

export class CodeSandboxImpl implements CodeSandbox {
  private readonly byLanguage: ReadonlyMap<string, LanguageSandbox>;
  readonly availableLanguages: readonly string[];

  constructor(opts: CodeSandboxImplOptions) {
    const map = new Map<string, LanguageSandbox>();
    for (const a of opts.adapters) {
      if (map.has(a.language)) {
        throw new Error(
          `CodeSandboxImpl: duplicate adapter for language "${a.language}"`,
        );
      }
      map.set(a.language, a);
    }
    this.byLanguage = map;
    this.availableLanguages = Array.from(map.keys()).sort();
  }

  async run(input: CodeSandboxInput): Promise<CodeSandboxResult> {
    const adapter = this.byLanguage.get(input.language);
    if (!adapter) {
      throw new Error(
        `CodeSandboxImpl: no adapter for language "${input.language}". ` +
          `Available: ${this.availableLanguages.join(", ")}.`,
      );
    }
    const timeoutMs = clamp(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS);
    const memoryLimitMb = input.memoryLimitMb ?? DEFAULT_MEMORY_MB;
    const stdin =
      adapter.supportsStdin && input.stdin !== undefined ? input.stdin : undefined;

    const r = await adapter.run({
      code: input.code,
      timeoutMs,
      memoryLimitMb,
      ...(stdin !== undefined && { stdin }),
      outputLimitBytes: DEFAULT_OUTPUT_LIMIT_BYTES,
    });

    return {
      stdout: r.stdout,
      stderr: r.guestError ? appendGuestError(r.stderr, r.guestError) : r.stderr,
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      ...(r.truncated.stdout || r.truncated.stderr ? { truncated: r.truncated } : {}),
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function appendGuestError(stderr: string, err: string): string {
  return stderr.length === 0 ? err : `${stderr}\n${err}`;
}
```

**Implementation Notes**:
- Caller-facing `CodeSandboxInput.timeoutMs` is clamped to `[1, MAX_TIMEOUT_MS]` here, before reaching adapters. Adapters trust the value.
- `stdin` is gated on `adapter.supportsStdin` so adapters never see stdin they can't act on. Adapters with `supportsStdin: false` are guaranteed `stdin === undefined` in their options.
- Registry throws on duplicate `language` entries to fail-fast at composition root.
- The dispatcher's `throw` for unknown language is intentional: by the time runtime dispatch happens, the tool's Zod enum has already validated the input. A throw here means a programming mistake (registered the tool with stale languages) — exactly the right shape for a Fail-Fast invariant.

**Acceptance Criteria**:
- [ ] `new CodeSandboxImpl({ adapters: [] })` succeeds; `run()` on it throws "no adapter for language" for any input.
- [ ] Constructor throws on duplicate `language`.
- [ ] `availableLanguages` is sorted, stable, and reflects the adapter set.
- [ ] `run` clamps `timeoutMs` to `[1, 30000]`.
- [ ] Adapter with `supportsStdin: false` never sees `stdin` in its options.
- [ ] Adapter that returns `truncated: { stdout: false, stderr: false }` produces a result with no `truncated` key.
- [ ] Adapter that returns `guestError: "boom"` produces stderr that includes "boom".

---

### Unit 3: `QuickJsLanguageSandbox` (replaces `IsolatedVmHost`)

**File**: `packages/tools/src/runtime/quickjs-language-sandbox.ts` (new)

```typescript
import type {
  LanguageSandbox,
  LanguageSandboxRunOptions,
  LanguageSandboxRunResult,
} from "@praxis/core/types";

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

/**
 * JavaScript sandbox backed by `quickjs-emscripten` — a pure-WASM build of
 * the QuickJS engine. No native bindings, so this works in any Node /
 * Electron / browser environment with no rebuild dance.
 *
 * Each `run()` call constructs a fresh QuickJSRuntime + QuickJSContext.
 * Memory limit applies to the runtime; timeout uses
 * `shouldInterruptAfterDeadline`. Console output is captured by injecting
 * a host-controlled `console` global with `log/warn/info/debug` writing
 * to stdout and `error` writing to stderr.
 *
 * Lazy-loads `quickjs-emscripten` on first `run()` so the import cost
 * (~3MB WASM) only hits when JS is actually executed.
 */
export class QuickJsLanguageSandbox implements LanguageSandbox {
  readonly language = "javascript" as const;
  readonly displayName = "JavaScript" as const;
  readonly supportsStdin = false as const;

  // biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten's QuickJSWASMModule type
  private modulePromise: Promise<any> | null = null;

  // biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten module type
  private async getModule(): Promise<any> {
    if (!this.modulePromise) {
      this.modulePromise = (async () => {
        const tx = await import("quickjs-emscripten");
        return tx.getQuickJS();
      })();
    }
    return this.modulePromise;
  }

  async run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult> {
    const limit = opts.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;
    const stdoutBuf: string[] = [];
    const stderrBuf: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const truncated = { stdout: false, stderr: false };
    const start = Date.now();

    const QuickJS = await this.getModule();
    const { shouldInterruptAfterDeadline } = await import("quickjs-emscripten");

    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(opts.memoryLimitMb * 1024 * 1024);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + opts.timeoutMs));
    const ctx = runtime.newContext();

    try {
      installConsole(ctx, {
        appendStdout: (line) => {
          const bytes = Buffer.byteLength(line, "utf8");
          if (stdoutBytes + bytes > limit) {
            truncated.stdout = true;
            return;
          }
          stdoutBytes += bytes;
          stdoutBuf.push(line);
        },
        appendStderr: (line) => {
          const bytes = Buffer.byteLength(line, "utf8");
          if (stderrBytes + bytes > limit) {
            truncated.stderr = true;
            return;
          }
          stderrBytes += bytes;
          stderrBuf.push(line);
        },
      });

      const result = ctx.evalCode(opts.code);
      if (result.error) {
        const err = ctx.dump(result.error);
        result.error.dispose();
        const guestError = formatGuestError(err);
        return {
          stdout: stdoutBuf.join(""),
          stderr: stderrBuf.join(""),
          exitCode: 1,
          timedOut: false,
          durationMs: Date.now() - start,
          truncated,
          guestError,
        };
      }
      result.value.dispose();
      return {
        stdout: stdoutBuf.join(""),
        stderr: stderrBuf.join(""),
        exitCode: 0,
        timedOut: false,
        durationMs: Date.now() - start,
        truncated,
      };
    } catch (err) {
      // Interrupt-handler firing surfaces as a thrown error from evalCode in
      // some quickjs-emscripten versions; detect via message.
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("interrupted");
      return {
        stdout: stdoutBuf.join(""),
        stderr: stderrBuf.join(""),
        exitCode: null,
        timedOut: isTimeout,
        durationMs: Date.now() - start,
        truncated,
        ...(isTimeout ? {} : { guestError: msg }),
      };
    } finally {
      try {
        ctx.dispose();
      } catch {
        /* already disposed */
      }
      try {
        runtime.dispose();
      } catch {
        /* already disposed */
      }
    }
  }
}

interface ConsoleHooks {
  appendStdout: (line: string) => void;
  appendStderr: (line: string) => void;
}

/**
 * Build a `console` global on the QuickJS context that captures output
 * back to host-side buffers. log / warn / info / debug → stdout;
 * error → stderr. Each method takes variadic args, formats them like
 * `console.log` (space-separated, JSON-stringifying objects), appends a
 * trailing newline, and calls the supplied hook.
 *
 * Returns nothing; all handles disposed before return.
 */
// biome-ignore lint/suspicious/noExplicitAny: quickjs-emscripten context type
function installConsole(ctx: any, hooks: ConsoleHooks): void {
  // biome-ignore lint/suspicious/noExplicitAny: quickjs handle type
  const make = (sink: (line: string) => void) =>
    ctx.newFunction("log", (...handles: any[]) => {
      const args = handles.map((h) => ctx.dump(h));
      sink(`${args.map(stringifyForLog).join(" ")}\n`);
    });

  const consoleHandle = ctx.newObject();
  const logFn = make(hooks.appendStdout);
  const errFn = make(hooks.appendStderr);

  ctx.setProp(consoleHandle, "log", logFn);
  ctx.setProp(consoleHandle, "warn", logFn);
  ctx.setProp(consoleHandle, "info", logFn);
  ctx.setProp(consoleHandle, "debug", logFn);
  ctx.setProp(consoleHandle, "error", errFn);
  ctx.setProp(ctx.global, "console", consoleHandle);

  consoleHandle.dispose();
  logFn.dispose();
  errFn.dispose();
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

function formatGuestError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message?: unknown; name?: unknown; stack?: unknown };
    const name = typeof e.name === "string" ? e.name : "Error";
    const msg = typeof e.message === "string" ? e.message : String(e.message);
    return e.stack ? String(e.stack) : `${name}: ${msg}`;
  }
  return String(err);
}
```

**Implementation Notes**:
- `getQuickJS()` returns a singleton WASM module — cached in `modulePromise` so subsequent `run()` calls reuse it. Each `run()` creates a fresh `Runtime + Context` (~2-5ms; same cost order as `IsolatedVmHost`).
- `setInterruptHandler(shouldInterruptAfterDeadline(deadline))` is the documented timeout pattern. The handler returns true after the deadline, terminating execution.
- Memory limit is **bytes** in QuickJS (vs. **megabytes** in our high-level option). Multiply by 1024*1024 at the boundary.
- Disposal order matters: dispose the `error`/`value` handle first, then context, then runtime. Disposing a runtime with live handles throws (memory-leak detection).
- Guest errors come back as a `dump`-able handle with `{ name, message, stack? }`. Format to a string for `guestError`.
- Timeout detection: depending on the quickjs-emscripten version, an interrupt fires via either (a) a return from `evalCode` with `result.error.message === "interrupted"`, or (b) a thrown exception from `evalCode`. Handle both — the `try/catch` in `run` covers (b), the `result.error` branch covers (a).
- Lazy import lets tests that don't exercise JS sandboxing skip loading quickjs-emscripten entirely.

**Acceptance Criteria**:
- [ ] `await new QuickJsLanguageSandbox().run({ code: "console.log(2+2)", timeoutMs: 1000, memoryLimitMb: 64 })` returns `{ stdout: "4\n", stderr: "", exitCode: 0, timedOut: false, ...}`.
- [ ] Code that throws (`throw new Error("boom")`) produces `exitCode: 1`, `guestError` containing "boom".
- [ ] Infinite loop (`while(true){}`) with `timeoutMs: 100` produces `timedOut: true`, `exitCode: null`.
- [ ] No filesystem, no network, no `process`, no `require` in the guest — the only global beyond ECMAScript built-ins is `console`.
- [ ] After `run()` returns, no QuickJS handles are leaked (a leak would throw on `runtime.dispose()`).
- [ ] `console.error("x")` lands in `stderr`, not `stdout`.
- [ ] Output truncation at 1MB sets `truncated.stdout: true`.

---

### Unit 4: `PyodideLanguageSandbox` (wraps existing `PyodideHost`)

**File**: `packages/tools/src/runtime/pyodide-language-sandbox.ts` (new)

```typescript
import type {
  LanguageSandbox,
  LanguageSandboxRunOptions,
  LanguageSandboxRunResult,
} from "@praxis/core/types";
import type { PyodideHost } from "./pyodide-host.js";

/**
 * Python adapter — thin wrapper that conforms `PyodideHost.runPython` to
 * the `LanguageSandbox` shape. `PyodideHost` itself stays unchanged so
 * other callers (`PyodideSymPyService`) keep working.
 *
 * Stdin is supported by injecting a small Python preamble that replaces
 * `sys.stdin` with an `io.StringIO` wrapping the supplied string. Same
 * pattern as the previous `LocalCodeSandbox.wrapPythonWithStdin` helper.
 *
 * Memory limits are silently ignored — Pyodide doesn't expose a per-run
 * cap. The Pyodide runtime has its own WASM heap cap set at boot.
 */
export class PyodideLanguageSandbox implements LanguageSandbox {
  readonly language = "python" as const;
  readonly displayName = "Python" as const;
  readonly supportsStdin = true as const;

  constructor(private readonly host: PyodideHost) {}

  async run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult> {
    const code = opts.stdin !== undefined ? wrapWithStdin(opts.code, opts.stdin) : opts.code;
    const r = await this.host.runPython({ code, timeoutMs: opts.timeoutMs });
    return {
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.timedOut ? null : r.pythonError ? 1 : 0,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      truncated: { stdout: false, stderr: false },
      ...(r.pythonError !== undefined && { guestError: r.pythonError }),
    };
  }
}

/** Inject stdin as `sys.stdin` for the user's Python code. */
function wrapWithStdin(userCode: string, stdin: string): string {
  const stdinJson = JSON.stringify(stdin);
  return `
import sys, io
sys.stdin = io.StringIO(${stdinJson})
${userCode}
`.trim();
}
```

**Implementation Notes**:
- `truncated` is hardcoded to `{ stdout: false, stderr: false }` — Pyodide's `runPython` doesn't currently apply a byte cap. Capturing this honestly in the result rather than lying with `undefined` keeps the registry's truncation logic uniform. If we later add a cap to `PyodideHost`, plumb it through here.
- Memory limit is silently dropped (documented above). Don't surface it as an error — adapters that don't support a feature ignore it per the `LanguageSandbox` contract.
- `PyodideHost.runPython`'s existing `pythonError` field maps directly to `guestError`. No new field on `PyodideHost`.

**Acceptance Criteria**:
- [ ] `await sandbox.run({ code: "print(2+2)", timeoutMs: 1000, memoryLimitMb: 64 })` produces `{ stdout: "4\n", exitCode: 0, ... }`.
- [ ] `code: "1/0"` yields `exitCode: 1`, `guestError` containing "ZeroDivisionError".
- [ ] `code: "import sys; print(sys.stdin.read())"` with `stdin: "hi"` yields `stdout: "hi\n"`.
- [ ] Memory-limit input passed through `LanguageSandboxRunOptions` does not error.
- [ ] `PyodideHost` source is unchanged.

---

### Unit 5: Replace `LocalCodeSandbox` with `CodeSandboxImpl`

**Files**:
- Delete `packages/tools/src/sandbox/sandbox-service.ts`.
- Update `packages/tools/src/sandbox/index.ts` to export `CodeSandboxImpl` instead of `LocalCodeSandbox`.

```typescript
// packages/tools/src/sandbox/index.ts
export { codeSandboxInput, codeSandboxOutput, codeSandboxTool } from "./code-sandbox.js";
export { CodeSandboxImpl, type CodeSandboxImplOptions } from "./code-sandbox-impl.js";
```

**Acceptance Criteria**:
- [ ] `import { LocalCodeSandbox } from "@praxis/tools/sandbox"` no longer resolves.
- [ ] `import { CodeSandboxImpl } from "@praxis/tools/sandbox"` resolves to the new registry.
- [ ] No file in `packages/` imports `LocalCodeSandbox`.

---

### Unit 6: Derive `code_sandbox` Zod enum from registry

**File**: `packages/tools/src/sandbox/code-sandbox.ts` (modify)

The current input schema hard-codes `z.enum(["javascript", "python"])`. With the registry as SSOT, the enum should come from the constructed `CodeSandbox` instance. But `ToolDefinition`s are module-level `const`s — they can't read from a runtime registry.

The fix is a **factory pattern**: instead of exporting a static `codeSandboxTool`, export a `createCodeSandboxTool(sandbox: CodeSandbox)` factory. The composition root calls it after building the registry. The tool registry receives the resulting `ToolDefinition`. This is the same shape `service-deps-injection` codifies — the tool gets its dependency at construction.

```typescript
// packages/tools/src/sandbox/code-sandbox.ts (rewritten)
import type { CodeSandbox, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const codeSandboxOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  durationMs: z.number(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }).optional(),
});

/**
 * Factory: builds the `code_sandbox` tool with a Zod input enum derived
 * from the supplied sandbox's `availableLanguages`. Single source of
 * truth — adding a new language adapter automatically expands the
 * tool's accepted inputs.
 *
 * Throws if the sandbox has zero languages registered (no point
 * registering a no-op tool).
 */
export function createCodeSandboxTool(
  sandbox: CodeSandbox,
): ToolDefinition<z.ZodObject<{ language: z.ZodEnum<[string, ...string[]]>; code: z.ZodString; stdin: z.ZodOptional<z.ZodString>; timeoutMs: z.ZodOptional<z.ZodNumber> }>, typeof codeSandboxOutput> {
  const langs = sandbox.availableLanguages;
  if (langs.length === 0) {
    throw new Error("createCodeSandboxTool: sandbox has no language adapters registered");
  }
  const languageEnum = z.enum(langs as [string, ...string[]]);

  const codeSandboxInput = z.object({
    language: languageEnum.describe(
      `Language to execute. One of: ${langs.join(", ")}.`,
    ),
    code: z.string().describe("Source code to execute. Print results to stdout."),
    stdin: z.string().optional().describe("Optional stdin string. Only meaningful for languages that support it (e.g., Python)."),
    timeoutMs: z.number().int().positive().max(30_000).optional().describe(
      "Wall-clock timeout in ms. Default 5000, max 30000.",
    ),
  });

  return {
    name: "code_sandbox",
    description: buildDescription(langs),
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
}

function buildDescription(languages: readonly string[]): string {
  return `Run code in a sandboxed environment. No filesystem, no network. Output captured from stdout/stderr. Available languages: ${languages.join(", ")}.

Use cases:
- Demonstrate an algorithm to the student step-by-step (print intermediate values).
- Verify a numeric computation that's too messy for grade_math.
- Run a small simulation or example.

DO NOT use for grading math — use grade_math instead (deterministic, citable).
Default timeout: 5 seconds. Max: 30 seconds. Max output per stream: 1MB.`;
}

// Re-export for tests that need to introspect the schemas independently.
export { codeSandboxOutput };
```

**Implementation Notes**:
- The factory is the SSOT bridge: the registry's set of languages → the Zod enum advertised to the agent.
- The previous module-level `codeSandboxTool` and `codeSandboxInput` consts are deleted. Anyone importing them needs to call the factory instead.
- `codeSandboxOutput` stays exported — it's a fixed shape, no language-dependent structure.
- The factory return type uses `z.ZodEnum<[string, ...string[]]>` (the project's standard tuple-typed enum) so TypeScript carries the enumerated values into static type contexts (e.g., test fixture builders).

**Acceptance Criteria**:
- [ ] `createCodeSandboxTool(sandbox)` returns a `ToolDefinition` whose input parses `{ language: "javascript", code: "x" }` for a sandbox with that adapter registered.
- [ ] The same input fails Zod validation when `"javascript"` is not in `availableLanguages`.
- [ ] Calling the factory with an empty-adapter sandbox throws.
- [ ] No import of `codeSandboxTool` (the old static const) survives anywhere in `packages/`.

---

### Unit 7: Composition root wiring

**File**: `packages/desktop/electron/main/services.ts` (modify)

Replace the current isolated-vm wiring + `LocalCodeSandbox` construction with the registry + adapters + factory tool:

```typescript
// near the top, replace the @praxis/tools/sandbox import:
import { CodeSandboxImpl, createCodeSandboxTool } from "@praxis/tools/sandbox";

// replace IsolatedVmHost / WorkerIsolatedVmHost imports with:
import {
  // existing items kept...
  PyodideLanguageSandbox,
  QuickJsLanguageSandbox,
} from "@praxis/tools/runtime";

// inside buildServices(), replace:
//   const isolatedVmWorker = spawnNodeWorker({ ... });
//   const jsHost = new WorkerIsolatedVmHost({ worker: isolatedVmWorker });
//   const sandbox = new LocalCodeSandbox(jsHost, pyodide);
// with:
const sandbox = new CodeSandboxImpl({
  adapters: [
    new QuickJsLanguageSandbox(),
    new PyodideLanguageSandbox(pyodide),
  ],
});
// codeSandboxTool is now built per-process (uses the registry's enum):
const codeSandboxTool = createCodeSandboxTool(sandbox);

// Remove `isolatedVmWorker` from the workers object on Services.
```

**Implementation Notes**:
- `Services.workers` shrinks back to `{ embeddings: NodeWorker }` (the embeddings worker stays — it's still needed for onnxruntime-node).
- The `before-quit` shutdown chain in `electron/main/index.ts` already iterates `services.workers` — no change needed; it just sees one entry.
- The `toolDefinitions` array in `buildServices` still includes `codeSandboxTool` — but it's now the local const built from the factory, not an import.

**Acceptance Criteria**:
- [ ] No `IsolatedVmHost`, `WorkerIsolatedVmHost`, `JsSandboxHost`, `LocalCodeSandbox`, or `isolated-vm-worker` import remains in `services.ts`.
- [ ] `services.session.shutdown()` followed by `services.workers.embeddings.shutdown()` still cleanly tears down (embeddings worker survives this design unchanged).
- [ ] `codeSandboxTool` registered in `toolDefinitions` advertises both `javascript` and `python` in its Zod enum.

---

### Unit 8: Update `@praxis/tools` runtime barrel + package exports

**File**: `packages/tools/src/runtime/index.ts` (modify)

```typescript
// Replace these existing exports:
//   export { IsolatedVmHost, type IsolatedVmRunOptions, type IsolatedVmRunResult, type JsSandboxHost } from "./isolated-vm-host.js";
//   export { WorkerIsolatedVmHost, type WorkerIsolatedVmHostOptions } from "./isolated-vm-worker-client.js";
// with:
export { QuickJsLanguageSandbox } from "./quickjs-language-sandbox.js";
export { PyodideLanguageSandbox } from "./pyodide-language-sandbox.js";
// LocalEmbeddingService, WorkerEmbeddingService, PyodideHost, etc. — all unchanged.
```

**File**: `packages/tools/package.json` (modify)

Remove the `./runtime/isolated-vm-worker` export entry. Remove `"isolated-vm": "^6.1.2"` from `dependencies`. Add `"quickjs-emscripten": "^0.32.0"` to `dependencies`.

**Acceptance Criteria**:
- [ ] `import { QuickJsLanguageSandbox } from "@praxis/tools/runtime"` resolves.
- [ ] `import { IsolatedVmHost } from "@praxis/tools/runtime"` does NOT resolve.
- [ ] `pnpm install` succeeds and pulls in `quickjs-emscripten`.

---

### Unit 9: Delete legacy files

Delete outright:
- `packages/tools/src/runtime/isolated-vm-host.ts`
- `packages/tools/src/runtime/isolated-vm-worker.ts`
- `packages/tools/src/runtime/isolated-vm-worker-client.ts`
- `packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts`
- `packages/tools/src/sandbox/sandbox-service.ts`

**Acceptance Criteria**:
- [ ] None of the above files exist.
- [ ] `git grep -i "isolated.vm\|IsolatedVmHost\|WorkerIsolatedVmHost\|JsSandboxHost\|LocalCodeSandbox" packages/` returns zero matches.

---

### Unit 10: Build & deployment cleanup

**File**: `packages/desktop/package.json`

Remove `"isolated-vm": "^6.1.2"` from `dependencies`. Remove the line `"!**/node_modules/isolated-vm/**"` from `electron-builder.files` (no longer needed since the dep is gone).

**File**: `packages/desktop/electron.vite.config.ts`

Remove `"isolated-vm",` from the `EXTERNAL_THIRD_PARTY` array.

**File**: `tests/helpers/mocks.ts`

Delete `isolatedVmStubFactory` and any associated helper code. Keep the rest of the file unchanged.

**File**: every test under `tests/` that contains `vi.mock("isolated-vm", ...)` (8 known files at the time of this design):
- `tests/adaptive-routing-end-to-end.test.ts`
- `tests/configure-end-to-end.test.ts`
- `tests/exam-end-to-end.test.ts`
- `tests/full-turn-with-fake-engine.test.ts`
- `tests/gates-end-to-end.test.ts`
- `tests/mastery-end-to-end.test.ts`
- `tests/pack-import-end-to-end.test.ts`
- `tests/quiz-end-to-end.test.ts`

For each: remove the `vi.mock("isolated-vm", ...)` block AND the import of `isolatedVmStubFactory` if present. The mock is no longer needed because `isolated-vm` is no longer a dependency.

**Acceptance Criteria**:
- [ ] `git grep "isolated-vm" packages/` and `git grep "isolated-vm" tests/` both return zero matches.
- [ ] `pnpm install` removes `isolated-vm` from `node_modules`.
- [ ] `pnpm rebuild better-sqlite3 canvas` is the only manual native rebuild needed for tests; the previous "isolated-vm@6.1.2 prebuilts don't cover Node 25+" comment is obsolete and can be deleted from `CLAUDE.md` if present.

---

### Unit 11: Update sandbox unit tests

**File**: `packages/tools/src/sandbox/__tests__/code-sandbox-impl.test.ts` (new — replaces tests of `LocalCodeSandbox`)

Test the registry behavior with **fake `LanguageSandbox` adapters** (no real engines):
- Construction: empty adapter set succeeds; duplicate `language` throws.
- `availableLanguages` is sorted, immutable.
- Dispatch: routes `input.language` to the correct adapter.
- Unknown language: dispatch throws with a "no adapter for language" message that lists `availableLanguages`.
- Timeout clamp: `timeoutMs: 999_999` becomes `30_000` at the adapter call.
- Stdin gating: adapter with `supportsStdin: false` never sees `opts.stdin` even when supplied at the input.
- Truncation passthrough: adapter returning `truncated: { stdout: false, stderr: false }` produces a result with NO `truncated` field; adapter returning `truncated: { stdout: true, stderr: false }` produces a result WITH `truncated`.
- Guest error formatting: `guestError: "boom"` appears in the result's `stderr`.

**File**: `packages/tools/src/runtime/__tests__/quickjs-language-sandbox.test.ts` (new)

Real `quickjs-emscripten` (no mock — it's WASM, loads everywhere). Slow-test guarded if needed (`describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)` is the project's pattern, but quickjs is fast enough that we don't need to skip):
- Hello world: `console.log("hi")` → `stdout: "hi\n"`, `exitCode: 0`.
- Error: `throw new Error("boom")` → `exitCode: 1`, `guestError` contains `"boom"`.
- Timeout: `while(true){}` with `timeoutMs: 100` → `timedOut: true`, `exitCode: null`.
- No filesystem: `require("fs")` errors out (require not defined).
- No process: `process.exit(0)` errors out (process not defined).
- console routing: `console.error("e")` → `stderr`, `console.warn("w")` → `stdout`.
- Output truncation: `for (let i=0; i<200000; i++) console.log("x")` → `truncated.stdout: true`, total `stdout` size ≤ 1MB.
- Disposal: 100 sequential `run()` calls don't leak (uses 100MB+ if leaking; a snapshot of `process.memoryUsage()` shouldn't grow proportionally — soft assertion).

**File**: `packages/tools/src/runtime/__tests__/pyodide-language-sandbox.test.ts` (new)

Slow-test guarded (Pyodide is slow to boot). Tests:
- Hello world: `print(2+2)` → `stdout: "4\n"`, `exitCode: 0`.
- Error: `1/0` → `exitCode: 1`, `guestError` contains `"ZeroDivisionError"`.
- Stdin: `import sys; print(sys.stdin.read())` with `stdin: "hi"` → `stdout: "hi\n"`.
- Memory limit ignored cleanly (no error when supplied).

**File**: `packages/tools/src/sandbox/__tests__/code-sandbox-tool.test.ts` (new)

Tests for `createCodeSandboxTool`:
- Empty adapter set: throws.
- One adapter: tool's input schema accepts that language and rejects all others.
- Two adapters: enum advertises both.
- Description includes the language list.

**Acceptance Criteria**:
- [ ] All four test files pass under plain `pnpm test`.
- [ ] No test relies on `vi.mock("isolated-vm", ...)`.
- [ ] Slow Pyodide test obeys the `slow-test-gating` pattern (or is left ungated if it boots fast enough — Pyodide preload is ~3s, fine for CI).

---

## Implementation Order

Land in this order. Each step keeps `pnpm typecheck && pnpm lint && pnpm test` green at completion.

1. **Unit 1** — `LanguageSandbox` port in `@praxis/core/types`. Adds new types alongside existing `CodeSandbox`. Build core. (Old `LocalCodeSandbox` still works because it doesn't depend on the new types.)
2. **Unit 4** — `PyodideLanguageSandbox`. Adds the wrapper alongside `PyodideHost`. Tested directly.
3. **Unit 3** — `QuickJsLanguageSandbox`. Adds quickjs-emscripten to `@praxis/tools` `dependencies` (pnpm install). Tested directly. **At this step `pnpm test` still uses `LocalCodeSandbox` for `sandbox` in `services.ts` — the new adapters are written but unwired.**
4. **Unit 2** — `CodeSandboxImpl` registry. Tested with fake adapters.
5. **Unit 6** — `createCodeSandboxTool` factory. Tested directly. **The old `codeSandboxTool` static const stays exported alongside the factory until Unit 7 swaps it.**
6. **Unit 7** — Composition root swap. Replace `LocalCodeSandbox` + `IsolatedVmHost` + `WorkerIsolatedVmHost` with `CodeSandboxImpl(adapters)`. Replace `codeSandboxTool` import with local-built version. Build and run `pnpm test`. Pre-existing 3 unrelated test failures remain.
7. **Unit 11** — Add the new test files. Old `LocalCodeSandbox` tests deleted as part of Unit 9.
8. **Unit 8** — Tools barrel + package.json exports. Drop `isolated-vm` from `dependencies` of `@praxis/tools`.
9. **Unit 5 + Unit 9** — Delete `LocalCodeSandbox`, the four isolated-vm files, the worker subpath export. (Single deletion pass — ordering only matters because Unit 7 must have already swapped the importer.)
10. **Unit 10** — Build / packaging / test-mocks cleanup. Drop `isolated-vm` from `@praxis/desktop`'s `dependencies`. Remove the EXTERNAL_THIRD_PARTY entry. Remove the electron-builder files exclusion. Strip the 8 `vi.mock("isolated-vm", ...)` blocks. Delete `isolatedVmStubFactory` from `tests/helpers/mocks.ts`.

Final verification: see the verification checklist below.

---

## Testing

### Unit tests (colocated `*.test.ts`)

Per the project's existing pattern. Specifics in Unit 11. Summary:

| File | Coverage |
|---|---|
| `packages/tools/src/sandbox/__tests__/code-sandbox-impl.test.ts` | Registry: construction, dispatch, clamping, stdin gating, truncation passthrough, error formatting. |
| `packages/tools/src/sandbox/__tests__/code-sandbox-tool.test.ts` | Factory: empty-adapter throw, derived enum, description contents. |
| `packages/tools/src/runtime/__tests__/quickjs-language-sandbox.test.ts` | QuickJS adapter: hello world, errors, timeout, isolation invariants, console routing, truncation, disposal. |
| `packages/tools/src/runtime/__tests__/pyodide-language-sandbox.test.ts` | Pyodide wrapper: hello world, error, stdin, memory-limit-ignored. |

### Integration

`pnpm test` runs the existing e2e suite (`tests/`). After Unit 10, the 8 e2e files no longer mock `isolated-vm`. Their assertions don't touch the JS sandbox path directly — they just need the import chain to load without crashing, which it does once `isolated-vm` is removed from `node_modules`.

### Manual smoke

Inside `pnpm dev` (Electron):
1. Start a chat session that invokes `code_sandbox` with `language: "javascript"`. Verify `console.log` output appears.
2. Same with `language: "python"`. Verify `print` output appears.
3. Submit code that throws — verify `stderr` and `exitCode` correctness in the chat surface.
4. Submit `while(true){}` — verify the call returns within `timeoutMs + 100ms` and reports `timedOut: true`.

---

## Verification Checklist

```bash
# From repo root, after all units land:
pnpm install                                    # picks up quickjs-emscripten, drops isolated-vm
pnpm typecheck                                  # all 10 packages clean
pnpm lint                                       # biome clean
pnpm test                                       # 1676+ pass; the 3 pre-existing unrelated failures may persist
pnpm vitest run packages/tools/src/sandbox/__tests__/code-sandbox-impl.test.ts
pnpm vitest run packages/tools/src/sandbox/__tests__/code-sandbox-tool.test.ts
pnpm vitest run packages/tools/src/runtime/__tests__/quickjs-language-sandbox.test.ts
pnpm vitest run packages/tools/src/runtime/__tests__/pyodide-language-sandbox.test.ts

# Confirm the legacy code is fully gone:
git grep "isolated-vm" packages/                          # zero matches
git grep "isolated-vm" tests/                             # zero matches
git grep IsolatedVmHost packages/                         # zero matches
git grep WorkerIsolatedVmHost packages/                   # zero matches
git grep LocalCodeSandbox packages/                       # zero matches
git grep JsSandboxHost packages/                          # zero matches
git grep isolatedVmStubFactory                            # zero matches
test -f packages/tools/src/runtime/isolated-vm-host.ts && echo FAIL || echo OK
test -f packages/tools/src/sandbox/sandbox-service.ts && echo FAIL || echo OK

# Manual sanity: the dependency is gone:
test -d node_modules/.pnpm/isolated-vm@* && echo FAIL || echo OK
```

**Done when**:
- [ ] All `pnpm` commands above pass.
- [ ] All `git grep` lines return zero matches.
- [ ] `code_sandbox` tool's input enum advertises exactly `["javascript", "python"]` (verifiable by reading `services.ts` after wiring or via the in-process tool registry's summary).
- [ ] `pnpm dev` boots without `isolated-vm` errors and `code_sandbox` works end-to-end for both languages.
- [ ] No native rebuild dance for `isolated-vm` exists anywhere in build / dev docs.

---

## Future language adapters (informative — not implemented in this design)

To document the shape so the next person extending this can copy the pattern:

```typescript
// packages/tools/src/runtime/ruby-language-sandbox.ts
import type { LanguageSandbox, LanguageSandboxRunOptions, LanguageSandboxRunResult } from "@praxis/core/types";

export class RubyLanguageSandbox implements LanguageSandbox {
  readonly language = "ruby" as const;
  readonly displayName = "Ruby" as const;
  readonly supportsStdin = true as const;
  async run(opts: LanguageSandboxRunOptions): Promise<LanguageSandboxRunResult> {
    // load ruby.wasm runtime, run opts.code, capture stdio, return normalized result
  }
}
```

Then in the composition root:

```typescript
const sandbox = new CodeSandboxImpl({
  adapters: [
    new QuickJsLanguageSandbox(),
    new PyodideLanguageSandbox(pyodide),
    new RubyLanguageSandbox(),  // ← new line
  ],
});
```

Three sites change: the new file, the import line in services.ts, and the constructor call. The `code_sandbox` tool's enum picks up "ruby" automatically. Tests for the new adapter follow the QuickJS test template.

Candidate runtimes already verified to work in Node + browser (per the prior research session, since-removed):
- **Ruby**: `ruby.wasm` (official upstream) — Ruby 3.2+.
- **Lua**: `wasmoon` — JS-bindable Lua VM.
- **C / C++**: `clang.wasm` (via WAPM) — compile + execute in-sandbox.
- **SQL**: re-use `better-sqlite3` (already in the project) with a per-run schema sandbox.
- **PHP**: `php-cgi.wasm`.

The single-binary `@runno/sandbox` package bundles seven of these but adds ~120 MB unpacked to the install — pick à la carte unless a future feature wants all of them at once.
