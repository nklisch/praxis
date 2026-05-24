import { Codex } from "@openai/codex-sdk";
import type { EngineConfig } from "@praxis/core/config";
import type {
  VisionCapability,
  VisionDescribeRequest,
  VisionDescribeResponse,
} from "@praxis/core/types";
import { writeVisionImages } from "../vision/temp-images.js";

/**
 * One-shot vision capability for the Codex engine.
 *
 * Creates a transient `Codex` instance and `startThread` per call — no MCP
 * servers, no persistent state. Images are written to a temp dir and passed
 * as `local_image` inputs. The temp dir is always cleaned up in a `finally`
 * block, even on error.
 */
export class CodexVision implements VisionCapability {
  private readonly config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
  }

  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const { filePaths, cleanup } = await writeVisionImages(req.images);
    try {
      // Build input array: text prompt + one local_image per file.
      const inputs: Array<{ type: "text"; text: string } | { type: "local_image"; path: string }> =
        [
          { type: "text", text: req.prompt },
          ...filePaths.map((path) => ({ type: "local_image" as const, path })),
        ];

      // Create a transient Codex instance — no MCP servers for vision calls.
      const codex = new Codex({
        ...(this.config.apiKey !== undefined && { apiKey: this.config.apiKey }),
        ...(this.config.baseUrl !== undefined && { baseUrl: this.config.baseUrl }),
      });

      const thread = codex.startThread({
        ...(this.config.model !== undefined && { model: this.config.model }),
        approvalPolicy: "never" as const,
        sandboxMode: "read-only" as const,
        skipGitRepoCheck: true,
      });

      const turn = await thread.run(inputs);

      // Extract text from agent_message items.
      const textParts = turn.items
        .filter((item) => item.type === "agent_message")
        .map((item) => (item as { type: "agent_message"; text: string }).text);

      const text = textParts.length > 0 ? textParts.join("\n") : turn.finalResponse;

      return {
        text,
        ...(turn.usage && {
          usage: {
            inputTokens: turn.usage.input_tokens,
            outputTokens: turn.usage.output_tokens,
          },
        }),
      };
    } finally {
      await cleanup();
    }
  }
}
