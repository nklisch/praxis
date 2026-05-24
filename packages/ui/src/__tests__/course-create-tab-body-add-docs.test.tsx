/**
 * Interaction tests for the "Add documents" affordance on CourseCreateTabBody.
 *
 * Verifies:
 * - An "Add documents" button is rendered in the outline header.
 * - Clicking it opens the LibraryDocumentPicker with the session scope.
 * - Clicking Attach inside the picker calls client.documentScopes.attach
 *   with { scope: { kind: 'session', id: sessionId }, ... }.
 * - The picker closes when its onClose is called.
 * - After attaching, the attached document appears on the canvas (Bug 2 fix).
 * - The picker modal is hidden (not stacked) when the batch-summary modal is shown (Bug 1 fix).
 */
import type { SessionId, SessionTabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock TanStack Router so useNavigate works in test context.
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({}),
  };
});

// Mock heavy sub-components to keep test fast and focused.
vi.mock("../components/authoring-chat-pane.js", () => ({
  AuthoringChatPane: () => <div data-testid="authoring-chat-pane" />,
}));
vi.mock("../components/draft-card.js", () => ({
  DraftCard: () => <div data-testid="draft-card" />,
}));
vi.mock("../hooks/use-drafts.js", () => ({
  useDrafts: () => ({ current: null }),
}));
vi.mock("../hooks/use-course-create-budget.js", () => ({
  COURSE_CREATE_BUDGET_MIN: 5,
  COURSE_CREATE_BUDGET_MAX: 200,
  useCourseCreateBudget: () => ({ maxSteps: 100, saving: false, setMaxSteps: vi.fn() }),
}));
vi.mock("../hooks/use-tabs.js", () => ({
  useTabs: () => ({ openTab: vi.fn().mockResolvedValue(undefined) }),
}));

// Import after mocks (Vitest hoists vi.mock calls).
const { CourseCreateTabBody } = await import("../components/course-create-tab-body.js");

afterEach(() => cleanup());

const SESSION_ID = brandId<"SessionId">("session-course-create-1") as SessionId;

function makeTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: SESSION_ID,
    modeId: "course-create",
    title: "course-create",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function renderCourseCreate(attachFn = vi.fn().mockResolvedValue({ attached: true })) {
  const client = makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue([
        {
          documentId: "doc-x",
          filename: "biology.pdf",
          mimeType: "application/pdf",
          ingestorId: "js-pdf",
          ingestorLabel: "JS PDF",
          chunkCount: 3,
          createdAt: new Date().toISOString(),
          hasPageImages: false,
        },
      ]),
      delete: vi.fn(),
      pageImage: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null),
    },
    documentScopes: {
      listForScope: vi.fn().mockResolvedValue([]),
      attach: attachFn,
      detach: vi.fn().mockResolvedValue({ detached: true }),
      listOrphaned: vi.fn().mockResolvedValue([]),
      listScopesForDocument: vi.fn().mockResolvedValue([]),
    },
    subAgent: {
      list: vi.fn().mockResolvedValue([]),
      events: vi.fn(async function* () {}),
    },
    // The finalization handler subscribes to drafts.events — return an empty
    // async generator so the useEffect doesn't throw in tests.
    drafts: {
      events: vi.fn(async function* () {}),
    } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
  });

  return {
    client,
    attachFn,
    ...render(
      <PraxisClientProvider client={client}>
        <CourseCreateTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    ),
  };
}

