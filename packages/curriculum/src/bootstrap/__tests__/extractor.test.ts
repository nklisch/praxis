/**
 * Unit tests for runConceptExtractor — Phase 6.
 *
 * The extractor calls runOneShot from @praxis/engines; we mock the Engine
 * so no real LLM calls are made. Tests verify:
 *  - Parses fenced JSON block from assistant response
 *  - Falls back to bare {...} block when no fence
 *  - Throws on empty response
 *  - Throws on malformed JSON
 *  - Throws on schema validation failure
 *  - Caps concept count (maxConcepts) and trims orphaned edges/lessons
 */
import type { Engine, EngineSession, Logger } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import type { RunConceptExtractorInput } from "../extractor.js";
import { runConceptExtractor } from "../extractor.js";

const MOCK_LOG: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const MOCK_CHUNKS: RunConceptExtractorInput["chunks"] = [
  {
    documentId: "doc-1",
    chunkIndex: 0,
    text: "Chapter 1: Introduction to Variables.",
    locator: { page: 1, section: "Chapter 1" },
  },
];

/** Minimal valid ProposedCourse for extractor output. */
const VALID_OUTPUT = {
  title: "Algebra 1",
  subject: "math",
  gradeLevel: "9",
  thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
  proposedConcepts: [
    { name: "Variables", description: "Symbols for numbers", evidence: [] },
    { name: "Equations", description: "Statements of equality", evidence: [] },
  ],
  proposedEdges: [
    { fromName: "Variables", toName: "Equations", strength: 0.8, rationale: "prerequisite" },
  ],
  proposedLessons: [
    {
      draftLessonId: "l1",
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 45,
    },
    {
      draftLessonId: "l2",
      title: "Writing Equations",
      conceptNames: ["Equations"],
      references: [],
      suggestedStrategy: "worked-examples",
      estimatedMinutes: 45,
    },
  ],
};

/** Create a mock Engine that yields the given text as a model_message. */
function makeEngine(text: string): Engine {
  const mockHandle: EngineSession = {
    send: vi.fn().mockImplementation(async function* () {
      yield { type: "model_message" as const, content: text };
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    open: vi.fn().mockResolvedValue(mockHandle),
  } as unknown as Engine;
}

const BASE_INPUT: Omit<RunConceptExtractorInput, "engine"> = {
  chunks: MOCK_CHUNKS,
  courseTitle: "Algebra 1",
  subject: "math",
  gradeLevel: "9",
  log: MOCK_LOG,
};

describe("runConceptExtractor", () => {
  it("parses a fenced JSON block from the assistant response", async () => {
    const json = JSON.stringify(VALID_OUTPUT);
    const engine = makeEngine(`Here is the course plan:\n\`\`\`json\n${json}\n\`\`\``);
    const result = await runConceptExtractor({ ...BASE_INPUT, engine });
    expect(result.title).toBe("Algebra 1");
    expect(result.proposedConcepts).toHaveLength(2);
    expect(result.proposedLessons).toHaveLength(2);
  });

  it("falls back to bare JSON block when no fence", async () => {
    const json = JSON.stringify(VALID_OUTPUT);
    const engine = makeEngine(`Sure, here is the output:\n${json}`);
    const result = await runConceptExtractor({ ...BASE_INPUT, engine });
    expect(result.title).toBe("Algebra 1");
  });

  it("throws when the engine returns an empty response", async () => {
    const engine = makeEngine("   ");
    await expect(runConceptExtractor({ ...BASE_INPUT, engine })).rejects.toThrow(
      "Extractor produced empty response",
    );
  });

  it("throws when response contains no JSON block", async () => {
    const engine = makeEngine("I cannot produce a course plan right now.");
    await expect(runConceptExtractor({ ...BASE_INPUT, engine })).rejects.toThrow(
      "no JSON block",
    );
  });

  it("throws when JSON is malformed", async () => {
    const engine = makeEngine("```json\n{broken json\n```");
    await expect(runConceptExtractor({ ...BASE_INPUT, engine })).rejects.toThrow();
  });

  it("throws on schema validation failure (missing proposedConcepts)", async () => {
    const bad = { ...VALID_OUTPUT, proposedConcepts: [] }; // min(1) violated
    const engine = makeEngine(`\`\`\`json\n${JSON.stringify(bad)}\n\`\`\``);
    await expect(runConceptExtractor({ ...BASE_INPUT, engine })).rejects.toThrow(
      "schema validation",
    );
  });

  it("caps concept count at maxConcepts and trims orphaned edges and lessons", async () => {
    const manyConceptOutput = {
      ...VALID_OUTPUT,
      proposedConcepts: [
        { name: "Variables", description: "desc", evidence: [] },
        { name: "Equations", description: "desc", evidence: [] },
        { name: "Functions", description: "desc", evidence: [] },
      ],
      proposedEdges: [
        { fromName: "Variables", toName: "Equations", strength: 0.8, rationale: "prereq" },
        { fromName: "Equations", toName: "Functions", strength: 0.7, rationale: "prereq" },
      ],
      proposedLessons: [
        {
          draftLessonId: "l1",
          title: "Variables",
          conceptNames: ["Variables"],
          references: [],
          suggestedStrategy: "worked-examples",
          estimatedMinutes: 45,
        },
        {
          draftLessonId: "l2",
          title: "Equations",
          conceptNames: ["Equations", "Functions"],
          references: [],
          suggestedStrategy: "worked-examples",
          estimatedMinutes: 45,
        },
      ],
    };
    const engine = makeEngine(`\`\`\`json\n${JSON.stringify(manyConceptOutput)}\n\`\`\``);
    const result = await runConceptExtractor({ ...BASE_INPUT, engine, maxConcepts: 1 });

    // Only 1 concept kept (Variables, first in array).
    expect(result.proposedConcepts).toHaveLength(1);
    expect(result.proposedConcepts[0]?.name).toBe("Variables");

    // Edges involving Equations or Functions should be dropped.
    expect(result.proposedEdges).toHaveLength(0);

    // Lesson 2 (Equations + Functions) has no valid concepts after trimming — dropped.
    // Lesson 1 (Variables) still valid.
    expect(result.proposedLessons).toHaveLength(1);
    expect(result.proposedLessons[0]?.title).toBe("Variables");
  });
});
