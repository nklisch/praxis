import type { CourseId, SessionHandle } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { AuthoringChatPane } from "../components/authoring-chat-pane.js";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { UnlockModal } from "../components/unlock-modal.js";
import { usePraxisClient } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import { ConfigureStateContext } from "../hooks/use-configure-state.js";
import { useDirtyAggregate, useDirtyStateObserver } from "../hooks/use-dirty-state.js";
import { useLock } from "../hooks/use-lock.js";
import { COPY } from "../lib/copy.js";
import { CourseTab } from "./configure/course-tab.js";
import { GatesTab } from "./configure/gates-tab.js";
import { MemoryTab } from "./configure/memory-tab.js";
import { PromptTab } from "./configure/prompt-tab.js";
import styles from "./configure.module.css";

type ConfigureTab = "course" | "gates" | "prompt" | "memory";

const TABS: Array<{ id: ConfigureTab; label: string; dirtyKey: string }> = [
  { id: "course", label: "Course", dirtyKey: "configure.course" },
  { id: "gates", label: "Gates", dirtyKey: "configure.gates" },
  { id: "prompt", label: "Prompt", dirtyKey: "configure.prompt" },
  { id: "memory", label: "Memory", dirtyKey: "configure.memory" },
];

/**
 * A single tab button that reads its own dirty key to show a change-dot.
 * Must be rendered inside <DirtyStateProvider>.
 */
