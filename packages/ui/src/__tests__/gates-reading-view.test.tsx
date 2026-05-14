import type {
	ConceptId,
	Gate,
	GateView,
	Lesson,
	Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatesReadingView } from "../components/gates-reading-view.js";

afterEach(() => cleanup());

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
	return {
		id: brandId<"LessonId">("lesson-1"),
		courseId: brandId<"CourseId">("course-1"),
		title: "Variables",
		conceptIds: [
			brandId<"ConceptId">("concept-var"),
			brandId<"ConceptId">("concept-const"),
		],
		sortOrder: 0,
		objective: "",
		estimatedMinutes: 20,
		suggestedStrategy: null,
		createdAt: 0 as Timestamp,
		updatedAt: 0 as Timestamp,
		...overrides,
	};
}

function makeGate(overrides: Partial<Gate> = {}): Gate {
	return {
		id: brandId<"GateId">("gate-1"),
		courseId: brandId<"CourseId">("course-1"),
		guards: { kind: "lesson", lessonId: brandId<"LessonId">("lesson-1") },
		successCriteria: {
			kind: "mastery-threshold",
			conceptIds: [brandId<"ConceptId">("concept-var")] as ConceptId[],
			minScore: 0.7,
		},
		prerequisites: [],
		state: { kind: "locked", missingPrerequisites: [] },
		overrideHistory: [],
		createdAt: 0 as Timestamp,
		updatedAt: 0 as Timestamp,
		...overrides,
	};
}

function makeGateView(gate: Gate, summaryText = "Mastery ≥ 70% on 1 concept"): GateView {
	return {
		gate,
		summaryText,
		lockReason: "",
		progress: 0,
		isActive: false,
	};
}

const conceptDescriptions: Record<string, { name: string; description: string }> = {
	"concept-var": { name: "Variable", description: "A named placeholder for a value." },
	"concept-const": { name: "Constant", description: "A fixed value that does not change." },
};

function getConcept(id: string): { name: string; description: string } | null {
	return conceptDescriptions[id] ?? null;
}

describe("GatesReadingView", () => {
	it("renders concept names as chips inside lessons", () => {
		const lesson = makeLesson();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[]}
				gates={[]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		expect(screen.getByText("Variable")).toBeDefined();
		expect(screen.getByText("Constant")).toBeDefined();
		// concept ids appear as muted secondary text inside the same chip
		expect(screen.getByText("concept-var")).toBeDefined();
		expect(screen.getByText("concept-const")).toBeDefined();
	});

	it("falls back to the id when getConcept returns null", () => {
		const lesson = makeLesson({
			conceptIds: [brandId<"ConceptId">("unknown-concept")] as ConceptId[],
		});
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[]}
				gates={[]}
				getConcept={() => null}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		// Both the chip name and id show the same id (fallback)
		const matches = screen.getAllByText("unknown-concept");
		expect(matches.length).toBeGreaterThanOrEqual(1);
	});

	it("renders a state badge on the gate row", () => {
		const lesson = makeLesson();
		const gate = makeGate();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[makeGateView(gate)]}
				gates={[gate]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		expect(screen.getByText("Locked")).toBeDefined();
	});

	it("clicking the chevron expands the gate row to show concept cards", () => {
		const lesson = makeLesson();
		const gate = makeGate();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[makeGateView(gate)]}
				gates={[gate]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		const chevron = screen.getByLabelText("Expand gate details");
		fireEvent.click(chevron);
		// "Required concepts:" label appears when expanded
		expect(screen.getByText(/Required concepts/)).toBeDefined();
		// First-sentence description appears
		expect(screen.getByText(/A named placeholder/)).toBeDefined();
	});

	it("clicking the chevron again collapses the gate row", () => {
		const lesson = makeLesson();
		const gate = makeGate();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[makeGateView(gate)]}
				gates={[gate]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		const expandBtn = screen.getByLabelText("Expand gate details");
		fireEvent.click(expandBtn);
		const collapseBtn = screen.getByLabelText("Collapse gate details");
		fireEvent.click(collapseBtn);
		expect(screen.queryByText(/Required concepts/)).toBeNull();
	});

	it("clicking the gate row body (not the chevron) calls onSelectGate", () => {
		const lesson = makeLesson();
		const gate = makeGate();
		const onSelect = vi.fn();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[makeGateView(gate)]}
				gates={[gate]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={onSelect}
			/>,
		);
		const inspectBtn = screen.getByLabelText("Inspect gate Mastery ≥ 70% on 1 concept");
		fireEvent.click(inspectBtn);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(gate);
	});

	it("clicking the chevron does NOT call onSelectGate", () => {
		const lesson = makeLesson();
		const gate = makeGate();
		const onSelect = vi.fn();
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[makeGateView(gate)]}
				gates={[gate]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={onSelect}
			/>,
		);
		fireEvent.click(screen.getByLabelText("Expand gate details"));
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("renders empty state when no lessons exist", () => {
		render(
			<GatesReadingView
				lessons={[]}
				gateViews={[]}
				gates={[]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		expect(screen.getByText(/No lessons/)).toBeDefined();
	});

	it("renders 'no concepts' line when a lesson has zero conceptIds", () => {
		const lesson = makeLesson({ conceptIds: [] });
		render(
			<GatesReadingView
				lessons={[lesson]}
				gateViews={[]}
				gates={[]}
				getConcept={getConcept}
				selectedGateId={null}
				onSelectGate={vi.fn()}
			/>,
		);
		expect(screen.getByText(/No concepts in this lesson/)).toBeDefined();
	});
});
