import type { Logger, QuickCheckAnswer, QuickCheckEvent } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

// Wire validation for QuickCheckAnswer (see @praxis/core/types/quick-check.ts). Keep in sync.
const QuickCheckAnswerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single-choice"),
    selectedIndex: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("multi-select"),
    selectedIndices: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    kind: z.literal("short-answer"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("matching"),
    pairs: z.array(z.object({ leftId: z.string().min(1), rightId: z.string().min(1) })),
  }),
  z.object({
    kind: z.literal("confidence"),
    rating: z.number(),
  }),
  z.object({
    kind: z.literal("structured-question"),
    answers: z.array(
      z.object({
        questionIndex: z.number().int().nonnegative(),
        selectedIndices: z.array(z.number().int().nonnegative()),
      }),
    ),
  }),
  z.object({ kind: z.literal("abandoned") }),
]);

const QuickCheckResolveInputSchema = z.object({
  callId: z.string().min(1),
  answer: QuickCheckAnswerSchema,
});

// Compile-time guard: if QuickCheckAnswer adds a kind, this line fails to compile.
const _quickCheckAnswerSchemaShape = null as unknown as z.infer<
  typeof QuickCheckAnswerSchema
> satisfies QuickCheckAnswer;

/**
 * IPC channel for the Phase 17 QuickCheck human-in-the-loop dispatch.
 *
 * Channel naming follows the project's streaming convention:
 *   praxis.quickCheck.events.start  (invoke with streamId) — subscribe to events
 *   praxis.quickCheck.events.events.<streamId> (push)      — IpcStreamMessage<QuickCheckEvent>
 *   praxis.quickCheck.events.cancel (on streamId)          — unsubscribe
 *   praxis.quickCheck.resolve       (invoke with { callId, answer }) — resolve a pending check
 */
export function registerQuickCheckHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const quickCheck = services.quickCheck;
  const { handle, on } = createIpcHelpers(log);

  registerSubscriberStream<QuickCheckEvent>(
    { channelBase: "praxis.quickCheck.events", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    { subscribe: (cb) => quickCheck.subscribe(cb) },
  );

  handle(
    "praxis.quickCheck.resolve",
    handleEnvelope(
      "praxis.quickCheck.resolve",
      log,
      QuickCheckResolveInputSchema,
      async (input) => {
        quickCheck.resolve({ callId: input.callId, answer: input.answer });
      },
    ),
  );
}
