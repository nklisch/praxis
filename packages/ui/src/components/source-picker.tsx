/**
 * SourcePicker — 3-tab source selector for the /course-create landing.
 *
 * Tab 1 (default): Pack — lists canonical packs; selecting one calls onPackSelect.
 * Tab 2: Upload — existing drop-zone + browse behavior; carries a "create your own" tag.
 * Tab 3: Paste — textarea + "Save as source" button; calls onPasteSubmit with pasted text.
 *
 * Below the active surface, an italic "Or —" bar names the OTHER two options as
 * tab-switching links (Option 4 mock: below-hints pattern).
 *
 * Props surface: parent (CourseCreateRoute) owns state; this component is
 * purely presentational + event-dispatching.
 */
import type { PackSummaryClient } from "@praxis/core/types";
import { useCallback, useRef, useState } from "react";
import styles from "./source-picker.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceTab = "pack" | "upload" | "paste";

interface SourceTabMeta {
  id: SourceTab;
  glyph: string;
  label: string;
  altLabel: string;
}

const TABS: SourceTabMeta[] = [
  { id: "pack", glyph: "‡", label: "Pack", altLabel: "pick a canonical pack" },
  { id: "upload", glyph: "⤓", label: "Upload", altLabel: "upload your own files" },
  { id: "paste", glyph: "¶", label: "Paste", altLabel: "paste source text" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SourcePickerProps {
  /** Initial/controlled active tab. Defaults to "pack". */
  activeTab?: SourceTab;
  /** Called when the user switches tabs (or Or-bar link clicked). */
  onTabChange?: (tab: SourceTab) => void;
  /** Pack list for the Pack tab. */
  packs: PackSummaryClient[];
  packsLoading: boolean;
  packsError: string | null;
  /** Called when the user clicks "Use this pack" on a pack row. */
  onPackSelect: (pack: PackSummaryClient) => void;
  /** Called when the user clicks "browse files" in the Upload tab. */
  onBrowse: () => void;
  /** Called when the user submits pasted text ("Save as source"). */
  onPasteSubmit: (text: string) => void;
  /** Whether a paste-ingest is currently in flight (disables the button). */
  pasteSubmitting?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SourcePicker({
  activeTab: controlledActiveTab,
  onTabChange,
  packs,
  packsLoading,
  packsError,
  onPackSelect,
  onBrowse,
  onPasteSubmit,
  pasteSubmitting = false,
}: SourcePickerProps) {
  const [internalTab, setInternalTab] = useState<SourceTab>("pack");
  const active = controlledActiveTab ?? internalTab;

  const switchTab = useCallback(
    (tab: SourceTab) => {
      setInternalTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

  const otherTabs = TABS.filter((t) => t.id !== active);

  return (
    <div className={styles.wrapper}>
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className={styles.tabBar} role="tablist" aria-label="Source type">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => switchTab(tab.id)}
          >
            <span className={styles.tabGlyph}>{tab.glyph}</span>
            {tab.label}
            {tab.id === "upload" && <span className={styles.tabTag}>create your own</span>}
          </button>
        ))}
      </div>

      {/* ── Active surface ───────────────────────────────────────────────── */}
      <div className={styles.surface} role="tabpanel">
        {active === "pack" && (
          <PackPane
            packs={packs}
            loading={packsLoading}
            error={packsError}
            onSelect={onPackSelect}
          />
        )}
        {active === "upload" && <UploadPane onBrowse={onBrowse} />}
        {active === "paste" && <PastePane onSubmit={onPasteSubmit} submitting={pasteSubmitting} />}
      </div>

      {/* ── Or — bar ─────────────────────────────────────────────────────── */}
      <div className={styles.altBar}>
        <span className={styles.altPrefix}>Or —</span>
        {otherTabs.map((tab, i) => (
          <span key={tab.id} className={styles.altGroup}>
            {i > 0 && <span className={styles.altSep}>·</span>}
            <button type="button" className={styles.altLink} onClick={() => switchTab(tab.id)}>
              <span className={styles.altGlyph}>{tab.glyph}</span>
              {tab.altLabel} →
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Pack pane ────────────────────────────────────────────────────────────────

interface PackPaneProps {
  packs: PackSummaryClient[];
  loading: boolean;
  error: string | null;
  onSelect: (pack: PackSummaryClient) => void;
}

function PackPane({ packs, loading, error, onSelect }: PackPaneProps) {
  return (
    <div className={styles.packPane}>
      <p className={styles.packIntro}>
        A <em>pack</em> is a published concept graph + standards alignment + assessment shells.
        Praxis drafts your course on top of it; you can edit anything. <em>Start here</em> if you
        don&apos;t have your own material to bring.
      </p>

      {loading && <p className={styles.packStatus}>Loading packs…</p>}
      {error && <p className={styles.packError}>{error}</p>}

      {!loading && !error && packs.length === 0 && (
        <p className={styles.packStatus}>No packs available.</p>
      )}

      {packs.length > 0 && (
        <ul className={styles.packList}>
          {packs.map((pack) => (
            <li key={`${pack.id}@${pack.version}`} className={styles.packRow}>
              <div className={styles.packRowMain}>
                <div className={styles.packRowName}>
                  <em>{pack.name}</em>
                </div>
                <div className={styles.packRowMeta}>
                  {pack.id} · {pack.subject} · Grade {pack.gradeLevel} · v{pack.version} ·{" "}
                  {pack.conceptCount} concepts
                </div>
              </div>
              <button
                type="button"
                className={styles.packUseBtn}
                onClick={() => onSelect(pack)}
                aria-label={`Use pack ${pack.name}`}
              >
                Use this pack
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Upload pane ──────────────────────────────────────────────────────────────

function UploadPane({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className={styles.dropzone}>
      <div className={styles.dropzoneOrnament}>¶</div>
      <h3 className={styles.dropzoneTitle}>
        Drop your material <em>here</em>
      </h3>
      <p className={styles.dropzoneHint}>
        A whole textbook is fine. A syllabus is fine. A mix is best. The more Praxis reads, the
        better the draft.
      </p>
      <button type="button" className={styles.browseBtn} onClick={onBrowse}>
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
  );
}

// ─── Paste pane ───────────────────────────────────────────────────────────────

function PastePane({
  onSubmit,
  submitting,
}: {
  onSubmit: (text: string) => void;
  submitting: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const text = textareaRef.current?.value ?? "";
    if (text.trim() === "") return;
    onSubmit(text);
  }, [onSubmit]);

  return (
    <div className={styles.pastePane}>
      <textarea
        ref={textareaRef}
        className={styles.pasteTextarea}
        placeholder="Paste here — anything from a one-page syllabus to an entire chapter. Markdown, plain text, or unformatted prose all work. Praxis will parse structure as it reads — units, sections, headings, learning objectives — without you having to format anything."
        rows={10}
        disabled={submitting}
        aria-label="Paste source text"
      />
      <div className={styles.pasteFoot}>
        <span className={styles.pasteHint}>
          — pasted text is saved as a document named &quot;Pasted notes · &lt;timestamp&gt;&quot;;
          you can rename it after.
        </span>
        <button
          type="button"
          className={styles.pasteSaveBtn}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save as source"}
        </button>
      </div>
    </div>
  );
}
