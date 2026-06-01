/**
 * CourseCreateRoute — material / source-picker step of the course-create entry flow.
 *
 * Located at `/course-create`. The library "Create a course" CTA navigates
 * here instead of opening a session directly, so the student can attach
 * source material and add optional context before the course-create session
 * opens.
 *
 * Per the locked Option 4 mock
 * (`.mockups/screens/epic-course-create-readiness-unified-landing-source-picker/option-4.html`):
 *   - 4-tab source picker: Pack (landing) / Upload (tagged "create your own") / Paste / Library
 *   - Below the active tab, italic "Or —" bar names the other tabs as switch links
 *   - Attached sources list with per-source status (indexing / ready)
 *   - Optional context textarea (audience / goal / notes)
 *   - "Start Praxis →" CTA
 *
 * URL contract: `?pack=<packId>` pre-selects the Pack tab and pre-attaches that
 * pack as source on mount. Validated via TanStack Router `validateSearch`.
 *
 * Stepper: Material · Create · Confirm · Open (step 2 renamed from "Explore").
 *
 * Story fix-create-to-design-docs-missing: after starting the session, all
 * document-backed attached sources are attached to the session scope so
 * `useDerivedScope` → `listForScope({ kind: "session", id })` surfaces them
 * in the documents panel.
 */
