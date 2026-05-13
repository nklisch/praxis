import type { JSX } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  ComposedSegment,
  ComposedSystemPromptWithAttribution,
  SegmentSource,
} from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./attributed-preview-pane.module.css";

export interface AttributedPreviewPaneProps {
  modeId: string;
  view: "composed" | "diff";
  draftGlobal?: string | null;
  draftAppend?: string | null;
}

export function AttributedPreviewPane(props: AttributedPreviewPaneProps): JSX.Element {
  const client = usePraxisClient();

  const deferredGlobal = useDeferredValue(props.draftGlobal);
  const deferredAppend = useDeferredValue(props.draftAppend);

  const [current, setCurrent] = useState<ComposedSystemPromptWithAttribution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await client.author.previewPromptWithAttribution({
          modeId: props.modeId,
          ...(deferredGlobal !== undefined && { draftGlobal: deferredGlobal }),
          ...(deferredAppend !== undefined && { draftAppend: deferredAppend }),
        });
        if (!cancelled) setCurrent(result);
      } catch {
        // Silent degradation — keep prior preview on transient errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, props.modeId, deferredGlobal, deferredAppend]);

  const baseline = useMemo(
    () => (current && props.view === "diff" ? reconstructBaseline(current.segments) : null),
    [current, props.view],
  );

  if (current === null) {
    return <div className={styles.pane}>{loading ? "…" : ""}</div>;
  }

  if (props.view === "composed") {
    return (
      <div className={styles.pane}>
        {loading && (
          <span className={styles.refreshing} aria-label="Refreshing preview">
            …
          </span>
        )}
        <ComposedView segments={current.segments} />
      </div>
    );
  }

  // view === "diff"
  return (
    <div className={styles.pane}>
      {loading && (
        <span className={styles.refreshing} aria-label="Refreshing preview">
          …
        </span>
      )}
      <DiffView left={baseline!.segments} right={current.segments} />
    </div>
  );
}

// — Client-side baseline reconstruction —
// The diff's "default" column is the prompt as it would compose without ANY user
// customization. Pure projection of the current segments — no extra IPC.
export function reconstructBaseline(segments: readonly ComposedSegment[]): {
  prompt: string;
  segments: ComposedSegment[];
} {
  const baselineSegments = segments.flatMap<ComposedSegment>((s) => {
    if (s.source === "global" || s.source === "append") {
      // User-added cross-mode or per-mode layer — drop from baseline.
      return [];
    }
    if (s.source === "override") {
      // Revert to default text; reclassify as "default" so the renderer treats it cleanly.
      return [{ ...s, source: "default" as const, text: s.defaultText ?? s.text }];
    }
    // default and additional pass through unchanged.
    return [s];
  });
  return {
    prompt: baselineSegments.map((s) => s.text).join("\n\n"),
    segments: baselineSegments,
  };
}

function ComposedView({ segments }: { segments: readonly ComposedSegment[] }): JSX.Element {
  return (
    <pre className={styles.preview}>
      {segments.map((s, i) => (
        <span
          key={`${s.fragmentId}-${i}`}
          className={`${styles.segment} ${segmentClassFor(s.source)}`}
          title={`${s.source} · ${s.fragmentId}`}
        >
          {s.text}
          {i < segments.length - 1 && "\n\n"}
        </span>
      ))}
    </pre>
  );
}

function DiffView({
  left,
  right,
}: {
  left: readonly ComposedSegment[];
  right: readonly ComposedSegment[];
}): JSX.Element {
  return (
    <div className={styles.diff}>
      <div className={styles.diffCol}>
        <div className={styles.diffHeader}>Default</div>
        <ComposedView segments={left} />
      </div>
      <div className={styles.diffCol}>
        <div className={styles.diffHeader}>Current</div>
        <ComposedView segments={right} />
      </div>
    </div>
  );
}

function segmentClassFor(source: SegmentSource): string {
  switch (source) {
    case "default":
      return styles.sourceDefault ?? "";
    case "override":
      return styles.sourceOverride ?? "";
    case "append":
      return styles.sourceAppend ?? "";
    case "global":
      return styles.sourceGlobal ?? "";
    case "additional":
      return styles.sourceAdditional ?? "";
  }
}
