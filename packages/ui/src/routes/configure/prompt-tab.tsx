import type { ComposedSegment, PromptFragment } from "@praxis/core/types";
import { listModes, requireMode } from "@praxis/curriculum/modes";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../components/loading-state.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useDirtyState } from "../../hooks/use-dirty-state.js";
import { useFragmentOverrides } from "../../hooks/use-fragment-overrides.js";
import { useResource } from "../../hooks/use-resource.js";
import styles from "./prompt-tab.module.css";

// ---------------------------------------------------------------------------
// Mode glyph mapping (mirrors the mock's typographic glyphs)
// ---------------------------------------------------------------------------

const MODE_GLYPHS: Record<string, string> = {
  teach: "§",
  quiz: "‡",
  homework: "❦",
  exam: "†",
  bootstrap: "¶",
  "study-skills": "‖",
  configure: "⁂",
  "course-create": "¶",
};

function glyphFor(modeId: string): string {
  return MODE_GLYPHS[modeId] ?? "·";
}

// ---------------------------------------------------------------------------
// Lock-status types and helpers
// ---------------------------------------------------------------------------

/**
 * Fragment state classification:
 * - "locked"   — not customizable; user cannot edit
 * - "default"  — customizable; no override active
 * - "custom"   — customizable; user override active
 */
type LockStatus = "locked" | "default" | "custom";

