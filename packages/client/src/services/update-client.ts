import type { UpdateCheckResult } from "@praxis/core/services";
import type { UpdateClientApi } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.update";

/**
 * UpdateClient — renderer-side wrapper over the praxis.update.* IPC channels.
 * The main-process service knows the app version (via `app.getVersion()`),
 * so the renderer's surface is parameter-less.
 */
export class UpdateClient implements UpdateClientApi {
  constructor(private readonly transport: ClientTransport) {}

  checkLatest(): Promise<UpdateCheckResult> {
    return this.transport.invoke<UpdateCheckResult>(`${CHANNEL}.checkLatest`);
  }
}
