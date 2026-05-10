import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { RouterReason } from "@praxis/curriculum/router";
import { suggestNext } from "@praxis/curriculum/router";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z
    .string()
    .optional()
    .describe("The course ID to query. Omit to use the session's active course."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    /** Existing fields — Phase 6 callers continue to work. */
    conceptId: z.string(),
    name: z.string(),
    description: z.string(),
    lessonId: z.string(),
    /** Phase 10: new fields — adaptive routing metadata. */
    reason: z.enum(["next-in-order", "frontier", "review", "interleave"]),
    masteryNow: z.number().min(0).max(1),
    uncertainty: z.number().min(0).max(1),
    /** Suggested companion concepts: decayed concepts to review before/during the primary. */
    reviews: z
      .array(
        z.object({
          conceptId: z.string(),
          name: z.string(),
          reason: z.literal("review"),
          masteryNow: z.number(),
        }),
      )
      .default([]),
    /** Suggested companion concepts: earlier concepts to interleave for retention. */
    interleaves: z
      .array(
        z.object({
          conceptId: z.string(),
          name: z.string(),
          reason: z.literal("interleave"),
          masteryNow: z.number(),
        }),
      )
      .default([]),
    /** Phase 18: recommended teaching strategy (from procedural preferences + affective state). */
    suggestedStrategy: z.string(),
    /** Phase 18: difficulty modulation hint for the next item. */
    difficultyHint: z.enum(["easier", "normal", "harder"]),
    /** Phase 18: mode-transition suggestion (null = no transition recommended). */
    suggestedModeTransition: z.enum(["study-skills"]).nullable(),
  }),
  z.object({
    kind: z.literal("all_complete"),
    courseId: z.string(),
    /** Phase 18: difficulty modulation hint — still computable from affective state. */
    difficultyHint: z.enum(["easier", "normal", "harder"]),
    /** Phase 18: mode-transition suggestion. */
    suggestedModeTransition: z.enum(["study-skills"]).nullable(),
  }),
  z.object({ kind: z.literal("no_active_lesson"), courseId: z.string() }),
]);

export const currentConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.current_concept",
  description:
    "Suggest the right concept for the student to work on now. Returns the primary concept (with reason: next-in-order / frontier / review / interleave) plus optional companion concepts the student should review or interleave for retention. The router considers mastery, uncertainty, decay, and course position — not just lesson order. Call at the start of each major teaching chunk.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const rawId = args.courseId ?? (ctx.courseId ? ctx.courseId : null);
    if (!rawId) {
      throw new Error(
        "course.current_concept requires either an explicit courseId argument or a session started with a courseId",
      );
    }
    const courseId = brandId<"CourseId">(rawId);

    // Read course snapshot + student model + procedural + affective in parallel for performance.
    const [snapshot, studentModel, proceduralModel, affectiveModel] = await Promise.all([
      ctx.services.courseState.read({ studentId: ctx.studentId, courseId }),
      ctx.services.memory.studentModel(ctx.studentId),
      ctx.services.memory.procedural(ctx.studentId),
      ctx.services.memory.affective(ctx.studentId),
    ]);

    if (!snapshot) {
      throw new Error(`Course not found for this student: ${rawId}`);
    }

    // Build procedural strategy map for the router (string keys; router brands at read).
    const proceduralStrategies = new Map<string, { preference: number; evidenceCount: number }>();
    for (const [id, pref] of proceduralModel.strategies) {
      proceduralStrategies.set(id as string, {
        preference: pref.preference,
        evidenceCount: pref.evidenceCount,
      });
    }

    const recentAffect = affectiveModel.recent.map((s) => ({
      engagement: s.engagement,
      frustration: s.frustration,
      confidence: s.confidence,
    }));

    if (!snapshot.currentLesson) {
      // Even when the course is complete, we can still compute affect-based signals.
      const completeSuggestion = suggestNext({
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: Date.now() as import("@praxis/core/types").Timestamp,
        decayDays: snapshot.course.thresholds.decayDays,
        proceduralStrategies,
        affectiveBaseline: affectiveModel.baseline,
        recentAffect,
      });
      return {
        kind: "all_complete",
        courseId: snapshot.course.id,
        difficultyHint: completeSuggestion.difficultyHint,
        suggestedModeTransition: completeSuggestion.suggestedModeTransition,
      };
    }

    // Build router input maps from the student model's conceptMastery.
    // Concepts not in the map default to 0 mastery / 0.5 uncertainty (per RouterInput contract).
    const masteryByConceptId = new Map<string, number>();
    const uncertaintyByConceptId = new Map<string, number>();
    const lastPracticedByConceptId = new Map<string, import("@praxis/core/types").Timestamp>();
    for (const [conceptId, m] of studentModel.conceptMastery.entries()) {
      masteryByConceptId.set(conceptId, m.effectivePKnown);
      uncertaintyByConceptId.set(conceptId, m.uncertainty);
      if (m.lastPracticedAt !== undefined) {
        lastPracticedByConceptId.set(conceptId, m.lastPracticedAt);
      }
    }

    const decayDays = snapshot.course.thresholds.decayDays;
    const suggestion = suggestNext({
      snapshot,
      masteryByConceptId,
      uncertaintyByConceptId,
      lastPracticedByConceptId,
      now: Date.now() as import("@praxis/core/types").Timestamp,
      decayDays,
      proceduralStrategies,
      affectiveBaseline: affectiveModel.baseline,
      recentAffect,
    });

    if (!suggestion.primary) {
      return {
        kind: "all_complete",
        courseId: snapshot.course.id,
        difficultyHint: suggestion.difficultyHint,
        suggestedModeTransition: suggestion.suggestedModeTransition,
      };
    }

    const primaryReason = suggestion.primary.reason as Exclude<RouterReason, "all-complete">;

    return {
      kind: "ok",
      conceptId: suggestion.primary.conceptId,
      name: suggestion.primary.name,
      description: suggestion.primary.description,
      lessonId: suggestion.primary.lessonId,
      reason: primaryReason,
      masteryNow: suggestion.primary.masteryNow,
      uncertainty: suggestion.primary.uncertainty,
      reviews: suggestion.reviews.map((r) => ({
        conceptId: r.conceptId,
        name: r.name,
        reason: "review" as const,
        masteryNow: r.masteryNow,
      })),
      interleaves: suggestion.interleaves.map((i) => ({
        conceptId: i.conceptId,
        name: i.name,
        reason: "interleave" as const,
        masteryNow: i.masteryNow,
      })),
      suggestedStrategy: suggestion.suggestedStrategy as string,
      difficultyHint: suggestion.difficultyHint,
      suggestedModeTransition: suggestion.suggestedModeTransition,
    };
  },
};
