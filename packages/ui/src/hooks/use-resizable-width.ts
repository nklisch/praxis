import { useCallback, useRef, useState } from "react";

export interface UseResizableWidthOptions {
	/**
	 * localStorage key. Convention: `praxis.panel.<panel-id>.width`.
	 * Set to `null` to disable persistence (testing / ephemeral panels).
	 */
	storageKey: string | null;
	/** Default width in pixels, used when no persisted value is found. */
	defaultWidth: number;
	/** Hard minimum — drag clamps here. Must be > 0 so the toggle stays grabbable. */
	minWidth: number;
	/** Hard maximum — drag clamps here. Should be < viewport width. */
	maxWidth: number;
	/** Which edge the handle sits on. Drag direction inverts for "left". */
	side: "left" | "right";
}

export interface UseResizableWidthResult {
	/** Current width in pixels. Apply to the panel root via inline style. */
	width: number;
	/** Spread onto a <ResizeHandle>; wires pointer-down + ARIA attrs. */
	handleProps: {
		onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
		role: "separator";
		"aria-orientation": "vertical";
		"aria-valuenow": number;
		"aria-valuemin": number;
		"aria-valuemax": number;
		"aria-label": string;
		tabIndex: 0;
		onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
	};
	/** Reset to defaultWidth and clear the persisted value. */
	reset: () => void;
}

function readPersisted(
	storageKey: string | null,
	defaultWidth: number,
	min: number,
	max: number,
): number {
	if (!storageKey || typeof window === "undefined") return defaultWidth;
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (raw === null) return defaultWidth;
		const n = Number.parseInt(raw, 10);
		if (Number.isNaN(n)) return defaultWidth;
		return Math.max(min, Math.min(max, n));
	} catch {
		return defaultWidth;
	}
}

function persist(storageKey: string | null, width: number): void {
	if (!storageKey || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(storageKey, String(Math.round(width)));
	} catch {
		// quota / privacy mode — state remains in memory; no propagation.
	}
}

/**
 * Drag-to-resize + persisted-width hook for fixed-width side panels.
 *
 * Returns `{ width, handleProps, reset }`. The hook owns pointer-event
 * lifecycle, clamps width to [minWidth, maxWidth], and persists to
 * `localStorage[storageKey]` once per drag release (not per pointermove).
 * Keyboard nav: arrow keys move by 16px, Shift+arrow by 64px, Home resets.
 *
 * Identity-stability: `handleProps` is recreated when `width` changes
 * (intentional — ARIA `valuenow` must reflect the current width).
 *
 * See feature epic-editorial-polish-pass-resizable-panels.
 */
export function useResizableWidth(opts: UseResizableWidthOptions): UseResizableWidthResult {
	const { storageKey, defaultWidth, minWidth, maxWidth, side } = opts;
	const [width, setWidth] = useState<number>(() =>
		readPersisted(storageKey, defaultWidth, minWidth, maxWidth),
	);
	const widthRef = useRef(width);
	widthRef.current = width;

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLElement>) => {
			e.preventDefault();
			const handle = e.currentTarget;
			handle.setPointerCapture(e.pointerId);
			const startX = e.clientX;
			const startWidth = widthRef.current;
			const sign = side === "right" ? 1 : -1;

			const onMove = (ev: PointerEvent) => {
				const delta = (ev.clientX - startX) * sign;
				const next = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
				setWidth(next);
				widthRef.current = next;
			};
			const onUp = () => {
				handle.removeEventListener("pointermove", onMove);
				handle.removeEventListener("pointerup", onUp);
				handle.removeEventListener("pointercancel", onUp);
				try {
					handle.releasePointerCapture(e.pointerId);
				} catch {
					// already released
				}
				persist(storageKey, widthRef.current);
			};
			handle.addEventListener("pointermove", onMove);
			handle.addEventListener("pointerup", onUp);
			handle.addEventListener("pointercancel", onUp);
		},
		[side, minWidth, maxWidth, storageKey],
	);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLElement>) => {
			let delta = 0;
			const big = e.shiftKey ? 64 : 16;
			if (e.key === "ArrowRight") delta = big;
			else if (e.key === "ArrowLeft") delta = -big;
			else if (e.key === "Home") {
				e.preventDefault();
				setWidth(defaultWidth);
				widthRef.current = defaultWidth;
				persist(storageKey, defaultWidth);
				return;
			}
			if (delta === 0) return;
			e.preventDefault();
			// For left-edge handles, ArrowLeft grows the panel.
			const sign = side === "right" ? 1 : -1;
			const next = Math.max(minWidth, Math.min(maxWidth, widthRef.current + delta * sign));
			setWidth(next);
			widthRef.current = next;
			persist(storageKey, next);
		},
		[side, minWidth, maxWidth, defaultWidth, storageKey],
	);

	const reset = useCallback(() => {
		setWidth(defaultWidth);
		widthRef.current = defaultWidth;
		if (storageKey && typeof window !== "undefined") {
			try {
				window.localStorage.removeItem(storageKey);
			} catch {
				// no-op
			}
		}
	}, [defaultWidth, storageKey]);

	return {
		width,
		handleProps: {
			onPointerDown,
			role: "separator",
			"aria-orientation": "vertical",
			"aria-valuenow": width,
			"aria-valuemin": minWidth,
			"aria-valuemax": maxWidth,
			"aria-label": side === "right" ? "Resize right edge" : "Resize left edge",
			tabIndex: 0,
			onKeyDown,
		},
		reset,
	};
}
