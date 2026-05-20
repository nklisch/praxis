/**
 * Tests for the LibraryDocumentPicker modal component.
 *
 * Verifies:
 * - Renders the modal with LIBRARY kicker and correct aria-label.
 * - Lists all library documents from client.documents.list().
 * - Marks already-attached docs with "attached" badge (no Attach button).
 * - Shows "Attach" button for unattached docs.
 * - Clicking "Attach" calls client.documentScopes.attach() with correct args.
 * - After attach, the row shows "attached" badge (optimistic update).
 * - Empty state renders when library is empty.
 * - Close button calls onClose.
 * - ESC calls onClose.
 * - Course scope and session scope both work (polymorphic scope prop).
 * - Drag-over with Files type shows drop overlay; text type does not.
 * - Drop with files calls startBatchWithPaths with the Electron .path values.
 * - "+ Upload" button calls startPickBatch("files").
 * - After onDone fires the picker list is refreshed.
 */
import type {
  CourseId,
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  IngestionEvent,
  PraxisClient,
  SessionId,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryDocumentPicker } from "../components/library-document-picker.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const COURSE_ID = brandId<"CourseId">("course-1") as CourseId;
const SESSION_ID = brandId<"SessionId">("session-1") as SessionId;
const COURSE_SCOPE: DocumentScope = { kind: "course", id: COURSE_ID };
const SESSION_SCOPE: DocumentScope = { kind: "session", id: SESSION_ID };
const DOC_A = "doc-a" as DocumentId;
const DOC_B = "doc-b" as DocumentId;

function makeDocSummary(
  documentId: string,
  filename: string,
  chunkCount = 5,
): import("@praxis/core/types").DocumentSummary {
  return {
    documentId,
    filename,
    mimeType: "application/pdf",
    ingestorId: "js-pdf",
    ingestorLabel: "JS PDF",
    chunkCount,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
  };
}

function makeScopeAttachment(documentId: string, filename: string): DocumentScopeAttachment {
  return {
    documentId: documentId as DocumentId,
    filename,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
    source: "manual",
    attachedAt: new Date(),
  };
}

/**
 * Build an async generator yielding given IngestionEvents.
 */
async function* makeIngestionStream(
  events: IngestionEvent[],
): AsyncGenerator<IngestionEvent, void, unknown> {
  for (const e of events) yield e;
}

function makeDoneIngestionStream(documentId = "doc-new", chunkCount = 5) {
  return makeIngestionStream([{ type: "done", documentId, chunkCount } as IngestionEvent]);
}

function makeClient(opts?: {
  library?: ReturnType<typeof makeDocSummary>[];
  attached?: DocumentScopeAttachment[];
  attachFn?: PraxisClient["documentScopes"]["attach"];
  ingestStartFn?: PraxisClient["ingest"]["start"];
  ingestPickPathsFn?: PraxisClient["ingest"]["pickPaths"];
}): PraxisClient {
  return makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue(opts?.library ?? []),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    } as PraxisClient["documents"],
    documentScopes: {
      listForScope: vi.fn().mockResolvedValue(opts?.attached ?? []),
      attach:
        opts?.attachFn ??
        (vi.fn().mockResolvedValue({ attached: true }) as PraxisClient["documentScopes"]["attach"]),
      detach: vi.fn().mockResolvedValue({ detached: true }),
    } as PraxisClient["documentScopes"],
    ingest: {
      pickFile: vi.fn().mockResolvedValue(null),
      pickPaths:
        opts?.ingestPickPathsFn ??
        (vi.fn().mockResolvedValue([]) as PraxisClient["ingest"]["pickPaths"]),
      isAvailable: () => true,
      start:
        opts?.ingestStartFn ??
        (vi
          .fn()
          .mockReturnValue(
            makeDoneIngestionStream(),
          ) as unknown as PraxisClient["ingest"]["start"]),
      candidatesFor: vi.fn().mockResolvedValue([]),
    } as PraxisClient["ingest"],
  });
}

function renderPicker(
  client: PraxisClient,
  onClose = vi.fn(),
  onAttached?: (id: DocumentId) => void,
  scope: DocumentScope = COURSE_SCOPE,
) {
  return render(
    <PraxisClientProvider client={client}>
      <LibraryDocumentPicker scope={scope} onClose={onClose} onAttached={onAttached} />
    </PraxisClientProvider>,
  );
}

