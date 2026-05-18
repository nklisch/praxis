/**
 * Tests for <CourseCreateRoute> — focused on the ingestion status sync.
 *
 * Verifies:
 * - Files added via startPickBatch land with "indexing" status while ingesting.
 * - After batch_summary fires, files transition to "ready" (ok) or "error" (!ok).
 * - Mixed-outcome batches: ok → ready, error → error, no file left at indexing.
 */
import type {
  IngestionEvent,
  PraxisClient,
  SessionHandle,
  SessionTabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { CourseCreateRoute } from "../routes/course-create.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// TanStack Router hooks used in CourseCreateRoute.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

afterEach(() => cleanup());

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function* makeEventStream(
  events: IngestionEvent[],
): AsyncGenerator<IngestionEvent, void, unknown> {
  for (const ev of events) {
    yield ev;
  }
}

function makeDoneStream(documentId = "doc-1", chunkCount = 5) {
  return makeEventStream([{ type: "done", documentId, chunkCount } as IngestionEvent]);
}

function makeErrorStream(message = "parse error") {
  return makeEventStream([{ type: "error", error: { message } } as unknown as IngestionEvent]);
}

type IngestClient = PraxisClient["ingest"];

function makeClient(opts?: {
  pickPaths?: string[];
  startFn?: IngestClient["start"];
}): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        modeId: "bootstrap",
        startedAt: Date.now() as Timestamp,
      } satisfies SessionHandle),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(),
    } as PraxisClient["session"],
    tabs: {
      open: vi.fn().mockResolvedValue({
        kind: "session",
        id: brandId<"TabId">("tab-1"),
        sessionId: brandId<"SessionId">("s1"),
        modeId: "bootstrap",
        title: "test tab",
        sortOrder: 0,
        openedAt: Date.now() as Timestamp,
        lastSeenAt: Date.now() as Timestamp,
        closedAt: null,
      } satisfies SessionTabSummary),
    } as unknown as PraxisClient["tabs"],
    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      pickPaths: vi.fn().mockResolvedValue(opts?.pickPaths ?? []),
      isAvailable: () => true,
      start:
        opts?.startFn ??
        (vi.fn().mockImplementation(() => makeDoneStream()) as unknown as IngestClient["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
    } as IngestClient,
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <CourseCreateRoute />
    </PraxisClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CourseCreateRoute — ingestion status sync", () => {
  it("batch_summary with all-ok results: files transition from indexing to ready", async () => {
    const paths = ["/docs/a.txt", "/docs/b.txt"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return makeDoneStream(`doc-${callCount}`);
    });

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as IngestClient["start"],
    });

    renderRoute(client);

    // Trigger the browse button to start a batch pick.
    // Use the async form of act so pending microtasks (promise chains in
    // startPickBatch) are flushed before assertions run.
    await act(async () => {
      screen.getByRole("button", { name: /browse files/i }).click();
    });

    // After batch completes, both files should be "ready".
    await waitFor(() => {
      expect(screen.getAllByText("ready")).toHaveLength(2);
    });

    // No file should still show "indexing".
    expect(screen.queryByText("indexing")).toBeNull();
  });

  it("batch_summary with mixed results: ok file is ready, failed file shows error", async () => {
    const paths = ["/docs/good.txt", "/docs/bad.txt"];

    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 2 ? makeErrorStream("parse failed") : makeDoneStream("doc-good");
    });

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as IngestClient["start"],
    });

    renderRoute(client);

    await act(async () => {
      screen.getByRole("button", { name: /browse files/i }).click();
    });

    await waitFor(() => {
      expect(screen.getByText("ready")).toBeDefined();
      expect(screen.getByText("error")).toBeDefined();
    });

    // No file stuck at indexing.
    expect(screen.queryByText("indexing")).toBeNull();
  });

  it("batch_summary with all-error results: all files show error", async () => {
    const paths = ["/docs/a.txt", "/docs/b.txt"];

    const startFn = vi.fn().mockImplementation(() => makeErrorStream("boom"));

    const client = makeClient({
      pickPaths: paths,
      startFn: startFn as unknown as IngestClient["start"],
    });

    renderRoute(client);

    await act(async () => {
      screen.getByRole("button", { name: /browse files/i }).click();
    });

    await waitFor(() => {
      expect(screen.getAllByText("error")).toHaveLength(2);
    });

    expect(screen.queryByText("indexing")).toBeNull();
    expect(screen.queryByText("ready")).toBeNull();
  });
});
