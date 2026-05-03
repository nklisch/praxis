import type {
  DocumentId,
  DraftSummary,
  Engine,
  Logger,
  ToolContext,
  ToolDefinition,
} from "@praxis/core/types";
import { InProcessToolRegistry } from "@praxis/tools";
import type { z } from "zod";
import { EXPLORER_SYSTEM_PROMPT } from "./explorer-prompt.js";

export interface RunConceptExplorerInput {
  engine: Engine;
  /** The base ToolContext from the live tutor session. Cloned with overrides. */
  baseContext: Omit<ToolContext, "courseId" | "courseDocumentIds">;
  /** Tools the explorer is allowed to call. Must include draft mutation and search tools. */
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  documentIds: ReadonlyArray<DocumentId>;
  courseTitle: string;
  subject: string;
  gradeLevel: string;
  log: Logger;
  /** Maximum loop steps. Default 30. */
  maxSteps?: number;
  /**
   * Optional progress callback. Fired when the explorer transitions between
   * coarse phases. Only called on transitions — `"reading"` is the initial
   * state and the callback does not fire until the first transition from it.
   */
  onProgress?: (phase: "reading" | "shaping" | "finalizing") => void;
}

export interface RunConceptExplorerResult {
  ok: boolean;
  draftId?: string;
  summary?: DraftSummary;
  /** Reason the explorer ended without finalizing. */
  reason?: "max_steps_reached" | "engine_error" | "no_finalize_call" | "validation_failed";
  issues?: ReadonlyArray<{ kind: string; message: string }>;
  stepsUsed: number;
}

/**
 * Drive the concept-explorer agent in a fresh isolated engine session.
 *
 * Lifecycle:
 *   1. Open EngineSession with EXPLORER_SYSTEM_PROMPT and a scoped tool registry.
 *   2. send() the initial user message (course params + document list + outline hint).
 *   3. The SDK loops internally across many tool calls inside that single send.
 *   4. Drain the event stream and watch for the draft_finalize tool result.
 *   5. Close the session in finally.
 */
export async function runConceptExplorer(
  input: RunConceptExplorerInput,
): Promise<RunConceptExplorerResult> {
  // Build initial context without draftId (it's optional; will be injected via setContextField once draft_init runs).
  const explorerContext = { ...input.baseContext } as unknown as ToolContext;
  const registry = new InProcessToolRegistry({
    tools: input.toolDefinitions,
    context: explorerContext,
    log: input.log.child({ component: "explorer-tools" }),
  });

  const session = await input.engine.open({
    systemPrompt: EXPLORER_SYSTEM_PROMPT,
    tools: registry,
    maxSteps: input.maxSteps ?? 30,
  });

  let draftId: string | undefined;
  let finalizeSummary: DraftSummary | undefined;
  let finalizeIssues: ReadonlyArray<{ kind: string; message: string }> | undefined;
  let stepsUsed = 0;
  let lastToolName: string | undefined;
  let currentPhase: "reading" | "shaping" | "finalizing" = "reading";

  const initialMessage = buildInitialMessage(input);

  try {
    for await (const ev of session.send(initialMessage)) {
      if (ev.type === "tool_call") {
        stepsUsed++;
        lastToolName = ev.toolName;
        // Track coarse phase transitions for the activity rail.
        if (input.onProgress) {
          if (currentPhase !== "finalizing" && ev.toolName === "course.draft_finalize") {
            currentPhase = "finalizing";
            input.onProgress("finalizing");
          } else if (currentPhase === "reading" && ev.toolName === "course.draft_init") {
            currentPhase = "shaping";
            input.onProgress("shaping");
          }
        }
      }
      if (ev.type === "tool_result" && ev.result.ok) {
        const value = ev.result.value as Record<string, unknown>;

        // Capture draftId from draft_init result and inject into context.
        if (typeof value.draftId === "string" && draftId === undefined) {
          draftId = value.draftId;
          registry.setContextField("draftId", draftId);
        }

        // Capture finalize result — success signal.
        if (
          lastToolName === "course.draft_finalize" ||
          (typeof value.summary === "object" &&
            value.summary !== null &&
            "lessonCount" in (value.summary as object))
        ) {
          const summary = value.summary as Record<string, unknown> | undefined;
          if (value.ok === true && summary !== undefined && "lessonCount" in summary) {
            finalizeSummary = value.summary as DraftSummary;
          }
          if (value.ok === false && Array.isArray(value.issues)) {
            finalizeIssues = value.issues as ReadonlyArray<{ kind: string; message: string }>;
          }
        }
      }
      if (ev.type === "error") {
        input.log.warn("explorer.engine_error", { err: ev.error.message });
        return {
          ok: false,
          reason: "engine_error",
          stepsUsed,
          ...(draftId !== undefined && { draftId }),
        };
      }
    }
  } finally {
    await session.close();
  }

  if (finalizeSummary !== undefined && draftId !== undefined) {
    return { ok: true, draftId, summary: finalizeSummary, stepsUsed };
  }
  if (finalizeIssues !== undefined) {
    return {
      ok: false,
      reason: "validation_failed",
      issues: finalizeIssues,
      stepsUsed,
      ...(draftId !== undefined && { draftId }),
    };
  }
  if (stepsUsed >= (input.maxSteps ?? 30)) {
    return {
      ok: false,
      reason: "max_steps_reached",
      stepsUsed,
      ...(draftId !== undefined && { draftId }),
    };
  }
  return {
    ok: false,
    reason: "no_finalize_call",
    stepsUsed,
    ...(draftId !== undefined && { draftId }),
  };
}

function buildInitialMessage(input: RunConceptExplorerInput): string {
  return [
    `Course title: ${input.courseTitle}`,
    `Subject: ${input.subject}`,
    `Grade level: ${input.gradeLevel}`,
    `Source documents (${input.documentIds.length}): ${input.documentIds.join(", ")}`,
    "",
    "Your job: explore these documents using the tools available, then assemble a concept graph and lesson plan that fits the course brief above. Start with document.outline on each document, then list sections, then read or retrieve as needed.",
  ].join("\n");
}
