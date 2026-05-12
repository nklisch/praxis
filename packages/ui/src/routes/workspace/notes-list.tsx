import type { Note, NoteBody } from "@praxis/core/types";
import { parseNoteBody } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MarkdownContent } from "../../components/markdown-content.js";
import { NoteFormatPicker } from "../../components/note-format-picker.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useNotes } from "../../hooks/use-notes.js";
import styles from "./notes-list.module.css";

type NoteFormat = "cornell" | "feynman" | "outline" | "free";

/** Empty body for each format when creating a new note. */
function emptyBody(format: NoteFormat): NoteBody {
  switch (format) {
    case "cornell":
      return { kind: "cornell", questions: [""], details: [""], summary: "" };
    case "feynman":
      return { kind: "feynman", explanation: "", followUps: [] };
    case "outline":
      return { kind: "outline", root: { text: "", children: [] } };
    case "free":
      return { kind: "free", text: "" };
  }
}

/**
 * Notes tab in the workspace — list of notes with format filter.
 * "New note" opens the format picker modal then creates and navigates.
 *
 * No RouteHeader: this is a tab panel inside <WorkspaceRoute>, not a standalone route.
 * The parent route owns the header (workspace.tsx renders <RouteHeader>).
 */
export function NotesListTab() {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const [formatFilter, setFormatFilter] = useState<NoteFormat | "all">("all");
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const { notes, loading, error, refresh } = useNotes(
    formatFilter !== "all" ? { format: formatFilter } : {},
  );

  const handleNewNote = () => {
    setShowFormatPicker(true);
    setCreateError(null);
  };

  const handleFormatSelect = async (format: NoteFormat) => {
    setShowFormatPicker(false);
    setCreating(true);
    setCreateError(null);
    try {
      const note = await client.notes.create({
        format,
        body: emptyBody(format),
        context: {},
      });
      await navigate({ to: "/workspace/notes/$noteId", params: { noteId: note.id } });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["all", "cornell", "feynman", "outline", "free"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.filterBtn} ${formatFilter === f ? styles.active : ""}`}
              onClick={() => setFormatFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className={styles.newBtn} onClick={handleNewNote} disabled={creating}>
          {creating ? "Creating…" : "+ New note"}
        </button>
      </div>

      {createError && <p className={styles.error}>{createError}</p>}

      {showFormatPicker && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerModal}>
            <NoteFormatPicker
              onSelect={handleFormatSelect}
              onCancel={() => setShowFormatPicker(false)}
            />
          </div>
        </div>
      )}

      {loading && <p className={styles.status}>Loading notes…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && notes.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>No notes yet.</p>
          <p className={styles.emptyHint}>
            Take your first note — pick a format and start writing.
          </p>
          <button type="button" className={styles.newBtn} onClick={handleNewNote}>
            + New note
          </button>
        </div>
      )}

      {notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              onOpen={() =>
                navigate({ to: "/workspace/notes/$noteId", params: { noteId: note.id } })
              }
              onDelete={async () => {
                await client.notes.delete(note.id);
                await refresh();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── NoteListItem helpers ──────────────────────────────────────────────────────

/**
 * Extract the primary text from a parsed NoteBody for markdown preview.
 * Free notes use `text` directly (already markdown).
 * Cornell uses the first detail entry (the note content column).
 * Feynman uses `explanation`.
 * Outline uses the root node text.
 * Sketch notes have no textual content.
 */
function noteBodyToMarkdown(body: NoteBody): string {
  switch (body.kind) {
    case "free":
      return body.text;
    case "cornell":
      return body.details[0] ?? body.questions[0] ?? body.summary;
    case "feynman":
      return body.explanation;
    case "outline":
      return body.root.text;
    case "sketch":
      return "";
  }
}

// ── NoteListItem ──────────────────────────────────────────────────────────────

interface NoteListItemProps {
  note: Note;
  onOpen: () => void;
  onDelete: () => Promise<void>;
}

function NoteListItem({ note, onOpen, onDelete }: NoteListItemProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this note?")) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  let previewContent = "";
  if (note.body) {
    try {
      const parsed = parseNoteBody(note.format, note.body);
      previewContent = noteBodyToMarkdown(parsed);
    } catch {
      previewContent = note.body.slice(0, 80);
    }
  }

  return (
    <li className={styles.noteItem}>
      <button type="button" className={styles.noteBtn} onClick={onOpen}>
        <div className={styles.noteHeader}>
          <span className={styles.formatBadge}>{note.format}</span>
          <time className={styles.noteDate}>{new Date(note.updatedAt).toLocaleDateString()}</time>
        </div>
        <div className={styles.notePreview}>
          {previewContent ? (
            <MarkdownContent content={previewContent} />
          ) : (
            <span className={styles.notePreviewEmpty}>(empty)</span>
          )}
        </div>
      </button>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete note"
        title="Delete"
      >
        ×
      </button>
    </li>
  );
}
