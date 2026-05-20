import type {
  AffectiveModel,
  AffectSample,
  ConceptId,
  ConceptMastery,
  EpisodicEvent,
  Misconception,
  MisconceptionId,
  ProceduralModel,
} from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmReasonModal } from "../../components/confirm-reason-modal.js";
import { EmptyState } from "../../components/empty-state.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useDirtyState } from "../../hooks/use-dirty-state.js";
import { useResource } from "../../hooks/use-resource.js";
import { COPY } from "../../lib/copy.js";
import styles from "./memory-tab.module.css";

type ProjectionTab = "semantic" | "misconceptions" | "procedural" | "affective" | "episodic";

/**
 * Memory tab — Canvas + Side Chat variant per tab-memory.html.
 *
 * Projection-tab strip switches canvas view:
 *   semantic / misconceptions / procedural / affective / episodic
 *
 * The canvas is the read-mostly student-model inspector. Controlled edits
 * (recompute mastery, clear misconception) go through the configurator side
 * chat or the inline action buttons — both call client.author methods.
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>.
 */
export function MemoryTab() {
  useDirtyState("configure.memory");

  const client = usePraxisClient();
  const [activeProjection, setActiveProjection] = useState<ProjectionTab>("semantic");

  // ── Semantic (concept mastery) ───────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<ConceptId | null>(null);

  const loadMastery = useCallback(async () => {
    const model = await client.memory.studentModel();
    return Array.from(model.conceptMastery.entries());
  }, [client]);

  const {
    data: mastery = [],
    loading: masteryLoading,
    error: masteryError,
    refresh: refreshMastery,
  } = useResource<Array<[ConceptId, ConceptMastery]>>(loadMastery);

  // ── Misconceptions ───────────────────────────────────────────────────────
  const [clearTarget, setClearTarget] = useState<MisconceptionId | null>(null);

  const loadMisconceptions = useCallback(async () => {
    return client.memory.misconceptions();
  }, [client]);

  const {
    data: misconceptions = [],
    loading: miscLoading,
    error: miscError,
    refresh: refreshMisconceptions,
  } = useResource<Misconception[]>(loadMisconceptions);

  // ── Procedural ───────────────────────────────────────────────────────────
  const loadProcedural = useCallback(async () => {
    return client.memory.procedural();
  }, [client]);

  const {
    data: procedural = null,
    loading: proceduralLoading,
    error: proceduralError,
  } = useResource<ProceduralModel | null>(loadProcedural);

  // ── Affective ─────────────────────────────────────────────────────────────
  const loadAffective = useCallback(async () => {
    return client.memory.affective();
  }, [client]);

  const {
    data: affective = null,
    loading: affectiveLoading,
    error: affectiveError,
  } = useResource<AffectiveModel | null>(loadAffective);

  // ── Episodic ──────────────────────────────────────────────────────────────
  const [episodicEvents, setEpisodicEvents] = useState<EpisodicEvent[] | null>(null);
  const [episodicLoading, setEpisodicLoading] = useState(false);
  const [episodicError, setEpisodicError] = useState<string | null>(null);
  const episodicAbortRef = useRef<AbortController | null>(null);

  const loadEpisodic = useCallback(async () => {
    episodicAbortRef.current?.abort();
    const ac = new AbortController();
    episodicAbortRef.current = ac;

    setEpisodicLoading(true);
    setEpisodicError(null);
    const collected: EpisodicEvent[] = [];
    try {
      for await (const evt of client.memory.episodic({})) {
        if (ac.signal.aborted) break;
        collected.push(evt);
        // Cap at 200 for display — the full episodic log can be large
        if (collected.length >= 200) break;
      }
      if (!ac.signal.aborted) setEpisodicEvents(collected);
    } catch (err) {
      if (!ac.signal.aborted) {
        setEpisodicError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!ac.signal.aborted) setEpisodicLoading(false);
    }
  }, [client]);

  // Episodic loads lazily when tab is activated
  useEffect(() => {
    if (activeProjection === "episodic" && episodicEvents === null && !episodicLoading) {
      loadEpisodic();
    }
  }, [activeProjection, episodicEvents, episodicLoading, loadEpisodic]);

  // Cleanup episodic stream on unmount
  useEffect(() => {
    return () => {
      episodicAbortRef.current?.abort();
    };
  }, []);

  const handleResetConcept = async (reason: string) => {
    if (!resetTarget) return;
    await client.author.resetConcept({ conceptId: resetTarget, reason });
    setResetTarget(null);
    await refreshMastery();
  };

  const handleClearMisconception = async (reason: string) => {
    if (!clearTarget) return;
    await client.author.clearMisconception({ misconceptionId: clearTarget, reason });
    setClearTarget(null);
    await refreshMisconceptions();
  };

  // Counts for projection tab badges
  const activeMiscCount = misconceptions.filter((m) => m.status === "active").length;
  const proceduralCount = procedural ? procedural.strategies.size : 0;
  const episodicCount = episodicEvents?.length ?? 0;

  return (
    <div className={styles.layout}>
      {/* Canvas head */}
      <div className={styles.canvasHead}>
        <span className={styles.kicker}>⁂ Configure · memory inspector</span>
        <h2 className={styles.canvasTitle}>
          What Praxis <em>knows about the student</em>
        </h2>
        <p className={styles.deck}>
          Read-mostly view of the four projections plus the episodic log. Controlled edits possible
          — clear a stale misconception, force-recompute a mastery score — through the configurator
          or the inline actions below.
        </p>
      </div>

      {/* Projection tab strip */}
      <div className={styles.projectionTabs}>
        <ProjectionTabBtn
          id="semantic"
          label="Semantic"
          count={`${mastery.length} concepts`}
          active={activeProjection === "semantic"}
          onClick={() => setActiveProjection("semantic")}
        />
        <ProjectionTabBtn
          id="misconceptions"
          label="Misconceptions"
          count={`${activeMiscCount} active`}
          active={activeProjection === "misconceptions"}
          onClick={() => setActiveProjection("misconceptions")}
        />
        <ProjectionTabBtn
          id="procedural"
          label="Procedural"
          count={proceduralCount > 0 ? `${proceduralCount} prefs` : ""}
          active={activeProjection === "procedural"}
          onClick={() => setActiveProjection("procedural")}
        />
        <ProjectionTabBtn
          id="affective"
          label="Affective"
          count={affective ? "last 7d" : ""}
          active={activeProjection === "affective"}
          onClick={() => setActiveProjection("affective")}
        />
        <ProjectionTabBtn
          id="episodic"
          label="Episodic"
          count={episodicCount > 0 ? `${episodicCount} turns` : ""}
          active={activeProjection === "episodic"}
          onClick={() => setActiveProjection("episodic")}
        />
      </div>

      {/* Canvas pane */}
      <div className={styles.pane}>
        {activeProjection === "semantic" && (
          <SemanticPane
            mastery={mastery}
            loading={masteryLoading}
            error={masteryError}
            onRecompute={(conceptId) => setResetTarget(conceptId)}
          />
        )}
        {activeProjection === "misconceptions" && (
          <MisconceptionsPane
            misconceptions={misconceptions}
            loading={miscLoading}
            error={miscError}
            onClear={(id) => setClearTarget(id)}
          />
        )}
        {activeProjection === "procedural" && (
          <ProceduralPane model={procedural} loading={proceduralLoading} error={proceduralError} />
        )}
        {activeProjection === "affective" && (
          <AffectivePane model={affective} loading={affectiveLoading} error={affectiveError} />
        )}
        {activeProjection === "episodic" && (
          <EpisodicPane
            events={episodicEvents ?? []}
            loading={episodicLoading}
            error={episodicError}
          />
        )}
      </div>

      {resetTarget && (
        <ConfirmReasonModal
          title="Recompute concept mastery"
          description={`Re-run the BKT update for "${resetTarget}" against the current episodic log. The score will update immediately.`}
          reasonLabel="Reason"
          reasonRequired
          confirmLabel="Recompute"
          onConfirm={handleResetConcept}
          onClose={() => setResetTarget(null)}
        />
      )}

      {clearTarget && (
        <ConfirmReasonModal
          title="Clear misconception"
          description="Mark this misconception as manually cleared. Provide a reason for the audit log."
          reasonLabel="Reason"
          reasonRequired
          confirmLabel="Clear"
          onConfirm={handleClearMisconception}
          onClose={() => setClearTarget(null)}
        />
      )}
    </div>
  );
}

