import type { NoteBody, NoteId } from "@praxis/core/types";
import { parseNoteBody } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { NoteEditorCornell } from "../../components/note-editor-cornell.js";
import { NoteEditorFeynman } from "../../components/note-editor-feynman.js";
import { NoteEditorFree } from "../../components/note-editor-free.js";
import { NoteEditorOutline } from "../../components/note-editor-outline.js";
import { usePraxisClient } from "../../context/client-context.js";
import styles from "./note-editor-page.module.css";

/**
 * /workspace/notes/:noteId — note editor page.
 *
 * Loads the note, parses the body, routes to the right format editor.
 * Save button calls client.notes.update with the current body.
 * Consistent header + footer layout regardless of format.
 */
export function NoteEditorPage() {
  const client = usePraxisClient();
  const navigate = useNavigate();
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Router params — safe cast
  const { noteId } = useParams({ strict: false }) as any as { noteId: string };

  const [note, setNote] = useState<Awaited<ReturnType<typeof client.notes.get>>>(null);
  const [body, setBody] = useState<NoteBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: NoteId branded — cast safely
      const fetched = await client.notes.get(noteId as any as NoteId);
      if (!fetched) {
        setLoadError("Note not found.");
        return;
      }
      setNote(fetched);
      const parsed = parseNoteBody(fetched.format, fetched.body ?? null);
      setBody(parsed);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, noteId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!note || !body) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await client.notes.update({ noteId: note.id, body });
      setNote(updated);
      setSaveSuccess(true);
      // Clear success indicator after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Loading note…</p>
      </div>
    );
  }

  if (loadError || !note || !body) {
    return (
      <div className={styles.layout}>
        <p className={styles.error}>{loadError ?? "Failed to load note."}</p>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate({ to: "/workspace", search: { tab: "notes" } })}
        >
          Back to notes
        </button>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate({ to: "/workspace", search: { tab: "notes" } })}
        >
          ← Notes
        </button>
        <div className={styles.meta}>
          <span className={styles.formatBadge}>{note.format}</span>
          <time className={styles.updated}>
            Last edited {new Date(note.updatedAt).toLocaleDateString()}
          </time>
        </div>
      </header>

      <div className={styles.editorBody}>
        {body.kind === "cornell" && (
          <NoteEditorCornell body={body} onChange={(updated) => setBody(updated)} />
        )}
        {body.kind === "feynman" && (
          <NoteEditorFeynman body={body} onChange={(updated) => setBody(updated)} />
        )}
        {body.kind === "outline" && (
          <NoteEditorOutline body={body} onChange={(updated) => setBody(updated)} />
        )}
        {body.kind === "free" && (
          <NoteEditorFree body={body} onChange={(updated) => setBody(updated)} />
        )}
      </div>

      <footer className={styles.footer}>
        {saveError && <p className={styles.error}>{saveError}</p>}
        {saveSuccess && <p className={styles.success}>Saved!</p>}
        <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </div>
  );
}