function TabButton({
  id,
  label,
  dirtyKey,
  isActive,
  onClick,
}: {
  id: string;
  label: string;
  dirtyKey: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { isDirty } = useDirtyStateObserver(dirtyKey);
  return (
    <button
      key={id}
      type="button"
      className={`${styles.tabBtn} ${isActive ? styles.tabActive : ""}`}
      onClick={onClick}
    >
      {label}
      {isDirty && <span className={styles.changeDot} aria-hidden="true" title="unsaved changes" />}
    </button>
  );
}

/**
 * Save bar rendered inside <DirtyStateProvider> so it can read useDirtyAggregate.
 * Shows nothing when nothing is dirty; shows "Unsaved" when one surface is
 * dirty; shows "N unsaved across M surfaces" when multiple surfaces are dirty.
 */
function ConfigureSaveBar() {
  const { dirtyCount, surfaceCount } = useDirtyAggregate();

  if (surfaceCount === 0) return null;

  const message =
    surfaceCount === 1 ? "Unsaved" : `${dirtyCount} unsaved across ${surfaceCount} surfaces`;

  return (
    <div className={styles.saveBar} role="status" aria-live="polite">
      <span className={styles.saveBarMessage}>{message}</span>
    </div>
  );
}

/**
 * Inspector strip below the canvas — empty placeholder for this story.
 * Per-tab canvases will populate this with selected-node fields in their
 * own implementation stories.
 */
function InspectorStrip() {
  return (
    <div className={styles.inspectorStrip} data-testid="inspector-strip" aria-hidden="true">
      {/* Populated by per-tab canvas stories */}
    </div>
  );
}

/**
 * /configure route — the configurator workspace.
 *
 * Lock gate:
 *  - If lock is set AND not unlocked this session → show locked screen with unlock prompt.
 *  - Once unlocked (or if no lock is set) → render the Canvas + Side Chat workspace.
 *
 * Layout (Option 5 — Canvas + Side Chat):
 *  - Sub-surface tab strip at top (Course / Gates / Prompt / Memory)
 *    with per-tab change-dots and "N unsaved across M surfaces" save bar.
 *  - Center canvas area: all four tab canvases mounted simultaneously;
 *    inactive tabs use display:none (tab-body-isolation pattern).
 *  - Inspector strip beneath the canvas: empty now; per-tab canvases will fill it.
 *  - Right panel (380px): <AuthoringChatPane mode="configure"> — the shared
 *    configurator chat, promoted from inside individual tab layouts.
 *
 * Session lifecycle:
 *  - When unlocked, auto-start a configure-mode session on mount.
 *  - End session on unmount.
 *  - Each navigation to /configure is a fresh session (no sharing across navigations).
 *
 * Cross-tab state:
 *  - ConfigureStateContext holds selectedCourseId so Course → Gates tab switch preserves selection.
 */
export function ConfigureRoute() {
  const client = usePraxisClient();
  const { isSet, isUnlocked, loading: lockLoading, refresh: refreshLock } = useLock();
  const [activeTab, setActiveTab] = useState<ConfigureTab>("course");
  const [selectedCourseId, setSelectedCourseId] = useState<CourseId | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const meta = getRouteMeta("configure");

  // Session state
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionStartedRef = useRef(false);

  const isLocked = isSet && !isUnlocked;
  const isAccessible = !lockLoading && !isLocked;

  // Start configure session when accessible (React 19 Strict Mode double-mount safe).
  // session is used only in the cleanup to call session.end; adding it to deps would
  // cause the effect to re-run on every session state update, creating duplicate sessions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: session accessed only in cleanup — intentional stale closure for end-on-unmount
  useEffect(() => {
    if (!isAccessible) return;

    let cancelled = false;
    sessionStartedRef.current = false;

    async function startSession() {
      if (sessionStartedRef.current) return;
      sessionStartedRef.current = true;
      try {
        const handle = await client.session.start({ modeId: "configure" });
        if (!cancelled) setSession(handle);
      } catch (err) {
        if (!cancelled) {
          setSessionError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    startSession();

    return () => {
      cancelled = true;
      // End session on unmount
      if (session) {
        client.session.end(session.sessionId).catch(() => {});
      }
    };
    // isAccessible is the trigger; session ref tracks single-start
  }, [isAccessible, client]);

  if (lockLoading) {
    return (
      <div className={styles.loadingScreen}>
        <p>Checking lock state…</p>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className={styles.lockedScreen}>
        <div className={styles.lockedCard}>
          <RouteHeader
            ornament={meta.ornament}
            kicker={meta.kicker}
            title={meta.title}
            deck={meta.deck}
          />
          <p className={styles.lockedDesc}>
            Enter your lock code to access course editing, prompt customization, and memory
            management.
          </p>
          <button
            type="button"
            className={styles.unlockBtn}
            onClick={() => setShowUnlockModal(true)}
          >
            Unlock
          </button>
        </div>

        {showUnlockModal && (
          <UnlockModal
            onClose={() => setShowUnlockModal(false)}
            onUnlocked={() => {
              setShowUnlockModal(false);
              refreshLock();
            }}
          />
        )}
      </div>
    );
  }

  const sessionId = session?.sessionId ?? null;

  return (
    <DirtyStateProvider>
      <ConfigureStateContext.Provider value={{ selectedCourseId, setSelectedCourseId }}>
        <div className={styles.workspace}>
          {/* ── Sub-surface tab strip ───────────────────────────────────── */}
          <div className={styles.tabBar} role="tablist" aria-label="Configure surfaces">
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                dirtyKey={tab.dirtyKey}
                isActive={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
            <div className={styles.tabBarRight}>
              <ConfigureSaveBar />
              <span className={styles.sessionStatus}>
                {sessionError
                  ? COPY.error.generic("start the configure session")
                  : session
                    ? "Configure session active"
                    : COPY.loading.starting}
              </span>
            </div>
          </div>

          {/* ── Main surface: canvas area + side chat ───────────────────── */}
          <div className={styles.surface}>
            {/* Canvas column: tab panels (all mounted, inactive display:none) + inspector strip */}
            <div className={styles.canvasColumn}>
              <div className={styles.tabPanels}>
                {/* Course tab panel */}
                <div
                  className={styles.tabPanel}
                  style={{ display: activeTab === "course" ? undefined : "none" }}
                  role="tabpanel"
                  aria-label="Course"
                  hidden={activeTab !== "course"}
                >
                  <CourseTab sessionId={sessionId} />
                </div>

                {/* Gates tab panel */}
                <div
                  className={styles.tabPanel}
                  style={{ display: activeTab === "gates" ? undefined : "none" }}
                  role="tabpanel"
                  aria-label="Gates"
                  hidden={activeTab !== "gates"}
                >
                  <GatesTab sessionId={sessionId} />
                </div>

                {/* Prompt tab panel */}
                <div
                  className={styles.tabPanel}
                  style={{ display: activeTab === "prompt" ? undefined : "none" }}
                  role="tabpanel"
                  aria-label="Prompt"
                  hidden={activeTab !== "prompt"}
                >
                  <PromptTab />
                </div>

                {/* Memory tab panel */}
                <div
                  className={styles.tabPanel}
                  style={{ display: activeTab === "memory" ? undefined : "none" }}
                  role="tabpanel"
                  aria-label="Memory"
                  hidden={activeTab !== "memory"}
                >
                  <MemoryTab />
                </div>
              </div>

              {/* Inspector strip: empty placeholder — filled by per-tab canvas stories */}
              <InspectorStrip />
            </div>

            {/* Right panel: shared configure chat (380px) */}
            <aside className={styles.chatPanel} aria-label="Configure assistant">
              <AuthoringChatPane mode="configure" sessionId={sessionId} />
            </aside>
          </div>
        </div>
      </ConfigureStateContext.Provider>
    </DirtyStateProvider>
  );
}
