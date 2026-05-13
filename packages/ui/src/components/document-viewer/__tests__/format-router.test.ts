/**
 * Unit tests for format-router.ts — pickRenderer maps MIME types to
 * the correct renderer component.
 */
import { describe, expect, it } from "vitest";
import { FallbackRenderer } from "../fallback-renderer.js";
import { pickRenderer } from "../format-router.js";
import { HtmlRenderer } from "../html-renderer.js";
import { MarkdownRenderer } from "../markdown-renderer.js";
import { PdfRenderer } from "../pdf-renderer.js";
import { StructuredRenderer } from "../structured-renderer.js";

describe("pickRenderer", () => {
  it("maps application/pdf to PdfRenderer", () => {
    expect(pickRenderer("application/pdf")).toBe(PdfRenderer);
  });

  it("maps text/markdown to MarkdownRenderer", () => {
    expect(pickRenderer("text/markdown")).toBe(MarkdownRenderer);
  });

  it("maps text/x-markdown to MarkdownRenderer", () => {
    expect(pickRenderer("text/x-markdown")).toBe(MarkdownRenderer);
  });

  it("maps text/plain to MarkdownRenderer (plain-text fallback)", () => {
    expect(pickRenderer("text/plain")).toBe(MarkdownRenderer);
  });

  it("maps text/csv to MarkdownRenderer (generic text/* fallback)", () => {
    expect(pickRenderer("text/csv")).toBe(MarkdownRenderer);
  });

  it("maps text/html to HtmlRenderer", () => {
    expect(pickRenderer("text/html")).toBe(HtmlRenderer);
  });

  it("maps application/xhtml+xml to HtmlRenderer", () => {
    expect(pickRenderer("application/xhtml+xml")).toBe(HtmlRenderer);
  });

  it("maps PPTX MIME type to StructuredRenderer", () => {
    expect(
      pickRenderer("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ).toBe(StructuredRenderer);
  });

  it("maps DOCX MIME type to StructuredRenderer", () => {
    expect(
      pickRenderer("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe(StructuredRenderer);
  });

  it("maps an unknown binary MIME type to FallbackRenderer", () => {
    expect(pickRenderer("application/octet-stream")).toBe(FallbackRenderer);
  });

  it("maps image/png to FallbackRenderer", () => {
    expect(pickRenderer("image/png")).toBe(FallbackRenderer);
  });

  it("maps audio/mpeg to FallbackRenderer", () => {
    expect(pickRenderer("audio/mpeg")).toBe(FallbackRenderer);
  });

  it("maps an entirely unknown type to FallbackRenderer", () => {
    expect(pickRenderer("application/x-custom-format")).toBe(FallbackRenderer);
  });
});
