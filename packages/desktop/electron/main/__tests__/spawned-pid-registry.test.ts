import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpawnedPidRegistry } from "../spawned-pid-registry.js";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
};

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "praxis-pid-registry-test-"));
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("createSpawnedPidRegistry", () => {
  it("serializes register and deregister persistence so stale PIDs do not reappear", async () => {
    const registry = createSpawnedPidRegistry(dataDir, log);

    const register = registry.register(12345);
    const deregister = registry.deregister(12345);

    await Promise.all([register, deregister]);

    const raw = await readFile(join(dataDir, "spawned-pids.json"), "utf8");
    expect(JSON.parse(raw)).toEqual([]);
  });

  it("uses temporary files only as an atomic-write implementation detail", async () => {
    const registry = createSpawnedPidRegistry(dataDir, log);

    await registry.register(111);

    const entries = await readdir(dataDir);
    expect(entries).toEqual(["spawned-pids.json"]);
  });
});
