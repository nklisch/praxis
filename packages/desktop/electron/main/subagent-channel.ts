import type { Logger, SubAgentEvent } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

/**
 * Streams sub-agent transparency events from `services.subAgent` to the renderer.
 *
 * Channel naming matches the project's streaming convention:
 *   praxis.subAgent.events.start  (invoke with streamId + optional parentCallId)
 *   praxis.subAgent.events.events.<streamId> (push) — IpcStreamMessage<SubAgentEvent>
 *   praxis.subAgent.events.cancel (on) — unsubscribes
 *
 * Also provides a non-streaming list endpoint:
 *   praxis.subAgent.list (invoke) — returns readonly SubAgentItem[]
 */
export function registerSubAgentHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);
  const sessionIdByParentCallId = new Map<string, string>();

  handle(
    "praxis.subAgent.list",
    wrapEnvelope("praxis.subAgent.list", log, async () => services.subAgent.list()),
  );

  registerSubscriberStream<SubAgentEvent, [parentCallId?: string]>(
    {
      channelBase: "praxis.subAgent.events",
      log,
      webContentsGetter,
      activeAbortControllers,
      debugTrace: services.debugTrace,
    },
    { handle, on },
    {
      subscribe: (cb, [parentCallId]) => {
        const filter = parentCallId !== undefined ? { parentCallId } : undefined;
        return services.subAgent.subscribe(cb, filter);
      },
      traceBindings: ([parentCallId]) =>
        parentCallId !== undefined ? { parentCallId } : undefined,
      summarizeEvent: (event, ctx) =>
        summarizeSubAgentStreamEvent(event, ctx.args[0], sessionIdByParentCallId),
    },
  );
}

function summarizeSubAgentStreamEvent(
  event: SubAgentEvent,
  subscribedParentCallId: string | undefined,
  sessionIdByParentCallId: Map<string, string>,
): {
  eventType: string;
  parentCallId?: string;
  sessionId?: string;
  callId?: string;
  summary?: string;
} {
  switch (event.kind) {
    case "snapshot": {
      for (const item of event.items) {
        sessionIdByParentCallId.set(item.parentCallId, item.sessionId);
      }
      const item =
        subscribedParentCallId !== undefined
          ? event.items.find((candidate) => candidate.parentCallId === subscribedParentCallId)
          : undefined;
      return {
        eventType: event.kind,
        ...(subscribedParentCallId !== undefined && { parentCallId: subscribedParentCallId }),
        ...(item !== undefined && {
          sessionId: item.sessionId,
          summary: `snapshot:${item.status}`,
        }),
      };
    }
    case "started":
      sessionIdByParentCallId.set(event.item.parentCallId, event.item.sessionId);
      return {
        eventType: event.kind,
        parentCallId: event.item.parentCallId,
        sessionId: event.item.sessionId,
        summary: `phase:${event.item.label};status:${event.item.status}`,
      };
    case "step_started":
      return {
        eventType: event.kind,
        parentCallId: event.parentCallId,
        callId: event.step.callId,
        summary: `step:${event.step.toolName}`,
        ...sessionIdField(sessionIdByParentCallId, event.parentCallId),
      };
    case "step_settled":
      return {
        eventType: event.kind,
        parentCallId: event.parentCallId,
        callId: event.callId,
        summary: `step:${event.ok ? "ok" : "failed"}`,
        ...sessionIdField(sessionIdByParentCallId, event.parentCallId),
      };
    case "phase_changed":
      return {
        eventType: event.kind,
        parentCallId: event.parentCallId,
        summary: `phase:${event.label}`,
        ...sessionIdField(sessionIdByParentCallId, event.parentCallId),
      };
    case "finished":
      return {
        eventType: event.kind,
        parentCallId: event.parentCallId,
        summary: `status:${event.status}`,
        ...sessionIdField(sessionIdByParentCallId, event.parentCallId),
      };
  }
}

function sessionIdField(
  sessionIdByParentCallId: Map<string, string>,
  parentCallId: string,
): { sessionId?: string } {
  const sessionId = sessionIdByParentCallId.get(parentCallId);
  return sessionId !== undefined ? { sessionId } : {};
}
