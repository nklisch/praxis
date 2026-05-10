import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PackManifestSchema } from "../schema.js";

// Path: __tests__/ → packs/ → src/ → curriculum/ → packs/
const PACKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs");

function loadAndValidate(filename: string) {
  const filePath = join(PACKS_DIR, filename);
  const raw = readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return PackManifestSchema.safeParse(json);
}

describe("Starter pack content validation", () => {
  describe("algebra-1.json", () => {
    it("parses successfully against PackManifestSchema", () => {
      const result = loadAndValidate("algebra-1.json");
      if (!result.success) {
        throw new Error(`algebra-1.json failed validation:\n${result.error.message}`);
      }
      expect(result.success).toBe(true);
    });

    it("has at least 30 concepts", () => {
      const result = loadAndValidate("algebra-1.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concepts.length).toBeGreaterThanOrEqual(30);
      }
    });

    it("has non-empty edges", () => {
      const result = loadAndValidate("algebra-1.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.edges.length).toBeGreaterThan(0);
      }
    });

    it("every concept has a non-empty description", () => {
      const result = loadAndValidate("algebra-1.json");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const concept of result.data.concepts) {
          expect(
            concept.description.length,
            `concept ${concept.id} has empty description`,
          ).toBeGreaterThan(0);
        }
      }
    });

    it("every concept has at least one standardsTag", () => {
      const result = loadAndValidate("algebra-1.json");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const concept of result.data.concepts) {
          expect(
            concept.standardsTags.length,
            `concept ${concept.id} has no standards tags`,
          ).toBeGreaterThan(0);
        }
      }
    });

    it("all edge endpoints reference known concept ids", () => {
      const result = loadAndValidate("algebra-1.json");
      // superRefine already checks this — if parse succeeds, edges are valid
      expect(result.success).toBe(true);
    });

    it("has no circular prerequisite chains", () => {
      // Cycle detection is in superRefine — a successful parse guarantees no cycles
      const result = loadAndValidate("algebra-1.json");
      expect(result.success).toBe(true);
    });
  });

  describe("geometry.json", () => {
    it("parses successfully against PackManifestSchema", () => {
      const result = loadAndValidate("geometry.json");
      if (!result.success) {
        throw new Error(`geometry.json failed validation:\n${result.error.message}`);
      }
      expect(result.success).toBe(true);
    });

    it("has at least 30 concepts", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concepts.length).toBeGreaterThanOrEqual(30);
      }
    });

    it("has non-empty edges", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.edges.length).toBeGreaterThan(0);
      }
    });

    it("every concept has a non-empty description", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const concept of result.data.concepts) {
          expect(
            concept.description.length,
            `concept ${concept.id} has empty description`,
          ).toBeGreaterThan(0);
        }
      }
    });

    it("every concept has at least one standardsTag", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const concept of result.data.concepts) {
          expect(
            concept.standardsTags.length,
            `concept ${concept.id} has no standards tags`,
          ).toBeGreaterThan(0);
        }
      }
    });

    it("all edge endpoints reference known concept ids", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
    });

    it("has no circular prerequisite chains", () => {
      const result = loadAndValidate("geometry.json");
      expect(result.success).toBe(true);
    });
  });

  describe("biology.json", () => {
    it("parses successfully against PackManifestSchema", () => {
      const result = loadAndValidate("biology.json");
      if (!result.success) {
        throw new Error(`biology.json failed validation:\n${result.error.message}`);
      }
      expect(result.success).toBe(true);
    });

    it("has between 90 and 120 concepts", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.concepts.length).toBeGreaterThanOrEqual(90);
        expect(result.data.concepts.length).toBeLessThanOrEqual(120);
      }
    });

    it("has at least 100 prerequisite edges", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.edges.length).toBeGreaterThanOrEqual(100);
      }
    });

    it("every concept has a description ≥ 50 characters", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const concept of result.data.concepts) {
          expect(
            concept.description.length,
            `concept ${concept.id} description too short`,
          ).toBeGreaterThanOrEqual(50);
        }
      }
    });

    it("every concept has at least one NGSS HS-LS standards tag", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        const ngssRe = /^HS-LS[1-4]-\d+$/;
        for (const concept of result.data.concepts) {
          expect(
            concept.standardsTags.length,
            `concept ${concept.id} has no standards tags`,
          ).toBeGreaterThan(0);
          for (const tag of concept.standardsTags) {
            expect(tag, `concept ${concept.id} tag '${tag}' not NGSS HS-LS`).toMatch(
              ngssRe,
            );
          }
        }
      }
    });

    it("contains the expected anchor concepts", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        const names = new Set(result.data.concepts.map((c) => c.name.toLowerCase()));
        const ids = new Set(result.data.concepts.map((c) => c.id));
        const anchors = [
          "cell theory",
          "dna structure",
          "natural selection",
          "photosynthesis",
          "cellular respiration",
          "mendelian inheritance",
          "ecosystem energy flow",
        ];
        for (const anchor of anchors) {
          const found =
            names.has(anchor) || ids.has(`biology.${anchor.replace(/\s+/g, "-")}`);
          expect(found, `missing anchor concept: ${anchor}`).toBe(true);
        }
      }
    });

    it("references the NGSS HS-LS standards body", () => {
      const result = loadAndValidate("biology.json");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.standardsRef?.body).toBe("NGSS-HS-LS");
      }
    });
  });

  describe("schema rejection cases", () => {
    it("rejects a pack with a cyclic prerequisite chain", () => {
      const cyclic = {
        id: "test-cyclic",
        version: "1.0.0",
        name: "Cyclic Pack",
        subject: "test",
        gradeLevel: "9-12",
        authoredBy: "test",
        authoredAt: "2026-01-01T00:00:00.000Z",
        concepts: [
          {
            id: "test-cyclic.a",
            name: "A",
            description: "Concept A",
            aliases: [],
            standardsTags: [],
          },
          {
            id: "test-cyclic.b",
            name: "B",
            description: "Concept B",
            aliases: [],
            standardsTags: [],
          },
          {
            id: "test-cyclic.c",
            name: "C",
            description: "Concept C",
            aliases: [],
            standardsTags: [],
          },
        ],
        edges: [
          { fromId: "test-cyclic.a", toId: "test-cyclic.b", strength: 0.8 },
          { fromId: "test-cyclic.b", toId: "test-cyclic.c", strength: 0.8 },
          { fromId: "test-cyclic.c", toId: "test-cyclic.a", strength: 0.8 }, // cycle!
        ],
      };
      const result = PackManifestSchema.safeParse(cyclic);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("circular");
      }
    });

    it("rejects an edge referencing an unknown concept id", () => {
      const badEdge = {
        id: "test-bad-edge",
        version: "1.0.0",
        name: "Bad Edge Pack",
        subject: "test",
        gradeLevel: "9-12",
        authoredBy: "test",
        authoredAt: "2026-01-01T00:00:00.000Z",
        concepts: [
          {
            id: "test-bad-edge.a",
            name: "A",
            description: "Concept A",
            aliases: [],
            standardsTags: [],
          },
        ],
        edges: [{ fromId: "test-bad-edge.a", toId: "test-bad-edge.nonexistent", strength: 0.8 }],
      };
      const result = PackManifestSchema.safeParse(badEdge);
      expect(result.success).toBe(false);
    });

    it("rejects a concept id with invalid characters", () => {
      const badId = {
        id: "test-pack",
        version: "1.0.0",
        name: "Pack",
        subject: "test",
        gradeLevel: "9-12",
        authoredBy: "test",
        authoredAt: "2026-01-01T00:00:00.000Z",
        concepts: [
          { id: "BAD_ID", name: "Bad", description: "Bad concept", aliases: [], standardsTags: [] },
        ],
        edges: [],
      };
      const result = PackManifestSchema.safeParse(badId);
      expect(result.success).toBe(false);
    });
  });
});
