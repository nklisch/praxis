/**
 * ClientTransport — the minimal interface that transport adapters must implement.
 * IpcTransport wraps Electron's contextBridge; WebSocketTransport (Phase 15) will
 * wrap a WebSocket connection to a hosted server.
 */
export interface ClientTransport {
  /**
   * Invoke a single-value IPC channel and return the resolved result.
   */
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;

  /**
   * Send a fire-and-forget IPC message. Transports may throw synchronously if
   * the channel cannot be reached; callers that use this for logging should
   * catch locally.
   */
  send(channel: string, ...args: unknown[]): void;

  /**
   * Open a streaming IPC channel and return an AsyncIterable of typed events.
   * The iterable completes when the server sends a done signal or an error.
   * If the consumer breaks out of the for-await loop early, the transport
   * sends a cancel signal to the server.
   */
  stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T>;
}
