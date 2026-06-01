import { describe, expect, it, vi } from "vitest";

vi.mock("../cli/index.js", () => ({
  attachSpawnErrorHandler: vi.fn(),
  buildCliArgs: vi.fn(),
  spawnCli: vi.fn(),
  streamEvents: vi.fn(),
}));

describe("query()", () => {
  it("rejects sessionId when the CLI fails before system init", async () => {
    const { buildCliArgs, spawnCli, streamEvents } = await import("../cli/index.js");
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const proc = {
      exitCode: 1,
      kill: vi.fn(),
    };

    vi.mocked(buildCliArgs).mockResolvedValueOnce({ args: ["-p", "hi"], tempFiles: [] });
    vi.mocked(spawnCli).mockReturnValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal ChildProcess mock for query error path
      proc: proc as any,
      cleanup,
    });
    vi.mocked(streamEvents).mockImplementationOnce(async function* () {
      yield* [];
      throw new Error("CLI failed before init");
    });

    const { query } = await import("../query.js");
    const q = query("hi");

    await expect(q.next()).rejects.toThrow("CLI failed before init");
    await expect(q.sessionId).rejects.toThrow("CLI failed before init");
    await expect(q.result).rejects.toThrow("CLI failed before init");
    expect(cleanup).toHaveBeenCalled();
  });
});
