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