import type { DocumentId, PackSummaryClient, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { SourceTab } from "../components/source-picker.js";
import { SourcePicker } from "../components/source-picker.js";
import { usePraxisClient } from "../context/client-context.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { usePacks } from "../hooks/use-packs.js";
import { useTabs } from "../hooks/use-tabs.js";
import { storeInitialMessage } from "../lib/open-session-in-tab.js";
import styles from "./course-create.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttachedSourceKind = "file" | "pack" | "paste" | "library";

interface AttachedSource {
  /** Unique key for React rendering. */
  key: string;
  kind: AttachedSourceKind;
  label: string;
  status: "indexing" | "ready" | "error";
  documentId?: string;
}

export function formatLocalDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Route component ──────────────────────────────────────────────────────────

export function CourseCreateRoute() {
  const navigate = useNavigate();
  const client = usePraxisClient();
  const { openTab } = useTabs();
  const [context, setContext] = useState("");
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);
  const [starting, setStarting] = useState(false);
  const [pasteSubmitting, setPasteSubmitting] = useState(false);

  // ── Search params (typed via validateSearch in router.tsx) ──────────────────
  const { pack: packParam } = (
    useSearch as unknown as (opts: { strict: false }) => { pack?: string }
  )({ strict: false });

  // Active tab: default to "pack", or "pack" if packParam is set.
  const [activeTab, setActiveTab] = useState<SourceTab>("pack");

  const { packs, loading: packsLoading, error: packsError } = usePacks();

  // ── Ingestion hook (for file upload + paste) ─────────────────────────────────

  const ingestion = useIngestion(
    useCallback(() => {
      // file finished — state update handled in the effect below
    }, []),
  );

  // Sync ingestion state into attachedSources.
  const ingestionState = ingestion.state;
  useEffect(() => {
    if (ingestionState.status === "ingesting") {
      setAttachedSources((prev) => {
        const existing = prev.find((s) => s.label === ingestionState.filename);
        if (existing) return prev;
        return [
          ...prev,
          {
            key: ingestionState.filename,
            kind: "file",
            label: ingestionState.filename,
            status: "indexing",
          },
        ];
      });
    } else if (ingestionState.status === "done") {
      setAttachedSources((prev) =>
        prev.map((s) => {
          if (s.status === "indexing") {
            return { ...s, status: "ready" as const, documentId: ingestionState.documentId };
          }
          return s;
        }),
      );
    } else if (ingestionState.status === "batch_summary") {
      setAttachedSources((prev) => {
        const byLabel = new Map(prev.map((s) => [s.label, s]));
        for (const result of ingestionState.results) {
          const existing = byLabel.get(result.filename);
          byLabel.set(result.filename, {
            key: result.filename,
            kind: existing?.kind ?? ("file" as const),
            label: result.filename,
            status: result.outcome.ok ? ("ready" as const) : ("error" as const),
            ...(result.outcome.ok && { documentId: result.outcome.documentId }),
          });
        }
        return Array.from(byLabel.values());
      });
    } else if (ingestionState.status === "error") {
      setAttachedSources((prev) =>
        prev.map((s) => (s.status === "indexing" ? { ...s, status: "error" as const } : s)),
      );
    }
  }, [ingestionState]);

  // ── Pre-select pack from URL param ───────────────────────────────────────────

  useEffect(() => {
    if (!packParam) return;
    // Find the matching pack from the list.
    const targetPack = packs.find((p) => p.id === packParam);
    if (!targetPack) return;
    // Pre-attach the pack as a source (status ready — packs don't need ingestion).
    setAttachedSources((prev) => {
      const alreadyAttached = prev.find((s) => s.kind === "pack" && s.key === targetPack.id);
      if (alreadyAttached) return prev;
      return [
        ...prev,
        {
          key: targetPack.id,
          kind: "pack",
          label: targetPack.name,
          status: "ready",
        },
      ];
    });
  }, [packParam, packs]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBrowse = useCallback(async () => {
    await ingestion.startPickBatch("files");
  }, [ingestion]);

  const handlePackSelect = useCallback((pack: PackSummaryClient) => {
    setAttachedSources((prev) => {
      const alreadyAttached = prev.find((s) => s.kind === "pack" && s.key === pack.id);
      if (alreadyAttached) return prev;
      return [
        ...prev,
        {
          key: pack.id,
          kind: "pack",
          label: pack.name,
          status: "ready" as const,
        },
      ];
    });
  }, []);

  const handlePasteSubmit = useCallback(
    async (text: string) => {
      setPasteSubmitting(true);
      try {
        const now = formatLocalDateForFilename(new Date());
        const filename = `Pasted notes (${now}).txt`;

        // Write text to a temp file on the main process, then ingest from that path.
        const tmpPath = await client.ingest.writeTempText(text, filename);

        // Add optimistic "indexing" entry immediately.
        const key = `paste-${Date.now()}`;
        setAttachedSources((prev) => [
          ...prev,
          { key, kind: "paste", label: filename, status: "indexing" },
        ]);

        // Run ingestion via the batch path so the ingestionState sync picks it up.
        await ingestion.startBatchWithPaths([tmpPath]);
      } finally {
        setPasteSubmitting(false);
      }
    },
    [client, ingestion],
  );

  const handleRemove = useCallback((key: string) => {
    setAttachedSources((prev) => prev.filter((s) => s.key !== key));
  }, []);

  // ── Library document selection (story-create-course-select-existing-docs) ────

  /**
   * Called when the user selects a document from the library pane in the
   * source picker. Adds it to `attachedSources` as a ready library source.
   * The documentId will be attached to the session scope in handleStart.
   */
  const handleLibrarySelect = useCallback((documentId: string, filename: string) => {
    setAttachedSources((prev) => {
      const alreadyAttached = prev.find((s) => s.kind === "library" && s.key === documentId);
      if (alreadyAttached) return prev;
      return [
        ...prev,
        {
          key: documentId,
          kind: "library",
          label: filename,
          status: "ready" as const,
          documentId,
        },
      ];
    });
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const trimmedContext = context.trim();

      // Start the session, capture the sessionId, then attach all document-backed
      // sources to the session scope before opening the tab. This is the fix for
      // story-fix-create-to-design-docs-missing: without these attach calls,
      // listForScope({ kind: "session", id }) returns empty and the documents panel
      // shows nothing in the design session.
      const handle = await client.session.start({ modeId: "course-create" });
      const newSessionId = handle.sessionId as SessionId;

      // Collect document IDs from all ready attached sources.
      const documentIds = attachedSources
        .filter(
          (s): s is AttachedSource & { documentId: string } =>
            s.status === "ready" && s.documentId !== undefined,
        )
        .map((s) => brandId<"DocumentId">(s.documentId) as DocumentId);

      if (documentIds.length > 0) {
        // Non-blocking: attach each doc to the new session scope. Fire sequentially
        // (not Promise.all) so we don't overload the IPC channel; errors are
        // swallowed per session-scoped attachment contract — the course-create
        // session is already started and must open regardless.
        for (const documentId of documentIds) {
          try {
            await client.documentScopes.attach({
              scope: { kind: "session", id: newSessionId },
              documentId,
              source: "course-create",
            });
          } catch {
            // Non-fatal: user will still reach the design session; docs can be
            // re-attached manually via the library picker.
          }
        }
      }

      // Store initial message (context textarea) so the tab body picks it up.
      if (trimmedContext !== "") {
        storeInitialMessage(newSessionId, trimmedContext);
      }

      const tab = await openTab({ sessionId: newSessionId });
      await navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
    } finally {
      setStarting(false);
    }
  }, [client, navigate, openTab, context, attachedSources]);

  const indexingCount = attachedSources.filter((s) => s.status === "indexing").length;

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
          A canonical pack, a textbook, a syllabus, or your lecture notes. Praxis will read it and
          draft a course shape — units, lessons, and assessment shells — for you to confirm.
        </p>
      </div>

      <div className={styles.surface}>
        {/* Stepper — step 2 is "Create" (renamed from "Explore") */}
        <div className={styles.stepper}>
          <span className={styles.stepActive}>Material</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Create</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Confirm</span>
          <span className={styles.stepSep}>·</span>
          <span className={styles.stepPending}>Open</span>
        </div>

        {/* Source picker — 4-tab: Pack / Upload / Paste / Library */}
        <SourcePicker
          activeTab={activeTab}
          onTabChange={setActiveTab}
          packs={packs}
          packsLoading={packsLoading}
          packsError={packsError}
          onPackSelect={handlePackSelect}
          onBrowse={handleBrowse}
          onPasteSubmit={handlePasteSubmit}
          pasteSubmitting={pasteSubmitting}
          onLibrarySelect={handleLibrarySelect}
          selectedLibraryDocumentIds={
            new Set(attachedSources.filter((s) => s.kind === "library").map((s) => s.key))
          }
        />

        {/* Attached sources */}
        {attachedSources.length > 0 && (
          <div className={styles.attached}>
            <h3 className={styles.attachedHeading}>
              Attached · {attachedSources.length} source
              {attachedSources.length !== 1 ? "s" : ""}
            </h3>
            {attachedSources.map((source) => (
              <div key={source.key} className={styles.fileRow}>
                <span className={styles.fileIcon}>†</span>
                <span className={styles.fileName}>{source.label}</span>
                <span
                  className={
                    source.status === "ready"
                      ? styles.statusReady
                      : source.status === "error"
                        ? styles.statusError
                        : styles.statusIndexing
                  }
                >
                  {source.status === "ready"
                    ? "ready"
                    : source.status === "error"
                      ? "error"
                      : "indexing"}
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => handleRemove(source.key)}
                  aria-label={`Remove ${source.label}`}
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
