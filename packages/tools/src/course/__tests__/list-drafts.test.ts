/**
 * Unit tests for course.list_drafts — the projection (pure function) plus a
 * thin handler test using a fake BootstrapService.
 */
import type { BootstrapService, DraftCourseState, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listDraftsTool, toDraftListing } from "../list-drafts.js";

const STUDENT = brandId<"StudentId">("stu-1");

function makeDraft(overrides: Partial<DraftCourseState> = {}): DraftCourseState {
	const now = 1_700_000_000_000 as Timestamp;
	return {
		draftId: "d-1",
		studentId: STUDENT,
		documentIds: [],
		proposed: {
			title: "Algebra I",
			subject: "math",
			gradeLevel: "9",
			thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
			proposedConcepts: [],
			proposedEdges: [],
			proposedLessons: [],
		},
		createdAt: now,
		lastTouchedAt: now,
		expiresAt: (now + 2 * 60 * 60 * 1000) as Timestamp,
		...overrides,
	};
}

describe("toDraftListing — projection", () => {
	it("returns 'Untitled draft' when the proposed title is empty or whitespace", () => {
		const draft = makeDraft({
			proposed: {
				...makeDraft().proposed,
				title: "",
			},
		});
		const listing = toDraftListing(draft);
		expect(listing.title).toBe("Untitled draft");
	});

	it("includes subject and gradeLevel when present", () => {
		const listing = toDraftListing(makeDraft());
		expect(listing.subject).toBe("math");
		expect(listing.gradeLevel).toBe("9");
	});

	it("counts assessmentCount as summativeCount + lessonAssessmentCount", () => {
		const draft = makeDraft({
			proposed: {
				...makeDraft().proposed,
				proposedUnits: [
					// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
					{ title: "Unit A", summative: { id: "s1" } as any },
					// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
					{ title: "Unit B", summative: { id: "s2" } as any },
					{ title: "Unit C" },
				],
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
				proposedLessonAssessments: [{ id: "la1" } as any, { id: "la2" } as any],
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
			} as any,
		});
		const listing = toDraftListing(draft);
		expect(listing.assessmentCount).toBe(2 + 2);
	});

	it("completionPercent is in [0, 100] and grows monotonically", () => {
		const empty = makeDraft({
			proposed: {
				...makeDraft().proposed,
				title: "",
				subject: undefined,
				gradeLevel: undefined,
			},
		});
		const partial = makeDraft();
		const full = makeDraft({
			proposed: {
				...makeDraft().proposed,
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
				proposedConcepts: Array.from({ length: 8 }, (_, i) => ({ name: `C${i}` })) as any,
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
				proposedLessons: Array.from({ length: 10 }, (_, i) => ({ title: `L${i}` })) as any,
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
				proposedUnits: Array.from({ length: 4 }, (_, i) => ({
					title: `U${i}`,
					// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
					summative: { id: `s${i}` } as any,
				})) as any,
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
				proposedLessonAssessments: [{ id: "la1" } as any],
				// biome-ignore lint/suspicious/noExplicitAny: shape narrowed elsewhere
			} as any,
		});
		const c1 = toDraftListing(empty).completionPercent;
		const c2 = toDraftListing(partial).completionPercent;
		const c3 = toDraftListing(full).completionPercent;
		expect(c1).toBeGreaterThanOrEqual(0);
		expect(c1).toBeLessThanOrEqual(100);
		expect(c2).toBeGreaterThanOrEqual(c1);
		expect(c3).toBeGreaterThanOrEqual(c2);
		expect(c3).toBeLessThanOrEqual(100);
	});
});

describe("listDraftsTool — handler", () => {
	it("returns drafts: [] when no active drafts exist", async () => {
		const bootstrap: Partial<BootstrapService> = {
			listActiveForStudent: vi.fn().mockReturnValue([]),
		};
		const ctx = makeToolContext({
			services: { bootstrap: bootstrap as BootstrapService },
			studentId: STUDENT,
		});
		const result = await listDraftsTool.handler({}, ctx);
		expect(result.drafts).toEqual([]);
		expect(bootstrap.listActiveForStudent).toHaveBeenCalledWith(STUDENT);
	});

	it("projects each draft through toDraftListing", async () => {
		const bootstrap: Partial<BootstrapService> = {
			listActiveForStudent: vi.fn().mockReturnValue([makeDraft({ draftId: "abc" })]),
		};
		const ctx = makeToolContext({
			services: { bootstrap: bootstrap as BootstrapService },
			studentId: STUDENT,
		});
		const result = await listDraftsTool.handler({}, ctx);
		expect(result.drafts).toHaveLength(1);
		expect(result.drafts[0]?.draftId).toBe("abc");
		expect(result.drafts[0]?.title).toBe("Algebra I");
	});
});
