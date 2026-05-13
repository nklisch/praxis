/**
 * Tests for MarkdownRenderer — renders document text as markdown.
 */
import type { DocumentDetail } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownRenderer } from "../markdown-renderer.js";

afterEach(() => cleanup());

function makeDoc(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    documentId: "doc-md-1",
    filename: "notes.md",
    mimeType: "text/markdown",
    ingestorId: "markdown",
    ingestorLabel: "Markdown",
    chunkCount: 1,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
    title: "Notes",
    pageCount: null,
    text: "# Hello\n\nThis is a **test** document.",
    ...overrides,
  };
}

describe("MarkdownRenderer", () => {
  it("renders empty-state when doc.text is empty", () => {
    render(<MarkdownRenderer doc={makeDoc({ text: "" })} />);
    expect(screen.getByText(/No text content available/i)).toBeDefined();
  });

  it("renders document text content", () => {
    render(<MarkdownRenderer doc={makeDoc()} />);
    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("renders plain text documents without crashing", () => {
    render(
      <MarkdownRenderer
        doc={makeDoc({
          mimeType: "text/plain",
          text: "This is just plain text without any markdown.",
        })}
      />,
    );
    expect(screen.getByText("This is just plain text without any markdown.")).toBeDefined();
  });

  it("renders markdown formatting (bold via GFM)", () => {
    const { container } = render(
      <MarkdownRenderer doc={makeDoc({ text: "Some **bold** text" })} />,
    );
    const bold = container.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold");
  });
});
