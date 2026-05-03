import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { MatchingItem } from "@praxis/core/types";
import { useLayoutEffect, useRef, useState } from "react";
import sharedStyles from "./item-body-shared.module.css";
import styles from "./matching-body.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchingPair {
  leftId: string;
  rightId: string;
}

export interface MatchingBodyProps {
  item: MatchingItem;
  /** JSON-encoded array of MatchingPair, or "" for empty. */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
  feedback?: { correctPairs: MatchingPair[] };
}

function parsePairs(response: string): MatchingPair[] {
  if (!response || response === "") return [];
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed as MatchingPair[];
  } catch {
    // ignore
  }
  return [];
}

// ─── Draggable left item ──────────────────────────────────────────────────────

function DraggableLeft({
  id,
  text,
  disabled,
  paired,
  feedback,
}: {
  id: string;
  text: string;
  disabled: boolean;
  paired: boolean;
  feedback?: "correct" | "incorrect" | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  const cls = [
    styles.leftItem,
    isDragging ? styles.dragging : "",
    disabled ? styles.disabled : "",
    feedback === "correct" ? styles.correct : "",
    feedback === "incorrect" ? styles.incorrect : "",
    paired ? styles.paired : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} className={cls} {...listeners} {...attributes}>
      {text}
    </div>
  );
}

// ─── Droppable right item ─────────────────────────────────────────────────────

function DroppableRight({
  id,
  text,
  feedback,
}: {
  id: string;
  text: string;
  feedback?: "correct" | "incorrect" | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const cls = [
    styles.rightItem,
    isOver ? styles.over : "",
    feedback === "correct" ? styles.correct : "",
    feedback === "incorrect" ? styles.incorrect : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} id={`right-${id}`} className={cls}>
      {text}
    </div>
  );
}

// ─── SVG line overlay ─────────────────────────────────────────────────────────

