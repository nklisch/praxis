/**
 * Unit tests for ArtifactsServiceImpl.concepts() — Phase 10.
 *
 * Uses useTempDb() for a real migrated SQLite database.
 * Seeds concept graph + course rows, verifies the concepts() method
 * returns the correct concept rows for the given courseId.
 *
 * Covers:
 *  - Returns empty array when courseId is not found
 *  - Returns all concepts belonging to the course's conceptGraphId
 *  - Does NOT return concepts from a different conceptGraphId
 *  - Returned shape includes id, graphId, name, description, aliases, standardsTags
 */
import { courses } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { ArtifactsServiceImpl } from "../services/artifacts-service.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-asc");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const MOCK_MASTERY_READER = { read: vi.fn().mockResolvedValue(0) };
const MOCK_GRADE_READER = { readGrade: vi.fn().mockResolvedValue(null) };

const dbCtx = useTempDb();

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedGraphAndCourse(
  db: ReturnType<typeof openDb>["db"],
  opts: { courseId: string; graphId: string },
) {
  db.insert(conceptGraphs)
    .values({
      id: opts.graphId,
      source: "canonical",
      name: `Graph ${opts.graphId}`,
      version: "1.0.0",
      createdAt: new Date(),
    })
    .run();

  db.insert(courses)
    .values({
      id: opts.courseId,
      studentId: STUDENT_ID,
      title: "Test Course",
      subject: "math",
      gradeLevel: "9-12",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: opts.graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

function seedConcepts(
  db: ReturnType<typeof openDb>["db"],
  graphId: string,
  conceptDefs: Array<{ id: string; name: string }>,
) {
  for (const def of conceptDefs) {
    db.insert(concepts)
      .values({
        id: def.id,
        graphId,
        name: def.name,
        description: `Description of ${def.name}`,
        aliasesJson: ["alias1"],
        standardsTagsJson: ["CCSS.MATH.HSA-REI.A.1"],
      })
      .run();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ArtifactsServiceImpl.concepts()", () => {
  it("returns empty array when courseId does not exist", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const result = await svc.concepts(brandId<"CourseId">("nonexistent-course"));
    expect(result).toHaveLength(0);
  });

  it("returns all concepts belonging to the course's conceptGraphId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const courseId = "asc-course-1";
    const graphId = "asc-graph-1";

    seedGraphAndCourse(db, { courseId, graphId });
    seedConcepts(db, graphId, [
      { id: `${graphId}:concept-a`, name: "Concept A" },
      { id: `${graphId}:concept-b`, name: "Concept B" },
      { id: `${graphId}:concept-c`, name: "Concept C" },
    ]);

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const result = await svc.concepts(brandId<"CourseId">(courseId));
    expect(result).toHaveLength(3);
  });

  it("does not return concepts from a different conceptGraphId", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const courseId = "asc-course-2";
    const graphId = "asc-graph-2";
    const otherGraphId = "asc-graph-other";

    seedGraphAndCourse(db, { courseId, graphId });
    // Seed concept graph for the other graph (no course references it).
    db.insert(conceptGraphs)
      .values({
        id: otherGraphId,
        source: "canonical",
        name: "Other Graph",
        version: "1.0.0",
        createdAt: new Date(),
      })
      .run();

    // Seed one concept for the course's graph and two for the other graph.
    seedConcepts(db, graphId, [{ id: `${graphId}:own-concept`, name: "Own Concept" }]);
    seedConcepts(db, otherGraphId, [
      { id: `${otherGraphId}:other-1`, name: "Other 1" },
      { id: `${otherGraphId}:other-2`, name: "Other 2" },
    ]);

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const result = await svc.concepts(brandId<"CourseId">(courseId));
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Own Concept");
  });

  it("returns the correct shape: id, graphId, name, description, aliases, standardsTags", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const courseId = "asc-course-3";
    const graphId = "asc-graph-3";

    seedGraphAndCourse(db, { courseId, graphId });
    seedConcepts(db, graphId, [{ id: `${graphId}:shape-concept`, name: "Shape Concept" }]);

    const svc = new ArtifactsServiceImpl({
      db,
      log: MOCK_LOG,
      masteryReader: MOCK_MASTERY_READER,
      gradeReader: MOCK_GRADE_READER,
    });

    const result = await svc.concepts(brandId<"CourseId">(courseId));
    expect(result).toHaveLength(1);

    const concept = result[0]!;
    expect(concept).toHaveProperty("id");
    expect(concept).toHaveProperty("graphId", graphId);
    expect(concept).toHaveProperty("name", "Shape Concept");
    expect(concept).toHaveProperty("description", "Description of Shape Concept");
    expect(Array.isArray(concept.aliases)).toBe(true);
    expect(concept.aliases).toContain("alias1");
    expect(Array.isArray(concept.standardsTags)).toBe(true);
    expect(concept.standardsTags).toContain("CCSS.MATH.HSA-REI.A.1");
  });
});