// ── Projection tab button ─────────────────────────────────────────────────────

function ProjectionTabBtn({
  label,
  count,
  active,
  onClick,
}: {
  id: string;
  label: string;
  count: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.projectionTab} ${active ? styles.projectionTabActive : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {count && <span className={styles.projectionCount}>· {count}</span>}
    </button>
  );
}

// ── Semantic pane — BKT-adjusted concept mastery table ────────────────────────

function SemanticPane({
  mastery,
  loading,
  error,
  onRecompute,
}: {
  mastery: Array<[ConceptId, ConceptMastery]>;
  loading: boolean;
  error: string | null;
  onRecompute: (conceptId: ConceptId) => void;
}) {
  if (loading) return <p className={styles.statusText}>Loading mastery data…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;

  return (
    <>
      <h3 className={styles.paneHeading}>Semantic — concept mastery (BKT-adjusted)</h3>
      {mastery.length === 0 ? (
        <EmptyState message={COPY.empty.memorySemanticEmpty} compact />
      ) : (
        <div className={styles.conceptsTable}>
          <div className={`${styles.conceptsRow} ${styles.conceptsHead}`}>
            <span>Concept</span>
            <span>Mastery</span>
            <span>Last practiced</span>
            <span />
          </div>
          {mastery.map(([conceptId, cm]) => {
            const pct = Math.round(cm.pKnown * 100);
            const tier = pct >= 70 ? "high" : pct >= 45 ? "mid" : "low";
            return (
              <div key={conceptId} className={styles.conceptsRow}>
                <span className={styles.conceptName}>{conceptId}</span>
                <span className={styles.masteryBarWrap}>
                  <span className={styles.masteryBarTrack}>
                    <span
                      className={`${styles.masteryBarFill} ${styles[`masteryFill_${tier}`]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className={styles.masteryVal}>{cm.pKnown.toFixed(2)}</span>
                </span>
                <span className={styles.lastPracticed}>
                  {cm.lastPracticedAt ? new Date(cm.lastPracticedAt).toLocaleDateString() : "Never"}
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.inlineLink}
                    onClick={() => onRecompute(conceptId)}
                    title="Re-run BKT update against current episodic log"
                  >
                    recompute
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Misconceptions pane — cards with evidence + actions ──────────────────────

function MisconceptionsPane({
  misconceptions,
  loading,
  error,
  onClear,
}: {
  misconceptions: Misconception[];
  loading: boolean;
  error: string | null;
  onClear: (id: MisconceptionId) => void;
}) {
  if (loading) return <p className={styles.statusText}>Loading misconceptions…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;

  const active = misconceptions.filter((m) => m.status === "active");
  const cleared = misconceptions.filter((m) => m.status !== "active");

  return (
    <>
      <h3 className={styles.paneHeading}>
        Active misconceptions{" "}
        <span className={styles.paneSubheading}>
          · {active.length} currently held · {cleared.length} cleared
        </span>
      </h3>
      {misconceptions.length === 0 ? (
        <EmptyState message={COPY.empty.memoryMisconceptionsEmpty} compact />
      ) : (
        <div className={styles.miscCards}>
          {[...active, ...cleared].map((m) => (
            <MisconceptionCard key={m.id} misconception={m} onClear={onClear} />
          ))}
        </div>
      )}
    </>
  );
}

function MisconceptionCard({
  misconception: m,
  onClear,
}: {
  misconception: Misconception;
  onClear: (id: MisconceptionId) => void;
}) {
  const isCleared = m.status !== "active";
  // Derive a human-readable strength label from how recent it is
  const ageMs = Date.now() - m.lastObservedAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  const strength = isCleared ? "cleared" : ageHours < 48 ? "strong" : "forming";

  return (
    <div className={`${styles.miscCard} ${isCleared ? styles.miscCardCleared : ""}`}>
      <div className={styles.miscCardHead}>
        <span className={styles.miscId}>{String(m.id).slice(0, 8).toUpperCase()}</span>
        <span className={styles.miscConcept}>
          <em>{m.conceptId}</em> — {m.description.slice(0, 60)}
          {m.description.length > 60 ? "…" : ""}
        </span>
        <span
          className={`${styles.miscStrength} ${strength === "forming" || isCleared ? styles.miscStrengthWeak : ""}`}
        >
          {strength}
        </span>
      </div>
      <p className={styles.miscDesc}>{m.description}</p>
      {m.errorForm && (
        <blockquote className={styles.miscEvidence}>
          <span className={styles.miscQuote}>"{m.errorForm}"</span>
          <span className={styles.miscRef}>
            · first observed {new Date(m.firstObservedAt).toLocaleDateString()}
          </span>
        </blockquote>
      )}
      {!isCleared && (
        <div className={styles.miscActions}>
          <button
            type="button"
            className={`${styles.miscBtn} ${styles.miscBtnDanger}`}
            onClick={() => onClear(m.id)}
          >
            clear (stale)
          </button>
        </div>
      )}
    </div>
  );
}

// ── Procedural pane — strategy preferences ────────────────────────────────────

function ProceduralPane({
  model,
  loading,
  error,
}: {
  model: ProceduralModel | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className={styles.statusText}>Loading procedural model…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;

  const entries = model ? Array.from(model.strategies.entries()) : [];

  return (
    <>
      <h3 className={styles.paneHeading}>Procedural — strategy preferences</h3>
      {entries.length === 0 ? (
        <EmptyState message={COPY.empty.memoryProceduralEmpty} compact />
      ) : (
        <div className={styles.proceduralList}>
          {entries.map(([strategyId, pref]) => {
            const pct = Math.round(((pref.preference + 1) / 2) * 100);
            const label =
              pref.preference > 0.3 ? "preferred" : pref.preference < -0.3 ? "avoids" : "neutral";
            return (
              <div key={strategyId} className={styles.proceduralRow}>
                <span className={styles.strategyId}>{strategyId}</span>
                <span className={styles.strategyPref}>
                  <span className={styles.masteryBarTrack}>
                    <span
                      className={`${styles.masteryBarFill} ${styles.masteryFill_mid}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className={styles.masteryVal}>{pref.preference.toFixed(2)}</span>
                </span>
                <span className={styles.strategyLabel}>{label}</span>
                <span className={styles.strategyEvidence}>{pref.evidenceCount} obs</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Affective pane — mood / engagement signals ────────────────────────────────

function AffectivePane({
  model,
  loading,
  error,
}: {
  model: AffectiveModel | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className={styles.statusText}>Loading affective model…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;
  if (!model || model.recent.length === 0) {
    return (
      <>
        <h3 className={styles.paneHeading}>Affective — engagement + confidence signals</h3>
        <EmptyState message={COPY.empty.memoryAffectiveEmpty} compact />
      </>
    );
  }

  const { baseline } = model;

  return (
    <>
      <h3 className={styles.paneHeading}>Affective — engagement + confidence signals</h3>
      <div className={styles.affectiveBaseline}>
        <span className={styles.baselineLabel}>Baseline</span>
        <AffectBar label="engagement" value={baseline.engagement} />
        <AffectBar label="confidence" value={baseline.confidence} />
        <AffectBar label="frustration" value={baseline.frustration} flip />
      </div>
      <div className={styles.affectiveSamples}>
        {model.recent
          .slice()
          .reverse()
          .slice(0, 20)
          .map((sample, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable slice of snapshot — order won't change mid-render
            <AffectSampleRow key={i} sample={sample} />
          ))}
      </div>
    </>
  );
}

function AffectBar({
  label,
  value,
  flip = false,
}: {
  label: string;
  value: number;
  flip?: boolean;
}) {
  const pct = Math.round(value * 100);
  // For frustration (flip=true), high value is "bad" — use danger color
  const tier = flip ? "low" : pct >= 70 ? "high" : pct >= 40 ? "mid" : "low";
  return (
    <div className={styles.affectBarRow}>
      <span className={styles.affectBarLabel}>{label}</span>
      <span className={styles.masteryBarTrack}>
        <span
          className={`${styles.masteryBarFill} ${styles[`masteryFill_${tier}`]}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={styles.masteryVal}>{pct}%</span>
    </div>
  );
}

function AffectSampleRow({ sample }: { sample: AffectSample }) {
  const ts = new Date(sample.ts).toLocaleString();
  return (
    <div className={styles.affectSampleRow}>
      <span className={styles.affectSampleTs}>{ts}</span>
      <span className={styles.affectSampleSource}>{sample.source}</span>
      <span className={styles.affectSampleStats}>
        E {Math.round(sample.engagement * 100)}% · C {Math.round(sample.confidence * 100)}% · F{" "}
        {Math.round(sample.frustration * 100)}%
      </span>
    </div>
  );
}

// ── Episodic pane — chronological turn log ────────────────────────────────────

function EpisodicPane({
  events,
  loading,
  error,
}: {
  events: EpisodicEvent[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className={styles.statusText}>Loading episodic log…</p>;
  if (error) return <p className={styles.errorText}>{error}</p>;

  return (
    <>
      <h3 className={styles.paneHeading}>Episodic — turn log</h3>
      {events.length === 0 ? (
        <EmptyState message={COPY.empty.memoryEpisodicEmpty} compact />
      ) : (
        <div className={styles.episodicList}>
          {events
            .slice()
            .reverse()
            .map((evt) => (
              <EpisodicRow key={evt.id} event={evt} />
            ))}
        </div>
      )}
    </>
  );
}

function EpisodicRow({ event: evt }: { event: EpisodicEvent }) {
  const ts = new Date(evt.ts).toLocaleTimeString();
  const { type } = evt.event;
  const glyph =
    type === "user_message"
      ? "↑"
      : type === "model_message"
        ? "↓"
        : type === "tool_call"
          ? "⚙"
          : type === "tool_result"
            ? "✓"
            : "·";

  // Surface a short text snippet for content-bearing events
  let snippet = "";
  if (
    evt.event.type === "user_message" ||
    evt.event.type === "model_message" ||
    evt.event.type === "thinking"
  ) {
    snippet = evt.event.content.slice(0, 80);
  } else if (evt.event.type === "system_note") {
    snippet = evt.event.content.slice(0, 80);
  }

  return (
    <div className={styles.episodicRow}>
      <span className={styles.episodicTs}>{ts}</span>
      <span className={styles.episodicGlyph}>{glyph}</span>
      <span className={styles.episodicType}>{type}</span>
      {snippet && <span className={styles.episodicSnippet}>{snippet}</span>}
    </div>
  );
}
