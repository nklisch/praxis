import type {
  DocumentId,
  DraftSummary,
  Engine,
  Logger,
  SubAgentHandle,
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
   * Optional draft id to continue. When present, the explorer skips
   * `draft_init` and the model is told the draft already exists — it should
   * call `course.show_draft` first to see what's there before adding more.
   * Used by the tutor to "spend more budget" on a partially-built draft.
   */
  draftId?: string;
  /**
   * Optional free-form scope / strategy guidance from the tutor (the parent
   * agent). Surfaced verbatim in the explorer's initial message under a
   * clearly-labelled "Tutor instructions" block so the explorer treats it as
   * authoritative narrowing on top of the structured fields.
   *
   * Use cases the structured input can't express:
   *   - chapter / page-range scope ("focus on Ch. R through Ch. 4 only")
   *   - emphasis / de-emphasis ("skip trigonometry; treat polynomials lightly")
   *   - special pedagogy ("prefer worked-examples lessons over discovery")
   *   - student context the tutor learned in chat ("student has weak fractions")
   *
   * Capped server-side at 4000 characters to prevent accidental dumps.
   */
  instructions?: string;
  /**
   * Optional progress callback. Fired when the explorer transitions between
   * coarse phases. Only called on transitions — `"reading"` is the initial
   * state and the callback does not fire until the first transition from it.
   */
  onProgress?: (phase: "reading" | "shaping" | "finalizing") => void;
  /**
   * Sub-agent transparency handle. When provided, the explorer emits
   * step_started / step_settled events on each tool_call / tool_result, and
   * calls setLabel on phase transitions. When absent (test stubs without a
   * full engine), all emissions are no-ops — existing tests pass unchanged.
   */
  subAgentHandle?: SubAgentHandle;
}

export interface RunConceptExplorerResult {
  ok: boolean;
  /** Always present when the explorer reached a state where a draft existed. */
  draftId?: string;
  /** Compact view of the draft as it stood when the explorer exited. */
  summary?: DraftSummary;
  /**
   * True if the explorer ran out of budget mid-build. The tutor uses this to
   * offer continuation rather than narrating it as a failure — partial work is
   * preserved and the same draftId can be passed to a follow-up
   * `course.start_exploration` call.
   */
  exhaustedBudget?: boolean;
  /** Reason the explorer ended without producing a usable draft. */
  reason?: "no_draft_init" | "engine_error";
  stepsUsed: number;
}

/**
 * Drive the concept-explorer agent in a fresh isolated engine session.
 *
 * Lifecycle:
 *   1. Open EngineSession with EXPLORER_SYSTEM_PROMPT and a scoped tool registry.
 *   2. send() the initial user message (course params + document list +
 *      either "create a fresh draft" or "continue draft <id>").
 *   3. The SDK loops internally across many tool calls inside that single send.
 *   4. Drain the event stream, tracking the live draftId as it appears.
 *   5. Close the session in finally.
 *
 * Exit policy:
 *   - If a draftId was created (or passed in for continuation): always succeed
 *     (`ok: true`), with a `summary` built from the live draft state and an
 *     `exhaustedBudget` hint if we hit the cap. The tutor decides whether to
 *     continue (re-call with the same draftId), confirm, or discard.
 *   - If no draft was ever created: `ok: false, reason: "no_draft_init"`.
 *   - On a fatal stream error: `ok: false, reason: "engine_error"`.
 *
 * There is no separate "finalize" step. Validation runs inside
 * `BootstrapServiceImpl.confirmDraft` so the tutor sees structured issues at
 * confirm time rather than via a separate ritual.
 */
