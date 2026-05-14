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
 * Keyboard:
 *  - Esc closes the listbox.
 *  - When open, ArrowDown/ArrowUp move focus through the rows (focus wraps
 *    at the ends). Enter on a focused row selects it.
 *  - Home/End jump to the first / last row.
 *
 * See feature epic-course-structured-tutor-draft-resumption.
 */
export function ResumeDraftPicker({ onResume }: ResumeDraftPickerProps): React.JSX.Element | null {
  const { drafts } = useDrafts();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // On open: focus the first row so arrow keys are immediately responsive.
  // On close: reset the active index so re-opening starts from the top.
  useEffect(() => {
    if (open) {
      setActiveIndex((i) => (i >= 0 && i < drafts.length ? i : 0));
    } else {
      setActiveIndex(0);
    }
  }, [open, drafts.length]);

  // Move DOM focus to the active row when the active index changes while open.
  useEffect(() => {
    if (!open) return;
    const node = rowRefs.current[activeIndex];
    node?.focus();
  }, [open, activeIndex]);

  if (drafts.length === 0) return null;

  function moveActive(delta: number, draftCount: number) {
    setActiveIndex((i) => {
      const next = (i + delta + draftCount) % draftCount;
      return next;
    });
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1, drafts.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1, drafts.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(drafts.length - 1);
    }
    // Enter falls through to the row button's own onClick — the focused row
    // receives the synthetic click via the browser's default Enter-on-button
    // behaviour. No explicit Enter handling needed here.
  }

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
        <ul
          id={listId}
          role="listbox"
          className={styles.panel}
          onKeyDown={onListKeyDown}
          aria-activedescendant={`${listId}-row-${activeIndex}`}
          tabIndex={-1}
        >
          {drafts.map((draft, idx) => (
            <li
              key={draft.draftId}
              role="option"
              id={`${listId}-row-${idx}`}
              aria-selected={idx === activeIndex}
            >
              <button
                type="button"
                className={styles.row}
                ref={(el) => {
                  rowRefs.current[idx] = el;
                }}
                onClick={async () => {
                  setOpen(false);
                  await onResume(draft);
                }}
                tabIndex={idx === activeIndex ? 0 : -1}
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
