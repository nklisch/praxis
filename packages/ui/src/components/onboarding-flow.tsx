/**
 * OnboardingFlow — three-step first-run journey.
 *
 * Steps: welcome → engine picker → course picker.
 *
 * Visual direction: Studio Quiet tokens — italic serif titles, mono kicker
 * labels, muted brick accent for primary actions.
 * Locked mock: .mockups/flows/first-run/ (2026-05-18).
 */
import type { EngineConfigSnapshot } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type JSX, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import { ClaudeAuthModal } from "./claude-auth-modal.js";
import styles from "./onboarding-flow.module.css";

const ENGINE_OPTIONS = [
  { id: "direct.anthropic", label: "Direct — Anthropic (Claude)" },
  { id: "direct.openai", label: "Direct — OpenAI (GPT)" },
  { id: "direct.google", label: "Direct — Google (Gemini)" },
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "direct.ollama", label: "Direct — Ollama (local)" },
];

type Step = "welcome" | "engine" | "course";

const STEP_INDEX: Record<Step, number> = { welcome: 0, engine: 1, course: 2 };
const TOTAL_STEPS = 3;

export interface OnboardingFlowProps {
  /**
   * Mark first-run as complete. Called when the user finishes the flow OR
   * skips it. Should write the flag and trigger a re-render of the parent so
   * the normal layout takes over.
   */
  onComplete: () => Promise<void>;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");

  const handleSkip = async () => {
    await onComplete();
  };

  return (
    <div className={styles.shell}>
      <span className={styles.wordmark}>Praxis</span>

      <StepProgress current={STEP_INDEX[step]} total={TOTAL_STEPS} />

      {step === "welcome" && <WelcomeStep onNext={() => setStep("engine")} onSkip={handleSkip} />}

      {step === "engine" && (
        <EngineStep
          onNext={() => setStep("course")}
          onBack={() => setStep("welcome")}
          onSkip={handleSkip}
        />
      )}

      {step === "course" && (
        <CourseStep onComplete={onComplete} onBack={() => setStep("engine")} onSkip={handleSkip} />
      )}
    </div>
  );
}

// ─── Step progress ────────────────────────────────────────────────────────────

