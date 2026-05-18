/**
 * EngineSessionManager — owns the `activeSessions` map and all engine-session
 * lifecycle logic extracted from SessionServiceImpl.
 *
 * Responsibilities:
 *   - Create, reuse, and close `EngineSession` handles (one per Praxis session).
 *   - Detect engine swaps and reopen with priorTurns (text-splice fallback).
 *   - Prefer native engine resume (`resumeEngineSessionId`) when the same
 *     engine was used in a prior turn (Unit 5d).
 *   - Record engine-session state to the DB so restarts can resume.
 *
 * Pattern preserved: engine-session-lifecycle
 *   Engine.open(opts) → EngineSession; send(msg) reuses the live conversation;
 *   close() in finally; seed with priorTurns only on engine swap/restart.
 */

import { composeSystemPrompt } from "@praxis/curriculum/brief";
import { composeAssignmentContextFragment } from "@praxis/curriculum/brief/assignment-context";
import { composeCourseContextFragment } from "@praxis/curriculum/brief/course-context";
import {
  composeInCourseBehaviorFragment,
  type InCourseBehaviorModeId,
} from "@praxis/curriculum/brief/in-course-behavior";
import { createEngine } from "@praxis/engines";
import { type EngineSessionStateJson, sessions } from "@praxis/memory/schema";
import { InProcessToolRegistry } from "@praxis/tools";
import { eq } from "drizzle-orm";
import { readEngineConfig } from "../../config/index.js";
import { loadConversationHistory } from "../../session/history.js";
import type {
  AssignmentId,
  ConversationTurn,
  CourseId,
  DocumentId,
  Engine,
  EngineSession,
  Mode,
  SessionId,
  StudentId,
  ToolContext,
} from "../../types/index.js";
import { serializeError } from "../../types/index.js";
import type { ServiceDeps } from "../types.js";

export interface ActiveEntry {
  /** The Praxis session this entry belongs to. */
  sessionId: string;
  /** EngineId currently powering the session — used to detect engine swap. */
  engineId: string;
  /** Mode the session was started with — fixed for the session's lifetime. */
  mode: Mode;
  /** Open EngineSession; receives every send for this Praxis session. */
  handle: EngineSession;
  /** Engine instance — held for diagnostics. */
  engine: Engine;
  /**
   * Phase 16: true while a `send()` or synthetic turn is iterating the engine
   * stream. Used by `notifySession` to decide between live narration vs.
   * lazy delivery (leaving the system_note for the next real turn to pick up).
   */
  turnInFlight: boolean;
}

/**
 * Focused deps interface for EngineSessionManager. Mirrors the subset of
 * ServiceDeps that the engine lifecycle and prompt composition actually need.
 * The `engineFactory` test seam is threaded through here so FakeEngine tests
 * continue to work without change.
 */
export interface EngineSessionManagerDeps
  extends Pick<
    ServiceDeps,
    | "db"
    | "log"
    | "secretStorage"
    | "toolDefinitions"
    | "toolServices"
    | "indexerOrchestrator"
    | "activity"
    | "subAgent"
    | "promptCustomization"
    | "engineFactory"
  > {}

export class EngineSessionManager {
  private readonly activeSessions = new Map<string, ActiveEntry>();

  constructor(private readonly deps: EngineSessionManagerDeps) {}

