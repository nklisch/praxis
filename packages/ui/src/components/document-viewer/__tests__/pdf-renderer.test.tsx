/**
 * Tests for PdfRenderer — verifies that the correct number of page elements
 * are rendered and that the zero-page empty state is shown when pageCount is 0.
 *
 * Image loading is mocked: `client.documents.pageImage` returns a mock Uint8Array
 * so the component can render without real page-image data.
 */
import type { DocumentDetail } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../../context/client-context.js";
import { PdfRenderer } from "../pdf-renderer.js";

afterEach(() => cleanup());

function makeDoc(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    documentId: "doc-pdf-1",
    filename: "lecture.pdf",
    mimeType: "application/pdf",
    ingestorId: "pdf",
    ingestorLabel: "PDF",
    chunkCount: 0,
    createdAt: new Date().toISOString(),
    hasPageImages: true,
    title: "Lecture Notes",
    pageCount: 3,
    text: "",
    ...overrides,
  };
}

function renderInClient(ui: React.ReactElement) {
  const client = makeFakeClient({
    documents: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      // Return a minimal PNG-like buffer so the blob URL branch runs.
      pageImage: vi.fn().mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    },
  });
  return render(<PraxisClientProvider client={client}>{ui}</PraxisClientProvider>);
}

describe("PdfRenderer", () => {
  it("renders empty-state when pageCount is 0", () => {
    renderInClient(<PdfRenderer doc={makeDoc({ pageCount: 0, hasPageImages: false })} />);
    expect(screen.getByText(/No page images available/i)).toBeDefined();
  });

  it("renders empty-state when pageCount is null", () => {
    renderInClient(<PdfRenderer doc={makeDoc({ pageCount: null, hasPageImages: false })} />);
    expect(screen.getByText(/No page images available/i)).toBeDefined();
  });

  it("renders N page containers for a doc with pageCount=N", () => {
    renderInClient(<PdfRenderer doc={makeDoc({ pageCount: 3 })} />);
    // Each page has a visible label showing "N / 3".
    // There will be labels "1 / 3", "2 / 3", "3 / 3".
    expect(screen.getAllByText(/\/ 3/).length).toBe(3);
  });

  it("renders correct page labels for pageCount=2", () => {
    renderInClient(<PdfRenderer doc={makeDoc({ pageCount: 2 })} />);
    // Page labels show "1 / 2" and "2 / 2".
    expect(screen.getAllByText(/\/ 2/).length).toBe(2);
  });
});
