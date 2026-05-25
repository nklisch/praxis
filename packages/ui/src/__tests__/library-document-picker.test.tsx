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
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryDocumentPicker } from "../components/library-document-picker.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { useIngestion } from "../hooks/use-ingestion.js";
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

/**
 * Thin wrapper that calls useIngestion (a hook) so tests can render
 * LibraryDocumentPicker — which now requires ingestion as a prop — without
 * coupling each test to the hook's internals.
 */
function PickerWithIngestion({
  scope,
  onClose,
  onAttached,
}: {
  scope: DocumentScope;
  onClose: () => void;
  onAttached?: (id: DocumentId) => void;
}) {
  const ingestion = useIngestion(undefined, { scope });
  return (
    <LibraryDocumentPicker
      scope={scope}
      onClose={onClose}
      onAttached={onAttached}
      ingestion={ingestion}
    />
  );
}

function renderPicker(
  client: PraxisClient,
  onClose = vi.fn(),
  onAttached?: (id: DocumentId) => void,
  scope: DocumentScope = COURSE_SCOPE,
) {
  return render(
    <PraxisClientProvider client={client}>
      <PickerWithIngestion scope={scope} onClose={onClose} onAttached={onAttached} />
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

  it("optimistic update: row shows 'attached' badge immediately on click before IPC resolves", async () => {
    // The attach function hangs so we can inspect the UI before it resolves.
    let resolveAttach!: () => void;
    const hangingAttach = vi.fn().mockImplementation(
      () =>
        new Promise<{ attached: boolean }>((resolve) => {
          resolveAttach = () => resolve({ attached: true });
        }),
    );
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
      attachFn: hangingAttach as PraxisClient["documentScopes"]["attach"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    // Optimistically shows "attached" before the IPC call resolves.
    await waitFor(() => {
      expect(screen.getByText("attached")).toBeDefined();
    });

    // Resolve so the test cleans up nicely.
    resolveAttach();
  });

  it("failure: row reverts optimistic state and shows FailurePopover on attach error", async () => {
    const failingAttach = vi.fn().mockRejectedValue(new Error("Permission denied"));
    const client = makeClient({
      library: [makeDocSummary(DOC_B, "calculus.pdf")],
      attachFn: failingAttach as PraxisClient["documentScopes"]["attach"],
    });
    renderPicker(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Attach$/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Attach$/i }));

    // After the failure resolves, the attached badge is gone and FailurePopover appears.
    await waitFor(() => {
      expect(screen.queryByText("attached")).toBeNull();
      expect(screen.getByRole("dialog", { name: /action failed/i })).toBeDefined();
    });
    // Retry button should be present.
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });

  it("multiple concurrent attaches each have their own pip state (no cross-talk)", async () => {
    // Both attach calls hang so we can inspect independent pip states.
    let resolveA!: () => void;
    let resolveB!: () => void;
    const hangingAttach = vi.fn().mockImplementation(
      () =>
        new Promise<{ attached: boolean }>((resolve) => {
          if (!resolveA) {
            resolveA = () => resolve({ attached: true });
          } else {
            resolveB = () => resolve({ attached: true });
          }
        }),
    );
    const client = makeClient({
      library: [makeDocSummary(DOC_A, "algebra.pdf"), makeDocSummary(DOC_B, "calculus.pdf")],
      attachFn: hangingAttach as PraxisClient["documentScopes"]["attach"],
    });
    renderPicker(client);

    await waitFor(() => {
      const attachBtns = screen.getAllByRole("button", { name: /^Attach$/i });
      expect(attachBtns).toHaveLength(2);
    });

    const [btnA, btnB] = screen.getAllByRole("button", { name: /^Attach$/i });
    // Click both concurrently.
    if (btnA) fireEvent.click(btnA);
    if (btnB) fireEvent.click(btnB);

    // Both rows should show the optimistic "attached" badge — no cross-talk.
    await waitFor(() => {
      const attachedBadges = screen.getAllByText("attached");
      expect(attachedBadges).toHaveLength(2);
    });

    // Resolve both so the test cleans up.
    resolveA?.();
    resolveB?.();
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

    /**
     * BUG (gate-tests-picker-close-midingestion-no-abort):
     * When the parent unmounts the picker on onClose, React tears down the
     * component tree and the `for await` loop inside useIngestion's
     * ingestOneWithResult is abandoned — this triggers the generator's
     * finally block, effectively aborting the in-flight batch. The spec
     * requires that closing the picker does NOT cancel the batch. The fix
     * is to lift ingestion state out of LibraryDocumentPicker so it survives
     * unmount (e.g. hoist useIngestion to the parent, or keep the component
     * mounted with display:none during in-flight ingestion). This test is
     * skipped until the bug is fixed; it documents the desired behavior.
     * See: .work/active/stories/bug-picker-close-aborts-ingestion.md
     */
    it("closing the picker modal mid-ingestion does NOT abort the in-flight batch", async () => {
      // Arrange: a slow ingestion generator that hangs until explicitly resolved.
      // We track whether the generator's return() (abort) was invoked.
      let resolveIngestion!: () => void;
      let generatorAborted = false;

      async function* slowIngestionStream(): AsyncGenerator<
        import("@praxis/core/types").IngestionEvent,
        void,
        unknown
      > {
        try {
          // Hang until test resolves it — simulates a long-running upload.
          await new Promise<void>((resolve) => {
            resolveIngestion = resolve;
          });
          yield {
            type: "done",
            documentId: "doc-slow",
            chunkCount: 2,
          } as import("@praxis/core/types").IngestionEvent;
        } finally {
          // If the for-await loop in useIngestion is broken (e.g. component
          // unmounted mid-stream), the generator's finally block runs. We
          // record this so the test can assert it did NOT happen via close.
          generatorAborted = true;
        }
      }

      const startFn = vi.fn().mockImplementation(() => slowIngestionStream());
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
        ingestStartFn: startFn as unknown as PraxisClient["ingest"]["start"],
      });

      const onClose = vi.fn();

      // Render inside a controlling wrapper so onClose behaves realistically
      // (parent toggles open state, component unmounts on close).
      // useIngestion is hoisted to the inner component (which is inside the
      // provider) so it survives picker unmount — that's the fix being tested.
      function Inner({ onClose: handleClose }: { onClose: () => void }) {
        const [open, setOpen] = useState(true);
        const ingestion = useIngestion(undefined, { scope: COURSE_SCOPE });
        return (
          <>
            {open && (
              <LibraryDocumentPicker
                scope={COURSE_SCOPE}
                onClose={() => {
                  setOpen(false);
                  handleClose();
                }}
                ingestion={ingestion}
              />
            )}
          </>
        );
      }

      function Wrapper() {
        return (
          <PraxisClientProvider client={client}>
            <Inner onClose={onClose} />
          </PraxisClientProvider>
        );
      }

      render(<Wrapper />);

      // Wait for list to load.
      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      // Drop a non-PDF file (txt → skips tier_selection, goes straight to ingesting).
      const fileA = new File([""], "notes.txt", { type: "text/plain" });
      Object.defineProperty(fileA, "path", { value: "/docs/notes.txt", writable: false });

      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.drop(listArea, {
        dataTransfer: { files: [fileA], types: ["Files"] },
      });

      // Wait until ingestion has started (startFn called) — the batch is now in-flight.
      await waitFor(() => {
        expect(startFn).toHaveBeenCalledOnce();
      });

      // Act: close the picker via Escape while ingestion is still running.
      // The picker's Modal calls onClose on Escape — this is the close path the
      // spec requires to NOT abort the batch.
      fireEvent.keyDown(document, { key: "Escape" });

      // Assert: onClose was invoked (picker closed).
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce();
      });

      // Assert: the ingestion generator was NOT aborted by the close action.
      // generatorAborted would be true only if the for-await loop inside
      // useIngestion broke (component unmount tears down the async loop).
      // The spec says closing must NOT cancel the batch — so if generatorAborted
      // is true here it means the current implementation violates the spec.
      //
      // We check generatorAborted BEFORE resolving — if it's already true at
      // this point, the generator was forcibly aborted when the picker closed
      // (the bug). In the fixed implementation (useIngestion hoisted to the
      // parent), the generator is still alive and waiting here, so false.
      expect(generatorAborted).toBe(false);

      // Clean up: resolve the slow ingestion so the async batch finishes.
      resolveIngestion();

      // Give a tick for the microtask queue to flush the completed ingestion.
      await new Promise((r) => setTimeout(r, 0));
    });

    it("drag-over from list-area to a child list-row keeps the drop overlay visible", async () => {
      // Regression guard for the `e.currentTarget === e.target` guard in handleDragLeave.
      // When the pointer crosses from the listArea into one of its child rows,
      // onDragLeave fires with currentTarget = listArea and target = child row.
      // The guard must detect currentTarget !== target and NOT clear the overlay.
      const client = makeClient({
        library: [makeDocSummary(DOC_A, "algebra.pdf")],
      });
      renderPicker(client);

      await waitFor(() => {
        expect(screen.getByText("algebra.pdf")).toBeDefined();
      });

      // Simulate drag-over the list area — overlay should appear.
      const listArea = screen.getByRole("list").parentElement!;
      fireEvent.dragOver(listArea, {
        dataTransfer: { types: ["Files"] },
      });

      expect(screen.getByText("Drop files to upload")).toBeDefined();

      // Now simulate onDragLeave from a child element (currentTarget !== target).
      // In JSDOM, fireEvent doesn't set currentTarget on the event object, so we
      // dispatch a synthetic event where target is the child list row — this is
      // the exact scenario the guard defends against.
      const listRow = screen.getByRole("list").firstElementChild as HTMLElement;
      if (listRow) {
        const syntheticLeave = new Event("dragleave", { bubbles: true });
        // Simulate the guard condition: target is the child, not the listArea itself.
        // We fire dragleave directly on the child element (bubbles to listArea);
        // in JSDOM, event.currentTarget === listArea but event.target === child.
        listRow.dispatchEvent(syntheticLeave);
      }

      // Overlay must still be visible — the guard prevented a false dismissal.
      expect(screen.getByText("Drop files to upload")).toBeDefined();
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
