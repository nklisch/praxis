/**
 * CourseCreateRoute — step 2 of the course-create entry flow.
 *
 * Located at `/course-create`. The library "Create a course" CTA navigates
 * here instead of opening a session directly, so the student can attach
 * source material and add optional context before the bootstrap session
 * opens.
 *
 * Per the locked `.mockups/flows/course-create-entry/02-upload-docs.html`:
 *   - Drop zone hero for file selection (single file or batch)
 *   - Attached files list with per-file status (indexing / ready)
 *   - Optional context textarea (audience / goal / notes)
 *   - "Start Praxis →" CTA (enabled as soon as any file is attached or
 *     can always start — students don't have to wait for indexing)
 *
 * On "Start Praxis →", opens a bootstrap session and navigates to it via
 * `openSessionInTab`.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import styles from "./course-create.module.css";

interface AttachedFile {
  path: string;
  filename: string;
  status: "indexing" | "ready" | "error";
  documentId?: string;
}

export function CourseCreateRoute() {
  const navigate = useNavigate();
  const client = usePraxisClient();
  const [context, setContext] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [starting, setStarting] = useState(false);

  const ingestion = useIngestion(
    useCallback(() => {
      // file finished — state update handled in the effect below
    }, []),
  );

  // Sync ingestion state into the attachedFiles list.
  useEffect(() => {
    const { state } = ingestion;
    if (state.status === "ingesting") {
      setAttachedFiles((prev) => {
        const existing = prev.find((f) => f.filename === state.filename);
        if (existing) return prev; // already tracking
        return [...prev, { path: "", filename: state.filename, status: "indexing" }];
      });
    } else if (state.status === "done") {
      // Mark the most recently ingesting file as ready.
      setAttachedFiles((prev) =>
        prev.map((f) => {
          if (f.status === "indexing") {
            return { ...f, status: "ready" as const, documentId: state.documentId };
          }
          return f;
        }),
      );
    } else if (state.status === "error") {
      setAttachedFiles((prev) =>
        prev.map((f) => (f.status === "indexing" ? { ...f, status: "error" as const } : f)),
      );
    }
  }, [ingestion]);

  const handleBrowse = useCallback(async () => {
    await ingestion.startPickBatch("files");
  }, [ingestion]);

  const handleRemove = useCallback((filename: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.filename !== filename));
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      await openSessionInTab({
        client,
        navigate,
        startOpts: { modeId: "bootstrap" },
      });
    } finally {
      setStarting(false);
    }
  }, [client, navigate]);

  const indexingCount = attachedFiles.filter((f) => f.status === "indexing").length;

  return (
    <div className={styles.layout}>
      <div className={styles.headBlock}>
        <div className={styles.kicker}>
          <span className={styles.kickerDot} />
          <span>¶ Create a course</span>
        </div>
        <h1 className={styles.heading}>
          Bring me <em>something to teach you</em>
        </h1>
        <p className={styles.deck}>
          A textbook, a syllabus, lecture notes, course PDFs. Drop it in; Praxis will read it and
          draft a course shape — units, lessons, and assessment shells — for you to confirm.
        </p>
      </div>

      <div className={styles.surface}>
        {/* Stepper */}
        <div className={styles.stepper}>
          <span className={styles.stepActive}>Material</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Explore</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Confirm</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Open</span>
        </div>

        {/* Drop zone */}
        <div className={styles.dropzone}>
          <div className={styles.dropzoneOrnament}>¶</div>
          <h3 className={styles.dropzoneTitle}>
            Drop your material <em>here</em>
          </h3>
          <p className={styles.dropzoneHint}>
            A whole textbook is fine. A syllabus is fine. A mix is best. The more Praxis reads, the
            better the draft.
          </p>
          <button type="button" className={styles.browseBtn} onClick={handleBrowse}>
            browse files…
          </button>
          <div className={styles.formatPills}>
            {["pdf", "epub", "docx", "pptx", "md", "html", "txt"].map((ext) => (
              <span key={ext} className={styles.formatPill}>
                {ext}
              </span>
            ))}
          </div>
        </div>

        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className={styles.attached}>
            <h3 className={styles.attachedHeading}>
              Attached · {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""}
            </h3>
            {attachedFiles.map((file) => (
              <div key={file.filename} className={styles.fileRow}>
                <span className={styles.fileIcon}>†</span>
                <span className={styles.fileName}>{file.filename}</span>
                <span
                  className={
                    file.status === "ready"
                      ? styles.statusReady
                      : file.status === "error"
                        ? styles.statusError
                        : styles.statusIndexing
                  }
                >
                  {file.status === "ready"
                    ? "ready"
                    : file.status === "error"
                      ? "error"
                      : "indexing"}
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemove(file.filename)}
                  aria-label={`Remove ${file.filename}`}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Context */}
        <div className={styles.contextRow}>
          <h3 className={styles.contextHeading}>
            Tell Praxis what you&apos;re trying to learn{" "}
            <span className={styles.contextOptional}>— optional but helpful</span>
          </h3>
          <textarea
            className={styles.contextTextarea}
            placeholder="e.g. — I'm an adult learner returning to calculus to prep for an actuarial exam. I want to actually understand derivatives this time, not memorize them."
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className={styles.actionRow}>
          {indexingCount > 0 && (
            <span className={styles.actionHint}>
              — starting Praxis doesn&apos;t require indexing to finish; it&apos;ll work with
              what&apos;s ready now.
            </span>
          )}
          <button type="button" className={styles.addMoreBtn} onClick={handleBrowse}>
            Add more material
          </button>
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "Opening…" : "Start Praxis →"}
          </button>
        </div>
      </div>
    </div>
  );
}