  /**
   * Get-or-create-and-swap. Used by send().
   *
   * - If no active entry: open a new one, seeding from conversation history
   *   (process restart / first send after a missed start).
   * - If active entry exists with a different engineId: close the stale handle,
   *   then open a new one with priorTurns (engine swap).
   * - Else: return the existing entry (hot path — session already in memory).
   */
  async acquire(args: {
    sessionId: SessionId;
    currentEngineId: string;
    mode: Mode;
    studentId: StudentId;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> {
    let entry = this.activeSessions.get(args.sessionId);

    // Engine swap detection.
    if (entry && entry.engineId !== args.currentEngineId) {
      this.deps.log.info("engine swap detected; closing active session", {
        sessionId: args.sessionId,
        from: entry.engineId,
        to: args.currentEngineId,
      });
      const _oldEngineId = entry.engineId;
      await entry.handle.close().catch((err: unknown) => {
        this.deps.log.warn("session.engine_swap.close_failed", {
          sessionId: args.sessionId,
          oldEngineId: _oldEngineId,
          err: serializeError(err),
        });
      });
      this.activeSessions.delete(args.sessionId);
      entry = undefined;
    }

    // Re-open if missing (process restart, swap above, or never opened).
    if (!entry) {
      const priorTurns = loadConversationHistory({ db: this.deps.db, sessionId: args.sessionId });
      entry = await this.openActive({
        sessionId: args.sessionId,
        engineId: args.currentEngineId,
        mode: args.mode,
        studentId: args.studentId,
        priorTurns,
        ...(args.courseId !== undefined && { courseId: args.courseId }),
        ...(args.assignmentId !== undefined && { assignmentId: args.assignmentId }),
      });
    }

    return entry;
  }

  /**
   * Direct open without prior-turn seeding. Used by start() which always
   * opens a brand-new session (priorTurns = []).
   */
  async openActive(args: {
    sessionId: string;
    engineId: string;
    mode: Mode;
    studentId: string;
    priorTurns: ConversationTurn[];
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> {
    const engineConfig = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    const factory = this.deps.engineFactory ?? ((c, d) => createEngine({ config: c, deps: d }));
    const engine = factory(engineConfig, { log: this.deps.log });

    // Phase 6 + 7: inject course-context override when a courseId is set.
    // Phase 8: inject assignment-context override when an assignmentId is set.
    //
    // Prompt-customization-layers: seed the overrides map from stored fragment
    // overrides FIRST so that the dynamic course-context / assignment-context
    // blocks below can overwrite any stale user overrides for the same fragment
    // ids. Dynamic state always wins — a stale user override of
    // `context.course-state` must NOT mask the live course state.
    let overrides: Map<string, string> | undefined;
    if (this.deps.promptCustomization) {
      const storedOverrides = this.deps.promptCustomization.listFragmentOverrides(args.mode.id);
      if (storedOverrides.length > 0) {
        overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));
      }
    }

    if (args.courseId && this.deps.toolServices.courseState) {
      const snapshot = await this.deps.toolServices.courseState.read({
        studentId: args.studentId as StudentId,
        courseId: args.courseId,
      });
      if (snapshot) {
        // Phase 7: build a conceptId → effectivePKnown map from the student model.
        let masteryByConceptId: ReadonlyMap<string, number> | undefined;
        if (this.deps.toolServices.memory) {
          try {
            const studentModel = await this.deps.toolServices.memory.studentModel(
              args.studentId as StudentId,
            );
            const masteryMap = new Map<string, number>();
            for (const [conceptId, mastery] of studentModel.conceptMastery) {
              // Only include concepts in this course's snapshot
              if (snapshot.conceptsById.has(conceptId)) {
                masteryMap.set(conceptId, mastery.effectivePKnown);
              }
            }
            if (masteryMap.size > 0) {
              masteryByConceptId = masteryMap;
            }
          } catch {
            // Non-fatal: mastery data unavailable; fall back to binary tags
          }
        }

        // Coalesce the course-documents read with the existing
        // `courseDocumentIds` computation below — the document attachments
        // feed both the prompt's "Available documents" section and the
        // `toolContext.courseDocumentIds`.
        // `listForScopeDetailed` is a newer accessor; fall back gracefully
        // if a test fake doesn't implement it.
        const courseDocuments =
          typeof this.deps.toolServices.documentScopes.listForScopeDetailed === "function"
            ? await this.deps.toolServices.documentScopes
                .listForScopeDetailed({
                  kind: "course",
                  id: args.courseId,
                })
                .catch(() => undefined)
            : undefined;

        const fragment = composeCourseContextFragment(
          snapshot,
          masteryByConceptId,
          courseDocuments,
        );
        // Use the overrides map so the existing "context.course-state" fragment
        // (which is customizable: true) is replaced by the dynamic course content.
        overrides = new Map([[fragment.id, fragment.template]]);

        // Course-aware mode-prompts: inject the per-mode behavior addendum
        // when the active mode is in the in-course set. Bootstrap / configure
        // are excluded — they have their own contracts and no notion of an
        // active course.
        const inCourseModes: ReadonlySet<string> = new Set<string>([
          "teach",
          "quiz",
          "homework",
          "exam",
          "study-skills",
        ]);
        if (inCourseModes.has(args.mode.id)) {
          const behavior = composeInCourseBehaviorFragment(
            args.mode.id as InCourseBehaviorModeId,
            snapshot,
          );
          overrides.set(behavior.id, behavior.template);
        }

        // Phase 9: If there are newly-unlocked gates the student hasn't viewed yet,
        // inject a small "Newly unlocked" fragment to the pre-session brief.
        if (this.deps.toolServices.artifacts.newlyUnlockedCount) {
          try {
            const newlyUnlockedCount = await this.deps.toolServices.artifacts.newlyUnlockedCount({
              studentId: args.studentId as StudentId,
              courseId: args.courseId,
            });
            if (newlyUnlockedCount > 0) {
              const newlyUnlockedId = "context.newly-unlocked";
              const newlyUnlockedTemplate = `Newly unlocked since your last session: ${newlyUnlockedCount} gate${newlyUnlockedCount === 1 ? "" : "s"} now available. Celebrate this with the student briefly before getting into the lesson.`;
              overrides.set(newlyUnlockedId, newlyUnlockedTemplate);
            }
          } catch {
            // Non-fatal: don't block session start if badge count fails.
          }
        }
      }
    }

    // Phase 8: inject assignment-context override when an assignmentId is set.
    if (args.assignmentId && this.deps.toolServices.assignments) {
      const assignment = await this.deps.toolServices.assignments.get({
        assignmentId: args.assignmentId,
      });
      const responses = await this.deps.toolServices.assignments.getResponses({
        assignmentId: args.assignmentId,
      });
      if (assignment) {
        const fragment = composeAssignmentContextFragment({ assignment, responses });
        overrides = new Map([...(overrides ?? []), [fragment.id, fragment.template]]);
      }
    }

    // Prompt-customization-layers: inject the two user-authored layers as
    // additionalFragments so they sort into the user-global / user-append slots.
    const additionalFragments: import("../../types/index.js").PromptFragment[] = [];
    if (this.deps.promptCustomization) {
      const globalText = this.deps.promptCustomization.getGlobalFragment();
      if (globalText !== null) {
        additionalFragments.push({
          id: "user.global",
          position: "user-global",
          customizable: true,
          template: globalText,
        });
      }
      const appendText = this.deps.promptCustomization.getModeAppend(args.mode.id);
      if (appendText !== null) {
        additionalFragments.push({
          id: `user.append.${args.mode.id}`,
          position: "user-append",
          customizable: true,
          template: appendText,
        });
      }
    }

    const systemPrompt = composeSystemPrompt({
      mode: args.mode,
      ...(overrides !== undefined && { overrides }),
      ...(additionalFragments.length > 0 && { additionalFragments }),
    });

    // Phase 16: pre-compute course-attached document ids for tool context.
    // Tools consume this directly to avoid a per-dispatch DB call.
    const courseDocumentIds: DocumentId[] | undefined =
      args.courseId !== undefined
        ? await this.deps.toolServices.documentScopes.listForScope({
            kind: "course",
            id: args.courseId,
          })
        : undefined;

    const toolContext: ToolContext = {
      studentId: args.studentId as ToolContext["studentId"],
      sessionId: args.sessionId as ToolContext["sessionId"],
      ...(args.courseId !== undefined && { courseId: args.courseId }),
      ...(args.assignmentId !== undefined && { assignmentId: args.assignmentId }),
      ...(courseDocumentIds !== undefined && { courseDocumentIds }),
      services: {
        memory: this.deps.toolServices.memory, // ← Phase 7
        artifacts: this.deps.toolServices.artifacts, // ← Phase 6
        bootstrap: this.deps.toolServices.bootstrap, // ← Phase 6
        courseState: this.deps.toolServices.courseState, // ← Phase 6
        vectorStore: this.deps.toolServices.vectorStore,
        ftsStore: this.deps.toolServices.ftsStore,
        embeddings: this.deps.toolServices.embeddings,
        documents: this.deps.toolServices.documents,
        sandbox: this.deps.toolServices.sandbox,
        sympy: this.deps.toolServices.sympy,
        assignments: this.deps.toolServices.assignments, // ← Phase 8
        packs: this.deps.toolServices.packs, // ← Phase 10
        ...(this.deps.indexerOrchestrator !== undefined && {
          indexerOrchestrator: this.deps.indexerOrchestrator,
        }), // ← Phase 7 (optional)
        pedagogyPack: this.deps.toolServices.pedagogyPack, // ← Phase 18
        lock: this.deps.toolServices.lock,
        authoring: this.deps.toolServices.authoring,
        notes: this.deps.toolServices.notes,
        flashcards: this.deps.toolServices.flashcards,
        fsrsScheduler: this.deps.toolServices.fsrsScheduler,
        // Phase 15a: sketch + vision — undefined when not wired (tool handlers guard).
        ...(this.deps.toolServices.sketches !== undefined && {
          sketches: this.deps.toolServices.sketches,
        }),
        ...(this.deps.toolServices.vision !== undefined && {
          vision: this.deps.toolServices.vision,
        }),
        // Phase 16: polymorphic scope ↔ document attachment service — always present.
        documentScopes: this.deps.toolServices.documentScopes,
        // Phase 16: engine resolver — used by tools that spawn isolated agent sessions.
        engineResolver: this.deps.toolServices.engineResolver,
        // Bootstrap budget resolver — read by course.start_drafting.
        ...(this.deps.toolServices.courseCreateConfigResolver !== undefined && {
          courseCreateConfigResolver: this.deps.toolServices.courseCreateConfigResolver,
        }),
        // Activity registry — optional; wired from ServiceDeps when available.
        ...(this.deps.activity !== undefined && { activity: this.deps.activity }),
        // Sub-agent transparency registry — optional; wired from ServiceDeps.toolServices.
        ...(this.deps.toolServices.subAgent !== undefined && {
          subAgent: this.deps.toolServices.subAgent,
        }),
        // Phase 17: quick-check dispatch — wires the human-in-the-loop service
        // through to ask_student_question and the five quick_check.* tools.
        // Without this, those handlers see `quickCheck === undefined`, short-circuit
        // on `!answer`, and return `{ abandoned: true }` without ever surfacing
        // the inline card to the renderer.
        ...(this.deps.toolServices.quickCheck !== undefined && {
          quickCheck: this.deps.toolServices.quickCheck,
        }),
      },
      log: this.deps.log,
    };

    // Phase 4: filter toolDefinitions by mode.toolNames.
    const enabledNames = new Set(args.mode.toolNames);
    const enabledTools =
      enabledNames.size === 0
        ? this.deps.toolDefinitions // empty array means "all available" for backward compat
        : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));

    const sessionId = args.sessionId;
    const tools = new InProcessToolRegistry({
      tools: enabledTools,
      context: toolContext,
      log: this.deps.log.child({ component: "tool-dispatch", sessionId }),
    });

    // Unit 5d: prefer native engine resume over text-splice when possible.
    const resumeId = this.resolveResumeEngineSessionId(args.sessionId, args.engineId);

    const handle = await engine.open({
      systemPrompt,
      tools,
      ...(resumeId !== undefined
        ? // Same-engine continuation: use native resume; skip priorTurns.
          { resumeEngineSessionId: resumeId }
        : // Engine swap or first open: replay transcript via text-splice.
          args.priorTurns.length > 0
          ? { priorTurns: args.priorTurns }
          : {}),
      onEngineSessionReady: (engineSessionId) => {
        this.recordEngineSessionId(args.sessionId, args.engineId, engineSessionId);
      },
    });

    const entry: ActiveEntry = {
      sessionId: args.sessionId,
      engineId: args.engineId,
      mode: args.mode,
      handle,
      engine,
      turnInFlight: false,
    };
    this.activeSessions.set(args.sessionId, entry);
    return entry;
  }

