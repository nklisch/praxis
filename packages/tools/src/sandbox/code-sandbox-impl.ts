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
        throw new Error(`CodeSandboxImpl: duplicate adapter for language "${a.language}"`);
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
    const stdin = adapter.supportsStdin && input.stdin !== undefined ? input.stdin : undefined;

    let r: import("@praxis/core/types").LanguageSandboxRunResult;
    try {
      r = await adapter.run({
        code: input.code,
        timeoutMs,
        memoryLimitMb,
        ...(stdin !== undefined && { stdin }),
        outputLimitBytes: DEFAULT_OUTPUT_LIMIT_BYTES,
      });
    } catch (err) {
      // Adapter threw for an internal failure — normalize to a result.
      const msg = err instanceof Error ? err.message : String(err);
      return {
        stdout: "",
        stderr: msg,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
      };
    }

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
