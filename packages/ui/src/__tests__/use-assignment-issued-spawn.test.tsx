/**
 * Tests for useAssignmentIssuedSpawn (Phase 16).
 *
 * Key behaviour:
 * - When an activity event with metadata.kind === "assignment.issued" fires,
 *   spawnFromAssignment is called and then openTab is called with the returned sessionId.
 * - Duplicate events for the same assignmentId are deduplicated (idempotency).
 * - Non-matching events are ignored.
 */
import type { ActivityEvent, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useAssignmentIssuedSpawn } from "../hooks/use-assignment-issued-spawn.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

function makeAsyncIterable(events: ActivityEvent[]): AsyncIterable<ActivityEvent> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const ev of events) {
        yield ev;
      }
    },
  };
}

function makeWrapper(client: PraxisClient) {
  return function Wrapper({ children }: { children: React.ReactNode }): JSX.Element {
    return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
  };
}

describe("useAssignmentIssuedSpawn", () => {
  it("calls spawnFromAssignment and openTab when assignment.issued fires", async () => {
    const spawnFromAssignment = vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("child-session-1"),
      modeId: "quiz",
      startedAt: Date.now() as Timestamp,
    });
    const openTab = vi.fn().mockResolvedValue({
      id: brandId<"TabId">("new-tab-1"),
      sessionId: brandId<"SessionId">("child-session-1"),
      modeId: "quiz",
      title: "algebra · quiz",
      sortOrder: 1,
      openedAt: Date.now() as Timestamp,
      lastSeenAt: Date.now() as Timestamp,
      closedAt: null,
    });

    const events: ActivityEvent[] = [
      {
        kind: "added",
        item: {
          id: "activity-1",
          label: "quiz issued: linear equations",
          status: "done",
          startedAt: Date.now() as Timestamp,
          metadata: {
            kind: "assignment.issued",
            assignmentId: "assignment-abc",
            parentSessionId: "parent-session-1",
          },
        },
      },
    ];

    const client = makeFakeClient({
      session: {
        spawnFromAssignment,
        active: vi.fn().mockResolvedValue(null),
        start: vi.fn(),
        end: vi.fn(),
        send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
        list: vi.fn().mockResolvedValue([]),
      },
      activity: {
        events: vi.fn().mockReturnValue(makeAsyncIterable(events)),
        dismiss: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderHook(() => useAssignmentIssuedSpawn(openTab), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      expect(spawnFromAssignment).toHaveBeenCalledOnce();
      expect(spawnFromAssignment).toHaveBeenCalledWith({
        assignmentId: brandId<"AssignmentId">("assignment-abc"),
        parentSessionId: brandId<"SessionId">("parent-session-1"),
      });
      expect(openTab).toHaveBeenCalledOnce();
      expect(openTab).toHaveBeenCalledWith({
        sessionId: brandId<"SessionId">("child-session-1"),
      });
    });
  });

  it("does NOT call spawnFromAssignment for the same assignmentId twice (idempotency)", async () => {
    const spawnFromAssignment = vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("child-session-1"),
      modeId: "quiz",
      startedAt: Date.now() as Timestamp,
    });
    const openTab = vi.fn().mockResolvedValue({
      id: brandId<"TabId">("new-tab-1"),
      sessionId: brandId<"SessionId">("child-session-1"),
      modeId: "quiz",
      title: "algebra · quiz",
      sortOrder: 1,
      openedAt: Date.now() as Timestamp,
      lastSeenAt: Date.now() as Timestamp,
      closedAt: null,
    });

    const duplicateEvent: ActivityEvent = {
      kind: "added",
      item: {
        id: "activity-1",
        label: "quiz issued",
        status: "done",
        startedAt: Date.now() as Timestamp,
        metadata: {
          kind: "assignment.issued",
          assignmentId: "assignment-abc",
          parentSessionId: "parent-session-1",
        },
      },
    };

    // Same assignmentId fires twice
    const events: ActivityEvent[] = [duplicateEvent, duplicateEvent];

    const client = makeFakeClient({
      session: {
        spawnFromAssignment,
        active: vi.fn().mockResolvedValue(null),
        start: vi.fn(),
        end: vi.fn(),
        send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
        list: vi.fn().mockResolvedValue([]),
      },
      activity: {
        events: vi.fn().mockReturnValue(makeAsyncIterable(events)),
        dismiss: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderHook(() => useAssignmentIssuedSpawn(openTab), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => {
      // Even though the event fired twice, spawn + openTab called only once
      expect(spawnFromAssignment).toHaveBeenCalledOnce();
      expect(openTab).toHaveBeenCalledOnce();
    });
  });

  it("ignores activity events without assignment.issued metadata", async () => {
    const spawnFromAssignment = vi.fn();
    const openTab = vi.fn();

    const events: ActivityEvent[] = [
      {
        kind: "added",
        item: {
          id: "activity-2",
          label: "ingesting document",
          status: "running",
          startedAt: Date.now() as Timestamp,
          metadata: { kind: "ingestion.started", documentId: "doc-1" },
        },
      },
      {
        kind: "removed",
        id: "activity-2",
      },
    ];

    const client = makeFakeClient({
      session: {
        spawnFromAssignment,
        active: vi.fn().mockResolvedValue(null),
        start: vi.fn(),
        end: vi.fn(),
        send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
        list: vi.fn().mockResolvedValue([]),
      },
      activity: {
        events: vi.fn().mockReturnValue(makeAsyncIterable(events)),
        dismiss: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderHook(() => useAssignmentIssuedSpawn(openTab), {
      wrapper: makeWrapper(client),
    });

    // Give async loop time to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(spawnFromAssignment).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
  });
});