describe("CourseCreateTabBody — Add documents affordance", () => {
  it("renders an 'Add documents' button in the outline header", () => {
    renderCourseCreate();
    expect(screen.getByRole("button", { name: /add documents/i })).toBeDefined();
  });

  it("clicking 'Add documents' opens the LibraryDocumentPicker modal", async () => {
    renderCourseCreate();

    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    // The picker modal renders a dialog with LIBRARY kicker.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText("LIBRARY")).toBeDefined();
    });
  });

  it("attach inside the picker calls documentScopes.attach with session scope", async () => {
    const attachFn = vi.fn().mockResolvedValue({ attached: true });
    renderCourseCreate(attachFn);

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    // Wait for the library doc row to appear.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    // Click Attach.
    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(attachFn).toHaveBeenCalledWith({
        scope: { kind: "session", id: SESSION_ID },
        documentId: "doc-x",
        source: "manual",
      });
    });
  });

  it("picker closes when Close is clicked", async () => {
    renderCourseCreate();

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Close picker.
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("Bug 2: attached document appears on the canvas after Attach is clicked", async () => {
    // listForScope is called by two consumers:
    //   1. CourseCreateTabBody's attachedLoader (canvas list) — tracks refreshes
    //   2. LibraryDocumentPicker's loader (already-attached check inside the picker)
    //
    // Strategy: always return [] from the picker's listForScope (so the doc shows
    // as attachable), and only return the doc after a real attach call has fired
    // (tracked via attachCallCount). The canvas refresh happens via onAttached →
    // refreshAttached() → listForScope, so after attach the canvas call returns the doc.
    let attachCallCount = 0;
    const attachedDoc = {
      documentId: "doc-x",
      filename: "biology.pdf",
      mimeType: "application/pdf",
      chunkCount: 3,
      hasPageImages: false,
      source: "manual" as const,
      attachedAt: new Date(),
    };
    const attachFn = vi.fn().mockImplementation(async () => {
      attachCallCount++;
      return { attached: true };
    });
    // After attach has been called, subsequent listForScope calls return the doc.
    const listForScopeFn = vi.fn().mockImplementation(async () => {
      return attachCallCount > 0 ? [attachedDoc] : [];
    });

    const client = makeFakeClient({
      documents: {
        list: vi.fn().mockResolvedValue([
          {
            documentId: "doc-x",
            filename: "biology.pdf",
            mimeType: "application/pdf",
            ingestorId: "js-pdf",
            ingestorLabel: "JS PDF",
            chunkCount: 3,
            createdAt: new Date().toISOString(),
            hasPageImages: false,
          },
        ]),
        delete: vi.fn(),
        pageImage: vi.fn().mockResolvedValue(null),
        get: vi.fn().mockResolvedValue(null),
      },
      documentScopes: {
        listForScope: listForScopeFn,
        attach: attachFn,
        detach: vi.fn().mockResolvedValue({ detached: true }),
        listOrphaned: vi.fn().mockResolvedValue([]),
        listScopesForDocument: vi.fn().mockResolvedValue([]),
      },
      subAgent: {
        list: vi.fn().mockResolvedValue([]),
        events: vi.fn(async function* () {}),
      },
      drafts: {
        events: vi.fn(async function* () {}),
      } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
    });

    render(
      <PraxisClientProvider client={client}>
        <CourseCreateTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    );

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    // Wait for the library doc row and Attach button (picker renders before attachment).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    // Click Attach — triggers documentScopes.attach + onAttached → refreshAttached().
    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    // After attach + refresh, the attached doc should appear in the canvas section.
    await waitFor(() => {
      expect(screen.getByTestId("attached-docs-section")).toBeDefined();
    });

    // The canvas shows the filename.
    expect(screen.getAllByText("biology.pdf").length).toBeGreaterThanOrEqual(1);

    // attach was called once, listForScope was called multiple times (initial + refresh).
    expect(attachFn).toHaveBeenCalledOnce();
    expect(listForScopeFn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("Bug 1: picker modal is hidden (not stacked) when batch-summary modal is showing", async () => {
    // This verifies the fix: when ingestion.state.status === "batch_summary",
    // the picker <Modal> is not rendered (status !== "batch_summary" guard),
    // preventing two role="dialog" elements from being mounted simultaneously.
    //
    // We trigger the batch_summary state by dropping a non-PDF file into the picker,
    // which runs the batch loop (no tier selection for non-PDF) and transitions to
    // batch_summary.
    const startFn = vi.fn().mockImplementation(() =>
      (async function* () {
        yield { type: "done", documentId: "doc-new", chunkCount: 2 };
      })(),
    );

    const client = makeFakeClient({
      documents: {
        list: vi.fn().mockResolvedValue([
          {
            documentId: "doc-x",
            filename: "biology.pdf",
            mimeType: "application/pdf",
            ingestorId: "js-pdf",
            ingestorLabel: "JS PDF",
            chunkCount: 3,
            createdAt: new Date().toISOString(),
            hasPageImages: false,
          },
        ]),
        delete: vi.fn(),
        pageImage: vi.fn().mockResolvedValue(null),
        get: vi.fn().mockResolvedValue(null),
      },
      documentScopes: {
        listForScope: vi.fn().mockResolvedValue([]),
        attach: vi.fn().mockResolvedValue({ attached: true }),
        detach: vi.fn().mockResolvedValue({ detached: true }),
        listOrphaned: vi.fn().mockResolvedValue([]),
        listScopesForDocument: vi.fn().mockResolvedValue([]),
      },
      ingest: {
        pickFile: vi.fn().mockResolvedValue(null),
        pickPaths: vi.fn().mockResolvedValue([]),
        isAvailable: () => true,
        start: startFn,
        candidatesFor: vi.fn().mockResolvedValue([]),
      },
      subAgent: {
        list: vi.fn().mockResolvedValue([]),
        events: vi.fn(async function* () {}),
      },
      drafts: {
        events: vi.fn(async function* () {}),
      } as unknown as ReturnType<typeof makeFakeClient>["drafts"],
    });

    render(
      <PraxisClientProvider client={client}>
        <CourseCreateTabBody tab={makeTab()} />
      </PraxisClientProvider>,
    );

    // Open picker.
    fireEvent.click(screen.getByRole("button", { name: /add documents/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    // Drop a non-PDF plain-text file onto the list area inside the picker.
    // Non-PDF skips tier selection → ingest → batch_summary in one pass.
    const file = new File([""], "notes.txt", { type: "text/plain" });
    Object.defineProperty(file, "path", { value: "/docs/notes.txt", writable: false });

    // Target the list area (ul's parent div) inside the picker.
    const ul = screen.getByRole("list");
    const listArea = ul.parentElement ?? ul;
    fireEvent.drop(listArea, {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    // After ingestion completes the state transitions to batch_summary.
    // The BatchSummaryModal (aria-label "Ingestion summary") should appear.
    await waitFor(
      () => {
        expect(screen.getByRole("dialog", { name: /ingestion summary/i })).toBeDefined();
      },
      { timeout: 3000 },
    );

    // The picker <Modal> should NOT be present simultaneously (no stacking).
    const allDialogs = screen.queryAllByRole("dialog");
    expect(allDialogs).toHaveLength(1);
  });
});
