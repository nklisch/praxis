import type { ClientTransport } from "./types.js";

/**
 * WebSocketTransport — typed stub; full implementation deferred to Phase 15.
 * Exposed here so @praxis/client consumers can import the type without errors.
 */
export function createWebSocketTransport(_url: string): ClientTransport {
  return {
    invoke<T>(_channel: string, ..._args: unknown[]): Promise<T> {
      return Promise.reject(
        new Error("WebSocketTransport not implemented in Phase 3 (deferred to Phase 15)"),
      );
    },
    stream<T>(_channel: string, ..._args: unknown[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.reject(
                new Error("WebSocketTransport not implemented in Phase 3 (deferred to Phase 15)"),
              );
            },
          };
        },
      };
    },
  };
}
