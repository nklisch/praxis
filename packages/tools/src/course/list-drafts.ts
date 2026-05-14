import type { DraftCourseState, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const DraftListingSchema = z.object({
	draftId: z.string(),
	title: z.string(),
	subject: z.string().optional(),
	gradeLevel: z.string().optional(),
	unitCount: z.number().int().nonnegative(),
	lessonCount: z.number().int().nonnegative(),
	conceptCount: z.number().int().nonnegative(),
	assessmentCount: z.number().int().nonnegative(),
	completionPercent: z.number().int().min(0).max(100),
	createdAt: z.number(),
	lastTouchedAt: z.number(),
});

const OutputSchema = z.object({
	drafts: z.array(DraftListingSchema),
});

export type DraftListing = z.infer<typeof DraftListingSchema>;

export const listDraftsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
	name: "course.list_drafts",
	description:
		"List the student's active course drafts (unconfirmed, undiscarded), newest-touched first. Each entry includes a recognizable title and structural progress signals. Call this when the student says they want to resume a course they started — pick the right draftId from the returned list, then call course.start_exploration with that draftId to continue.",
	input: InputSchema,
	output: OutputSchema,
	tier: "grounded",
	effects: ["none"],
	async handler(_args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
		const drafts = ctx.services.bootstrap.listActiveForStudent(ctx.studentId);
		// Already ordered DESC by lastTouchedAt per BootstrapService contract.
		return { drafts: drafts.map(toDraftListing) };
	},
};

/** Pure projection — co-located here for testability without DI. */
export function toDraftListing(state: DraftCourseState): DraftListing {
	const p = state.proposed;
	const trimmedTitle = (p.title ?? "").trim();
	const lessonCount = p.proposedLessons.length;
	const unitCount = p.proposedUnits?.length ?? 0;
	const conceptCount = p.proposedConcepts.length;
	const summativeCount = (p.proposedUnits ?? []).filter((u) => u.summative != null).length;
	const lessonAssessmentCount = p.proposedLessonAssessments?.length ?? 0;
	const assessmentCount = summativeCount + lessonAssessmentCount;

	return {
		draftId: state.draftId,
		title: trimmedTitle.length > 0 ? trimmedTitle : "Untitled draft",
		...(p.subject ? { subject: p.subject } : {}),
		...(p.gradeLevel ? { gradeLevel: p.gradeLevel } : {}),
		unitCount,
		lessonCount,
		conceptCount,
		assessmentCount,
		completionPercent: computeCompletion(
			p,
			lessonCount,
			unitCount,
			conceptCount,
			lessonAssessmentCount,
		),
		createdAt: state.createdAt,
		lastTouchedAt: state.lastTouchedAt,
	};
}

/**
 * Weighted completion estimate (illustrative, not exact).
 * - 10% metadata (title/subject/gradeLevel present)
 * - 20% concepts (saturates at 8 concepts)
 * - 20% lessons (saturates at 10 lessons)
 * - 20% units (saturates at 4 units)
 * - 15% assessment plan (any lesson assessment present)
 * - 15% summative count (saturates at 3)
 *
 * Monotonic on each axis as the draft grows. Always returns an integer in [0, 100].
 */
function computeCompletion(
	// biome-ignore lint/suspicious/noExplicitAny: ProposedCourse shape is wide; we read a few fields.
	p: any,
	lessonCount: number,
	unitCount: number,
	conceptCount: number,
	lessonAssessmentCount: number,
): number {
	const metadataWeight =
		(p.title?.trim() ? 1 : 0) * 0.04 +
		(p.subject ? 1 : 0) * 0.03 +
		(p.gradeLevel ? 1 : 0) * 0.03;
	const conceptsWeight = Math.min(1, conceptCount / 8) * 0.2;
	const lessonsWeight = Math.min(1, lessonCount / 10) * 0.2;
	const unitsWeight = Math.min(1, unitCount / 4) * 0.2;
	const assessmentPlanWeight = lessonAssessmentCount > 0 ? 0.15 : 0;
	const summativeCount = (p.proposedUnits ?? []).filter(
		// biome-ignore lint/suspicious/noExplicitAny: same as parent param
		(u: any) => u.summative != null,
	).length;
	const summativeWeight = Math.min(1, summativeCount / 3) * 0.15;

	const total =
		metadataWeight +
		conceptsWeight +
		lessonsWeight +
		unitsWeight +
		assessmentPlanWeight +
		summativeWeight;
	return Math.max(0, Math.min(100, Math.round(total * 100)));
}
