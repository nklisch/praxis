import {
  authLogin,
  authStatus,
  type ClaudeAuthLoginEvent,
  type ClaudeAuthLoginOptions,
  type ClaudeAuthStatus,
} from "@praxis/claude-cli-sdk";
import type { Logger } from "../types/index.js";

export type { ClaudeAuthLoginEvent, ClaudeAuthLoginOptions, ClaudeAuthStatus };

/**
 * Wraps the SDK's auth surface for desktop IPC. Stateless — every call hits
 * the CLI; we don't cache because the CLI is the source of truth and a stale
 * cache during a login flow would be worse than a 50ms re-spawn.
 */
export interface ClaudeAuthService {
  status(): Promise<ClaudeAuthStatus>;
  login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent>;
}

export class ClaudeAuthServiceImpl implements ClaudeAuthService {
  constructor(private readonly deps: { log: Logger }) {}

  async status(): Promise<ClaudeAuthStatus> {
    const result = await authStatus();
    this.deps.log.debug("claudeAuth.status", { loggedIn: result.loggedIn });
    return result;
  }

  async *login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent> {
    this.deps.log.info("claudeAuth.login.start", { method: opts?.method ?? "claudeai" });
    let last: ClaudeAuthLoginEvent | undefined;
    for await (const event of authLogin(opts)) {
      last = event;
      yield event;
    }
    this.deps.log.info("claudeAuth.login.end", { lastKind: last?.kind });
  }
}
