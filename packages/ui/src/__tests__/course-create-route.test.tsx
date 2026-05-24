/**
 * Tests for <CourseCreateRoute> — focused on the ingestion status sync and
 * context-text forwarding via consumeInitialMessage.
 *
 * Verifies:
 * - Files added via startPickBatch land with "indexing" status while ingesting.
 * - After batch_summary fires, files transition to "ready" (ok) or "error" (!ok).
 * - Mixed-outcome batches: ok → ready, error → error, no file left at indexing.
 * - Context text is stored for consumeInitialMessage (not fire-and-forget sent).
 */
import type {
  IngestionEvent,
  PraxisClient,
  SessionHandle,
  SessionId,
  SessionTabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { consumeInitialMessage } from "../lib/open-session-in-tab.js";
import { CourseCreateRoute } from "../routes/course-create.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// TanStack Router hooks used in CourseCreateRoute.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    useSearch: () => ({}),
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({
    openTab: vi.fn().mockResolvedValue({
      kind: "session",
      id: brandId<"TabId">("tab-1"),
      sessionId: brandId<"SessionId">("s1"),
      modeId: "course-create",
      title: "test tab",
      sortOrder: 0,
      openedAt: Date.now() as Timestamp,
      lastSeenAt: Date.now() as Timestamp,
      closedAt: null,
    }),
  }),
}));

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
        modeId: "course-create",
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
        modeId: "course-create",
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
      writeTempText: vi.fn().mockResolvedValue("/tmp/Pasted notes (2026-05-23).txt"),
    } as IngestClient,
    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <CourseCreateRoute />
    </PraxisClientProvider>,
  );
}

/** Build a client wired for the context-forwarding tests (no ingest needed). */
function makeClientForContext(): PraxisClient {
  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("s1"),
        modeId: "course-create",
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
        modeId: "course-create",
        title: "test tab",
        sortOrder: 0,
        openedAt: Date.now() as Timestamp,
        lastSeenAt: Date.now() as Timestamp,
        closedAt: null,
      } satisfies SessionTabSummary),
    } as unknown as PraxisClient["tabs"],
    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      pickPaths: vi.fn().mockResolvedValue([]),
      isAvailable: () => true,
      start: vi.fn().mockImplementation(() => makeDoneStream()) as unknown as IngestClient["start"],
      candidatesFor: vi.fn().mockResolvedValue([]),
      writeTempText: vi.fn().mockResolvedValue("/tmp/Pasted notes (2026-05-23).txt"),
    } as IngestClient,
    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CourseCreateRoute — context textarea forwarding", () => {
  it("does NOT store initialMessage when context is empty", async () => {
    const client = makeClientForContext();
    renderRoute(client);

    // Context textarea is empty by default — click Start Praxis immediately.
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // Empty context: no initial message stored, session.send never called.
    expect(
      consumeInitialMessage(brandId<"SessionId">("s1") as unknown as SessionId),
    ).toBeUndefined();
    expect(client.session.send).not.toHaveBeenCalled();
  });

  it("does NOT store initialMessage when context is whitespace-only", async () => {
    const client = makeClientForContext();
    const { getByRole } = renderRoute(client);

    fireEvent.change(getByRole("textbox"), { target: { value: "   " } });

    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // Whitespace-only context: no initial message stored, session.send never called.
    expect(
      consumeInitialMessage(brandId<"SessionId">("s1") as unknown as SessionId),
    ).toBeUndefined();
    expect(client.session.send).not.toHaveBeenCalled();
  });

  it("stores context text for consumeInitialMessage when context is non-empty", async () => {
    const client = makeClientForContext();
    const { getByRole } = renderRoute(client);

    const contextText = "I'm an adult learner returning to calculus to prep for an actuarial exam.";

    fireEvent.change(getByRole("textbox"), { target: { value: contextText } });

    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // Context text is stored for the tab body to pick up — never fire-and-forget sent.
    expect(client.session.send).not.toHaveBeenCalled();
    expect(consumeInitialMessage(brandId<"SessionId">("s1") as unknown as SessionId)).toBe(
      contextText,
    );
  });

  it("trims whitespace before storing context", async () => {
    const client = makeClientForContext();
    const { getByRole } = renderRoute(client);

    fireEvent.change(getByRole("textbox"), { target: { value: "  learn calculus deeply  " } });

    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    expect(consumeInitialMessage(brandId<"SessionId">("s1") as unknown as SessionId)).toBe(
      "learn calculus deeply",
    );
  });
});

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

    // Switch to the Upload tab so the "browse files" button is in the DOM.
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));

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

    // Switch to the Upload tab so the "browse files" button is in the DOM.
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));

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

    // Switch to the Upload tab so the "browse files" button is in the DOM.
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));

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
