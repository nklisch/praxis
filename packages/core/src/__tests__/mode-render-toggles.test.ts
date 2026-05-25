import { describe, expect, it } from "vitest";
import { DEFAULT_RENDER_TOGGLES, resolveRenderToggles } from "../types/mode.js";

describe("DEFAULT_RENDER_TOGGLES", () => {
  it("has all 8 fields set to true", () => {
    expect(DEFAULT_RENDER_TOGGLES).toEqual({
      callouts: true,
      figures: true,
      definitions: true,
      conceptRefs: true,
      glossary: true,
      bareGlyphMath: true,
      unitAutoDetect: true,
      filePathAutoDetect: true,
    });
  });
});

describe("resolveRenderToggles", () => {
  it("returns all-true defaults when renderToggles is undefined", () => {
    const result = resolveRenderToggles({});
    expect(result).toEqual({
      callouts: true,
      figures: true,
      definitions: true,
      conceptRefs: true,
      glossary: true,
      bareGlyphMath: true,
      unitAutoDetect: true,
      filePathAutoDetect: true,
    });
  });

  it("applies partial override, preserving defaults for unset keys", () => {
    const result = resolveRenderToggles({ renderToggles: { callouts: false } });
    expect(result).toEqual({
      callouts: false,
      figures: true,
      definitions: true,
      conceptRefs: true,
      glossary: true,
      bareGlyphMath: true,
      unitAutoDetect: true,
      filePathAutoDetect: true,
    });
  });

  it("returns all-false when all keys are explicitly false", () => {
    const result = resolveRenderToggles({
      renderToggles: {
        callouts: false,
        figures: false,
        definitions: false,
        conceptRefs: false,
        glossary: false,
        bareGlyphMath: false,
        unitAutoDetect: false,
        filePathAutoDetect: false,
      },
    });
    expect(result).toEqual({
      callouts: false,
      figures: false,
      definitions: false,
      conceptRefs: false,
      glossary: false,
      bareGlyphMath: false,
      unitAutoDetect: false,
      filePathAutoDetect: false,
    });
  });

  it("treats an empty renderToggles object as all-defaults", () => {
    const result = resolveRenderToggles({ renderToggles: {} });
    expect(result).toEqual(DEFAULT_RENDER_TOGGLES);
  });
});
