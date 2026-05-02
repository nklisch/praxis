import { describe, expect, it } from "vitest";
import { COPY } from "../lib/copy.js";

describe("COPY", () => {
  describe("empty", () => {
    it("documents is a non-empty string", () => {
      expect(typeof COPY.empty.documents).toBe("string");
      expect(COPY.empty.documents.length).toBeGreaterThan(0);
    });

    it("courses is a non-empty string", () => {
      expect(typeof COPY.empty.courses).toBe("string");
      expect(COPY.empty.courses.length).toBeGreaterThan(0);
    });

    it("packs is a non-empty string", () => {
      expect(typeof COPY.empty.packs).toBe("string");
      expect(COPY.empty.packs.length).toBeGreaterThan(0);
    });

    it("notes is a non-empty string", () => {
      expect(typeof COPY.empty.notes).toBe("string");
      expect(COPY.empty.notes.length).toBeGreaterThan(0);
    });

    it("flashcards is a non-empty string", () => {
      expect(typeof COPY.empty.flashcards).toBe("string");
      expect(COPY.empty.flashcards.length).toBeGreaterThan(0);
    });

    it("sessions is a non-empty string", () => {
      expect(typeof COPY.empty.sessions).toBe("string");
      expect(COPY.empty.sessions.length).toBeGreaterThan(0);
    });

    it("misconceptions is a non-empty string", () => {
      expect(typeof COPY.empty.misconceptions).toBe("string");
      expect(COPY.empty.misconceptions.length).toBeGreaterThan(0);
    });

    it("unlockedGates is a non-empty string", () => {
      expect(typeof COPY.empty.unlockedGates).toBe("string");
      expect(COPY.empty.unlockedGates.length).toBeGreaterThan(0);
    });
  });

  describe("loading", () => {
    it("default is a non-empty string", () => {
      expect(typeof COPY.loading.default).toBe("string");
      expect(COPY.loading.default.length).toBeGreaterThan(0);
    });

    it("all loading strings are non-empty", () => {
      for (const [key, value] of Object.entries(COPY.loading)) {
        expect(typeof value, `loading.${key} must be a string`).toBe("string");
        expect((value as string).length, `loading.${key} must be non-empty`).toBeGreaterThan(0);
      }
    });
  });

  describe("error", () => {
    it("generic returns a string containing the action description", () => {
      const result = COPY.error.generic("save your changes");
      expect(typeof result).toBe("string");
      expect(result).toContain("save your changes");
    });

    it("generic frames the error without panic", () => {
      const result = COPY.error.generic("load the course");
      // Should not shout or alarm
      expect(result).not.toMatch(/error|Error|ERROR/);
      expect(result).toContain("load the course");
    });

    it("network is a non-empty string", () => {
      expect(typeof COPY.error.network).toBe("string");
      expect(COPY.error.network.length).toBeGreaterThan(0);
    });

    it("unknown is a non-empty string", () => {
      expect(typeof COPY.error.unknown).toBe("string");
      expect(COPY.error.unknown.length).toBeGreaterThan(0);
    });
  });

  describe("composer", () => {
    it("placeholder is a non-empty string", () => {
      expect(typeof COPY.composer.placeholder).toBe("string");
      expect(COPY.composer.placeholder.length).toBeGreaterThan(0);
    });
  });
});
