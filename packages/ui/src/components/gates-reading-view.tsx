import type { Gate, GateId, GateView, Lesson, SuccessCriteria } from "@praxis/core/types";
import { type JSX, useState } from "react";
import styles from "./gates-reading-view.module.css";

export interface ConceptDisplayRow {
	name: string;
	description: string;
}

export interface GatesReadingViewProps {
	lessons: ReadonlyArray<Lesson>;
	gateViews: ReadonlyArray<GateView>;
	gates: ReadonlyArray<Gate>;
	/** Resolve a concept id to its display row. Returns null for unknown ids. */
	getConcept: (id: string) => ConceptDisplayRow | null;
	/** Currently-selected gate (for inspector pairing). */
	selectedGateId: GateId | null;
	/** Click on a gate row → opens the inspector. */
	onSelectGate: (gate: Gate) => void;
}

/**
 * Vertical lessons-and-gates reading view that sits alongside the React Flow
 * graph in the gates tab. Each lesson is a row containing the lesson title
 * and a wrapped chip grid of its concepts (name + muted id). Between
 * lessons, the gate guarding the next lesson renders as a row with a
 * chevron that expands inline to a wider reading layout (concept name + id +
 * description cards). Clicking the gate row body — not the chevron —
 * opens the gate inspector via `onSelectGate`.
 */
export function GatesReadingView({
	lessons,
	gateViews,
	gates: _gates,
	getConcept,
	selectedGateId,
	onSelectGate,
}: GatesReadingViewProps): JSX.Element {
	const [expanded, setExpanded] = useState<Set<GateId>>(new Set());

	const toggleExpanded = (gateId: GateId) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(gateId)) next.delete(gateId);
			else next.add(gateId);
			return next;
		});
	};

	if (lessons.length === 0) {
		return (
			<div className={styles.empty} role="status">
				<p>No lessons in this course yet.</p>
			</div>
		);
	}

	return (
		<div className={styles.reading}>
			{lessons.map((lesson) => {
				const gateView = gateViews.find(
					(gv) =>
						gv.gate.guards.kind === "lesson" &&
						(gv.gate.guards as { lessonId: string }).lessonId === lesson.id,
				);
				return (
					<div key={lesson.id} className={styles.lessonBlock}>
						<LessonRow lesson={lesson} getConcept={getConcept} />
						{gateView && (
							<GateRow
								gateView={gateView}
								getConcept={getConcept}
								expanded={expanded.has(gateView.gate.id)}
								selected={selectedGateId === gateView.gate.id}
								onToggleExpanded={() => toggleExpanded(gateView.gate.id)}
								onSelect={() => onSelectGate(gateView.gate)}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

interface LessonRowProps {
	lesson: Lesson;
	getConcept: (id: string) => ConceptDisplayRow | null;
}

function LessonRow({ lesson, getConcept }: LessonRowProps): JSX.Element {
	return (
		<div className={styles.lessonRow}>
			<h3 className={styles.lessonTitle}>{lesson.title}</h3>
			{lesson.conceptIds.length === 0 ? (
				<p className={styles.emptyConcepts}>No concepts in this lesson yet.</p>
			) : (
				<ul className={styles.chips} aria-label={`Concepts in ${lesson.title}`}>
					{lesson.conceptIds.map((conceptId) => {
						const row = getConcept(conceptId);
						const name = row?.name ?? conceptId;
						return (
							<li key={conceptId} className={styles.chip}>
								<span className={styles.chipName}>{name}</span>
								<span className={styles.chipId} title={conceptId}>
									{conceptId}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

interface GateRowProps {
	gateView: GateView;
	getConcept: (id: string) => ConceptDisplayRow | null;
	expanded: boolean;
	selected: boolean;
	onToggleExpanded: () => void;
	onSelect: () => void;
}

function gateStateBadge(gate: Gate): string {
	switch (gate.state.kind) {
		case "locked":
			return "Locked";
		case "unlocked":
			return "Unlocked";
		case "overridden":
			return "Overridden";
	}
}

function listConceptIdsForCriteria(criteria: SuccessCriteria): string[] | null {
	if (criteria.kind === "mastery-threshold") {
		return criteria.conceptIds.slice();
	}
	return null;
}

function firstSentence(description: string): string {
	const trimmed = description.trim();
	const match = trimmed.match(/^[^.!?]+[.!?]/);
	return match ? match[0] : trimmed;
}

function GateRow({
	gateView,
	getConcept,
	expanded,
	selected,
	onToggleExpanded,
	onSelect,
}: GateRowProps): JSX.Element {
	const { gate, summaryText } = gateView;
	const conceptIds = listConceptIdsForCriteria(gate.successCriteria);
	const stateBadge = gateStateBadge(gate);

	return (
		<div className={[styles.gateRow, selected ? styles.gateRowSelected : ""].filter(Boolean).join(" ")}>
			<div className={styles.gateHeader}>
				<button
					type="button"
					className={styles.chevron}
					aria-label={expanded ? "Collapse gate details" : "Expand gate details"}
					aria-expanded={expanded}
					onClick={onToggleExpanded}
				>
					{expanded ? "▾" : "▸"}
				</button>
				<button
					type="button"
					className={styles.gateBody}
					onClick={onSelect}
					aria-label={`Inspect gate ${summaryText}`}
				>
					<span className={styles.gateSummary}>{summaryText}</span>
					<span className={styles.gateBadge} data-state={gate.state.kind}>
						{stateBadge}
					</span>
				</button>
			</div>
			{expanded && (
				<div className={styles.gateExpanded}>
					{conceptIds === null ? (
						<p className={styles.gateCriteriaText}>{summaryText}</p>
					) : (
						<>
							<p className={styles.gateExpandedLabel}>Required concepts:</p>
							<ul className={styles.conceptCards}>
								{conceptIds.map((conceptId) => {
									const row = getConcept(conceptId);
									return (
										<li key={conceptId} className={styles.conceptCard}>
											<span className={styles.conceptCardName}>
												{row?.name ?? conceptId}
											</span>
											<span className={styles.conceptCardId} title={conceptId}>
												{conceptId}
											</span>
											{row?.description && (
												<span className={styles.conceptCardDesc}>
													{firstSentence(row.description)}
												</span>
											)}
										</li>
									);
								})}
							</ul>
						</>
					)}
				</div>
			)}
		</div>
	);
}