function ConnectionLines({
  pairs,
  containerRef,
  feedback,
}: {
  pairs: MatchingPair[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  feedback?: { correctPairs: MatchingPair[] } | undefined;
}) {
  const [lines, setLines] = useState<
    Array<{
      leftId: string;
      rightId: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      state: "normal" | "correct" | "incorrect";
    }>
  >([]);

  const correctSet = feedback
    ? new Set(feedback.correctPairs.map((p) => `${p.leftId}|${p.rightId}`))
    : null;

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    const nextLines = pairs
      .map(({ leftId, rightId }) => {
        const leftEl = container.querySelector(`[data-left-id="${leftId}"]`);
        const rightEl = container.querySelector(`#right-${rightId}`);
        if (!leftEl || !rightEl) return null;

        const lr = leftEl.getBoundingClientRect();
        const rr = rightEl.getBoundingClientRect();

        const x1 = lr.right - rect.left;
        const y1 = lr.top + lr.height / 2 - rect.top;
        const x2 = rr.left - rect.left;
        const y2 = rr.top + rr.height / 2 - rect.top;

        const pairKey = `${leftId}|${rightId}`;
        const state =
          correctSet !== null
            ? correctSet.has(pairKey)
              ? ("correct" as const)
              : ("incorrect" as const)
            : ("normal" as const);

        return { leftId, rightId, x1, y1, x2, y2, state };
      })
      .filter((l) => l !== null);

    setLines(nextLines);
  }, [pairs, containerRef, correctSet]);

  return (
    <svg className={styles.svgOverlay} aria-hidden="true" role="presentation">
      {lines.map((l) => (
        <line
          key={`${l.leftId}-${l.rightId}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          className={`${styles.connectionLine} ${l.state !== "normal" ? styles[l.state] : ""}`}
        />
      ))}
    </svg>
  );
}

// ─── Keyboard dropdown fallback ────────────────────────────────────────────────

function DropdownFallback({
  item,
  pairs,
  onChange,
  disabled,
  feedback,
}: {
  item: MatchingItem;
  pairs: MatchingPair[];
  onChange: (pairs: MatchingPair[]) => void;
  disabled: boolean;
  feedback?: { correctPairs: MatchingPair[] };
}) {
  const correctSet = feedback
    ? new Set(feedback.correctPairs.map((p) => `${p.leftId}|${p.rightId}`))
    : null;

  const getCurrentRight = (leftId: string): string => {
    return pairs.find((p) => p.leftId === leftId)?.rightId ?? "";
  };

  const handleChange = (leftId: string, rightId: string) => {
    const next = pairs.filter((p) => p.leftId !== leftId);
    if (rightId !== "") next.push({ leftId, rightId });
    onChange(next);
  };

  return (
    <fieldset className={styles.dropdownRows}>
      <legend className={styles.dropdownLegend}>match items</legend>
      {item.leftItems.map((left) => {
        const currentRight = getCurrentRight(left.id);
        const pairKey = `${left.id}|${currentRight}`;
        const rowFeedback =
          correctSet !== null && currentRight !== ""
            ? correctSet.has(pairKey)
              ? "correct"
              : "incorrect"
            : null;

        return (
          <div key={left.id} className={styles.dropdownRow}>
            <span
              className={`${styles.dropdownLeftLabel} ${rowFeedback === "correct" ? sharedStyles.correct : ""} ${rowFeedback === "incorrect" ? sharedStyles.incorrect : ""}`}
            >
              {left.text}
            </span>
            <span className={styles.dropdownArrow}>⌖</span>
            <select
              className={styles.dropdownSelect}
              value={currentRight}
              onChange={(e) => handleChange(left.id, e.target.value)}
              disabled={disabled}
              aria-label={`match for ${left.text}`}
            >
              <option value="">— select —</option>
              {item.rightItems.map((right) => (
                <option key={right.id} value={right.id}>
                  {right.text}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </fieldset>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MatchingBody({
  item,
  response,
  onChange,
  disabled = false,
  feedback,
}: MatchingBodyProps) {
  const pairs = parsePairs(response);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Detect touch/reduced-motion for default fallback
  const [useKeyboard, setUseKeyboard] = useState(() => {
    if (typeof window === "undefined") return false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    return reducedMotion || coarsePointer;
  });

  const correctSet = feedback
    ? new Set(feedback.correctPairs.map((p) => `${p.leftId}|${p.rightId}`))
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const leftId = String(event.active.id);
    if (!event.over) return;
    const rightId = String(event.over.id);
    // Remove any existing pair for this left item, then add the new one
    const next = pairs.filter((p) => p.leftId !== leftId);
    next.push({ leftId, rightId });
    onChange(JSON.stringify(next));
  };

  const getLeftFeedback = (leftId: string): "correct" | "incorrect" | null => {
    if (!correctSet) return null;
    const pair = pairs.find((p) => p.leftId === leftId);
    if (!pair) return null;
    return correctSet.has(`${pair.leftId}|${pair.rightId}`) ? "correct" : "incorrect";
  };

  const getRightFeedback = (rightId: string): "correct" | "incorrect" | null => {
    if (!correctSet) return null;
    const pair = pairs.find((p) => p.rightId === rightId);
    if (!pair) return null;
    return correctSet.has(`${pair.leftId}|${pair.rightId}`) ? "correct" : "incorrect";
  };

  const activeDragText = activeDragId
    ? (item.leftItems.find((l) => l.id === activeDragId)?.text ?? "")
    : "";

  if (useKeyboard || disabled) {
    return (
      <div className={styles.wrapper}>
        {!disabled && (
          <div className={sharedStyles.accessToggle}>
            <button
              type="button"
              className={sharedStyles.accessToggleBtn}
              onClick={() => setUseKeyboard(false)}
            >
              use drag-and-drop
            </button>
          </div>
        )}
        <DropdownFallback
          item={item}
          pairs={pairs}
          onChange={(nextPairs) => onChange(JSON.stringify(nextPairs))}
          disabled={disabled}
          feedback={feedback}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={sharedStyles.accessToggle}>
        <button
          type="button"
          className={sharedStyles.accessToggleBtn}
          onClick={() => setUseKeyboard(true)}
        >
          use keyboard
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.columnsContainer} ref={containerRef}>
          <ConnectionLines pairs={pairs} containerRef={containerRef} feedback={feedback} />

          <div className={styles.column}>
            <span className={styles.columnLabel}>· match these</span>
            {item.leftItems.map((left) => (
              <div key={left.id} data-left-id={left.id}>
                <DraggableLeft
                  id={left.id}
                  text={left.text}
                  disabled={disabled}
                  paired={pairs.some((p) => p.leftId === left.id)}
                  feedback={getLeftFeedback(left.id)}
                />
              </div>
            ))}
          </div>

          <div className={styles.column}>
            <span className={styles.columnLabel}>· with these</span>
            {item.rightItems.map((right) => (
              <DroppableRight
                key={right.id}
                id={right.id}
                text={right.text}
                feedback={getRightFeedback(right.id)}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeDragId ? (
            <div className={`${styles.leftItem} ${styles.dragging}`}>{activeDragText}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
