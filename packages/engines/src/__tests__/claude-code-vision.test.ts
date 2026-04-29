import type { VisionDescribeRequest } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs/promises so we can assert on temp-dir creation and cleanup.
vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock node:os so tmpdir() returns a predictable path.
vi.mock("node:os", () => ({
  tmpdir: vi.fn().mockReturnValue("/tmp"),
}));

// Mock @nklisch/claude-cli-sdk before any imports of vision.ts
vi.mock("@nklisch/claude-cli-sdk", () => {
  const query = vi.fn();
  const collectResult = vi.fn();
  return { query, collectResult };
});

describe("ClaudeCodeVision", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    vi.mocked(mkdtemp).mockResolvedValue("/tmp/praxis-vision-test");
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(rm).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const FAKE_IMAGE: VisionDescribeRequest["images"][number] = {
    data: Buffer.from("fake-image-bytes").toString("base64"),
    mimeType: "image/png",
  };

  const makeRequest = (overrides?: Partial<VisionDescribeRequest>): VisionDescribeRequest => ({
    prompt: "Describe this image",
    images: [FAKE_IMAGE],
    ...overrides,
  });

  it("calls query() once per describe() call (fresh, isolated)", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");

    const fakeQueryObj = Symbol("query-object");
    vi.mocked(query).mockReturnValue(fakeQueryObj as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "test-session",
      result: "The image shows a test pattern",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const vision = new ClaudeCodeVision();
    const result = await vision.describe(makeRequest());

    expect(vi.mocked(query)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(collectResult)).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("The image shows a test pattern");
  });

  it("passes noSessionPersistence: true to query()", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");

    let capturedOptions: unknown = null;
    vi.mocked(query).mockImplementation((_prompt, opts) => {
      capturedOptions = opts;
      return Symbol("query") as unknown as ReturnType<typeof query>;
    });
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "s",
      result: "ok",
    });

    const vision = new ClaudeCodeVision();
    await vision.describe(makeRequest());

    expect((capturedOptions as { noSessionPersistence?: boolean }).noSessionPersistence).toBe(true);
  });

  it("creates a temp dir and cleans it up after success", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");
    const { mkdtemp, rm } = await import("node:fs/promises");

    vi.mocked(query).mockReturnValue(Symbol("q") as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "s",
      result: "ok",
    });

    const vision = new ClaudeCodeVision();
    await vision.describe(makeRequest());

    expect(vi.mocked(mkdtemp)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rm)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rm)).toHaveBeenCalledWith("/tmp/praxis-vision-test", {
      recursive: true,
      force: true,
    });
  });

  it("cleans up temp dir even when query throws", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");
    const { rm } = await import("node:fs/promises");

    vi.mocked(query).mockReturnValue(Symbol("q") as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockRejectedValue(new Error("CLI failed"));

    const vision = new ClaudeCodeVision();
    await expect(vision.describe(makeRequest())).rejects.toThrow("CLI failed");

    // Temp dir must still be cleaned up
    expect(vi.mocked(rm)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rm)).toHaveBeenCalledWith("/tmp/praxis-vision-test", {
      recursive: true,
      force: true,
    });
  });

  it("writes image files to temp dir", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");
    const { writeFile } = await import("node:fs/promises");

    vi.mocked(query).mockReturnValue(Symbol("q") as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "s",
      result: "ok",
    });

    const req = makeRequest({ images: [FAKE_IMAGE, { ...FAKE_IMAGE, mimeType: "image/jpeg" }] });
    const vision = new ClaudeCodeVision();
    await vision.describe(req);

    // Two images → two writeFile calls
    expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(2);
  });

  it("maps usage from inputTokens/outputTokens correctly", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");

    vi.mocked(query).mockReturnValue(Symbol("q") as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "s",
      result: "text result",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const vision = new ClaudeCodeVision();
    const result = await vision.describe(makeRequest());

    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("returns empty string when result.result is undefined", async () => {
    const { query, collectResult } = await import("@nklisch/claude-cli-sdk");
    const { ClaudeCodeVision } = await import("../claude-code/vision.js");

    vi.mocked(query).mockReturnValue(Symbol("q") as unknown as ReturnType<typeof query>);
    vi.mocked(collectResult).mockResolvedValue({
      type: "result" as const,
      subtype: "success" as const,
      sessionId: "s",
    });

    const vision = new ClaudeCodeVision();
    const result = await vision.describe(makeRequest());

    expect(result.text).toBe("");
  });
});
