import type { EngineConfigSnapshot } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type JSX, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
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

export interface OnboardingFlowProps {
  /**
   * Mark first-run as complete. Called when the user finishes the flow OR
   * skips it. Should write the flag and trigger a re-render of the parent so
   * the normal layout takes over.
   */
  onComplete: () => Promise<void>;
}

/**
 * Three-step first-run flow: welcome → engine → course.
 *
 * Step transitions are local to this component. On completion (any step's
 * "Continue" or "Skip"), the parent's `onComplete` is invoked to write the
 * `firstRunCompletedAt` flag.
 */
export function OnboardingFlow({ onComplete }: OnboardingFlowProps): JSX.Element {
  const [step, setStep] = useState<Step>("welcome");

  const handleSkip = async () => {
    await onComplete();
  };

  if (step === "welcome") {
    return <WelcomeStep onNext={() => setStep("engine")} onSkip={handleSkip} />;
  }

  if (step === "engine") {
    return (
      <EngineStep
        onNext={() => setStep("course")}
        onBack={() => setStep("welcome")}
        onSkip={handleSkip}
      />
    );
  }

  return (
    <CourseStep onComplete={onComplete} onBack={() => setStep("engine")} onSkip={handleSkip} />
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
    <article className={styles.step}>
      <h1 className={styles.title}>{COPY.onboarding.welcomeTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.welcomeBody}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.ghostButton} onClick={onSkip}>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claudeLoggedIn, setClaudeLoggedIn] = useState<boolean | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client.config
      .engineConfig()
      .then((snap) => {
        if (!cancelled) setConfig(snap);
      })
      .catch(() => {
        if (!cancelled) setConfig({ engineId: "direct.anthropic" });
      });
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
      await client.config.setEngineConfig(config);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.error.unknown);
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <article className={styles.step}>
        <p className={styles.loading}>{COPY.loading.default}</p>
      </article>
    );
  }

  const showApiKey = config.engineId !== "claude-code" && config.engineId !== "direct.ollama";

  return (
    <form className={styles.step} onSubmit={handleContinue}>
      <h1 className={styles.title}>{COPY.onboarding.engineTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.engineBody}</p>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Engine</span>
        <select
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
      </label>

      {showApiKey && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>API key</span>
          <input
            type="password"
            className={styles.input}
            value={config.apiKey ?? ""}
            placeholder="sk-…"
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                setConfig({ ...config, apiKey: val });
              } else {
                const { apiKey: _k, ...rest } = config;
                setConfig(rest);
              }
            }}
          />
        </label>
      )}

      {config.engineId === "claude-code" && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Claude Code sign-in</span>
          <button
            type="button"
            className={claudeLoggedIn ? styles.signedInButton : styles.primaryButton}
            onClick={() => setShowAuthModal(true)}
          >
            {claudeLoggedIn ? "Signed in to Claude Code ✓" : "Sign in to Claude Code"}
          </button>
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
        <button type="button" className={styles.ghostButton} onClick={onBack} disabled={saving}>
          {COPY.onboarding.backLabel}
        </button>
        <button type="button" className={styles.ghostButton} onClick={onSkip} disabled={saving}>
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
      // For v1, every course path opens a fresh bootstrap session — the
      // bootstrap-mode agent handles canonical-pack import or syllabus
      // exploration based on the user's first message. The labels guide the
      // user toward the right initial prompt.
      await onComplete();
      await openSessionInTab({
        client,
        navigate,
        startOpts: { modeId: "bootstrap" },
      });
    } catch {
      setError(COPY.onboarding.couldNotStart);
      setBusy(null);
    }
  };

  return (
    <article className={styles.step}>
      <h1 className={styles.title}>{COPY.onboarding.courseTitle}</h1>
      <p className={styles.body}>{COPY.onboarding.courseBody}</p>

      <div className={styles.cards}>
        <CourseCard
          label={COPY.onboarding.courseAlgebraLabel}
          body={COPY.onboarding.courseAlgebraBody}
          busy={busy === "algebra"}
          disabled={busy !== null && busy !== "algebra"}
          onStart={() => handleStart("algebra")}
        />
        <CourseCard
          label={COPY.onboarding.courseBiologyLabel}
          body={COPY.onboarding.courseBiologyBody}
          busy={busy === "biology"}
          disabled={busy !== null && busy !== "biology"}
          onStart={() => handleStart("biology")}
        />
        <CourseCard
          label={COPY.onboarding.courseFromSyllabusLabel}
          body={COPY.onboarding.courseFromSyllabusBody}
          busy={busy === "syllabus"}
          disabled={busy !== null && busy !== "syllabus"}
          onStart={() => handleStart("syllabus")}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={onBack}
          disabled={busy !== null}
        >
          {COPY.onboarding.backLabel}
        </button>
        <button
          type="button"
          className={styles.ghostButton}
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
  body,
  busy,
  disabled,
  onStart,
}: {
  label: string;
  body: string;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}): JSX.Element {
  return (
    <button type="button" className={styles.card} onClick={onStart} disabled={disabled}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardBody}>{body}</span>
      <span className={styles.cardCta}>
        {busy ? COPY.loading.starting : COPY.onboarding.startLabel}
      </span>
    </button>
  );
}
