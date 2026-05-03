/**
 * Tests for the useIngestion hook.
 *
 * Verifies:
 * - When opts.courseId is provided, client.ingest.start is called with req.courseId set.
 * - When opts.courseId is absent, client.ingest.start is called without courseId.
 * - Initial state is idle.
 * - After startPick → pickFile returns a non-PDF path, ingestion starts immediately.
 * - After a "done" event, state is "done" and onDone fires.
 */
import type { CourseId, IngestionEvent, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { makeFakeClient } from "./helpers/fake-client.js";

const COURSE_ID = brandId<"CourseId">("course-xyz") as CourseId;

/**
 * Build an async generator that yields the given events as IngestionEvents,
 * then returns.
 */
async function* makeEventStream(
  events: IngestionEvent[],
): AsyncGenerator<IngestionEvent, void, unknown> {
  for (const event of events) {
    yield event;
  }
}

function makeClient(opts?: {
  pickFilePath?: string | null;
  startFn?: PraxisClient["ingest"]["start"];
}): PraxisClient {
  return makeFakeClient({
    ingest: {
      pickFile: vi.fn().mockResolvedValue(opts?.pickFilePath ?? null),
      isAvailable: () => true,
      start:
        opts?.startFn ??
        (vi
          .fn()
          .mockReturnValue(
            makeEventStream([
              { type: "done", documentId: "doc-new", chunkCount: 10 },
            ] as IngestionEvent[]),
          ) as unknown as PraxisClient["ingest"]["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
    } as PraxisClient["ingest"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

describe("useIngestion", () => {
  it("initial state is idle", () => {
    const client = makeClient();
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });
    expect(result.current.state.status).toBe("idle");
  });

  it("when opts.courseId is provided, client.ingest.start receives courseId on the request", async () => {
    const startFn = vi
      .fn()
      .mockReturnValue(
        makeEventStream([{ type: "done", documentId: "doc-new", chunkCount: 5 } as IngestionEvent]),
      );
    const client = makeClient({
      pickFilePath: "/documents/textbook.txt",
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(undefined, { courseId: COURSE_ID }), {
      wrapper: wrapper(client),
    });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });

    expect(startFn).toHaveBeenCalledOnce();
    const req = startFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(req.courseId).toBe(COURSE_ID);
  });

  it("when opts.courseId is absent, client.ingest.start receives no courseId", async () => {
    const startFn = vi
      .fn()
      .mockReturnValue(
        makeEventStream([{ type: "done", documentId: "doc-new", chunkCount: 5 } as IngestionEvent]),
      );
    const client = makeClient({
      pickFilePath: "/documents/textbook.txt",
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });

    const req = startFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(req.courseId).toBeUndefined();
  });

  it("state becomes 'done' with documentId after a done event", async () => {
    const client = makeClient({ pickFilePath: "/docs/notes.txt" });
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });

    if (result.current.state.status === "done") {
      expect(result.current.state.documentId).toBe("doc-new");
    }
  });

  it("onDone callback fires after successful ingestion", async () => {
    const onDone = vi.fn();
    const client = makeClient({ pickFilePath: "/docs/notes.txt" });
    const { result } = renderHook(() => useIngestion(onDone), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("dismiss resets state to idle", async () => {
    const client = makeClient({ pickFilePath: "/docs/notes.txt" });
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state.status).toBe("idle");
  });
});
