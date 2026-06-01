export type DebugFailureClass =
  | "agent-behavior"
  | "tool-dispatch"
  | "subagent"
  | "ipc"
  | "ui-render"
  | "persistence"
  | "simulation";

export type DebugBundleArtifactKind =
  | "jsonl"
  | "json"
  | "markdown"
  | "sqlite-slice"
  | "trace-zip"
  | "screenshot"
  | "dom-excerpt";

export type DebugBundleEvidenceSource =
  | "trace"
  | "session_event"
  | "tool_dispatch"
  | "subagent"
  | "ipc_stream"
  | "renderer"
  | "db_snapshot"
  | "browser_trace"
  | "manual_note";

export type DebugBundleCapturePolicy = "full_local" | "full_local_sensitive" | "metadata_only";

export interface DebugBundleArtifact {
  kind: DebugBundleArtifactKind;
  /** Relative path inside the bundle root. */
  path: string;
  source: DebugBundleEvidenceSource;
  capture: DebugBundleCapturePolicy;
  description?: string;
}

export interface DebugBundleCaptureEvent {
  type: "evidence_captured" | "evidence_missing";
  source: DebugBundleEvidenceSource;
  reason?: string;
  artifactPath?: string;
}

export interface DebugBundleManifest {
  kind: "debug_evidence_bundle";
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  localOnly: true;
  exportKind: "none";
  session?: {
    sessionId: string;
    modeId?: string;
    engineId?: string;
  };
  correlation: {
    turnIds: string[];
    callIds: string[];
    parentCallIds: string[];
    streamIds: string[];
    rendererEventIds: string[];
  };
  artifacts: DebugBundleArtifact[];
  captureEvents: DebugBundleCaptureEvent[];
  summary: {
    title: string;
    failureClass: DebugFailureClass;
    firstBadObservation?: string;
    nextDebugStep?: string;
  };
}

export interface DebugBundleArtifactContent {
  /** Relative path inside the bundle root. */
  path: string;
  contents: string | Uint8Array;
}

export interface DebugBundleWriter {
  write(input: {
    outputDir: string;
    manifest: DebugBundleManifest;
    artifacts: readonly DebugBundleArtifactContent[];
  }): Promise<{ bundleDir: string; manifestPath: string }>;
}
