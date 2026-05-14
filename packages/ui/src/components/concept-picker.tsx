import {
	type JSX,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import styles from "./concept-picker.module.css";

export interface ConceptPickerOption {
	id: string;
	name: string;
	aliases?: ReadonlyArray<string>;
}

export interface ConceptPickerProps {
	selectedIds: ReadonlyArray<string>;
	options: ReadonlyArray<ConceptPickerOption>;
	onChange: (ids: string[]) => void;
	disabled?: boolean;
	placeholder?: string;
}

/**
 * Editorial multi-select picker for concepts.
 *
 * Stores ids only; consumer renders names via the option list. Search
 * matches against `name` and any `aliases` (case-insensitive substring).
 * Selected items render as chips above the input. Keyboard nav: ↑/↓ moves
 * highlight, Enter selects, Esc closes, Tab leaves focus without selecting.
 *
 * Deliberate ~80-line in-house implementation — the editorial system is
 * opinionated and a generic combobox library would drag in extra styling
 * surface for no value.
 */
export function ConceptPicker({
	selectedIds,
	options,
	onChange,
	disabled = false,
	placeholder = "Search concepts…",
}: ConceptPickerProps): JSX.Element {
	const inputId = useId();
	const listboxId = useId();
	const containerRef = useRef<HTMLDivElement>(null);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const filteredOptions = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter((opt) => {
			if (opt.name.toLowerCase().includes(q)) return true;
			if (opt.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
			return false;
		});
	}, [query, options]);

	// Clamp activeIndex if the filtered set shrinks.
	useEffect(() => {
		if (activeIndex >= filteredOptions.length) {
			setActiveIndex(Math.max(0, filteredOptions.length - 1));
		}
	}, [filteredOptions.length, activeIndex]);

	// Close on click outside.
	useEffect(() => {
		if (!open) return;
		const handler = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const select = useCallback(
		(id: string) => {
			if (selectedSet.has(id)) return; // de-emphasised in dropdown; ignore re-select
			onChange([...selectedIds, id]);
			setQuery("");
			setActiveIndex(0);
		},
		[selectedIds, selectedSet, onChange],
	);

	const remove = useCallback(
		(id: string) => {
			onChange(selectedIds.filter((s) => s !== id));
		},
		[selectedIds, onChange],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setOpen(true);
				setActiveIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveIndex((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				const opt = filteredOptions[activeIndex];
				if (opt && !selectedSet.has(opt.id)) select(opt.id);
				return;
			}
			if (e.key === "Escape") {
				setOpen(false);
				return;
			}
			// Tab: don't select; let focus move naturally.
		},
		[filteredOptions, activeIndex, selectedSet, select],
	);

	const selectedOptions = useMemo(
		() => selectedIds.map((id) => ({ id, opt: options.find((o) => o.id === id) })),
		[selectedIds, options],
	);

	return (
		<div className={styles.picker} ref={containerRef}>
			{selectedOptions.length > 0 && (
				<ul className={styles.chips} aria-label="Selected concepts">
					{selectedOptions.map(({ id, opt }) => (
						<li key={id} className={styles.chip}>
							<span className={styles.chipName}>{opt?.name ?? id}</span>
							<button
								type="button"
								className={styles.chipRemove}
								onClick={() => remove(id)}
								disabled={disabled}
								aria-label={`Remove ${opt?.name ?? id}`}
								title={id}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			<input
				id={inputId}
				type="text"
				className={styles.input}
				role="combobox"
				aria-controls={listboxId}
				aria-expanded={open}
				aria-activedescendant={
					open && filteredOptions[activeIndex]
						? `${listboxId}-${filteredOptions[activeIndex].id}`
						: undefined
				}
				value={query}
				placeholder={placeholder}
				disabled={disabled}
				onFocus={() => setOpen(true)}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
				}}
				onKeyDown={handleKeyDown}
			/>
			{open && filteredOptions.length > 0 && (
				<ul
					id={listboxId}
					className={styles.dropdown}
					role="listbox"
				>
					{filteredOptions.map((opt, idx) => {
						const isActive = idx === activeIndex;
						const isSelected = selectedSet.has(opt.id);
						return (
							<li
								key={opt.id}
								id={`${listboxId}-${opt.id}`}
								role="option"
								aria-selected={isActive}
								aria-disabled={isSelected}
								className={[
									styles.option,
									isActive ? styles.active : "",
									isSelected ? styles.selected : "",
								]
									.filter(Boolean)
									.join(" ")}
								onMouseEnter={() => setActiveIndex(idx)}
								onClick={() => {
									if (!isSelected) select(opt.id);
								}}
							>
								<span className={styles.optionName}>{opt.name}</span>
								<span className={styles.optionId} title={opt.id}>
									{opt.id}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
