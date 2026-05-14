import type { PromptFragmentPosition } from "@praxis/core/types";
import { FRAGMENT_ORDER } from "@praxis/curriculum/brief";
import { listModes, requireMode } from "@praxis/curriculum/modes";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useFragmentOverrides } from "../hooks/use-fragment-overrides.js";
import { COPY } from "../lib/copy.js";
import { AttributedPreviewPane } from "./attributed-preview-pane.js";
import { LoadingState } from "./loading-state.js";
import { PromptBlock } from "./prompt-block.js";
import styles from "./prompt-block-stack.module.css";

export interface PromptBlockStackProps {
	modeId: string;
	onModeChange: (modeId: string) => void;
}

type StackView = "blocks" | "composed";

interface AssembledBlock {
	blockId: string;
	title: string;
	positionLabel: PromptFragmentPosition;
	currentText: string;
	defaultText?: string;
	hasOverride: boolean;
	customizable: boolean;
	saveAction: "fragment" | "global" | "append";
}

const ALL_MODES = listModes();

/**
 * Pure assembly fn — visible to tests without a render. Produces the
 * ordered AssembledBlock[] sorted by FRAGMENT_ORDER. Mode fragments
 * become per-fragment blocks; global and append blocks are synthetic
 * singletons at their respective positions.
 */
export function assembleBlocks(
	modeId: string,
	globalText: string | null,
	appendText: string | null,
	overridesById: Map<string, string>,
): AssembledBlock[] {
	const mode = requireMode(modeId);

	const fragmentBlocks: AssembledBlock[] = mode.promptFragments
		.filter(
			(f) => f.position !== "user-global" && f.position !== "user-append",
		)
		.map((fragment) => {
			const stored = overridesById.get(fragment.id);
			const currentText = stored ?? fragment.template;
			return {
				blockId: fragment.id,
				title: fragment.id,
				positionLabel: fragment.position,
				currentText,
				defaultText: fragment.template,
				hasOverride: stored !== undefined,
				customizable: fragment.customizable,
				saveAction: "fragment",
			} satisfies AssembledBlock;
		});

	const globalBlock: AssembledBlock = {
		blockId: "user-global",
		title: COPY.prompt.blockGlobalTitle,
		positionLabel: "user-global",
		currentText: globalText ?? "",
		hasOverride: globalText !== null && globalText !== "",
		customizable: true,
		saveAction: "global",
	};

	const appendBlock: AssembledBlock = {
		blockId: "user-append",
		title: COPY.prompt.blockAppendTitleFor(modeId),
		positionLabel: "user-append",
		currentText: appendText ?? "",
		hasOverride: appendText !== null && appendText !== "",
		customizable: true,
		saveAction: "append",
	};

	const all = [...fragmentBlocks, globalBlock, appendBlock];
	all.sort(
		(a, b) =>
			FRAGMENT_ORDER.indexOf(a.positionLabel) -
			FRAGMENT_ORDER.indexOf(b.positionLabel),
	);
	return all;
}

/**
 * Unified prompt-stack surface that replaces the four parallel preview shapes
 * (global / append / composed / full-fragment). Owns the mode picker, the
 * ordered block list, the [Blocks | Composed] toggle, and the IPC dispatch
 * for save.
 */
