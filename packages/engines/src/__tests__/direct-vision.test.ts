import type { VisionDescribeRequest } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the `ai` module — generateText must not make real network calls.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

// Mock provider SDKs
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ modelId: "claude-sonnet-4-5" })),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => ({ modelId: "gpt-4o" })),
}));
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({ modelId: "gemini-2.5-flash" })),
}));
vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: vi.fn(() => vi.fn(() => ({ modelId: "llava" }))),
}));

describe("DirectVision", () => {
  beforeEach(() => {
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

  it("calls generateText once per describe() call (fresh, isolated)", async () => {
    const { generateText } = await import("ai");
    const { DirectVision } = await import("../direct/vision.js");

    vi.mocked(generateText).mockResolvedValue({
      text: "A test image",
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { reasoningTokens: 0 },
      },
    } as unknown as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const vision = new DirectVision("anthropic", { engineId: "direct.anthropic" });
    const result = await vision.describe(makeRequest());

    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("A test image");
  });

  it("each describe() call is an independent fresh generateText call", async () => {
    const { generateText } = await import("ai");
    const { DirectVision } = await import("../direct/vision.js");

    vi.mocked(generateText).mockResolvedValue({
      text: "response",
      usage: {
        inputTokens: 5,
        outputTokens: 5,
        inputTokenDetails: { noCacheTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { reasoningTokens: 0 },
      },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const vision = new DirectVision("anthropic", { engineId: "direct.anthropic" });
    await vision.describe(makeRequest());
    await vision.describe(makeRequest());

    // Two separate fresh calls — NOT sharing state
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("maps usage from promptTokens/completionTokens to inputTokens/outputTokens", async () => {
    const { generateText } = await import("ai");
    const { DirectVision } = await import("../direct/vision.js");

    vi.mocked(generateText).mockResolvedValue({
      text: "Hello",
      usage: {
        inputTokens: 15,
        outputTokens: 25,
        inputTokenDetails: { noCacheTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { reasoningTokens: 0 },
      },
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const vision = new DirectVision("openai", { engineId: "direct.openai", model: "gpt-4o" });
    const result = await vision.describe(makeRequest());

    expect(result.usage).toEqual({ inputTokens: 15, outputTokens: 25 });
  });

  it("passes image data as Buffer with correct mediaType to generateText", async () => {
    const { generateText } = await import("ai");
    const { DirectVision } = await import("../direct/vision.js");

    let capturedMessages: unknown[] = [];
    vi.mocked(generateText).mockImplementation((opts) => {
      capturedMessages = (opts as { messages: unknown[] }).messages ?? [];
      return Promise.resolve({
        text: "ok",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokenDetails: { reasoningTokens: 0 },
        },
      } as unknown as Awaited<ReturnType<typeof generateText>>);
    });

    const vision = new DirectVision("anthropic", { engineId: "direct.anthropic" });
    await vision.describe(makeRequest());

    expect(capturedMessages).toHaveLength(1);
    const msg = capturedMessages[0] as { role: string; content: unknown[] };
    expect(msg.role).toBe("user");
    // content should contain image part + text part
    const imagePart = msg.content.find((p) => (p as { type: string }).type === "image") as
      | { type: string; image: Buffer; mediaType: string }
      | undefined;
    expect(imagePart).toBeDefined();
    expect(imagePart?.mediaType).toBe("image/png");
    expect(Buffer.isBuffer(imagePart?.image)).toBe(true);
  });

  it("passes maxTokens as maxOutputTokens when provided", async () => {
    const { generateText } = await import("ai");
    const { DirectVision } = await import("../direct/vision.js");

    let capturedOpts: unknown = null;
    vi.mocked(generateText).mockImplementation((opts) => {
      capturedOpts = opts;
      return Promise.resolve({
        text: "ok",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokenDetails: { reasoningTokens: 0 },
        },
      } as unknown as Awaited<ReturnType<typeof generateText>>);
    });

    const vision = new DirectVision("anthropic", { engineId: "direct.anthropic" });
    await vision.describe(makeRequest({ maxTokens: 500 }));

    expect((capturedOpts as { maxOutputTokens?: number }).maxOutputTokens).toBe(500);
  });
});
