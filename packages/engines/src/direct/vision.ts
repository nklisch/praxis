import type { EngineConfig } from "@praxis/core/config";
import type {
  VisionCapability,
  VisionDescribeRequest,
  VisionDescribeResponse,
} from "@praxis/core/types";
import { generateText } from "ai";
import type { DirectProvider } from "./providers.js";
import { resolveModel } from "./providers.js";

/**
 * One-shot vision capability for the Direct (Vercel AI SDK) engine.
 *
 * Each `describe()` call is fully isolated — it uses `generateText` (not
 * streamText), builds a fresh messages array, and shares no state with any
 * active tutoring EngineSession.
 */
export class DirectVision implements VisionCapability {
  private readonly provider: DirectProvider;
  private readonly config: EngineConfig;

  constructor(provider: DirectProvider, config: EngineConfig) {
    this.provider = provider;
    this.config = config;
  }

  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const model = resolveModel(this.provider, this.config);

    // Build image content parts for the Vercel AI SDK.
    // ImagePart expects `image: DataContent | URL` with optional `mediaType`.
    const imageParts = req.images.map((img) => ({
      type: "image" as const,
      image: Buffer.from(img.data, "base64"),
      mediaType: img.mimeType,
    }));

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [...imageParts, { type: "text" as const, text: req.prompt }],
        },
      ],
      ...(req.maxTokens !== undefined && { maxOutputTokens: req.maxTokens }),
    });

    return {
      text: result.text,
      ...(result.usage &&
        result.usage.inputTokens !== undefined &&
        result.usage.outputTokens !== undefined && {
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        }),
    };
  }
}
