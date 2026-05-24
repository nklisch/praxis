/**
 * Thrown by SessionService.send() when a session has been discarded
 * (either explicitly via discardIfUnpromoted or by the sweep job) before
 * the first user message arrived.
 *
 * The UI's send error path matches this error by name and renders it as a
 * friendly toast rather than a generic error banner.
 */
export class SessionDiscardedError extends Error {
  readonly code = "session.discarded";

  constructor(public readonly sessionId: string) {
    super("Session was closed while you were typing — please start a new one.");
    this.name = "SessionDiscardedError";
  }
}
