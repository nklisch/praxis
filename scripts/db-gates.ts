/**
 * db:gates — CLI script to display gate states and unlock history per course.
 *
 * Usage:
 *   pnpm db:gates              List all gates with current state.
 *   pnpm db:gates --evaluate   Re-evaluate all gates for all courses first.
 *
 * Reads `gates` and `gate_unlock_events` tables and prints formatted output.
 */

import { courses, gates, gateUnlockEvents } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import {
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  CourseStateReaderImpl,
  CoursesServiceImpl,
  GatesServiceImpl,
  getOrCreateDefaultStudentId,
  LessonAssessmentsServiceImpl,
  LessonsServiceImpl,
  MemoryServiceImpl,
} from "@praxis/core/services";
import { brandId } from "@praxis/core/types";
import { eq } from "drizzle-orm";
import { noopLogger } from "../tests/helpers/mocks.js";

const args = process.argv.slice(2);
const evaluateFlag = args.includes("--evaluate");

const { db } = openDb({ readonly: !evaluateFlag });

const log = noopLogger();

if (evaluateFlag) {
  // Construct minimal services to call evaluateAndPersistGates per course.
  const memoryService = new MemoryServiceImpl({ db, log, decayDaysFor: () => 14 });

  const assignmentService = new AssignmentServiceImpl({
    db,
    log,
    // biome-ignore lint/suspicious/noExplicitAny: graderServices stub for CLI
    graderServices: { sympy: null as any, sandbox: null as any, engineResolver: null as any },
    resolveSubmissionMode: () => "quiz",
  });

  const coursesService = new CoursesServiceImpl({ db, log });
  const lessonsService = new LessonsServiceImpl({ db, log });
  const gatesService = new GatesServiceImpl({
    db,
    log,
    masteryReader: memoryService,
    gradeReader: assignmentService,
  });
  const lessonAssessmentsService = new LessonAssessmentsServiceImpl({ db, log });
  const courseStateReader = new CourseStateReaderImpl({
    db,
    log,
    courses: coursesService,
    lessons: lessonsService,
    gates: gatesService,
  });
  const artifactsService = new ArtifactsServiceImpl({
    courses: coursesService,
    lessons: lessonsService,
    gates: gatesService,
    lessonAssessments: lessonAssessmentsService,
    courseStateReader,
  });

  const studentId = brandId<"StudentId">(getOrCreateDefaultStudentId(db));
  const courseRows = db.select().from(courses).all();

  for (const c of courseRows) {
    const courseId = brandId<"CourseId">(c.id);
    try {
      const result = await artifactsService.evaluateAndPersistGates({ studentId, courseId });
      if (result.unlockedGateIds.length > 0) {
        console.log(
          `  [${c.title}] Unlocked ${result.unlockedGateIds.length} gate(s): ${result.unlockedGateIds.join(", ")}`,
        );
      }
    } catch (err) {
      console.error(
        `  [${c.title}] Evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("\nRe-evaluated all gates for all courses.\n");
}

// ── List all courses + their gates ──────────────────────────────────────────

const courseRows = db.select().from(courses).all();

if (courseRows.length === 0) {
  console.log("No courses found. Run pnpm db:seed or bootstrap a course first.");
  process.exit(0);
}

for (const c of courseRows) {
  console.log(`\n## ${c.title} (${c.id})`);

  const gateRows = db.select().from(gates).where(eq(gates.courseId, c.id)).all();
  if (gateRows.length === 0) {
    console.log("  (no gates)");
  } else {
    console.table(
      gateRows.map((g) => ({
        gateId: g.id.slice(0, 8),
        guards: (g.guardsJson as { kind: string; lessonId?: string }).kind,
        state: (g.stateJson as { kind: string }).kind,
        prereqs: ((g.prerequisitesJson as string[]) ?? []).length,
      })),
    );
  }

  const unlockRows = db
    .select()
    .from(gateUnlockEvents)
    .where(eq(gateUnlockEvents.courseId, c.id))
    .all();

  if (unlockRows.length > 0) {
    console.log(`  ${unlockRows.length} unlock event(s):`);
    for (const u of unlockRows) {
      const viewedTag = u.viewedAt
        ? ` (viewed ${u.viewedAt.toISOString().slice(0, 10)})`
        : " (not viewed)";
      console.log(
        `    gate:${u.gateId.slice(0, 8)} unlocked at ${u.unlockedAt.toISOString()}${viewedTag}`,
      );
    }
  }
}
