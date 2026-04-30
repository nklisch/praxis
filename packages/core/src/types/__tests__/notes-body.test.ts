/**
 * parseNoteBody + serializeNoteBody — unit tests.
 * Tests round-trip per format and mismatch/error cases.
 */

import { describe, expect, it } from "vitest";
import type { NoteBody } from "../notes.js";
import { parseNoteBody, serializeNoteBody } from "../notes.js";

describe("parseNoteBody", () => {
  describe("cornell format", () => {
    it("parses a valid cornell body", () => {
      const body: NoteBody = {
        kind: "cornell",
        questions: ["What is a derivative?", "What is the chain rule?"],
        details: ["The rate of change of a function.", "d/dx[f(g(x))] = f'(g(x))·g'(x)"],
        summary: "Derivatives measure instantaneous rate of change.",
      };
      const json = JSON.stringify(body);
      const parsed = parseNoteBody("cornell", json);
      expect(parsed).toEqual(body);
    });

    it("throws when kind does not match format", () => {
      const body: NoteBody = { kind: "free", text: "some text" };
      expect(() => parseNoteBody("cornell", JSON.stringify(body))).toThrow(
        "Note format 'cornell' does not match body kind 'free'",
      );
    });

    it("throws when missing required fields", () => {
      expect(() => parseNoteBody("cornell", JSON.stringify({ kind: "cornell" }))).toThrow(
        "cornell body missing required fields",
      );
    });
  });

  describe("feynman format", () => {
    it("parses a valid feynman body", () => {
      const body: NoteBody = {
        kind: "feynman",
        explanation: "Gravity pulls objects together.",
        followUps: ["Why does mass affect gravity?", "What is the gravitational constant?"],
      };
      const result = parseNoteBody("feynman", JSON.stringify(body));
      expect(result).toEqual(body);
    });

    it("throws when kind does not match format", () => {
      const body: NoteBody = { kind: "cornell", questions: [], details: [], summary: "" };
      expect(() => parseNoteBody("feynman", JSON.stringify(body))).toThrow(
        "Note format 'feynman' does not match body kind 'cornell'",
      );
    });
  });

  describe("outline format", () => {
    it("parses a nested outline body", () => {
      const body: NoteBody = {
        kind: "outline",
        root: {
          text: "Calculus",
          children: [
            {
              text: "Derivatives",
              children: [
                { text: "Power rule", children: [] },
                { text: "Chain rule", children: [] },
              ],
            },
            { text: "Integrals", children: [] },
          ],
        },
      };
      const result = parseNoteBody("outline", JSON.stringify(body));
      expect(result).toEqual(body);
    });

    it("defaults missing children array to []", () => {
      const raw = JSON.stringify({ kind: "outline", root: { text: "root" } });
      const parsed = parseNoteBody("outline", raw);
      expect((parsed as { kind: "outline"; root: { children: unknown[] } }).root.children).toEqual(
        [],
      );
    });

    it("throws when kind does not match format", () => {
      expect(() =>
        parseNoteBody(
          "outline",
          JSON.stringify({ kind: "feynman", explanation: "x", followUps: [] }),
        ),
      ).toThrow("Note format 'outline' does not match body kind 'feynman'");
    });
  });

  describe("free format", () => {
    it("parses a valid free body", () => {
      const body: NoteBody = {
        kind: "free",
        text: "This is a free-form note.\n\nWith multiple paragraphs.",
      };
      const result = parseNoteBody("free", JSON.stringify(body));
      expect(result).toEqual(body);
    });

    it("throws when kind does not match format", () => {
      expect(() =>
        parseNoteBody(
          "free",
          JSON.stringify({ kind: "outline", root: { text: "x", children: [] } }),
        ),
      ).toThrow("Note format 'free' does not match body kind 'outline'");
    });
  });

  describe("error cases", () => {
    it("throws when bodyJson is null", () => {
      expect(() => parseNoteBody("free", null)).toThrow("body is null/undefined");
    });

    it("throws when bodyJson is undefined", () => {
      expect(() => parseNoteBody("free", undefined)).toThrow("body is null/undefined");
    });

    it("throws on malformed JSON", () => {
      expect(() => parseNoteBody("free", "not-json")).toThrow("invalid JSON");
    });

    it("throws for sketch format (Phase 13 deferred)", () => {
      expect(() => parseNoteBody("sketch", "{}")).toThrow("sketch format is not supported");
    });
  });
});

describe("serializeNoteBody", () => {
  it("round-trips cornell", () => {
    const body: NoteBody = { kind: "cornell", questions: ["q1"], details: ["d1"], summary: "s" };
    const json = serializeNoteBody(body);
    expect(parseNoteBody("cornell", json)).toEqual(body);
  });

  it("round-trips feynman", () => {
    const body: NoteBody = { kind: "feynman", explanation: "explain it", followUps: ["why?"] };
    expect(parseNoteBody("feynman", serializeNoteBody(body))).toEqual(body);
  });

  it("round-trips outline (nested)", () => {
    const body: NoteBody = {
      kind: "outline",
      root: {
        text: "topic",
        children: [{ text: "sub", children: [{ text: "leaf", children: [] }] }],
      },
    };
    expect(parseNoteBody("outline", serializeNoteBody(body))).toEqual(body);
  });

  it("round-trips free", () => {
    const body: NoteBody = { kind: "free", text: "hello world" };
    expect(parseNoteBody("free", serializeNoteBody(body))).toEqual(body);
  });
});
