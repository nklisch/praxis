/**
 * Regression test for story-fix-create-to-design-docs-missing.
 *
 * Verifies that when the user has uploaded documents and clicks "Start Praxis",
 * each ready document is attached to the new course-create session scope via
 * `client.documentScopes.attach({ scope: { kind: "session", id }, documentId })`.
 *
 * Without the fix, `handleStart` called `openSessionInTab` without any
 * subsequent attach calls, so `listForScope({ kind: "session", id })` returned
 * empty and the documents panel showed nothing in the design session.
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
import { CourseCreateRoute } from "../routes/course-create.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// ─── Router + tabs mocks ──────────────────────────────────────────────────────

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    useSearch: () => ({}),
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

const SESSION_ID = brandId<"SessionId">("session-attach-test") as SessionId;

vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({
    openTab: vi.fn().mockResolvedValue({
      kind: "session",
      id: brandId<"TabId">("tab-attach-test"),
      sessionId: SESSION_ID,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function* makeDoneStream(
  documentId: string,
  chunkCount = 3,
): AsyncGenerator<IngestionEvent, void, unknown> {
  yield { type: "done", documentId, chunkCount } as IngestionEvent;
}

type IngestClient = PraxisClient["ingest"];

function makeClient(opts?: {
  pickPaths?: string[];
  startFn?: IngestClient["start"];
}): PraxisClient {
  const attachMock = vi.fn().mockResolvedValue({ attached: true });
  const client = makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        modeId: "course-create",
        startedAt: Date.now() as Timestamp,
      } satisfies SessionHandle),
      end: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(),
    } as PraxisClient["session"],
    tabs: {
      open: vi.fn().mockResolvedValue({
        kind: "session",
        id: brandId<"TabId">("tab-attach-test"),
        sessionId: SESSION_ID,
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
      // Default to .txt to avoid the PDF tier-selection modal flow in tests.
      pickPaths: vi.fn().mockResolvedValue(opts?.pickPaths ?? ["/tmp/bio.txt"]),
      isAvailable: () => true,
      start:
        opts?.startFn ??
        (vi
          .fn()
          .mockImplementation(() =>
            makeDoneStream("doc-bio-1"),
          ) as unknown as IngestClient["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
      writeTempText: vi.fn().mockResolvedValue("/tmp/paste.txt"),
    } as IngestClient,
    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
    documentScopes: {
      attach: attachMock,
      detach: vi.fn().mockResolvedValue({ detached: true }),
      listForScope: vi.fn().mockResolvedValue([]),
      listOrphaned: vi.fn().mockResolvedValue([]),
      listScopesForDocument: vi.fn().mockResolvedValue([]),
    } as unknown as PraxisClient["documentScopes"],
  });
  // Expose attachMock via the client reference for assertion convenience.
  (client as PraxisClient & { _attachMock: typeof attachMock })._attachMock = attachMock;
  return client;
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <CourseCreateRoute />
    </PraxisClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CourseCreateRoute — document scope attachment on Start (story-fix-create-to-design-docs-missing)", () => {
  it("attaches each uploaded document to the session scope when Start Praxis is clicked", async () => {
    // Use .txt (not .pdf) to avoid the PDF tier-selection modal flow.
    const client = makeClient({ pickPaths: ["/tmp/bio.txt"] });
    // biome-ignore lint/suspicious/noExplicitAny: test-only instrumentation
    const attachMock = (client as any)._attachMock as ReturnType<typeof vi.fn>;

    renderRoute(client);

    // Switch to Upload tab and click "browse files" to trigger ingestion.
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));
    await act(async () => {
      screen.getByRole("button", { name: /browse files/i }).click();
    });

    // Wait for the doc to show as "ready" before starting.
    await waitFor(() => {
      expect(screen.getByText("ready")).toBeDefined();
    });

    // Click "Start Praxis".
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    // session.start must have been called first.
    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "course-create" });
    });

    // documentScopes.attach must have been called with the session scope + the
    // document id that came back from the ingestion event.
    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { kind: "session", id: SESSION_ID },
          documentId: "doc-bio-1",
          source: "course-create",
        }),
      );
    });
  });

  it("does NOT call documentScopes.attach when no files are attached", async () => {
    const client = makeClient();
    // biome-ignore lint/suspicious/noExplicitAny: test-only instrumentation
    const attachMock = (client as any)._attachMock as ReturnType<typeof vi.fn>;

    renderRoute(client);

    // Click Start Praxis immediately (no attached files).
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalled();
    });

    // No attach calls when there are no ready documents.
    expect(attachMock).not.toHaveBeenCalled();
  });

  it("attaches multiple documents when multiple files are uploaded", async () => {
    let callCount = 0;
    const startFn = vi.fn().mockImplementation(() => {
      callCount++;
      return makeDoneStream(`doc-${callCount}`);
    });

    // Use .txt (not .pdf) to avoid the PDF tier-selection modal flow.
    const client = makeClient({
      pickPaths: ["/tmp/a.txt", "/tmp/b.txt"],
      startFn: startFn as unknown as IngestClient["start"],
    });
    // biome-ignore lint/suspicious/noExplicitAny: test-only instrumentation
    const attachMock = (client as any)._attachMock as ReturnType<typeof vi.fn>;

    renderRoute(client);

    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));
    await act(async () => {
      screen.getByRole("button", { name: /browse files/i }).click();
    });

    await waitFor(() => {
      expect(screen.getAllByText("ready")).toHaveLength(2);
    });

    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      // Both documents must be attached to the session scope.
      expect(attachMock).toHaveBeenCalledTimes(2);
    });

    const calls = attachMock.mock.calls as Array<
      [{ scope: { kind: string; id: string }; documentId: string }]
    >;
    const attachedIds = calls.map((c) => c[0].documentId);
    expect(attachedIds).toContain("doc-1");
    expect(attachedIds).toContain("doc-2");

    // All calls must use the session scope.
    for (const [args] of calls) {
      expect(args.scope).toEqual({ kind: "session", id: SESSION_ID });
    }
  });
});
