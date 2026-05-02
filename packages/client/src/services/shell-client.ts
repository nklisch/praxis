import type { ShellClient } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/**
 * ShellClientImpl — renderer-side wrapper over the praxis.shell.* IPC channels.
 *
 * Implements ShellClient (defined in @praxis/core/types) so the interface can
 * be shared between the IPC service and renderer client.
 */
export class ShellClientImpl implements ShellClient {
  constructor(private readonly transport: ClientTransport) {}

  openExternal(url: string): Promise<void> {
    return this.transport.invoke<void>("praxis.shell.openExternal", url);
  }
}
