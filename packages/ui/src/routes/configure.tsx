import type { CourseId, SessionHandle } from "@praxis/core/types";
import { useEffect, useRef, useState } from "react";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { UnlockModal } from "../components/unlock-modal.js";
import { usePraxisClient } from "../context/client-context.js";
import { DirtyStateProvider } from "../contexts/dirty-state-provider.js";
import { ConfigureStateContext } from "../hooks/use-configure-state.js";
import { useDirtyAggregate } from "../hooks/use-dirty-state.js";
import { useLock } from "../hooks/use-lock.js";
import { COPY } from "../lib/copy.js";
import { CourseTab } from "./configure/course-tab.js";
import { GatesTab } from "./configure/gates-tab.js";
import { MemoryTab } from "./configure/memory-tab.js";
import { PromptTab } from "./configure/prompt-tab.js";
import styles from "./configure.module.css";

type ConfigureTab = "course" | "gates" | "prompt" | "memory";

const TABS: Array<{ id: ConfigureTab; label: string }> = [
  { id: "course", label: "Course" },
  { id: "gates", label: "Gates" },
  { id: "prompt", label: "Prompt" },
  { id: "memory", label: "Memory" },
];

/**
 * Save bar rendered inside <DirtyStateProvider> so it can read useDirtyAggregate.
 * Shows nothing when nothing is dirty; shows "Unsaved" when one surface is
 * dirty; shows "N unsaved across M surfaces" when multiple surfaces are dirty.
 */
function ConfigureSaveBar() {
  const { surfaceCount } = useDirtyAggregate();

  if (surfaceCount === 0) return null;

  const message =
    surfaceCount === 1 ? "Unsaved" : `${surfaceCount} unsaved across ${surfaceCount} surfaces`;

  return (
    <div className={styles.saveBar} role="status" aria-live="polite">
      <span className={styles.saveBarMessage}>{message}</span>
    </div>
  );
}

/**
 * /configure route — the configurator workspace.
 *
 * Lock gate:
 *  - If lock is set AND not unlocked this session → show locked screen with unlock prompt.
 *  - Once unlocked (or if no lock is set) → render the four-tab workspace.
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

  return (
    <DirtyStateProvider>
      <ConfigureStateContext.Provider value={{ selectedCourseId, setSelectedCourseId }}>
        <div className={styles.workspace}>
          <RouteHeader
            ornament={meta.ornament}
            kicker={meta.kicker}
            title={meta.title}
            deck={meta.deck}
          />
          <div className={styles.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
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

          <div className={styles.tabContent}>
            {activeTab === "course" && <CourseTab sessionId={session?.sessionId ?? null} />}
            {activeTab === "gates" && <GatesTab sessionId={session?.sessionId ?? null} />}
            {activeTab === "prompt" && <PromptTab />}
            {activeTab === "memory" && <MemoryTab />}
          </div>
        </div>
      </ConfigureStateContext.Provider>
    </DirtyStateProvider>
  );
}