export async function runConceptExplorer(
  input: RunConceptExplorerInput,
): Promise<RunConceptExplorerResult> {
  // Build initial context. If a draftId was passed for continuation, inject it
  // up front so the first draft-mutation tool call (which won't be draft_init)
  // already knows which draft to mutate.
  //
  // We also pin `courseDocumentIds` to the explorer's `documentIds` so that
  // retrieval tools (specifically `retrieve_from_documents`) hard-scope to
  // exactly the documents the tutor passed in. Without this, retrieval falls
  // back to "search the whole student library" in bootstrap mode (no course in
  // scope yet), which can leak chunks from unrelated documents the student
  // happens to have uploaded. The fence is enforced server-side; the model
  // doesn't need to remember to pass documentIds on every call.
  const explorerContext = {
    ...input.baseContext,
    courseDocumentIds: [...input.documentIds],
  } as unknown as ToolContext;
  if (input.draftId !== undefined) {
    (explorerContext as { draftId?: string }).draftId = input.draftId;
  }
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

  let draftId: string | undefined = input.draftId;
  let stepsUsed = 0;
  // Already past the "reading" phase if we're continuing an existing draft.
  let currentPhase: "reading" | "shaping" | "finalizing" =
    input.draftId !== undefined ? "shaping" : "reading";
  /**
   * Captured from the engine's terminal `final` event when the underlying
   * SDK reports a non-success exit (e.g. the Claude Code CLI hit its own
   * maxTurns). Lets the wrapper truthfully report `exhaustedBudget` even
   * when Praxis's per-tool counter happens to land below the cap.
   */
  let engineFinalReason: "success" | "max_turns" | "generation_error" | "interrupted" = "success";
  let engineErrorMessage: string | undefined;

  const initialMessage = buildInitialMessage(input);

  // Every event the explorer emits is logged at debug level with a small
  // fingerprint so dev runs have a paper trail. The explorer's tool calls
  // happen inside an isolated InProcessToolRegistry — they never reach the
  // parent session's episodic log, so without this, a stuck explorer is
  // completely opaque from the outside.
  const explorerLog = input.log.child({ component: "explorer" });
  explorerLog.info("explorer.start", {
    courseTitle: input.courseTitle,
    subject: input.subject,
    gradeLevel: input.gradeLevel,
    documentCount: input.documentIds.length,
    documentIds: [...input.documentIds],
    maxSteps: input.maxSteps ?? 30,
    continuation: input.draftId !== undefined,
    ...(input.draftId !== undefined && { priorDraftId: input.draftId }),
    ...(input.instructions !== undefined && {
      instructionsChars: input.instructions.length,
    }),
  });

  try {
    for await (const ev of session.send(initialMessage)) {
      if (ev.type === "tool_call") {
        stepsUsed++;
        explorerLog.debug("explorer.tool_call", {
          step: stepsUsed,
          toolName: ev.toolName,
          callId: ev.callId,
          argFingerprint: fingerprintArgs(ev.args),
        });
        // Emit sub-agent step_started event for transparency UI.
        input.subAgentHandle?.stepStarted({ callId: ev.callId, toolName: ev.toolName });
        // Track coarse phase transitions for the activity rail and sub-agent label.
        if (input.onProgress) {
          if (currentPhase === "reading" && ev.toolName === "course.draft_init") {
            currentPhase = "shaping";
            input.onProgress("shaping");
            input.subAgentHandle?.setLabel("drafting an outline");
          } else if (
            currentPhase === "shaping" &&
            stepsUsed >= Math.floor((input.maxSteps ?? 30) * 0.8)
          ) {
            currentPhase = "finalizing";
            input.onProgress("finalizing");
            input.subAgentHandle?.setLabel("finalizing the draft");
          }
        }
      }
      if (ev.type === "tool_result") {
        explorerLog.debug("explorer.tool_result", {
          step: stepsUsed,
          callId: ev.callId,
          ok: ev.result.ok,
          resultFingerprint: fingerprintResult(ev.result),
        });
        // Emit sub-agent step_settled event for transparency UI.
        input.subAgentHandle?.stepSettled({ callId: ev.callId, ok: ev.result.ok });
        if (ev.result.ok) {
          const value = ev.result.value as Record<string, unknown>;
          // Capture draftId from draft_init result and inject into context so
          // subsequent draft mutators see it.
          if (typeof value.draftId === "string" && draftId === undefined) {
            draftId = value.draftId;
            registry.setContextField("draftId", draftId);
            explorerLog.info("explorer.draft_init_captured", { draftId });
          }
        }
      }
      if (ev.type === "model_message") {
        // The explorer prompt says "tool calls only", but the model still
        // narrates briefly between calls. Log a truncated snippet so we can
        // see the model's reasoning when debugging a stalled run.
        explorerLog.debug("explorer.model_message", {
          partial: ev.partial === true,
          chars: ev.content.length,
          preview: ev.content.length > 0 ? ev.content.slice(0, 200) : undefined,
        });
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
      if (ev.type === "final") {
        if (ev.finalReason !== undefined) engineFinalReason = ev.finalReason;
        if (ev.errorMessage !== undefined) engineErrorMessage = ev.errorMessage;
        explorerLog.debug("explorer.final", {
          finalReason: ev.finalReason ?? "success",
          ...(ev.errorMessage !== undefined && { errorMessage: ev.errorMessage }),
        });
      }
    }
  } finally {
    await session.close();
  }

  // No draft was ever created — nothing to continue from.
  if (draftId === undefined) {
    if (engineFinalReason === "generation_error" || engineFinalReason === "interrupted") {
      input.log.warn("explorer.engine_terminal_error", {
        reason: engineFinalReason,
        err: engineErrorMessage,
      });
      explorerLog.info("explorer.exit", { outcome: "engine_error", stepsUsed });
      return { ok: false, reason: "engine_error", stepsUsed };
    }
    explorerLog.info("explorer.exit", { outcome: "no_draft_init", stepsUsed });
    return { ok: false, reason: "no_draft_init", stepsUsed };
  }

  // A draft exists — the run "succeeded" regardless of how complete it is.
  // The tutor decides whether to continue (call again with this draftId),
  // confirm, or discard. Surface `exhaustedBudget` so the tutor can offer
  // continuation when the explorer ran short.
  const exhaustedBudget = engineFinalReason === "max_turns" || stepsUsed >= (input.maxSteps ?? 30);
  if (exhaustedBudget && engineErrorMessage !== undefined) {
    input.log.warn("explorer.exhausted_budget", { err: engineErrorMessage });
  }

  // Build the summary from live draft state via the bootstrap service. We
  // reach in through the base context's services bag — the explorer's
  // ToolContext shares the same service references as the calling tutor's.
  const summary = await summarizeFromContext(input.baseContext, draftId);

  explorerLog.info("explorer.exit", {
    outcome: "ok",
    draftId,
    stepsUsed,
    exhaustedBudget,
    ...(summary !== null && {
      conceptCount: summary.conceptCount,
      lessonCount: summary.lessonCount,
      edgeCount: summary.edgeCount,
      unitCount: summary.unitCount,
      assessmentCount: summary.assessmentCount,
    }),
  });

  return {
    ok: true,
    draftId,
    stepsUsed,
    ...(summary !== null && { summary }),
    ...(exhaustedBudget && { exhaustedBudget: true }),
  };
}

/**
 * Build a small structured fingerprint of a tool_call's args so log records
 * stay short while still identifying which call this was. We don't dump the
 * whole args object — for batch tools it can be a 50KB array of concepts.
 * Instead we capture top-level field names + type-aware sizes so a debug-log
 * tail tells you "draft_add_concepts: 12 concepts" rather than the full list.
 */
function fingerprintArgs(args: unknown): Record<string, unknown> {
  if (args === null || args === undefined) return { kind: "empty" };
  if (typeof args !== "object") return { kind: typeof args };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = `array[${v.length}]`;
    } else if (typeof v === "string") {
      out[k] = v.length > 80 ? `string[${v.length}]` : v;
    } else if (typeof v === "object" && v !== null) {
      out[k] = "object";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Compact view of a tool_result's value for logging. Successful results
 * collapse to "ok=true" plus a couple of known signal fields (draftId,
 * conceptCount, etc.); errors collapse to the error code + message head.
 */
function fingerprintResult(result: {
  ok: boolean;
  value?: unknown;
  error?: { code?: string; message?: string };
}): Record<string, unknown> {
  if (!result.ok) {
    return {
      code: result.error?.code,
      message: result.error?.message?.slice(0, 200),
    };
  }
  const value = result.value;
  if (value === null || value === undefined) return { ok: true };
  if (typeof value !== "object") return { ok: true, kind: typeof value };
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ok: true };
  for (const k of [
    "draftId",
    "conceptCount",
    "lessonCount",
    "edgeCount",
    "unitCount",
    "assessmentCount",
    "draftUnitId",
    "draftAssessmentId",
    "lessonIndex",
    "courseId",
    "kind",
    "reason",
  ]) {
    if (k in v) out[k] = v[k];
  }
  if (Array.isArray(v.results)) out.itemCount = v.results.length;
  if (Array.isArray(v.citations)) out.citationCount = v.citations.length;
  if (Array.isArray(v.chunks)) out.chunkCount = v.chunks.length;
  return out;
}

/**
 * Look up the bootstrap service via the explorer's base context (which carries
 * the same services bag the tutor uses) and return a DraftSummary. Returns
 * null if the draft is gone or the bootstrap service isn't wired (e.g. test
 * stubs that skip it).
 */
async function summarizeFromContext(
  ctx: Omit<ToolContext, "courseId" | "courseDocumentIds">,
  draftId: string,
): Promise<DraftSummary | null> {
  const bootstrap = ctx.services?.bootstrap;
  if (!bootstrap || typeof bootstrap.summarize !== "function") return null;
  return bootstrap.summarize(draftId);
}

function buildInitialMessage(input: RunConceptExplorerInput): string {
  const budget = input.maxSteps ?? 30;
  const pacingThreshold = Math.floor(budget * 0.8);
  const lines = [
    `Course title: ${input.courseTitle}`,
    `Subject: ${input.subject}`,
    `Grade level: ${input.gradeLevel}`,
    `Source documents (${input.documentIds.length}): ${input.documentIds.join(", ")}`,
    `Tool-call budget: ${budget} steps. If you reach step ${pacingThreshold}, stop adding new content — you'll be allowed to resume on a follow-up call if needed.`,
  ];
  // Tutor instructions block. Surfaced verbatim and clearly attributed so the
  // explorer treats it as authoritative narrowing on top of the structured
  // fields above. Trimmed but otherwise untouched.
  if (input.instructions !== undefined && input.instructions.trim().length > 0) {
    lines.push(
      "",
      "==== Tutor instructions ====",
      "(Free-form scope / strategy guidance from the tutor agent. Treat these as binding constraints on top of the structured fields above. If they conflict with each other, follow these.)",
      "",
      input.instructions.trim(),
    );
  }
  if (input.draftId !== undefined) {
    lines.push(
      "",
      `You are CONTINUING an existing draft (draftId: ${input.draftId}). Call course.show_draft FIRST to see what's already there before adding more — duplicates are rejected and the prior agent already wrote concepts/lessons. Pick up where they left off rather than starting over.`,
    );
  } else {
    lines.push(
      "",
      "Start a fresh draft via course.draft_init. Use the batch draft_add_* tools (concepts, edges, lessons, lesson_assessments) — each call costs one step regardless of array length.",
    );
  }
  return lines.join("\n");
}
