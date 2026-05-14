import { type JSX, useState } from "react";
import styles from "./prompt-block.module.css";

export interface PromptBlockProps {
	/** Stable id; matches PromptFragment.id or synthetic "user-global"/"user-append" ids. */
	blockId: string;
	/** Display title shown in the block header. */
	title: string;
	/** Position label shown muted in the header (e.g. "preamble", "user-global"). */
	positionLabel: string;
	/** Current persisted text — what view-mode shows and what edit-mode initialises with. */
	currentText: string;
	/**
	 * The fragment's unmodified default. Present only for mode fragments — global
	 * and append blocks have no notion of a default. Drives the per-block Diff
	 * affordance and the "Return to default" button.
	 */
	defaultText?: string;
	/** True when an override / non-empty user value is stored. Drives the "Edited" badge. */
	hasOverride: boolean;
	/** Whether the block accepts edits at the data layer (PromptFragment.customizable). */
	customizable: boolean;
	/** True when the configurator lock is active (forces read-only). */
	locked: boolean;
	/**
	 * Whether the block's Edit button is enabled. The parent stack passes false
	 * when another block is already in edit-mode, enforcing single-block-at-a-time.
	 */
	editEnabled?: boolean;
	/** Called when the user saves a new value. Returns when the IPC completes. */
	onSave: (text: string) => Promise<void>;
	/** Called when the user clears the override (only for blocks with defaultText). */
	onReturnToDefault?: () => Promise<void>;
	/**
	 * Called whenever the in-flight draft changes during edit-mode. Lets the
	 * parent stack feed the draft into composed-view highlighting / preview
	 * IPC. Fires on every keystroke; debouncing happens upstream.
	 */
	onDraftChange?: (draft: string | null) => void;
	/**
	 * Called when this block enters/exits edit-mode. Parent uses this to track
	 * the editing-exclusivity flag.
	 */
	onEditingChange?: (editing: boolean) => void;
}

/**
 * Editorial primitive for a single prompt block. Owns the view-mode →
 * edit-mode lifecycle, local Save / Cancel, and per-block Diff toggle.
 * The parent stack (`<PromptBlockStack>`) owns the list and the refresh
 * after mutations.
 *
 * See feature epic-editorial-polish-pass-prompt-config-redesign.
 */
export function PromptBlock(props: PromptBlockProps): JSX.Element {
	const {
		title,
		positionLabel,
		currentText,
		defaultText,
		hasOverride,
		customizable,
		locked,
		editEnabled = true,
		onSave,
		onReturnToDefault,
		onDraftChange,
		onEditingChange,
	} = props;

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(currentText);
	const [showDiff, setShowDiff] = useState(false);
	const [saving, setSaving] = useState(false);

	const editable = customizable && !locked;
	const canShowDiff = defaultText !== undefined && customizable;

	function enterEdit() {
		setDraft(currentText);
		setEditing(true);
		onEditingChange?.(true);
		onDraftChange?.(currentText);
	}

	function cancelEdit() {
		setDraft(currentText);
		setEditing(false);
		onEditingChange?.(false);
		onDraftChange?.(null);
	}

	async function commitEdit() {
		setSaving(true);
		try {
			await onSave(draft);
			setEditing(false);
			onEditingChange?.(false);
			onDraftChange?.(null);
		} finally {
			setSaving(false);
		}
	}

	function updateDraft(next: string) {
		setDraft(next);
		onDraftChange?.(next);
	}

	return (
		<div className={styles.block}>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
				<span className={styles.position}>{positionLabel}</span>
				{hasOverride && <span className={styles.edited}>edited</span>}
				{!editable && <span className={styles.locked}>locked</span>}
				<div className={styles.spacer} />
				{canShowDiff && (
					<button
						type="button"
						className={styles.smallBtn}
						onClick={() => setShowDiff((v) => !v)}
					>
						{showDiff ? "hide diff" : "diff"}
					</button>
				)}
				{editing ? (
					<>
						<button
							type="button"
							className={styles.smallBtn}
							onClick={cancelEdit}
							disabled={saving}
						>
							cancel
						</button>
						<button
							type="button"
							className={styles.smallBtnPrimary}
							onClick={commitEdit}
							disabled={saving}
						>
							{saving ? "…" : "save"}
						</button>
					</>
				) : (
					editable && (
						<button
							type="button"
							className={styles.smallBtn}
							onClick={enterEdit}
							disabled={!editEnabled}
						>
							edit
						</button>
					)
				)}
				{!editing && editable && hasOverride && onReturnToDefault && (
					<button type="button" className={styles.smallBtn} onClick={onReturnToDefault}>
						return to default
					</button>
				)}
			</div>
			{editing ? (
				<textarea
					className={styles.editor}
					value={draft}
					onChange={(e) => updateDraft(e.target.value)}
					aria-label={`Edit ${title}`}
				/>
			) : (
				<pre className={styles.view}>{currentText}</pre>
			)}
			{showDiff && defaultText !== undefined && (
				<div className={styles.diff}>
					<div className={styles.diffSide}>
						<div className={styles.diffLabel}>default</div>
						<pre className={styles.diffPre}>{defaultText}</pre>
					</div>
					<div className={styles.diffSide}>
						<div className={styles.diffLabel}>current</div>
						<pre className={styles.diffPre}>{currentText}</pre>
					</div>
				</div>
			)}
		</div>
	);
}
