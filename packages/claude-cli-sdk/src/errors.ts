/**
 * Thrown when the `claude` CLI process exits with a non-zero exit code.
 *
 * This is the most common error — check `stderr` for the CLI's error output.
 * In conversations, this fires when the process dies unexpectedly (e.g. crash,
 * OOM, or signal).
 *
 * @example
 * try { await collectResult(query('...')); }
 * catch (err) {
 *   if (err instanceof CLIError) console.error(`Exit ${err.exitCode}: ${err.stderr}`);
 * }
 */
export class CLIError extends Error {
  constructor(
    /** The process exit code (non-zero). */
    public readonly exitCode: number,
    /** Stderr output from the CLI process. */
    public readonly stderr: string
  ) {
    super(`Claude CLI exited with code ${exitCode}: ${stderr}`);
    this.name = 'CLIError';
  }
}

/**
 * Thrown when a query or conversation turn exceeds the configured `timeout`.
 *
 * Default timeout: 300,000 ms (5 min) for `query()`, 600,000 ms (10 min) for
 * conversation turns. Set `timeout: 0` or `Infinity` to disable.
 */
export class CLITimeoutError extends Error {
  constructor(
    /** The timeout value that was exceeded, in milliseconds. */
    public readonly timeoutMs: number
  ) {
    super(`Claude CLI timed out after ${timeoutMs}ms`);
    this.name = 'CLITimeoutError';
  }
}

/**
 * Thrown when the `claude` binary cannot be found in `PATH`.
 *
 * Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
 */
export class CLINotFoundError extends Error {
  constructor() {
    super('Claude CLI not found. Ensure "claude" is installed and in PATH.');
    this.name = 'CLINotFoundError';
  }
}

/**
 * Thrown when a query or conversation option has an invalid value.
 *
 * Includes the option name, the invalid value, and a human-readable constraint
 * description for easy debugging.
 */
export class InvalidOptionError extends Error {
  constructor(
    /** The option name that was invalid (e.g. `'maxTurns'`). */
    public readonly option: string,
    /** The invalid value that was provided. */
    public readonly value: unknown,
    /** Description of the constraint that was violated. */
    public readonly constraint: string,
  ) {
    super(`Invalid option "${option}": ${constraint} (got ${JSON.stringify(value)})`);
    this.name = 'InvalidOptionError';
  }
}

/**
 * Thrown by {@link parseStructuredOutput} when the CLI response fails Zod schema validation.
 *
 * Check `issues` for per-field validation errors, and `rawOutput` for the
 * unparsed value the model returned.
 */
export class StructuredOutputError extends Error {
  constructor(
    /** Human-readable validation failure messages, one per failing field. */
    public readonly issues: string[],
    /** The raw `structuredOutput` value that failed validation. */
    public readonly rawOutput: unknown
  ) {
    super(`Structured output validation failed: ${issues.join(', ')}`);
    this.name = 'StructuredOutputError';
  }
}
