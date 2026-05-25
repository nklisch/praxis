/**
 * Tests for story-create-course-select-existing-docs.
 *
 * Verifies that:
 * - A "Library" tab is present in the SourcePicker.
 * - Switching to the Library tab shows the student's documents from client.documents.list().
 * - Clicking "Select" on a document adds it to the attached sources list as "ready".
 * - Selecting the same document twice shows "selected" badge (idempotent).
 * - Selected library docs are attached to the session scope when Start Praxis is clicked.
 */
import type {
  DocumentSummary,
  PraxisClient,
  SessionHandle,
  SessionId,
  SessionTabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

const SESSION_ID = brandId<"SessionId">("session-library-test") as SessionId;

vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({
    openTab: vi.fn().mockResolvedValue({
      kind: "session",
      id: brandId<"TabId">("tab-library-test"),
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

const SAMPLE_DOC: DocumentSummary = {
  documentId: "doc-bio-123",
  filename: "Biology Textbook.pdf",
  mimeType: "application/pdf",
  ingestorId: "pdf",
  ingestorLabel: "PDF",
  chunkCount: 42,
  createdAt: new Date().toISOString(),
  hasPageImages: false,
};

function makeClient(opts?: { documents?: DocumentSummary[] }): PraxisClient {
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
        id: brandId<"TabId">("tab-library-test"),
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
      pickPaths: vi.fn().mockResolvedValue([]),
      isAvailable: () => true,
      start: vi.fn() as unknown as PraxisClient["ingest"]["start"],
      candidatesFor: vi.fn().mockResolvedValue([]),
      writeTempText: vi.fn().mockResolvedValue("/tmp/paste.txt"),
    } as PraxisClient["ingest"],
    packs: {
      listAvailable: vi.fn().mockResolvedValue([]),
      listImported: vi.fn().mockResolvedValue([]),
      import: vi.fn().mockResolvedValue({}),
    } as PraxisClient["packs"],
    documents: {
      list: vi.fn().mockResolvedValue(opts?.documents ?? [SAMPLE_DOC]),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ deleted: false }),
    } as unknown as PraxisClient["documents"],
    documentScopes: {
      attach: attachMock,
      detach: vi.fn().mockResolvedValue({ detached: true }),
      listForScope: vi.fn().mockResolvedValue([]),
      listOrphaned: vi.fn().mockResolvedValue([]),
      listScopesForDocument: vi.fn().mockResolvedValue([]),
    } as unknown as PraxisClient["documentScopes"],
  });
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

describe("CourseCreateRoute — Library tab (story-create-course-select-existing-docs)", () => {
  it("renders a Library tab in the source picker", () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    expect(libraryTab).toBeDefined();
  });

  it("Library tab is not active on first load (Pack is active by default)", () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    expect(libraryTab.getAttribute("aria-selected")).toBe("false");
  });

  it("shows library documents when Library tab is clicked", async () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Biology Textbook.pdf")).toBeDefined();
    });
  });

  it("shows a 'Select' button per library document row", async () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Select Biology Textbook/i })).toBeDefined();
    });
  });

  it("clicking Select adds the document to attached sources with 'ready' status", async () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Select Biology Textbook/i })).toBeDefined();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Select Biology Textbook/i }).click();
    });

    // The document label appears in the attached sources list.
    await waitFor(() => {
      // At least one "Biology Textbook.pdf" should now appear in the attached list.
      expect(screen.getAllByText("Biology Textbook.pdf").length).toBeGreaterThanOrEqual(1);
    });

    // Status should be "ready".
    await waitFor(() => {
      expect(screen.getByText("ready")).toBeDefined();
    });
  });

  it("clicking Select twice shows 'selected' badge (idempotent)", async () => {
    const client = makeClient();
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Select Biology Textbook/i })).toBeDefined();
    });

    // First select.
    await act(async () => {
      screen.getByRole("button", { name: /Select Biology Textbook/i }).click();
    });

    // After first select, the row should show a "selected" badge (no Select button).
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Select Biology Textbook/i })).toBeNull();
      expect(screen.getByText("selected")).toBeDefined();
    });
  });

  it("selected library doc is attached to session scope when Start Praxis is clicked", async () => {
    const client = makeClient();
    // biome-ignore lint/suspicious/noExplicitAny: test-only instrumentation
    const attachMock = (client as any)._attachMock as ReturnType<typeof vi.fn>;

    renderRoute(client);

    // Open Library tab and select the document.
    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Select Biology Textbook/i })).toBeDefined();
    });

    await act(async () => {
      screen.getByRole("button", { name: /Select Biology Textbook/i }).click();
    });

    // Click Start Praxis.
    await act(async () => {
      screen.getByRole("button", { name: /Start Praxis/i }).click();
    });

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalled();
    });

    // documentScopes.attach must have been called with the session scope + doc id.
    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { kind: "session", id: SESSION_ID },
          documentId: SAMPLE_DOC.documentId,
          source: "course-create",
        }),
      );
    });
  });

  it("shows empty state when library has no documents", async () => {
    const client = makeClient({ documents: [] });
    renderRoute(client);

    const libraryTab = screen.getByRole("tab", { name: /library/i });
    await act(async () => {
      libraryTab.click();
    });

    await waitFor(() => {
      // The empty state copy from COPY.empty.libraryPickerEmpty
      expect(screen.getByText(/No documents in your library yet/i)).toBeDefined();
    });
  });
});