export function PromptBlockStack({
	modeId,
	onModeChange,
}: PromptBlockStackProps): JSX.Element {
	const client = usePraxisClient();
	const overrides = useFragmentOverrides(modeId);

	const [globalText, setGlobalText] = useState<string | null>(null);
	const [appendText, setAppendText] = useState<string | null>(null);
	const [globalLoaded, setGlobalLoaded] = useState(false);
	const [appendLoaded, setAppendLoaded] = useState(false);

	const [view, setView] = useState<StackView>("blocks");
	const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
	const [editingDraft, setEditingDraft] = useState<string | null>(null);

	// Load global once. Persists across mode changes per design.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const text = await client.author.getGlobalPrompt();
				if (!cancelled) setGlobalText(text);
			} finally {
				if (!cancelled) setGlobalLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [client]);

	// Load append per-mode. Refetches on modeId change.
	useEffect(() => {
		let cancelled = false;
		setAppendLoaded(false);
		void (async () => {
			try {
				const text = await client.author.getModeAppend(modeId);
				if (!cancelled) setAppendText(text);
			} finally {
				if (!cancelled) setAppendLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [client, modeId]);

	const blocks = useMemo(
		() => assembleBlocks(modeId, globalText, appendText, overrides.byId),
		[modeId, globalText, appendText, overrides.byId],
	);

	const dispatchSave = useCallback(
		async (block: AssembledBlock, text: string): Promise<void> => {
			switch (block.saveAction) {
				case "fragment": {
					await client.author.customizePrompt(modeId, block.blockId, text);
					await overrides.refresh();
					return;
				}
				case "global": {
					const next = text.trim() === "" ? null : text;
					await client.author.setGlobalPrompt(next);
					setGlobalText(next);
					return;
				}
				case "append": {
					const next = text.trim() === "" ? null : text;
					await client.author.setModeAppend({ modeId, text: next });
					setAppendText(next);
					return;
				}
			}
		},
		[client, modeId, overrides],
	);

	const handleEditingChange = useCallback(
		(blockId: string, editing: boolean) => {
			if (editing) {
				setEditingBlockId(blockId);
				setEditingDraft(null);
			} else if (editingBlockId === blockId) {
				setEditingBlockId(null);
				setEditingDraft(null);
			}
		},
		[editingBlockId],
	);

	const handleDraftChange = useCallback(
		(blockId: string, draft: string | null) => {
			if (editingBlockId === blockId) setEditingDraft(draft);
		},
		[editingBlockId],
	);

	// Pipe in-flight drafts into the composed view's diff highlight props.
	const editingBlock = blocks.find((b) => b.blockId === editingBlockId);
	const draftGlobal =
		editingBlock?.saveAction === "global" ? editingDraft : undefined;
	const draftAppend =
		editingBlock?.saveAction === "append" ? editingDraft : undefined;

	const allLoaded = globalLoaded && appendLoaded && !overrides.loading;

	return (
		<div className={styles.stack}>
			<div className={styles.modePicker}>
				<label htmlFor="prompt-block-stack-mode" className={styles.modePickerLabel}>
					{COPY.prompt.modePickerLabel}
				</label>
				<select
					id="prompt-block-stack-mode"
					className={styles.modeSelect}
					value={modeId}
					onChange={(e) => onModeChange(e.target.value)}
				>
					{ALL_MODES.map((m) => (
						<option key={m.id} value={m.id}>
							{m.displayName}
						</option>
					))}
				</select>
			</div>

			<div className={styles.toggleRow} role="tablist" aria-label="Stack view">
				<button
					type="button"
					role="tab"
					aria-selected={view === "blocks"}
					className={`${styles.toggleBtn} ${view === "blocks" ? styles.toggleBtnActive : ""}`}
					onClick={() => setView("blocks")}
				>
					{COPY.prompt.stackToggleBlocks}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={view === "composed"}
					className={`${styles.toggleBtn} ${view === "composed" ? styles.toggleBtnActive : ""}`}
					onClick={() => setView("composed")}
				>
					{COPY.prompt.stackToggleComposed}
				</button>
			</div>

			{!allLoaded ? (
				<LoadingState />
			) : view === "blocks" ? (
				<div className={styles.blockList}>
					{blocks.map((block) => (
						<PromptBlock
							key={block.blockId}
							blockId={block.blockId}
							title={block.title}
							positionLabel={block.positionLabel}
							currentText={block.currentText}
							{...(block.defaultText !== undefined && {
								defaultText: block.defaultText,
							})}
							hasOverride={block.hasOverride}
							customizable={block.customizable}
							locked={false}
							editEnabled={editingBlockId === null || editingBlockId === block.blockId}
							onSave={(text) => dispatchSave(block, text)}
							onEditingChange={(editing) => handleEditingChange(block.blockId, editing)}
							onDraftChange={(draft) => handleDraftChange(block.blockId, draft)}
						/>
					))}
				</div>
			) : (
				<AttributedPreviewPane
					modeId={modeId}
					view="composed"
					{...(draftGlobal !== undefined && { draftGlobal })}
					{...(draftAppend !== undefined && { draftAppend })}
				/>
			)}
		</div>
	);
}