describe("LibraryDocumentPicker", () => {
  it("renders the modal with LIBRARY kicker", () => {
    renderPicker(makeClient());
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("LIBRARY")).toBeDefined();
  });

  it("renders library documents after load", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText("algebra.pdf")).toBeDefined();
      expect(screen.getByText("calculus.pdf")).toBeDefined();
    });
  });

  it("marks an already-attached doc with 'attached' badge and no Attach button", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "calculus.pdf")],
      attached: [makeScopeAttachment(DOC_A, "algebra.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText("algebra.pdf")).toBeDefined();
    });

    // algebra.pdf is attached → badge, no Attach button
    expect(screen.getByText("attached")).toBeDefined();
    // calculus.pdf is unattached → Attach button
    const attachBtns = screen.getAllByRole("button", { name: /^Attach$/i });
    expect(attachBtns).toHaveLength(1);
  });

  it("clicking Attach calls documentScopes.attach with correct args", async () => {
    const attachFn = vi.fn().mockResolvedValue({ attached: true });
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
      attachFn: attachFn as PraxisClient["documentScopes"]["attach"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(attachFn).toHaveBeenCalledWith({
        scope: COURSE_SCOPE,
        documentId: DOC_B,
        source: "manual",
      });
    });
  });

  it("after attach the row shows 'attached' badge (optimistic update)", async () => {
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(screen.getByText("attached")).toBeDefined();
    });
  });

  it("calls onAttached with the documentId after a successful attach", async () => {
    const onAttached = vi.fn();
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
    });
    renderPicker(client, vi.fn(), onAttached);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledWith(DOC_B);
    });
  });

  it("shows empty state when library is empty", async () => {
    const client = makeClient({ library: [] });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByText(/No documents in your library yet/)).toBeDefined();
    });
  });

  it("Close button calls onClose", () => {
    const onClose = vi.fn();
    renderPicker(makeClient(), onClose);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    renderPicker(makeClient(), onClose);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("loads both library docs and attached docs in parallel", async () => {
    const listFn = vi.fn().mockResolvedValue([]);
    const listForScopeFn = vi.fn().mockResolvedValue([]);
    const client = makeFakeClient({
      documents: {
        list: listFn,
        delete: vi.fn(),
        pageImage: vi.fn().mockResolvedValue(null),
      } as PraxisClient["documents"],
      documentScopes: {
        listForScope: listForScopeFn,
        attach: vi.fn().mockResolvedValue({ attached: true }),
        detach: vi.fn().mockResolvedValue({ detached: true }),
      } as PraxisClient["documentScopes"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(listFn).toHaveBeenCalledOnce();
      expect(listForScopeFn).toHaveBeenCalledWith(COURSE_SCOPE);
    });
  });

  describe("session scope", () => {
    it("calls listForScope with session scope on load", async () => {
      const listForScopeFn = vi.fn().mockResolvedValue([]);
      const client = makeFakeClient({
        documents: {
          list: vi.fn().mockResolvedValue([makeDocSummary(DOC_A, "algebra.pdf")]),
          delete: vi.fn(),
          pageImage: vi.fn().mockResolvedValue(null),
        } as PraxisClient["documents"],
        documentScopes: {
          listForScope: listForScopeFn,
          attach: vi.fn().mockResolvedValue({ attached: true }),
          detach: vi.fn().mockResolvedValue({ detached: true }),
        } as PraxisClient["documentScopes"],
        ingest: {
          pickFile: vi.fn().mockResolvedValue(null),
          pickPaths: vi.fn().mockResolvedValue([]),
          isAvailable: () => true,
          start: vi
            .fn()
            .mockReturnValue(
              makeDoneIngestionStream(),
            ) as unknown as PraxisClient["ingest"]["start"],
          candidatesFor: vi.fn().mockResolvedValue([]),
        } as PraxisClient["ingest"],
      });
      renderPicker(client, vi.fn(), undefined, SESSION_SCOPE);

      await waitFor(() => {
        expect(listForScopeFn).toHaveBeenCalledWith(SESSION_SCOPE);
      });
    });

    it("calls documentScopes.attach with session scope when Attach clicked", async () => {
      const attachFn = vi.fn().mockResolvedValue({ attached: true });
      const client = makeClient({
        library: [makeDocSummary(DOC_B, "calculus.pdf")],
        attachFn: attachFn as PraxisClient["documentScopes"]["attach"],
      });
      renderPicker(client, vi.fn(), undefined, SESSION_SCOPE);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

      await waitFor(() => {
        expect(attachFn).toHaveBeenCalledWith({
          scope: SESSION_SCOPE,
          documentId: DOC_B,
          source: "manual",
        });
      });
    });
  });

  describe("inline upload — drag-and-drop and + Upload button", () => {
    it("renders the '+ Upload' button in the header", async () => {
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      expect(screen.getByRole("button", { name: /\+ Upload/i })).toBeDefined();
    });

    it("drag-over with Files type shows the drop overlay", async () => {
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      // Find the list area and fire a dragover with types including "Files".
      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.dragOver(listArea, {
        dataTransfer: { types: ["Files"] },
      });

      expect(screen.getByText("Drop files to upload")).toBeDefined();
    });

    it("drag-over with only text type does NOT show the drop overlay", async () => {
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.dragOver(listArea, {
        dataTransfer: { types: ["text/plain"] },
      });

      // Overlay should NOT be present.
      expect(screen.queryByText("Drop files to upload")).toBeNull();
    });

    it("drop with files that have .path calls startBatchWithPaths with those paths", async () => {
      const startFn = vi.fn().mockReturnValue(makeDoneIngestionStream());
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
        ingestStartFn: startFn as unknown as PraxisClient["ingest"]["start"],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      // jsdom's File doesn't expose .path (Electron-specific), so we inject it
      // via Object.defineProperty on a regular File instance.
      const fileA = new File([""], "a.txt", { type: "text/plain" });
      const fileB = new File([""], "b.txt", { type: "text/plain" });
      Object.defineProperty(fileA, "path", { value: "/docs/a.txt", writable: false });
      Object.defineProperty(fileB, "path", { value: "/docs/b.txt", writable: false });

      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.drop(listArea, {
        dataTransfer: { files: [fileA, fileB], types: ["Files"] },
      });

      await waitFor(() => {
        expect(startFn).toHaveBeenCalledTimes(2);
        const firstReq = startFn.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(firstReq.filePath).toBe("/docs/a.txt");
        const secondReq = startFn.mock.calls[1]?.[0] as Record<string, unknown>;
        expect(secondReq.filePath).toBe("/docs/b.txt");
      });
    });

    it("drop with files missing .path is a no-op — no backend call", async () => {
      // In non-Electron environments, File.path is undefined. The handler
      // filters these out, resulting in paths.length === 0 → no-op.
      const startFn = vi.fn();
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
        ingestStartFn: startFn as unknown as PraxisClient["ingest"]["start"],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      const fileMissingPath = new File([""], "x.txt", { type: "text/plain" });
      // No .path set — simulates a plain browser File.

      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.drop(listArea, {
        dataTransfer: { files: [fileMissingPath], types: ["Files"] },
      });

      // startFn must not have been called.
      expect(startFn).not.toHaveBeenCalled();
    });

    it("clicking '+ Upload' calls pickPaths (startPickBatch flow)", async () => {
      const pickPathsFn = vi.fn().mockResolvedValue([]);
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
        ingestPickPathsFn: pickPathsFn as unknown as PraxisClient["ingest"]["pickPaths"],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /\+ Upload/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: /\+ Upload/i }));

      // startPickBatch opens the OS dialog via client.ingest.pickPaths.
      await waitFor(() => {
        expect(pickPathsFn).toHaveBeenCalledWith({ mode: "files" });
      });
    });

    it("after ingestion completes (onDone), the picker list is refreshed", async () => {
      let callCount = 0;
      const listFn = vi.fn().mockImplementation(async () => {
        callCount++;
        // Second call returns an additional doc (simulating the newly-ingested file).
        if (callCount >= 2) {
          return [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "new-doc.txt")];
        }
        return [makeDocSummary(DOC_A, "algebra.pdf")];
      });

      const startFn = vi.fn().mockReturnValue(makeDoneIngestionStream("doc-new", 3));
      const client = makeFakeClient({
        documents: {
          list: listFn,
          delete: vi.fn(),
          pageImage: vi.fn().mockResolvedValue(null),
        } as PraxisClient["documents"],
        documentScopes: {
          listForScope: vi.fn().mockResolvedValue([]),
          attach: vi.fn().mockResolvedValue({ attached: true }),
          detach: vi.fn().mockResolvedValue({ detached: true }),
        } as PraxisClient["documentScopes"],
        ingest: {
          pickFile: vi.fn().mockResolvedValue(null),
          pickPaths: vi.fn().mockResolvedValue([]),
          isAvailable: () => true,
          start: startFn as unknown as PraxisClient["ingest"]["start"],
          candidatesFor: vi.fn().mockResolvedValue([]),
        } as PraxisClient["ingest"],
      });

      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      // Simulate a drop to trigger ingestion.
      const fileA = new File([""], "new-doc.txt", { type: "text/plain" });
      Object.defineProperty(fileA, "path", { value: "/docs/new-doc.txt", writable: false });

      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.drop(listArea, {
        dataTransfer: { files: [fileA], types: ["Files"] },
      });

      // After ingestion done, onDone fires → refresh() → documents.list called again.
      // The refresh is async (onDone?.() is fire-and-forget), so use a generous timeout.
      await waitFor(
        () => {
          expect(listFn.mock.calls.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );
    });
  });
});