function lockStatusFor(fragment: PromptFragment, hasOverride: boolean): LockStatus {
  if (!fragment.customizable) return "locked";
  if (hasOverride) return "custom";
  return "default";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// ModePickerRail — left rail of mode buttons
// ---------------------------------------------------------------------------

const ALL_MODES = listModes();

interface ModePickerRailProps {
  selectedModeId: string;
  dirtyModes: ReadonlySet<string>;
  onSelect: (modeId: string) => void;
}

function ModePickerRail({
  selectedModeId,
  dirtyModes,
  onSelect,
}: ModePickerRailProps): JSX.Element {
  return (
    <nav className={styles.modeRail} aria-label="Mode picker">
      <div className={styles.modeRailLabel}>Modes</div>
      {ALL_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`${styles.modeBtn} ${mode.id === selectedModeId ? styles.modeBtnActive : ""}`}
          onClick={() => onSelect(mode.id)}
          aria-current={mode.id === selectedModeId ? "true" : undefined}
        >
          <span className={styles.modeGlyph} aria-hidden="true">
            {glyphFor(mode.id)}
          </span>
          <span className={styles.modeName}>{mode.displayName}</span>
          {dirtyModes.has(mode.id) && (
            <span className={styles.changeDot} aria-hidden="true" title="unsaved changes" />
          )}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// FragmentCard — one fragment in the document
// ---------------------------------------------------------------------------

interface FragmentCardProps {
  position: number;
  fragment: PromptFragment;
  hasOverride: boolean;
  currentText: string;
  defaultText: string;
  onSave: (text: string) => Promise<void>;
  onClear: () => Promise<void>;
  editEnabled: boolean;
}

function FragmentCard({
  position,
  fragment,
  hasOverride,
  currentText,
  defaultText,
  onSave,
  onClear,
  editEnabled,
}: FragmentCardProps): JSX.Element {
  const status = lockStatusFor(fragment, hasOverride);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentText);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep draft in sync when external state changes (e.g. after clear/save).
  useEffect(() => {
    if (!editing) setDraft(currentText);
  }, [currentText, editing]);

  const handleEditStart = useCallback(() => {
    if (!fragment.customizable || !editEnabled) return;
    setDraft(currentText);
    setEditing(true);
  }, [fragment.customizable, editEnabled, currentText]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setDraft(currentText);
    setError(null);
  }, [currentText]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const handleRevert = useCallback(async () => {
    setReverting(true);
    setError(null);
    try {
      await onClear();
      setEditing(false);
      setDraft(defaultText);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReverting(false);
    }
  }, [onClear, defaultText]);

  return (
    <article
      className={[
        styles.frag,
        status === "locked" ? styles.fragLocked : "",
        status === "custom" ? styles.fragChanged : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`fragment-card-${fragment.id}`}
    >
      <header className={styles.fragHead}>
        <span className={styles.fragPos} aria-hidden="true">
          {String(position).padStart(2, "0")}.
        </span>
        <span className={styles.fragId}>{fragment.id}</span>
        <span className={styles.fragName}>
          <em>{fragment.id.replace(/\./g, " · ")}</em>
        </span>
        <span
          className={[styles.lockPill, styles[`lock${capitalize(status)}`]].join(" ")}
          title={`Fragment status: ${status}`}
        >
          {status}
        </span>
      </header>

      <div className={styles.fragBody}>
        {editing ? (
          <div className={styles.editArea}>
            <textarea
              className={styles.editTextarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              aria-label={`Edit fragment ${fragment.id}`}
            />
            {error && (
              <p className={styles.fragError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={saving || draft === currentText}
              >
                {saving ? "saving…" : "Save"}
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </button>
              {hasOverride && (
                <button
                  type="button"
                  className={styles.revertBtn}
                  onClick={handleRevert}
                  disabled={reverting || saving}
                >
                  {reverting ? "reverting…" : "↶ revert to default"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {fragment.customizable && editEnabled ? (
              <button
                type="button"
                className={[styles.fragTextBtn, status === "custom" ? styles.fragTextOverride : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={handleEditStart}
                aria-label={`Edit fragment ${fragment.id}`}
              >
                {currentText || (
                  <span className={styles.placeholder}>Click to add custom text…</span>
                )}
              </button>
            ) : (
              <div
                className={[styles.fragText, !fragment.customizable ? styles.fragTextLocked : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {currentText || <span className={styles.placeholder}>(system fragment)</span>}
              </div>
            )}
            {status !== "locked" && hasOverride && (
              <div className={styles.fragControls}>
                <span className={styles.fragControlsSpacer} />
                <button
                  type="button"
                  className={styles.revertBtn}
                  onClick={handleRevert}
                  disabled={reverting}
                  aria-label={`Revert fragment ${fragment.id} to default`}
                >
                  {reverting ? "reverting…" : "↶ revert to default"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ComposedSummary — fragment composition order at bottom of canvas
// ---------------------------------------------------------------------------

interface ComposedSummaryProps {
  modeId: string;
  segments: readonly ComposedSegment[];
  loading: boolean;
}

function ComposedSummary({ segments, loading }: ComposedSummaryProps): JSX.Element {
  return (
    <div className={styles.composedSummary} data-testid="composed-summary">
      <div className={styles.composedSummaryLabel}>⁂ Composition order · final prompt</div>
      {loading ? (
        <span className={styles.composedLoading}>loading preview…</span>
      ) : segments.length === 0 ? (
        <span className={styles.composedEmpty}>No segments.</span>
      ) : (
        <div className={styles.composedOrder}>
          {segments.map((seg, i) => (
            // fragmentId alone can repeat if a mode has the same frag at multiple positions;
            // combining with position makes the key stable and unique.
            <span key={`${seg.fragmentId}-${seg.position}`} className={styles.composedSegmentRef}>
              <span className={styles.composedFragId}>{seg.fragmentId}</span>
              {(seg.source === "override" ||
                seg.source === "append" ||
                seg.source === "global") && (
                <em className={styles.composedSourceBadge}>{seg.source}</em>
              )}
              {i < segments.length - 1 && (
                <span className={styles.composedArrow} aria-hidden="true">
                  {" "}
                  →{" "}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FragmentDocument — the ordered fragment canvas for a mode
// ---------------------------------------------------------------------------

interface FragmentDocumentProps {
  modeId: string;
}

function FragmentDocument({ modeId }: FragmentDocumentProps): JSX.Element {
  const client = usePraxisClient();
  const overrides = useFragmentOverrides(modeId);
  const { markDirty, markClean } = useDirtyState("configure.prompts");

  // Derived: ordered fragments for the mode
  const mode = useMemo(() => requireMode(modeId), [modeId]);
  const fragments = useMemo(() => mode.promptFragments, [mode]);

  // Map of fragmentId → override text from backend
  const overrideById = overrides.byId;

  // Track whether any fragment has an override — drives dirty state
  const hasAnyOverride = useMemo(() => overrideById.size > 0, [overrideById]);

  useEffect(() => {
    if (hasAnyOverride) {
      markDirty();
    } else {
      markClean();
    }
  }, [hasAnyOverride, markDirty, markClean]);

  // Stable refresh reference to avoid effect dependency churn
  const { refresh: refreshOverrides } = overrides;

  // Load composition preview on mount and when modeId changes (useResource owns the effect)
  const composedLoader = useCallback(
    () => client.author.previewPromptWithAttribution({ modeId }),
    [client, modeId],
  );
  const {
    data: composedData,
    loading: composedLoading,
    refresh: refreshComposed,
  } = useResource(composedLoader);
  const composedSegments: readonly ComposedSegment[] = composedData?.segments ?? [];

  const handleSave = useCallback(
    async (fragmentId: string, text: string) => {
      await client.author.customizePrompt(modeId, fragmentId, text);
      await refreshOverrides();
      await refreshComposed();
    },
    [client, modeId, refreshOverrides, refreshComposed],
  );

  const handleClear = useCallback(
    async (fragmentId: string) => {
      await client.author.clearFragmentOverride({ modeId, fragmentId });
      await refreshOverrides();
      await refreshComposed();
    },
    [client, modeId, refreshOverrides, refreshComposed],
  );

  if (overrides.loading) {
    return <LoadingState />;
  }

  return (
    <div className={styles.fragmentDocument}>
      {fragments.map((fragment, index) => {
        const hasOverride = overrideById.has(fragment.id);
        const currentText = overrideById.get(fragment.id) ?? fragment.template;
        return (
          <FragmentCard
            key={fragment.id}
            position={index + 1}
            fragment={fragment}
            hasOverride={hasOverride}
            currentText={currentText}
            defaultText={fragment.template}
            onSave={(text) => handleSave(fragment.id, text)}
            onClear={() => handleClear(fragment.id)}
            editEnabled={true}
          />
        );
      })}

      <ComposedSummary modeId={modeId} segments={composedSegments} loading={composedLoading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptTab — top-level component: left rail + canvas
// ---------------------------------------------------------------------------

/**
 * Configure → Prompt tab canvas (v4 — Canvas + Side Chat layout).
 *
 * Layout:
 *   - Left rail (~200px): mode picker listing all tutor modes
 *   - Canvas: composed prompt document — ordered fragments per mode
 *     with per-fragment lock-status pill, inline editing, revert button
 *   - Composed-prompt summary at bottom of canvas (fragment composition order)
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>.
 * The surrounding configure layout provides the side-chat panel.
 */
export function PromptTab(): JSX.Element {
  const [selectedModeId, setSelectedModeId] = useState<string>(ALL_MODES[0]?.id ?? "teach");
  // Change-dots in the rail: for now only the active mode's dirty state is
  // tracked (cross-mode dirty tracking requires a separate load per mode —
  // deferred to a follow-up story).
  const [dirtyModes] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className={styles.promptCanvas}>
      {/* Left rail: mode picker */}
      <ModePickerRail
        selectedModeId={selectedModeId}
        dirtyModes={dirtyModes}
        onSelect={setSelectedModeId}
      />

      {/* Center canvas: composed fragment document */}
      <div className={styles.canvasBody}>
        <div className={styles.canvasHead}>
          <span className={styles.canvasKicker}>⁂ Configure · prompts</span>
          <h2 className={styles.canvasTitle}>
            <span className={styles.canvasTitleGlyph} aria-hidden="true">
              {glyphFor(selectedModeId)}
            </span>{" "}
            {ALL_MODES.find((m) => m.id === selectedModeId)?.displayName ?? selectedModeId}
            {" — "}
            <em>composed prompt</em>
          </h2>
        </div>

        <div className={styles.canvasScrollArea}>
          {/* Re-mount document on mode change to get fresh overrides */}
          <FragmentDocument key={selectedModeId} modeId={selectedModeId} />
        </div>
      </div>
    </div>
  );
}
