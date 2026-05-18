import { useCallback, useRef, useState } from "react";
import styles from "./note-editor-outline.module.css";

// ── Data model ───────────────────────────────────────────────────────────────

/**
 * A single flat bullet row.
 * Structurally identical to `OutlineRow` from `@praxis/core/types` —
 * TypeScript's structural typing keeps them compatible.
 */
export interface OutlineRow {
  id: string;
  text: string;
  /** 1 = top-level heroic; 4 = muted-italic aside. */
  level: 1 | 2 | 3 | 4;
  /** When true the row IS a checkbox (toggled by ⌘.). */
  isCheckbox?: boolean;
  /** Checkbox is checked. */
  checked?: boolean;
}

/**
 * Flat-list body for the outline editor.
 * Structurally compatible with `{ kind: "outline"; rows: OutlineRow[] }` in
 * `NoteBody` from `@praxis/core/types`.
 */
export interface OutlineBody {
  kind: "outline";
  rows: OutlineRow[];
}

/**
 * @deprecated Legacy tree node; used only for the migration path.
 * Kept for backward-compat so callers that import OutlineNodeData still compile.
 */
export interface OutlineNodeData {
  text: string;
  children: OutlineNodeData[];
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _counter = 0;
function newId(): string {
  return `ol-${Date.now()}-${++_counter}`;
}

// ── Migration helper: old tree → flat rows ───────────────────────────────────

function treeToRows(node: OutlineNodeData, level: 1 | 2 | 3 | 4 = 1): OutlineRow[] {
  const clampedLevel = Math.min(level, 4) as 1 | 2 | 3 | 4;
  const row: OutlineRow = { id: newId(), text: node.text, level: clampedLevel };
  const childLevel = Math.min(level + 1, 4) as 1 | 2 | 3 | 4;
  const childRows = node.children.flatMap((c) => treeToRows(c, childLevel));
  return [row, ...childRows];
}

/** Any shape the outline body might arrive in from the DB or editor. */
type AnyOutlineBody = { kind: "outline"; rows?: OutlineRow[]; root?: OutlineNodeData };

/** Normalise any stored body into the current flat format. */
function normaliseBody(raw: AnyOutlineBody): OutlineBody {
  if (raw.rows !== undefined && raw.rows.length > 0) return { kind: "outline", rows: raw.rows };
  if (raw.root !== undefined) return { kind: "outline", rows: treeToRows(raw.root, 1) };
  return { kind: "outline", rows: [] };
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface NoteEditorOutlineProps {
  body: AnyOutlineBody;
  onChange: (body: OutlineBody) => void;
}

const BULLET_CHARS: Record<1 | 2 | 3 | 4, string> = {
  1: "·",
  2: "·",
  3: "◦",
  4: "▹",
};

/**
 * Outline note editor — keyboard-first flat-list with 4 indentation levels.
 *
 * Keyboard shortcuts:
 *   Tab          → indent (level + 1, max 4)
 *   Shift+Tab    → outdent (level − 1, min 1)
 *   Enter        → new sibling bullet at the same level (below current row)
 *   ⌘/Ctrl+Enter → finish branch: insert new level-1 row below
 *   ⌘/Ctrl+.     → toggle bullet ↔ checkbox
 *   ⌘/Ctrl+Shift+↑ → move row up
 *   ⌘/Ctrl+Shift+↓ → move row down
 *
 * Level styling (per locked mock):
 *   level-1: bold, 17px — heroic heading
 *   level-2: regular, 16px, accent bullet
 *   level-3: secondary colour, 15px
 *   level-4: tertiary colour, 14px, italic — asides
 *
 * Drag-to-reorder via HTML5 drag-and-drop on the ⁞ handle.
 */
export function NoteEditorOutline({ body, onChange }: NoteEditorOutlineProps) {
  const [rows, setRows] = useState<OutlineRow[]>(() =>
    normaliseBody(body).rows.length > 0
      ? normaliseBody(body).rows
      : [{ id: newId(), text: "", level: 1 }],
  );

  // Refs keyed by row id for imperative focus.
  const inputRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag state
  const dragRowId = useRef<string | null>(null);
  const dragOverRowId = useRef<string | null>(null);

  const emit = useCallback(
    (updated: OutlineRow[]) => {
      setRows(updated);
      onChange({ kind: "outline", rows: updated });
    },
    [onChange],
  );

  const focusRow = useCallback((id: string, atEnd = true) => {
    // Use requestAnimationFrame so the DOM has rendered the new row.
    requestAnimationFrame(() => {
      const el = inputRefs.current.get(id);
      if (!el) return;
      el.focus();
      if (atEnd) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }, []);

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      emit(rows.map((r) => (r.id === id ? { ...r, text } : r)));
    },
    [rows, emit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, rowId: string) => {
      const idx = rows.findIndex((r) => r.id === rowId);
      if (idx === -1) return;
      const row = rows[idx];
      if (!row) return;

      const meta = e.metaKey || e.ctrlKey;

      // ── Tab: indent / outdent ──
      if (e.key === "Tab") {
        e.preventDefault();
        const newLevel = e.shiftKey
          ? (Math.max(1, row.level - 1) as 1 | 2 | 3 | 4)
          : (Math.min(4, row.level + 1) as 1 | 2 | 3 | 4);
        emit(rows.map((r) => (r.id === rowId ? { ...r, level: newLevel } : r)));
        return;
      }

      // ── ⌘. / Ctrl.: toggle checkbox ──
      if (meta && e.key === ".") {
        e.preventDefault();
        const next = rows.map((r): OutlineRow => {
          if (r.id !== rowId) return r;
          const turningOn = !r.isCheckbox;
          // exactOptionalPropertyTypes: omit `checked` entirely when turning off (not undefined).
          if (turningOn) return { ...r, isCheckbox: true, checked: false };
          const { checked: _c, ...rest } = r;
          return { ...rest, isCheckbox: false };
        });
        emit(next);
        return;
      }

      // ── ⌘/Ctrl+Shift+↑/↓: move row ──
      if (meta && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const newRows = [...rows];
        if (e.key === "ArrowUp" && idx > 0) {
          const above = newRows[idx - 1];
          const current = newRows[idx];
          if (above !== undefined && current !== undefined) {
            newRows[idx - 1] = current;
            newRows[idx] = above;
            emit(newRows as OutlineRow[]);
            focusRow(rowId);
          }
        } else if (e.key === "ArrowDown" && idx < rows.length - 1) {
          const below = newRows[idx + 1];
          const current = newRows[idx];
          if (below !== undefined && current !== undefined) {
            newRows[idx + 1] = current;
            newRows[idx] = below;
            emit(newRows as OutlineRow[]);
            focusRow(rowId);
          }
        }
        return;
      }

      // ── Enter: new sibling / ⌘+Enter: new level-1 ──
      if (e.key === "Enter") {
        e.preventDefault();
        const newLevel: 1 | 2 | 3 | 4 = meta ? 1 : row.level;
        const newRow: OutlineRow = { id: newId(), text: "", level: newLevel };
        const next = [...rows.slice(0, idx + 1), newRow, ...rows.slice(idx + 1)];
        emit(next);
        focusRow(newRow.id);
        return;
      }

      // ── Backspace on empty row: delete and move focus up ──
      if (e.key === "Backspace") {
        const el = inputRefs.current.get(rowId);
        const isEmpty = !el?.textContent;
        if (isEmpty && rows.length > 1) {
          e.preventDefault();
          const prevId = rows[idx - 1]?.id ?? rows[idx + 1]?.id;
          emit(rows.filter((r) => r.id !== rowId));
          if (prevId) focusRow(prevId);
        }
      }
    },
    [rows, emit, focusRow],
  );

  const handleCheckboxToggle = useCallback(
    (id: string) => {
      emit(rows.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
    },
    [rows, emit],
  );

  // ── Drag-and-drop reorder ─────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent<HTMLSpanElement>, rowId: string) => {
    dragRowId.current = rowId;
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLIElement>, rowId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverRowId.current = rowId;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = dragRowId.current;
      if (!sourceId || sourceId === targetId) return;

      const sourceIdx = rows.findIndex((r) => r.id === sourceId);
      const targetIdx = rows.findIndex((r) => r.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return;

      const next = [...rows];
      const [moved] = next.splice(sourceIdx, 1);
      if (!moved) return;
      next.splice(targetIdx, 0, moved);
      emit(next);
      dragRowId.current = null;
      dragOverRowId.current = null;
    },
    [rows, emit],
  );

  const handleDragEnd = useCallback(() => {
    dragRowId.current = null;
    dragOverRowId.current = null;
  }, []);

  // ── "New bullet" click at bottom ─────────────────────────────────────────

  const handleNewBulletClick = useCallback(() => {
    const lastRow = rows[rows.length - 1];
    const level: 1 | 2 | 3 | 4 = lastRow?.level ?? 1;
    const newRow: OutlineRow = { id: newId(), text: "", level };
    emit([...rows, newRow]);
    focusRow(newRow.id);
  }, [rows, emit, focusRow]);

  return (
    <div className={styles.editor}>
      {/* Keyboard hints bar */}
      <div className={styles.keyboardHints} aria-hidden="true">
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>Tab</kbd> indent
        </span>
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>⇧ Tab</kbd> outdent
        </span>
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>↵</kbd> new bullet
        </span>
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>⌘ ↵</kbd> finish branch
        </span>
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>⌘ .</kbd> to-do
        </span>
        <span className={styles.hintGroup}>
          <kbd className={styles.kbd}>⌘ ⇧ ↑↓</kbd> move
        </span>
      </div>

      {/* Outline tree */}
      <ul className={styles.outlineTree} aria-label="Outline">
        {rows.map((row) => (
          <OutlineBulletRow
            key={row.id}
            row={row}
            inputRefs={inputRefs}
            onTextChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onCheckboxToggle={handleCheckboxToggle}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* New-bullet footer — not a list item, so rendered outside the ul */}
      </ul>
      <button
        type="button"
        className={styles.newBullet}
        onClick={handleNewBulletClick}
        aria-label="Add new bullet"
      >
        <span className={styles.newBulletGlyph}>·</span>
        <span>type to add a bullet, Tab to indent</span>
      </button>
    </div>
  );
}

// ── OutlineBulletRow ──────────────────────────────────────────────────────────

interface OutlineBulletRowProps {
  row: OutlineRow;
  inputRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onTextChange: (id: string, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, rowId: string) => void;
  onCheckboxToggle: (id: string) => void;
  onDragStart: (e: React.DragEvent<HTMLSpanElement>, rowId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>, rowId: string) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>, rowId: string) => void;
  onDragEnd: (e: React.DragEvent<HTMLSpanElement>) => void;
}

const LEVEL_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "level1",
  2: "level2",
  3: "level3",
  4: "level4",
};

function OutlineBulletRow({
  row,
  inputRefs,
  onTextChange,
  onKeyDown,
  onCheckboxToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: OutlineBulletRowProps) {
  const levelClass = styles[LEVEL_CLASS[row.level]] ?? "";
  const checkboxClass = row.isCheckbox ? (row.checked ? styles.checked : styles.checkbox) : "";

  return (
    <li
      className={`${styles.bulletRow} ${levelClass} ${checkboxClass}`.trim()}
      onDragOver={(e) => onDragOver(e, row.id)}
      onDrop={(e) => onDrop(e, row.id)}
      data-row-id={row.id}
      data-level={row.level}
    >
      {/* Drag handle */}
      <span
        className={styles.handle}
        draggable
        onDragStart={(e) => onDragStart(e, row.id)}
        onDragEnd={onDragEnd}
        aria-hidden="true"
        title="Drag to reorder"
      >
        ⁞
      </span>

      {/* Bullet glyph or checkbox */}
      {row.isCheckbox ? (
        <button
          type="button"
          className={styles.checkboxBtn}
          onClick={() => onCheckboxToggle(row.id)}
          aria-label={row.checked ? "Mark incomplete" : "Mark complete"}
          title={row.checked ? "Mark incomplete" : "Mark complete"}
        >
          {row.checked ? "☑" : "☐"}
        </button>
      ) : (
        <span className={styles.bullet} aria-hidden="true">
          {BULLET_CHARS[row.level]}
        </span>
      )}

      {/* Editable text — contenteditable div is the most accessible option for inline
          structured-text editing in a list; role + aria props are set on the outer <li>.
          Biome: noStaticElementInteractions doesn't apply — contenteditable IS interactive. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: contenteditable div is interactive */}
      <div
        ref={(el) => {
          if (el) {
            inputRefs.current.set(row.id, el);
            // Set text content only on mount (element is empty) so the initial
            // value is visible without using dangerouslySetInnerHTML. After
            // mount React owns no innerHTML prop, so typing special characters
            // like &, <, >, " never triggers a DOM overwrite and the cursor is
            // never reset. textContent (not innerHTML) means no HTML
            // interpretation of the stored text.
            if (!el.textContent) el.textContent = row.text;
          } else {
            inputRefs.current.delete(row.id);
          }
        }}
        contentEditable
        suppressContentEditableWarning
        className={styles.text}
        data-placeholder={
          row.level === 1
            ? "Main point…"
            : row.level === 2
              ? "Supporting detail…"
              : row.level === 3
                ? "Sub-detail…"
                : "Aside or note…"
        }
        onInput={(e) => {
          const target = e.currentTarget;
          onTextChange(row.id, target.textContent ?? "");
        }}
        onKeyDown={(e) => onKeyDown(e, row.id)}
      />
    </li>
  );
}
