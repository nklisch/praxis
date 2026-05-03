import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { OrderingItem } from "@praxis/core/types";
import styles from "./ordering-body.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderingBodyProps {
  item: OrderingItem;
  /** JSON-encoded ordered array of item ids, e.g. '["a","c","b"]'. "" for default. */
  response: string;
  onChange: (response: string) => void;
  disabled?: boolean;
  feedback?: { correctOrder: string[] };
}

function parseOrder(response: string, items: Array<{ id: string }>): string[] {
  if (!response || response === "") return items.map((it) => it.id);
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // ignore
  }
  return items.map((it) => it.id);
}

// ─── Sortable item ────────────────────────────────────────────────────────────

function SortableOrderItem({
  id,
  text,
  index,
  total,
  disabled,
  onMoveUp,
  onMoveDown,
  feedback,
}: {
  id: string;
  text: string;
  index: number;
  total: number;
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  feedback?: "correct" | "incorrect" | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const cls = [
    styles.orderItem,
    isDragging ? styles.dragging : "",
    isOver ? styles.over : "",
    disabled ? styles.disabled : "",
    feedback === "correct" ? styles.correct : "",
    feedback === "incorrect" ? styles.incorrect : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={setNodeRef} style={style} className={cls} {...attributes}>
      <span className={styles.dragHandle} {...listeners} aria-hidden>
        ⠿
      </span>
      <span className={styles.itemText}>{text}</span>
      <div className={styles.moveButtons}>
        <button
          type="button"
          className={styles.moveBtn}
          onClick={onMoveUp}
          disabled={disabled || index === 0}
          aria-label={`move "${text}" up`}
        >
          ▲
        </button>
        <button
          type="button"
          className={styles.moveBtn}
          onClick={onMoveDown}
          disabled={disabled || index === total - 1}
          aria-label={`move "${text}" down`}
        >
          ▼
        </button>
      </div>
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrderingBody({
  item,
  response,
  onChange,
  disabled = false,
  feedback,
}: OrderingBodyProps) {
  const order = parseOrder(response, item.items);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const correctSet = feedback ? new Map(feedback.correctOrder.map((id, idx) => [id, idx])) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    const next = arrayMove(order, oldIndex, newIndex);
    onChange(JSON.stringify(next));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    onChange(JSON.stringify(arrayMove(order, index, index - 1)));
  };

  const moveDown = (index: number) => {
    if (index === order.length - 1) return;
    onChange(JSON.stringify(arrayMove(order, index, index + 1)));
  };

  const getItemFeedback = (id: string, idx: number): "correct" | "incorrect" | null => {
    if (!correctSet) return null;
    return correctSet.get(id) === idx ? "correct" : "incorrect";
  };

  const idToText = new Map(item.items.map((it) => [it.id, it.text]));
  const activeDragText = activeDragId ? (idToText.get(activeDragId) ?? "") : "";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol className={styles.orderList}>
          {order.map((id, index) => (
            <SortableOrderItem
              key={id}
              id={id}
              text={idToText.get(id) ?? id}
              index={index}
              total={order.length}
              disabled={disabled}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              feedback={getItemFeedback(id, index)}
            />
          ))}
        </ol>
      </SortableContext>

      <DragOverlay>
        {activeDragId ? (
          <div className={`${styles.orderItem} ${styles.dragging}`}>
            <span className={styles.dragHandle} aria-hidden>
              ⠿
            </span>
            <span className={styles.itemText}>{activeDragText}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// useState needs to be imported — using React 19 auto-import isn't available here,
// so import explicitly.
import { useState } from "react";
