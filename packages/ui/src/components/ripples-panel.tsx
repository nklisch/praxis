/**
 * RipplesPanel — surfaces the downstream consequences of confirming a
 * canonical-link candidate on a concept-map node.
 *
 * Calls `client.conceptMaps.computeRipples(...)` whenever the selected
 * candidate changes. Renders three kicker stats:
 *
 *   Concept count delta — net new canonical concepts this map will cover.
 *   Notes retagged     — notes that would gain this canonical concept tag.
 *   Tutor refs         — open tutor sessions that reference this node.
 *
 * Visual contract: matches the mockup at
 * `.mockups/screens/.../-workspace/concept-map-editor.html` — compact panel,
 * kicker label above number, muted when no candidate is selected.
 */

import type { ConceptId, ConceptMapId, RippleSummary } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./ripples-panel.module.css";

export interface RipplesPanelProps {
  mapId: ConceptMapId;
  /** The tldraw shape id (elementId) of the currently-selected candidate node. */
  elementId: string | null;
  /** The canonical concept id being evaluated as a link candidate. */
  candidateId: ConceptId | null;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

export function RipplesPanel({ mapId, elementId, candidateId }: RipplesPanelProps) {
  const client = usePraxisClient();
  const [ripples, setRipples] = useState<RippleSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!elementId || !candidateId) {
      setRipples(null);
      setLoadState("idle");
      return;
    }

    let cancelled = false;
    setLoadState("loading");

    client.conceptMaps
      .computeRipples({ mapId, elementId, candidateId })
      .then((result) => {
        if (!cancelled) {
          setRipples(result);
          setLoadState("loaded");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, mapId, elementId, candidateId]);

  const isActive = !!elementId && !!candidateId;

  return (
    <section
      className={`${styles.panel} ${!isActive ? styles.panelMuted : ""}`}
      aria-label="Ripple effects of confirming this link"
      data-testid="ripples-panel"
    >
      <header className={styles.header}>
        <span className={styles.headerLabel}>link ripples</span>
        {loadState === "loading" && <span className={styles.loadingDot} aria-label="Loading" />}
      </header>

      <div className={styles.stats}>
        <RippleStat
          label="concept delta"
          value={ripples?.conceptCountDelta ?? null}
          isLoading={loadState === "loading"}
          isActive={isActive}
          formatValue={(v) => (v > 0 ? `+${v}` : String(v))}
          title="Net new canonical concepts this map will cover after confirming"
        />
        <RippleStat
          label="notes retagged"
          value={ripples?.notesRetagged ?? null}
          isLoading={loadState === "loading"}
          isActive={isActive}
          title="Notes that would gain this canonical concept tag"
        />
        <RippleStat
          label="tutor refs"
          value={ripples?.tutorRefsAffected ?? null}
          isLoading={loadState === "loading"}
          isActive={isActive}
          title="Open tutor sessions that reference this concept-map node"
        />
      </div>

      {!isActive && (
        <p className={styles.emptyHint}>Select a best-guess node to see ripple effects.</p>
      )}
      {loadState === "error" && <p className={styles.errorHint}>Could not compute ripples.</p>}
    </section>
  );
}

// ── RippleStat sub-component ──────────────────────────────────────────────────

interface RippleStatProps {
  label: string;
  value: number | null;
  isLoading: boolean;
  isActive: boolean;
  title?: string;
  formatValue?: (v: number) => string;
}

function RippleStat({ label, value, isLoading, isActive, title, formatValue }: RippleStatProps) {
  const displayValue =
    !isActive || value === null
      ? "—"
      : isLoading
        ? "…"
        : formatValue
          ? formatValue(value)
          : String(value);

  return (
    <div className={styles.stat} title={title}>
      <span className={styles.statLabel}>{label}</span>
      <span
        className={`${styles.statValue} ${!isActive ? styles.statMuted : ""}`}
        data-testid={`ripple-stat-${label.replace(/\s+/g, "-")}`}
      >
        {displayValue}
      </span>
    </div>
  );
}
