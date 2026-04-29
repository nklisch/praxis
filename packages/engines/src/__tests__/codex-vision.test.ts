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

// Mock @openai/codex-sdk before any imports of vision.ts
vi.mock("@openai/codex-sdk", () => {
  const Codex = vi.fn();
  return { Codex };
});

describe("CodexVision", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    vi.mocked(mkdtemp).mockResolvedValue("/tmp/praxis-vision-codex");
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

  it("creates a fresh Codex instance per describe() call (isolated)", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");

    const runMock = vi.fn().mockResolvedValue({
      items: [],
      finalResponse: "ok",
      usage: null,
    });
    const startThread = vi.fn().mockReturnValue({ run: runMock });
    vi.mocked(Codex).mockImplementation(
      () => ({ startThread }) as unknown as InstanceType<typeof Codex>,
    );

    const vision = new CodexVision({ engineId: "codex" });
    await vision.describe(makeRequest());
    await vision.describe(makeRequest());

    // Two fresh Codex instances — each call is isolated
    expect(vi.mocked(Codex)).toHaveBeenCalledTimes(2);
  });

  it("calls run() once with text + image inputs", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");

    let capturedInputs: unknown[] = [];
    const runMock = vi.fn().mockImplementation((inputs: unknown) => {
      capturedInputs = inputs as unknown[];
      return Promise.resolve({ items: [], finalResponse: "result", usage: null });
    });
    const startThread = vi.fn().mockReturnValue({ run: runMock });
    vi.mocked(Codex).mockImplementation(
      () => ({ startThread }) as unknown as InstanceType<typeof Codex>,
    );

    const vision = new CodexVision({ engineId: "codex" });
    await vision.describe(makeRequest());

    expect(runMock).toHaveBeenCalledTimes(1);
    // First item is text prompt, second is local_image
    expect(capturedInputs[0]).toMatchObject({ type: "text", text: "Describe this image" });
    expect(capturedInputs[1]).toMatchObject({ type: "local_image" });
  });

  it("creates a temp dir and cleans it up after success", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");
    const { mkdtemp, rm } = await import("node:fs/promises");

    const runMock = vi.fn().mockResolvedValue({ items: [], finalResponse: "ok", usage: null });
    vi.mocked(Codex).mockImplementation(
      () =>
        ({ startThread: vi.fn().mockReturnValue({ run: runMock }) }) as unknown as InstanceType<
          typeof Codex
        >,
    );

    const vision = new CodexVision({ engineId: "codex" });
    await vision.describe(makeRequest());

    expect(vi.mocked(mkdtemp)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rm)).toHaveBeenCalledWith("/tmp/praxis-vision-codex", {
      recursive: true,
      force: true,
    });
  });

  it("cleans up temp dir even when run() throws", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");
    const { rm } = await import("node:fs/promises");

    const runMock = vi.fn().mockRejectedValue(new Error("Codex run failed"));
    vi.mocked(Codex).mockImplementation(
      () =>
        ({ startThread: vi.fn().mockReturnValue({ run: runMock }) }) as unknown as InstanceType<
          typeof Codex
        >,
    );

    const vision = new CodexVision({ engineId: "codex" });
    await expect(vision.describe(makeRequest())).rejects.toThrow("Codex run failed");

    expect(vi.mocked(rm)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rm)).toHaveBeenCalledWith("/tmp/praxis-vision-codex", {
      recursive: true,
      force: true,
    });
  });

  it("extracts text from agent_message items", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");

    const runMock = vi.fn().mockResolvedValue({
      items: [
        { type: "agent_message", text: "Part one." },
        { type: "reasoning", text: "ignored" },
        { type: "agent_message", text: "Part two." },
      ],
      finalResponse: "Fallback",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 0,
        output_tokens: 5,
        reasoning_output_tokens: 0,
      },
    });
    vi.mocked(Codex).mockImplementation(
      () =>
        ({ startThread: vi.fn().mockReturnValue({ run: runMock }) }) as unknown as InstanceType<
          typeof Codex
        >,
    );

    const vision = new CodexVision({ engineId: "codex" });
    const result = await vision.describe(makeRequest());

    expect(result.text).toBe("Part one.\nPart two.");
  });

  it("falls back to finalResponse when no agent_message items", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");

    const runMock = vi.fn().mockResolvedValue({
      items: [],
      finalResponse: "Fallback text",
      usage: null,
    });
    vi.mocked(Codex).mockImplementation(
      () =>
        ({ startThread: vi.fn().mockReturnValue({ run: runMock }) }) as unknown as InstanceType<
          typeof Codex
        >,
    );

    const vision = new CodexVision({ engineId: "codex" });
    const result = await vision.describe(makeRequest());

    expect(result.text).toBe("Fallback text");
  });

  it("maps Codex usage to inputTokens/outputTokens", async () => {
    const { Codex } = await import("@openai/codex-sdk");
    const { CodexVision } = await import("../codex/vision.js");

    const runMock = vi.fn().mockResolvedValue({
      items: [{ type: "agent_message", text: "hello" }],
      finalResponse: "hello",
      usage: {
        input_tokens: 30,
        cached_input_tokens: 5,
        output_tokens: 15,
        reasoning_output_tokens: 0,
      },
    });
    vi.mocked(Codex).mockImplementation(
      () =>
        ({ startThread: vi.fn().mockReturnValue({ run: runMock }) }) as unknown as InstanceType<
          typeof Codex
        >,
    );

    const vision = new CodexVision({ engineId: "codex" });
    const result = await vision.describe(makeRequest());

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});
