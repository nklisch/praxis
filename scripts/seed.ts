#!/usr/bin/env tsx
import { courses } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";

const { db } = openDb();

const studentId = "student-seed";
const graphId = uuidv7();
const conceptId = uuidv7();
const courseId = uuidv7();
const sessionId = uuidv7();
const eventId = uuidv7();
const now = Date.now();

db.transaction((tx) => {
  tx.insert(conceptGraphs)
    .values({
      id: graphId,
      source: "canonical",
      name: "Seed Graph",
      version: "0.0.1",
      createdAt: new Date(now),
    })
    .run();

  tx.insert(concepts)
    .values({
      id: conceptId,
      graphId,
      name: "Seed Concept",
      description: "Demo concept inserted by scripts/seed.ts",
      aliasesJson: [],
      standardsTagsJson: [],
    })
    .run();

  tx.insert(courses)
    .values({
      id: courseId,
      studentId,
      title: "Seed Course",
      subject: "demo",
      gradeLevel: "6-8",
      sourceJson: { kind: "authored", authorRole: "self-directed" },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .run();

  tx.insert(sessions)
    .values({
      id: sessionId,
      studentId,
      courseId,
      modeId: "teach",
      engineId: "direct.anthropic",
      startedAt: new Date(now),
    })
    .run();

  tx.insert(episodicEvents)
    .values({
      id: eventId,
      sessionId,
      studentId,
      ts: new Date(now),
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      eventJson: { type: "model_message", content: "Hello from seed." },
    })
    .run();
});

console.log(`Seeded: student=${studentId} course=${courseId} session=${sessionId}`);
