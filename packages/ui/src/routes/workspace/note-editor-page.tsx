import type { NoteBody, NoteId } from "@praxis/core/types";
import { parseNoteBody } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { NoteEditorCornell } from "../../components/note-editor-cornell.js";
import { NoteEditorFeynman } from "../../components/note-editor-feynman.js";
import { NoteEditorFree } from "../../components/note-editor-free.js";
import { NoteEditorOutline } from "../../components/note-editor-outline.js";
import { NoteEditorSketch } from "../../components/note-editor-sketch.js";
import { usePraxisClient } from "../../context/client-context.js";
import styles from "./note-editor-page.module.css";

/**
 * /workspace/notes/:noteId — note editor page.
 *
 * Loads the note, parses the body, routes to the right format editor.
 * Save button calls client.notes.update with the current body.
 * Consistent header + footer layout regardless of format.
 *
 * Phase 15a: adds the "sketch" format case — renders <NoteEditorSketch>
 * with a full-canvas tldraw editor. Auto-saves on debounced canvas changes.
 *
 * No RouteHeader: this page has a bespoke back-button + format-badge header
 * rather than the editorial RouteHeader pattern — the note editor is a
 * focused full-screen editing surface, not a library/list route.
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
  const [spawning, setSpawning] = useState(false);

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
      // For sketch notes, parse returns { kind: "sketch", snapshot } directly.
      // Other formats parse as before.
      const parsed =
        fetched.format === "sketch"
          ? parseSketchBody(fetched.body ?? null)
          : parseNoteBody(fetched.format, fetched.body ?? null);
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

  /**
   * Spawn a new teach session pre-loaded with a specific note cue.
   * Follows the session-tab-open-flow pattern: spawn → open tab → navigate.
   *
   * `cueText` is the current editor value for that row (passed by the editor
   * component). We send it as `seedText` so the spawner can prime the session
   * with the live editor state rather than the last-saved DB snapshot — this
   * ensures unsaved edits are included in the opening context.
   */
  const handleSpawnFromCue = useCallback(
    async (cueId: string, cueText: string) => {
      if (!note || spawning) return;
      setSpawning(true);
      try {
        const handle = await client.session.spawnFromNote({
          noteId: note.id,
          cueId,
          seedText: cueText.trim() || undefined,
        });
        const tab = await client.tabs.open({ sessionId: handle.sessionId });
        await navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
      } catch {
        // Non-fatal — button returns to normal state; user can retry.
      } finally {
        setSpawning(false);
      }
    },
    [client, note, navigate, spawning],
  );

  /**
   * Phase 15a: auto-save handler for sketch notes. Called by NoteEditorSketch
   * with the latest tldraw snapshot (already debounced ~2s in the component).
   */
  const handleSketchAutoSave = useCallback(
    async (snapshot: unknown) => {
      if (!note) return;
      const sketchBody: NoteBody = { kind: "sketch", snapshot };
      setBody(sketchBody);
      try {
        const updated = await client.notes.update({ noteId: note.id, body: sketchBody });
        setNote(updated);
      } catch {
        // Auto-save failure is silent; the Save button is still available.
      }
    },
    [client, note],
  );

  /**
   * Phase 15b: sketch → concept-map conversion.
   * Calls the IPC conversion, then navigates to the new map's editor route.
   * Follows the session-tab-open-flow spirit: service call → navigate.
   */
  const handleConvertToConceptMap = useCallback(async () => {
    if (!note) return;
    // biome-ignore lint/suspicious/noExplicitAny: NoteId branded — cast safely
    const result = await client.conceptMaps.convertFromSketch({ sketchNoteId: note.id as any });
    const courseId = (note.context as { courseId?: string }).courseId;
    if (!courseId) {
      throw new Error("Sketch has no courseId in context — cannot navigate to concept map");
    }
    await navigate({
      to: "/courses/$courseId/concept-maps/$conceptMapId",
      params: { courseId, conceptMapId: result.conceptMapId },
    });
  }, [client, note, navigate]);

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

  // Sketch notes use a full-canvas layout — no footer Save button needed
  // (auto-save handles persistence). We still render the header.
  const isSketch = body.kind === "sketch";

  return (
    <div className={`${styles.layout} ${isSketch ? styles.sketchLayout : ""}`}>
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

      <div className={`${styles.editorBody} ${isSketch ? styles.sketchEditorBody : ""}`}>
        {body.kind === "cornell" && (
          <NoteEditorCornell
            body={body}
            onChange={(updated) => setBody(updated)}
            {...(!spawning && { onSpawnFromCue: handleSpawnFromCue })}
          />
        )}
        {body.kind === "feynman" && (
          <NoteEditorFeynman
            body={body}
            onChange={(updated) => setBody(updated)}
            noteId={noteId as unknown as NoteId}
            {...(!spawning && { onSpawnFromCue: handleSpawnFromCue })}
          />
        )}
        {body.kind === "outline" && (
          <NoteEditorOutline
            body={body}
            // biome-ignore lint/suspicious/noExplicitAny: OutlineBody rows-variant is a NoteBody member — structurally compatible at runtime
            onChange={(updated) => setBody(updated as any)}
          />
        )}
        {body.kind === "free" && (
          <NoteEditorFree body={body} onChange={(updated) => setBody(updated)} />
        )}
        {body.kind === "sketch" && (
          <NoteEditorSketch
            // biome-ignore lint/suspicious/noExplicitAny: NoteId branded — cast safely
            noteId={note.id as any as NoteId}
            initialSnapshot={body.snapshot}
            onSave={handleSketchAutoSave}
            // Only offer conversion when sketch has a courseId in context.
            {...((note.context as { courseId?: string }).courseId !== undefined && {
              onConvertToConceptMap: handleConvertToConceptMap,
            })}
          />
        )}
      </div>

      {!isSketch && (
        <footer className={styles.footer}>
          {saveError && <p className={styles.error}>{saveError}</p>}
          {saveSuccess && <p className={styles.success}>Saved!</p>}
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      )}
    </div>
  );
}

/**
 * Parse a sketch note body. The body JSON is { kind: "sketch", snapshot: unknown }.
 * Falls back to a fresh empty sketch if the body is missing or malformed.
 */
function parseSketchBody(bodyJson: string | null): NoteBody {
  if (!bodyJson) {
    return { kind: "sketch", snapshot: undefined };
  }
  try {
    // biome-ignore lint/suspicious/noExplicitAny: raw JSON input
    const parsed = JSON.parse(bodyJson) as any;
    return { kind: "sketch", snapshot: parsed?.snapshot ?? parsed };
  } catch {
    return { kind: "sketch", snapshot: undefined };
  }
}
