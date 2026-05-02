import type {
  ClaudeAuthLoginEvent,
  ClaudeAuthLoginOptions,
  ClaudeAuthService,
  ClaudeAuthStatus,
} from "@praxis/core/services";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.auth.claude" as const;

/**
 * ClaudeAuthClient — renderer-side wrapper over the IPC auth channels.
 *
 * Implements ClaudeAuthService so it can be used wherever the interface is
 * expected. The transport handles the streaming triple
 * (.start / .events.<id> / .cancel) internally — this class always passes
 * the BASE channel.
 */
export class ClaudeAuthClient implements ClaudeAuthService {
  constructor(private readonly transport: ClientTransport) {}

  status(): Promise<ClaudeAuthStatus> {
    return this.transport.invoke<ClaudeAuthStatus>(`${CHANNEL}.status`);
  }

  login(opts?: ClaudeAuthLoginOptions): AsyncIterable<ClaudeAuthLoginEvent> {
    // opts not currently transmitted — only "claudeai" is supported. When
    // we add console/sso, add an opts arg to the IPC call.
    void opts;
    return this.transport.stream<ClaudeAuthLoginEvent>(`${CHANNEL}.login`);
  }
}
