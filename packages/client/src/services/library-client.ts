import type { LibraryClientApi, LibraryHit, LibrarySearchInput } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  search: "praxis.library.search",
} as const;

class LibraryClientImpl implements LibraryClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async search(input: Omit<LibrarySearchInput, "studentId">): Promise<LibraryHit[]> {
    const result = await this.transport.invoke<IpcEnvelope<LibraryHit[]> | LibraryHit[]>(
      C.search,
      input,
    );
    return unwrapEnvelope(result);
  }
}

export { LibraryClientImpl as LibraryClient };