function StepProgress({ current, total }: { current: number; total: number }): JSX.Element {
  return (
    <div className={styles.progress} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: step dots are positionally stable — they never reorder
          key={`step-${i}`}
          className={`${styles.dot} ${i === current ? styles.dotActive : ""} ${i < current ? styles.dotDone : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function WelcomeStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => Promise<void>;
}): JSX.Element {
  return (
    <article className={styles.card}>
      <p className={styles.kicker}>Welcome</p>
      <h1 className={`${styles.title} ${styles.titleDisplay}`}>{COPY.onboarding.welcomeTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.welcomeBody}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.skipButton} onClick={onSkip}>
          {COPY.onboarding.skipLabel}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onNext}>
          {COPY.onboarding.continueLabel}
        </button>
      </div>
    </article>
  );
}

// ─── Engine ───────────────────────────────────────────────────────────────────

function EngineStep({
  onNext,
  onBack,
  onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => Promise<void>;
}): JSX.Element {
  const client = usePraxisClient();
  const [config, setConfig] = useState<EngineConfigSnapshot | null>(null);
  // Local apiKey edit state for the engine step. Decoupled from the
  // snapshot because the snapshot no longer carries the secret —
  // `hasApiKey` drives the placeholder/empty-state UX.
  const [apiKey, setApiKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claudeLoggedIn, setClaudeLoggedIn] = useState<boolean | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await client.config.engineConfig();
        if (cancelled) return;
        setConfig(snap);
        // First-run onboarding edits the apiKey in-place. If a key is already
        // stored (re-entering onboarding after first complete), pre-fill the
        // input by revealing the decrypted value.
        if (snap.hasApiKey) {
          try {
            const { apiKey } = await client.config.revealApiKey();
            if (!cancelled && apiKey !== null) setApiKey(apiKey);
          } catch {
            // non-fatal: reveal may fail before unlock — user can re-enter
          }
        }
      } catch {
        if (!cancelled) setConfig({ engineId: "direct.anthropic", hasApiKey: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Fetch Claude CLI login status whenever the claude-code engine is selected.
  useEffect(() => {
    if (config?.engineId !== "claude-code") {
      setClaudeLoggedIn(null);
      return;
    }
    let cancelled = false;
    client.claudeAuth
      .status()
      .then((s) => {
        if (!cancelled) setClaudeLoggedIn(s.loggedIn);
      })
      .catch(() => {
        if (!cancelled) setClaudeLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, config?.engineId]);

  const handleContinue = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await client.config.setEngineConfig({
        ...config,
        // `apiKey === ""` clears; non-empty replaces; undefined preserves.
        // The onboarding form intentionally writes whatever's in the input,
        // so the empty string is a deliberate user action (no key).
        apiKey,
      });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.error.unknown);
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <article className={styles.card}>
        <p className={styles.loading}>{COPY.loading.default}</p>
      </article>
    );
  }

  const isClaudeCode = config.engineId === "claude-code";
  const showApiKey = !isClaudeCode && config.engineId !== "direct.ollama";

  return (
    <form className={styles.card} onSubmit={handleContinue}>
      <p className={styles.kicker}>Engine — 2 of 3</p>
      <h1 className={styles.title}>{COPY.onboarding.engineTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.engineBody}</p>

      <div className={styles.field}>
        <label htmlFor="onboarding-engine-select" className={styles.fieldLabel}>
          Engine
        </label>
        <select
          id="onboarding-engine-select"
          className={styles.select}
          value={config.engineId}
          onChange={(e) => setConfig({ ...config, engineId: e.target.value })}
        >
          {ENGINE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {showApiKey && (
        <div className={styles.field}>
          <label htmlFor="onboarding-api-key-input" className={styles.fieldLabel}>
            API key
          </label>
          <input
            id="onboarding-api-key-input"
            type="password"
            className={styles.input}
            value={apiKey}
            placeholder="sk-…"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      )}

      {isClaudeCode && (
        <div className={styles.signinRow}>
          <span className={styles.signinLabel}>
            Sign in with your <span className={styles.signinLabelStrong}>Claude.ai</span>{" "}
            subscription to use the Claude Code engine.
          </span>
          {claudeLoggedIn ? (
            <span className={styles.signedInBadge}>{"✓ Signed in"}</span>
          ) : (
            <button
              type="button"
              className={styles.signinButton}
              onClick={() => setShowAuthModal(true)}
            >
              Sign in to Claude Code
            </button>
          )}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {showAuthModal && (
        <ClaudeAuthModal
          onClose={() => setShowAuthModal(false)}
          onSignedIn={() => {
            setShowAuthModal(false);
            setClaudeLoggedIn(true);
          }}
        />
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.backButton} onClick={onBack} disabled={saving}>
          {COPY.onboarding.backLabel}
        </button>
        <span className={styles.actionsSpacer} />
        <button type="button" className={styles.skipButton} onClick={onSkip} disabled={saving}>
          {COPY.onboarding.skipLabel}
        </button>
        <button type="submit" className={styles.primaryButton} disabled={saving}>
          {saving ? COPY.loading.saving : COPY.onboarding.continueLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Course ───────────────────────────────────────────────────────────────────

type CoursePath = "algebra" | "biology" | "syllabus";

/**
 * Pre-seed messages injected into the course-create session after `session.start`
 * resolves. null means no pre-seed (syllabus path — user supplies their own
 * context). Pack ids ("algebra-1", "biology") match the canonical JSON
 * manifests in packages/curriculum/packs/.
 */
const PRESEED_MESSAGES: Record<CoursePath, string | null> = {
  algebra: "Please use the canonical algebra-1 pack to create my course.",
  biology: "Please use the canonical biology pack to create my course.",
  syllabus: null,
};

function CourseStep({
  onComplete,
  onBack,
  onSkip,
}: {
  onComplete: () => Promise<void>;
  onBack: () => void;
  onSkip: () => Promise<void>;
}): JSX.Element {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<CoursePath | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (path: CoursePath) => {
    setBusy(path);
    setError(null);
    try {
      // For v1, every course path opens a fresh course-create session — the
      // course-create-mode agent handles canonical-pack import or syllabus
      // drafting based on the user's first message. The labels guide the
      // user toward the right initial prompt.
      await onComplete();

      // Inline the start → (optional pre-seed send) → tabs.open → navigate
      // sequence so we can inject a canonical-pack message for algebra and
      // biology before the user lands in the chat.
      const handle = await client.session.start({ modeId: "course-create" });

      const preSeedMessage = PRESEED_MESSAGES[path];
      if (preSeedMessage !== null) {
        // Fire-and-forget: start consuming the send stream so the message is
        // in-flight when the user arrives, but don't block navigation on it.
        // If the pre-seed fails for any transient reason, we log a warning and
        // proceed — the user can type the same message themselves.
        void (async () => {
          try {
            for await (const _event of client.session.send(handle.sessionId, preSeedMessage)) {
              // Drain events; the session service persists them server-side.
            }
          } catch (err) {
            console.warn("[onboarding] pre-seed send failed (non-blocking):", err);
          }
        })();
      }

      const tab = await client.tabs.open({ sessionId: handle.sessionId });
      await navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
    } catch {
      setError(COPY.onboarding.couldNotStart);
      setBusy(null);
    }
  };

  return (
    <article className={`${styles.card} ${styles.cardWide}`}>
      <p className={styles.kicker}>Start — 3 of 3</p>
      <h1 className={styles.title}>{COPY.onboarding.courseTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.courseBody}</p>

      <div className={styles.courseCards}>
        <CourseCard
          label={COPY.onboarding.courseAlgebraLabel}
          desc={COPY.onboarding.courseAlgebraBody}
          dotVariant="course-create"
          busy={busy === "algebra"}
          disabled={busy !== null && busy !== "algebra"}
          onStart={() => handleStart("algebra")}
        />
        <CourseCard
          label={COPY.onboarding.courseBiologyLabel}
          desc={COPY.onboarding.courseBiologyBody}
          dotVariant="course-create"
          busy={busy === "biology"}
          disabled={busy !== null && busy !== "biology"}
          onStart={() => handleStart("biology")}
        />
        <CourseCard
          label={COPY.onboarding.courseFromSyllabusLabel}
          desc={COPY.onboarding.courseFromSyllabusBody}
          dotVariant="neutral"
          busy={busy === "syllabus"}
          disabled={busy !== null && busy !== "syllabus"}
          onStart={() => handleStart("syllabus")}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          disabled={busy !== null}
        >
          {COPY.onboarding.backLabel}
        </button>
        <span className={styles.actionsSpacer} />
        <button
          type="button"
          className={styles.skipButton}
          onClick={onSkip}
          disabled={busy !== null}
        >
          {COPY.onboarding.skipLabel}
        </button>
      </div>
    </article>
  );
}

function CourseCard({
  label,
  desc,
  dotVariant,
  busy,
  disabled,
  onStart,
}: {
  label: string;
  desc: string;
  dotVariant: "course-create" | "neutral";
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}): JSX.Element {
  return (
    <button type="button" className={styles.courseCard} onClick={onStart} disabled={disabled}>
      <span className={styles.courseCardDotCol} aria-hidden="true">
        <span
          className={`${styles.courseCardDot} ${dotVariant === "neutral" ? styles.courseCardDotNeutral : ""}`}
        />
      </span>
      <span className={styles.courseCardBody}>
        <span className={styles.courseCardLabel}>{label}</span>
        <span className={styles.courseCardDesc}>{desc}</span>
        {busy && <span className={styles.courseCardCta}>{COPY.loading.starting}</span>}
      </span>
      {!busy && (
        <span className={styles.courseCardArrow} aria-hidden="true">
          ↗
        </span>
      )}
    </button>
  );
}
