import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectResult, query } from "@praxis/claude-cli-sdk";
import type {
  VisionCapability,
  VisionDescribeRequest,
  VisionDescribeResponse,
} from "@praxis/core/types";

/**
 * One-shot vision capability for the Claude Code engine.
 *
 * Uses `query()` (not `createConversation`) with `noSessionPersistence: true`
 * so vision calls leave no session breadcrumbs on disk and never affect the
 * active tutoring Conversation. Images are written to a temp dir so Claude's
 * native Read tool can access them; the temp dir is always cleaned up in a
 * `finally` block.
 */
export class ClaudeCodeVision implements VisionCapability {
  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const tempDir = await mkdtemp(join(tmpdir(), "praxis-vision-"));
    try {
      // Write image files to temp dir.
      const filePaths: string[] = [];
      let imgIndex = 0;
      for (const img of req.images) {
        const ext =
          img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png";
        const filePath = join(tempDir, `image-${imgIndex}.${ext}`);
        await writeFile(filePath, Buffer.from(img.data, "base64"));
        filePaths.push(filePath);
        imgIndex += 1;
      }

      // Build prompt: instruct Claude to Read the files, then complete the task.
      const fileList = filePaths.map((p) => `  - ${p}`).join("\n");
      const fullPrompt =
        `Read the following image file(s) using the Read tool, then complete the task.\n\n` +
        `Image files:\n${fileList}\n\n` +
        `Task:\n${req.prompt}`;

      const q = query(fullPrompt, {
        workDir: tempDir,
        noSessionPersistence: true,
        maxTurns: req.images.length + 1,
        // Disable the SDK's 5-minute default timeout. Vision is bounded by
        // maxTurns + the caller's AbortSignal; a wall-clock timeout just turns
        // legitimate slow image-reads into opaque CLITimeoutErrors.
        timeout: 0,
        ...(req.maxTokens !== undefined &&
          {
            // Claude Code CLI doesn't have a direct maxTokens option, but we pass it for future compat
          }),
      });

      const result = await collectResult(q);

      return {
        text: result.result ?? "",
        ...(result.usage && {
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        }),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
