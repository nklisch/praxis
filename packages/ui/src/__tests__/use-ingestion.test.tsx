/**
 * Tests for the useIngestion hook.
 *
 * Verifies:
 * - When opts.courseId is provided, client.ingest.start is called with req.courseId set.
 * - When opts.courseId is absent, client.ingest.start is called without courseId.
 * - Initial state is idle.
 * - After startPick → pickFile returns a non-PDF path, ingestion starts immediately.
 * - After a "done" event, state is "done" and onDone fires.
 *
 * Batch flow:
 * - startPickBatch("files") with 3 files runs them sequentially.
 * - Empty pick (user cancelled) → returns to idle.
 * - Mid-batch error → batch continues; error recorded in results.
 * - cancelBatch() mid-flight → summary shows partial results.
 * - Tier modal batch metadata is set correctly.
 * - skipCurrentFile() advances the batch without ingesting that file.
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

function makeDoneStream(documentId = "doc-new", chunkCount = 10) {
  return makeEventStream([{ type: "done", documentId, chunkCount } as IngestionEvent]);
}

function makeErrorStream(message = "parse error") {
  return makeEventStream([{ type: "error", error: { message } } as unknown as IngestionEvent]);
}

function makeClient(opts?: {
  pickFilePath?: string | null;
  pickPaths?: string[];
  startFn?: PraxisClient["ingest"]["start"];
}): PraxisClient {
  return makeFakeClient({
    ingest: {
      pickFile: vi.fn().mockResolvedValue(opts?.pickFilePath ?? null),
      pickPaths: vi.fn().mockResolvedValue(opts?.pickPaths ?? []),
      isAvailable: () => true,
      start:
        opts?.startFn ??
        (vi.fn().mockReturnValue(makeDoneStream()) as unknown as PraxisClient["ingest"]["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
    } as PraxisClient["ingest"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ─── Existing single-file tests ──────────────────────────────────────────────

describe("useIngestion — single-file (startPick)", () => {
  it("initial state is idle", () => {
    const client = makeClient();
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });
    expect(result.current.state.status).toBe("idle");
  });

  it("when opts.courseId is provided, client.ingest.start receives courseId on the request", async () => {
    const startFn = vi.fn().mockReturnValue(makeDoneStream());
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
    const startFn = vi.fn().mockReturnValue(makeDoneStream());
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

  it("empty pick (user cancelled) returns to idle", async () => {
    const client = makeClient({ pickFilePath: null });
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPick();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("idle");
    });
  });
});

// ─── Batch flow tests ────────────────────────────────────────────────────────

describe("useIngestion — batch flow (startPickBatch)", () => {
  it("empty pick (user cancelled) returns to idle", async () => {
    const client = makeClient({ pickPaths: [] });
    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPickBatch("files");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("idle");
    });
  });

  it("startPickBatch('files') with 3 non-PDF files runs them sequentially and lands on batch_summary", async () => {
    const paths = ["/docs/a.txt", "/docs/b.md", "/docs/c.html"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return makeDoneStream(`doc-${callCount}`, callCount * 3);
    });

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPickBatch("files");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    expect(startFn).toHaveBeenCalledTimes(3);

    if (result.current.state.status === "batch_summary") {
      const { results } = result.current.state;
      expect(results).toHaveLength(3);
      expect(results[0]?.outcome.ok).toBe(true);
      expect(results[1]?.outcome.ok).toBe(true);
      expect(results[2]?.outcome.ok).toBe(true);
    }
  });

  it("mid-batch error doesn't abort the batch; error is recorded in results", async () => {
    const paths = ["/docs/a.txt", "/docs/b.txt", "/docs/c.txt"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return makeErrorStream("parse failed");
      }
      return makeDoneStream(`doc-${callCount}`);
    });

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPickBatch("files");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    expect(startFn).toHaveBeenCalledTimes(3);

    if (result.current.state.status === "batch_summary") {
      const { results } = result.current.state;
      expect(results).toHaveLength(3);
      expect(results[0]?.outcome.ok).toBe(true);
      expect(results[1]?.outcome.ok).toBe(false);
      if (!results[1]?.outcome.ok) {
        expect(results[1]?.outcome.message).toBe("parse failed");
      }
      expect(results[2]?.outcome.ok).toBe(true);
    }
  });

  it("tier_selection state carries batch metadata for PDF files", async () => {
    // 2 PDFs so we can verify batch.current / batch.total on the first.
    const paths = ["/docs/a.pdf", "/docs/b.pdf"];

    const startFn = vi.fn().mockReturnValue(makeDoneStream());

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    // Kick off the batch — don't await; it will pause at tier_selection.
    act(() => {
      void result.current.startPickBatch("files");
    });

    // Wait for the first tier_selection state to appear.
    await waitFor(() => {
      expect(result.current.state.status).toBe("tier_selection");
    });

    if (result.current.state.status === "tier_selection") {
      expect(result.current.state.batch).toEqual({ current: 1, total: 2 });
      expect(result.current.state.filename).toBe("a.pdf");
    }

    // Confirm the tier to advance.
    await act(async () => {
      await result.current.confirmTier("/docs/a.pdf", "a.pdf", "application/pdf", "js-pdf");
    });

    // Second PDF tier_selection.
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status === "tier_selection" && s.filename === "b.pdf").toBe(true);
    });

    if (result.current.state.status === "tier_selection") {
      expect(result.current.state.batch).toEqual({ current: 2, total: 2 });
    }

    // Confirm second tier to finish batch.
    await act(async () => {
      await result.current.confirmTier("/docs/b.pdf", "b.pdf", "application/pdf", "js-pdf");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    expect(startFn).toHaveBeenCalledTimes(2);
  });

  it("skipCurrentFile records the file as skipped and advances the batch", async () => {
    const paths = ["/docs/a.pdf", "/docs/b.txt"];

    const startFn = vi.fn().mockReturnValue(makeDoneStream("doc-b"));

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    act(() => {
      void result.current.startPickBatch("files");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("tier_selection");
    });

    // Skip the PDF.
    act(() => {
      result.current.skipCurrentFile();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    if (result.current.state.status === "batch_summary") {
      const { results } = result.current.state;
      expect(results).toHaveLength(2);
      expect(results[0]?.outcome.ok).toBe(false);
      if (!results[0]?.outcome.ok) {
        expect(results[0]?.outcome.message).toBe("Skipped by user");
      }
      expect(results[1]?.outcome.ok).toBe(true);
    }

    // Ingestion was called once (for b.txt only).
    expect(startFn).toHaveBeenCalledTimes(1);
  });

  it("cancelBatch mid-flight transitions to batch_summary with partial results", async () => {
    const paths = ["/docs/a.txt", "/docs/b.pdf", "/docs/c.txt"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return makeDoneStream(`doc-${callCount}`);
    });

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(), { wrapper: wrapper(client) });

    act(() => {
      void result.current.startPickBatch("files");
    });

    // Wait for the first file (a.txt) to ingest and the second (b.pdf) to hit tier_selection.
    await waitFor(() => {
      expect(result.current.state.status).toBe("tier_selection");
    });

    // Cancel during tier_selection for b.pdf.
    act(() => {
      result.current.cancelBatch();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    if (result.current.state.status === "batch_summary") {
      // a.txt succeeded, then cancel was triggered — summary may have 1 or 2
      // entries depending on how the cancel races with the loop. At minimum,
      // we know c.txt was never ingested.
      expect(result.current.state.results.length).toBeLessThanOrEqual(2);
    }

    // c.txt must not have been ingested (only a.txt was).
    expect(startFn).toHaveBeenCalledTimes(1);
  });

  it("onDone fires once per successfully ingested file in a batch", async () => {
    const paths = ["/docs/a.txt", "/docs/b.txt"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return makeDoneStream(`doc-${callCount}`);
    });

    const onDone = vi.fn();
    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as PraxisClient["ingest"]["start"],
    });

    const { result } = renderHook(() => useIngestion(onDone), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.startPickBatch("files");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("batch_summary");
    });

    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
