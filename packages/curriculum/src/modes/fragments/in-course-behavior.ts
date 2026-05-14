import type { PromptFragment } from "@praxis/core/types";

/**
 * Fallback `context`-position fragments used when a session has no
 * `courseId`. SessionServiceImpl replaces these via the overrides map at
 * session-start when `courseId` is present (override-by-default pattern,
 * mirroring `context.course-state`).
 *
 * Each fragment carries `customizable: true` so SessionServiceImpl can
 * inject via the overrides map. Fragment ids must match
 * `behaviorInCourseFragmentId(modeId)`.
 *
 * Default templates are a single short line — empty strings produce doubled
 * `\n\n` separators in `composeSystemPrompt`'s join.
 *
 * See `epic-course-structured-tutor-course-aware-mode-prompts`.
 */
export const behaviorInCourseFragmentDefault: Record<
	"teach" | "quiz" | "homework" | "exam" | "study-skills",
	PromptFragment
> = {
	teach: {
		id: "context.behavior-in-course.teach",
		position: "context",
		customizable: true,
		template: `No active course — operate generically and rely on the student's stated topic.`,
	},
	quiz: {
		id: "context.behavior-in-course.quiz",
		position: "context",
		customizable: true,
		template: `No active course — operate generically and rely on the student's stated topic.`,
	},
	homework: {
		id: "context.behavior-in-course.homework",
		position: "context",
		customizable: true,
		template: `No active course — operate generically and rely on the student's stated topic.`,
	},
	exam: {
		id: "context.behavior-in-course.exam",
		position: "context",
		customizable: true,
		template: `No active course — operate generically and rely on the student's stated topic.`,
	},
	"study-skills": {
		id: "context.behavior-in-course.study-skills",
		position: "context",
		customizable: true,
		template: `No active course — operate generically and rely on the student's stated topic.`,
	},
};
