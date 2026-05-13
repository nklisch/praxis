/**
 * Tests for HtmlRenderer — verifies that HTML is rendered and that XSS
 * payloads are sanitised before injection into the DOM.
 *
 * DOMPurify requires a DOM environment; these tests run under jsdom.
 */
import type { DocumentDetail } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HtmlRenderer, sanitizeHtml } from "../html-renderer.js";

afterEach(() => cleanup());

function makeDoc(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    documentId: "doc-1",
    filename: "test.html",
    mimeType: "text/html",
    ingestorId: "html",
    ingestorLabel: "HTML",
    chunkCount: 1,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
    title: null,
    pageCount: null,
    text: "<p>Hello world</p>",
    ...overrides,
  };
}

describe("sanitizeHtml", () => {
  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("passes safe HTML through unchanged", () => {
    const result = sanitizeHtml("<p>Hello <strong>world</strong></p>");
    expect(result).toContain("Hello");
    expect(result).toContain("strong");
  });

  it("strips <script> tags (XSS vector)", () => {
    const malicious = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("Safe");
  });

  it("strips event handler attributes (onerror XSS)", () => {
    const malicious = '<img onerror="alert(1)" src="x">';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert");
  });

  it("strips javascript: href (XSS via anchor)", () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(malicious);
    // DOMPurify removes the href entirely for javascript: protocol
    expect(result).not.toContain("javascript:");
  });

  it("strips onload attribute", () => {
    const malicious = '<svg onload="alert(1)"><circle/></svg>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain("onload");
  });
});

describe("HtmlRenderer", () => {
  it("renders empty-state when doc.text is empty", () => {
    render(<HtmlRenderer doc={makeDoc({ text: "" })} />);
    expect(screen.getByText(/No HTML content available/i)).toBeDefined();
  });

  it("renders sanitised HTML content", () => {
    render(<HtmlRenderer doc={makeDoc({ text: "<p>Hello from HTML</p>" })} />);
    expect(screen.getByText("Hello from HTML")).toBeDefined();
  });

  it("does not render script tags from malicious HTML", () => {
    const { container } = render(
      <HtmlRenderer
        doc={makeDoc({
          text: '<p>Safe content</p><script>alert("xss")</script>',
        })}
      />,
    );
    // No script elements should exist in the rendered output.
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("does not preserve onerror attributes in rendered output", () => {
    const { container } = render(
      <HtmlRenderer
        doc={makeDoc({
          text: '<img onerror="alert(1)" src="x">',
        })}
      />,
    );
    const imgs = container.querySelectorAll("[onerror]");
    expect(imgs).toHaveLength(0);
  });
});
