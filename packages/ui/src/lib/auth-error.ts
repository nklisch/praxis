/**
 * Stable prefix the engine adapter uses when sending an auth-required signal
 * up through SessionService and across IPC. The renderer's chat route matches
 * on this to decide whether to show the auth banner.
 */
const AUTH_REQUIRED_PREFIX = "claude.auth.required:";

export function isClaudeAuthRequiredError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return message.startsWith(AUTH_REQUIRED_PREFIX);
}
