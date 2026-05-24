import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for prompt customization authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.customizePrompt
 *   praxis.author.listFragmentOverrides
 *   praxis.author.clearFragmentOverride
 *   praxis.author.setStyleSliders
 *   praxis.author.setGlobalPrompt
 *   praxis.author.getGlobalPrompt
 *   praxis.author.setModeAppend
 *   praxis.author.getModeAppend
 *   praxis.author.previewPrompt
 *   praxis.author.previewPromptWithAttribution
 */
export function registerAuthorPromptHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  const modeIdSchema = z.object({ modeId: z.string().min(1, "modeId") });

  const previewPromptSchema = z.object({
    modeId: z.string().min(1, "modeId"),
    draftGlobal: z.string().nullable().optional(),
    draftAppend: z.string().nullable().optional(),
  });

  handle(
    "praxis.author.customizePrompt",
    handleEnvelope(
      "praxis.author.customizePrompt",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        fragmentId: z.string().min(1, "fragmentId"),
        override: z.string(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.customizePrompt(input.modeId, input.fragmentId, input.override);
      },
    ),
  );

  handle(
    "praxis.author.listFragmentOverrides",
    handleEnvelope("praxis.author.listFragmentOverrides", log, modeIdSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.listFragmentOverrides(input.modeId);
    }),
  );

  handle(
    "praxis.author.clearFragmentOverride",
    handleEnvelope(
      "praxis.author.clearFragmentOverride",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        fragmentId: z.string().min(1, "fragmentId"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.clearFragmentOverride(input);
      },
    ),
  );

  handle(
    "praxis.author.setStyleSliders",
    handleEnvelope(
      "praxis.author.setStyleSliders",
      log,
      z.object({
        socratic: z.number().min(0).max(10),
        verbosity: z.number().min(0).max(10),
        formality: z.number().min(0).max(10),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setStyleSliders(input);
      },
    ),
  );

  handle(
    "praxis.author.setGlobalPrompt",
    handleEnvelope(
      "praxis.author.setGlobalPrompt",
      log,
      z.object({ text: z.string().nullable() }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setGlobalPrompt(input.text);
      },
    ),
  );

  handle(
    "praxis.author.getGlobalPrompt",
    wrapEnvelope("praxis.author.getGlobalPrompt", log, async () => {
      await requireUnlocked();
      return services.authoring.getGlobalPrompt();
    }),
  );

  handle(
    "praxis.author.setModeAppend",
    handleEnvelope(
      "praxis.author.setModeAppend",
      log,
      z.object({
        modeId: z.string().min(1, "modeId"),
        text: z.string().nullable(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.setModeAppend(input);
      },
    ),
  );

  handle(
    "praxis.author.getModeAppend",
    handleEnvelope("praxis.author.getModeAppend", log, modeIdSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.getModeAppend(input.modeId);
    }),
  );

  handle(
    "praxis.author.previewPrompt",
    handleEnvelope("praxis.author.previewPrompt", log, previewPromptSchema, async (input) => {
      await requireUnlocked();
      return services.authoring.previewPrompt({
        modeId: input.modeId,
        ...(input.draftGlobal !== undefined && { draftGlobal: input.draftGlobal }),
        ...(input.draftAppend !== undefined && { draftAppend: input.draftAppend }),
      });
    }),
  );

  handle(
    "praxis.author.previewPromptWithAttribution",
    handleEnvelope(
      "praxis.author.previewPromptWithAttribution",
      log,
      previewPromptSchema,
      async (input) => {
        await requireUnlocked();
        return services.authoring.previewPromptWithAttribution({
          modeId: input.modeId,
          ...(input.draftGlobal !== undefined && { draftGlobal: input.draftGlobal }),
          ...(input.draftAppend !== undefined && { draftAppend: input.draftAppend }),
        });
      },
    ),
  );
}