  /**
   * Close + remove a specific session.
   * Used by end() and as a building block for closeAll().
   * Errors from handle.close() are swallowed — callers that want to log them
   * should catch on their own (or use the internal close which logs via log).
   */
  async close(sessionId: SessionId): Promise<void> {
    const entry = this.activeSessions.get(sessionId);
    if (entry) {
      await entry.handle.close().catch((err: unknown) => {
        this.deps.log.warn("session.close_failed", {
          sessionId,
          err: serializeError(err),
        });
      });
      this.activeSessions.delete(sessionId);
    }
  }

  /** Close all active sessions. Used by shutdown(). */
  async closeAll(): Promise<void> {
    const entries = [...this.activeSessions.values()];
    this.activeSessions.clear();
    await Promise.all(
      entries.map((e) =>
        e.handle.close().catch((err: unknown) => {
          this.deps.log.warn("session.shutdown.close_failed", {
            sessionId: e.sessionId,
            err: serializeError(err),
          });
        }),
      ),
    );
  }

  /** Read-only access for active()/list() and other facade methods. */
  get(sessionId: SessionId): ActiveEntry | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** For lazy-delivery checks in notifySession()/spawn methods. */
  has(sessionId: SessionId): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Looks up engineSessionStateJson on the sessions row and returns the
   * stored CLI session id for the given engineId if present. Returns
   * undefined when there is no usable state to resume from.
   */
  private resolveResumeEngineSessionId(sessionId: string, engineId: string): string | undefined {
    const row = this.deps.db
      .select({ state: sessions.engineSessionStateJson })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    return row?.state?.[engineId]?.engineSessionId;
  }

  /**
   * Atomic read-modify-write: merges `{ engineSessionId, lastTurnAt }` into
   * engineSessionStateJson under the given engineId. Using a transaction
   * ensures concurrent opens of the same Praxis session don't clobber state.
   */
  private recordEngineSessionId(
    sessionId: string,
    engineId: string,
    engineSessionId: string,
  ): void {
    this.deps.db.transaction((tx) => {
      const row = tx
        .select({ state: sessions.engineSessionStateJson })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();
      const next: EngineSessionStateJson = { ...(row?.state ?? {}) };
      next[engineId] = { engineSessionId, lastTurnAt: Date.now() };
      tx.update(sessions)
        .set({ engineSessionStateJson: next })
        .where(eq(sessions.id, sessionId))
        .run();
    });
  }
}
