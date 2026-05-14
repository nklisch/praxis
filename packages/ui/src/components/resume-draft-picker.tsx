import type { DraftCourseState } from "@praxis/core/types";
import { useEffect, useId, useRef, useState } from "react";
import { useDrafts } from "../hooks/use-drafts.js";
import styles from "./resume-draft-picker.module.css";

export interface ResumeDraftPickerProps {
	onResume: (draft: DraftCourseState) => void | Promise<void>;
}

/**
 * Inline expanding picker rendered alongside "+ New course" on the courses
 * route. Subscribes to the live draft stream via `useDrafts()`. Renders
 * nothing when no active drafts exist. Each row shows the working title,
 * a relative last-touched timestamp, and a "N units · M lessons" summary.
 * Click → invokes `onResume(draft)`.
 *
 * See feature epic-course-structured-tutor-draft-resumption.
 */
export function ResumeDraftPicker({ onResume }: ResumeDraftPickerProps): React.JSX.Element | null {
	const { drafts } = useDrafts();
	const [open, setOpen] = useState(false);
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);

	// Esc + click-outside close.
	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		function onClick(e: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		window.addEventListener("keydown", onKey);
		window.addEventListener("mousedown", onClick);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("mousedown", onClick);
		};
	}, [open]);

	if (drafts.length === 0) return null;

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				type="button"
				className={styles.toggle}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listId}
				onClick={() => setOpen((v) => !v)}
			>
				Resume draft ({drafts.length})
			</button>
			{open && (
				<ul id={listId} role="listbox" className={styles.panel}>
					{drafts.map((draft) => (
						<li key={draft.draftId} role="option" aria-selected={false}>
							<button
								type="button"
								className={styles.row}
								onClick={async () => {
									setOpen(false);
									await onResume(draft);
								}}
							>
								<span className={styles.rowTitle}>{displayTitle(draft)}</span>
								<span className={styles.rowMeta}>
									{relativeTime(draft.lastTouchedAt)} · {summariseShape(draft)}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function displayTitle(draft: DraftCourseState): string {
	const title = (draft.proposed?.title ?? "").trim();
	return title.length > 0 ? title : "Untitled draft";
}

function summariseShape(draft: DraftCourseState): string {
	const p = draft.proposed;
	const units = p?.proposedUnits?.length ?? 0;
	const lessons = p?.proposedLessons?.length ?? 0;
	return `${units} unit${units === 1 ? "" : "s"} · ${lessons} lesson${lessons === 1 ? "" : "s"}`;
}

function relativeTime(ts: number): string {
	const now = Date.now();
	const delta = Math.max(0, now - ts);
	const min = Math.floor(delta / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} hr ago`;
	const days = Math.floor(hr / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
