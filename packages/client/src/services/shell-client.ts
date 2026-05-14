import type { ShellClient } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

/**
 * ShellClientImpl — renderer-side wrapper over the praxis.shell.* IPC channels.
 *
 * Implements ShellClient (defined in @praxis/core/types) so the interface can
 * be shared between the IPC service and renderer client.
 */
export class ShellClientImpl implements ShellClient {
  constructor(private readonly transport: ClientTransport) {}

  async openExternal(url: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      "praxis.shell.openExternal",
      url,
    );
    unwrapEnvelope(result);
  }
}
