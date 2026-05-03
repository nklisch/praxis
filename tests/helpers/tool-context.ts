import type { ToolContext, ToolServices } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { vi } from "vitest";

/**
 * Build a `ToolContext` for tool-handler unit tests. Populates a noop logger
 * (vi.fn() quads), fixed `studentId`/`sessionId` brands (`student-test` /
 * `session-test`), and a `services` proxy that returns an auto-stub for any
 * service not explicitly provided.
 *
 * The proxy means `ctx.services.somethingNeverStubbed.method()` returns a
 * fresh `vi.fn()` rather than crashing — so adding a new service to
 * `ToolServices` never breaks tests that don't touch it.
 *
 * Usage:
 *   const ctx = makeToolContext({
 *     services: { notes: { create: vi.fn().mockResolvedValue(noteFixture) } },
 *   });
 *   await tool.handler(args, ctx);
 *
 * For tests that assert on log calls, pass an explicit `log`:
 *   const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
 *   const ctx = makeToolContext({ log });
 *   // …
 *   expect(log.warn).toHaveBeenCalled();
 */

export interface MakeToolContextOptions {
  studentId?: string;
  sessionId?: string;
  /** Partial service overrides. Unset services auto-stub to `vi.fn()` proxies. */
  services?: Partial<ToolServices>;
  /** Override `log`; default is a `vi.fn()` quad. */
  log?: ToolContext["log"];
  /** Optional courseId to attach to the context. */
  courseId?: ToolContext["courseId"];
  /** Optional assignmentId to attach to the context. */
  assignmentId?: ToolContext["assignmentId"];
  /** Phase 16: pre-populated course-attached document ids; mirrors openActive's wiring. */
  courseDocumentIds?: ToolContext["courseDocumentIds"];
  /** Phase 16: explorer-session draft id; usually only set inside isolated explorer tests. */
  draftId?: ToolContext["draftId"];
}

export function makeToolContext(opts: MakeToolContextOptions = {}): ToolContext {
  const services = new Proxy(opts.services ?? {}, {
    get(target, prop) {
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      // Auto-stub: return a proxy whose any method call yields a fresh vi.fn().
      return new Proxy({}, { get: () => vi.fn() });
    },
  }) as ToolServices;

  return {
    studentId: brandId<"StudentId">(opts.studentId ?? "student-test"),
    sessionId: brandId<"SessionId">(opts.sessionId ?? "session-test"),
    ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
    ...(opts.courseDocumentIds !== undefined && { courseDocumentIds: opts.courseDocumentIds }),
    ...(opts.draftId !== undefined && { draftId: opts.draftId }),
    log:
      opts.log ??
      (() => {
        const l: ToolContext["log"] = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: () => l,
        };
        return l;
      })(),
    services,
  };
}
