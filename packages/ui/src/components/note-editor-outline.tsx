import { useState } from "react";
import styles from "./note-editor-outline.module.css";

export interface OutlineNodeData {
  text: string;
  children: OutlineNodeData[];
}

export interface OutlineBody {
  kind: "outline";
  root: OutlineNodeData;
}

export interface NoteEditorOutlineProps {
  body: OutlineBody;
  onChange: (body: OutlineBody) => void;
}

/**
 * Outline note editor — recursive tree editor.
 *
 * Supports 2 levels of depth visually (root + children + grandchildren).
 * The data model supports unlimited depth; this editor renders up to 2 levels
 * in the interest of a clean UX. Deeper nesting is preserved on load but
 * not creatable through the UI (a documented v1 limitation).
 *
 * Per node: text input + "Add child" + "Add sibling" + "Delete" buttons.
 */
export function NoteEditorOutline({ body, onChange }: NoteEditorOutlineProps) {
  const [root, setRoot] = useState<OutlineNodeData>(body.root);

  const emitRoot = (updated: OutlineNodeData) => {
    setRoot(updated);
    onChange({ kind: "outline", root: updated });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.rootRow}>
        <input
          className={styles.nodeInput}
          value={root.text}
          onChange={(e) => emitRoot({ ...root, text: e.target.value })}
          placeholder="Topic / root node…"
          aria-label="Root topic"
        />
        <button
          type="button"
          className={styles.addChildBtn}
          onClick={() =>
            emitRoot({ ...root, children: [...root.children, { text: "", children: [] }] })
          }
          title="Add child"
        >
          + Child
        </button>
      </div>

      {root.children.length > 0 && (
        <ul className={styles.childList}>
          {root.children.map((child, ci) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: outline nodes indexed by position
            <li key={ci} className={styles.childItem}>
              <OutlineNodeEditor
                node={child}
                depth={1}
                onChange={(updated) => {
                  const children = root.children.map((c, idx) => (idx === ci ? updated : c));
                  emitRoot({ ...root, children });
                }}
                onDelete={() => {
                  emitRoot({ ...root, children: root.children.filter((_, idx) => idx !== ci) });
                }}
                onAddSibling={() => {
                  const children = [
                    ...root.children.slice(0, ci + 1),
                    { text: "", children: [] },
                    ...root.children.slice(ci + 1),
                  ];
                  emitRoot({ ...root, children });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {root.children.length === 0 && (
        <p className={styles.emptyHint}>Click "+ Child" above to add your first outline point.</p>
      )}
    </div>
  );
}

// ── OutlineNodeEditor (recursive, max 2 levels from root) ───────────────────

interface OutlineNodeEditorProps {
  node: OutlineNodeData;
  depth: number;
  onChange: (updated: OutlineNodeData) => void;
  onDelete: () => void;
  onAddSibling: () => void;
}

function OutlineNodeEditor({
  node,
  depth,
  onChange,
  onDelete,
  onAddSibling,
}: OutlineNodeEditorProps) {
  const maxDepth = 2; // UI limit: root (0) + child (1) + grandchild (2)

  return (
    <div className={styles.nodeBlock}>
      <div className={styles.nodeRow}>
        <input
          className={`${styles.nodeInput} ${depth === 1 ? styles.nodeDepth1 : styles.nodeDepth2}`}
          value={node.text}
          onChange={(e) => onChange({ ...node, text: e.target.value })}
          placeholder={depth === 1 ? "Main point…" : "Sub-point…"}
          aria-label={`Outline node at depth ${depth}`}
        />
        <div className={styles.nodeActions}>
          {depth < maxDepth && (
            <button
              type="button"
              className={styles.addChildBtn}
              onClick={() =>
                onChange({ ...node, children: [...node.children, { text: "", children: [] }] })
              }
              title="Add child"
            >
              + Child
            </button>
          )}
          <button
            type="button"
            className={styles.addSiblingBtn}
            onClick={onAddSibling}
            title="Add sibling"
          >
            + Sibling
          </button>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={onDelete}
            title="Delete"
            aria-label="Delete node"
          >
            ×
          </button>
        </div>
      </div>

      {node.children.length > 0 && (
        <ul className={styles.grandchildList}>
          {node.children.map((child, ci) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: outline nodes indexed by position
            <li key={ci}>
              <OutlineNodeEditor
                node={child}
                depth={depth + 1}
                onChange={(updated) => {
                  const children = node.children.map((c, idx) => (idx === ci ? updated : c));
                  onChange({ ...node, children });
                }}
                onDelete={() => {
                  onChange({ ...node, children: node.children.filter((_, idx) => idx !== ci) });
                }}
                onAddSibling={() => {
                  const children = [
                    ...node.children.slice(0, ci + 1),
                    { text: "", children: [] },
                    ...node.children.slice(ci + 1),
                  ];
                  onChange({ ...node, children });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
