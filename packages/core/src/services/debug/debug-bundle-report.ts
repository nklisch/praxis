import type {
  DebugBundleArtifact,
  DebugBundleCaptureEvent,
  DebugBundleManifest,
} from "../../types/index.js";

export interface DebugBundleReportArtifact {
  path: string;
  contents?: string;
}

export function generateDebugBundleReport(input: {
  manifest: DebugBundleManifest;
  artifacts?: readonly DebugBundleReportArtifact[];
}): string {
  const { manifest } = input;
  const missingEvidence = manifest.captureEvents.filter(
    (event): event is DebugBundleCaptureEvent & { type: "evidence_missing" } =>
      event.type === "evidence_missing",
  );
  const browserArtifacts = manifest.artifacts.filter(isBrowserArtifact);
  const lines = [
    `# Debug Bundle: ${manifest.summary.title}`,
    "",
    `- Failure class: ${manifest.summary.failureClass}`,
    `- Likely owner: ${likelyOwner(manifest.summary.failureClass, missingEvidence)}`,
    `- Run: ${manifest.runId}`,
    `- Session: ${manifest.session?.sessionId ?? "unknown"}`,
    `- Turns: ${formatList(manifest.correlation.turnIds)}`,
    `- Calls: ${formatList(manifest.correlation.callIds)}`,
    `- Streams: ${formatList(manifest.correlation.streamIds)}`,
    `- Renderer events: ${formatList(manifest.correlation.rendererEventIds)}`,
    `- First bad observation: ${manifest.summary.firstBadObservation ?? "not recorded"}`,
    `- Next debug step: ${manifest.summary.nextDebugStep ?? defaultNextStep(manifest.summary.failureClass)}`,
    "",
    "## Artifacts",
    ...manifest.artifacts.map(formatArtifact),
    "",
    "## Missing Evidence",
    ...(missingEvidence.length === 0
      ? ["- none"]
      : missingEvidence.map((event) => `- ${event.source}: ${event.reason ?? "not recorded"}`)),
    "",
    "## Browser Handoff",
    ...formatBrowserHandoff(browserArtifacts),
  ];
  return `${lines.join("\n")}\n`;
}

function formatArtifact(artifact: DebugBundleArtifact): string {
  const description = artifact.description === undefined ? "" : ` - ${artifact.description}`;
  return `- ${artifact.path} (${artifact.kind}, ${artifact.source}, ${artifact.capture})${description}`;
}

function formatBrowserHandoff(artifacts: readonly DebugBundleArtifact[]): string[] {
  if (artifacts.length === 0) return ["- none"];
  const lines: string[] = [];
  for (const artifact of artifacts) {
    lines.push(`- ${artifact.path} (${artifact.kind})`);
    if (artifact.kind === "trace-zip") {
      lines.push(`  - Trace viewer: \`pnpm exec playwright show-trace ${artifact.path}\``);
    }
  }
  return lines;
}

function isBrowserArtifact(artifact: DebugBundleArtifact): boolean {
  return (
    artifact.kind === "trace-zip" ||
    artifact.kind === "screenshot" ||
    artifact.kind === "dom-excerpt"
  );
}

function likelyOwner(
  failureClass: DebugBundleManifest["summary"]["failureClass"],
  missingEvidence: readonly DebugBundleCaptureEvent[],
): string {
  if (missingEvidence.some((event) => event.source === "subagent")) {
    return "packages/core sub-agent registry / tool callId wiring";
  }
  switch (failureClass) {
    case "tool-dispatch":
      return "packages/tools registry or tool handler";
    case "subagent":
      return "packages/core SubAgentRegistry / desktop subagent channel";
    case "ipc":
      return "packages/desktop IPC stream helpers / packages/client transport";
    case "ui-render":
      return "packages/ui renderer plus desktop log channel";
    case "persistence":
      return "packages/core services, schema, and document scopes";
    case "simulation":
      return "tests simulation harness / Playwright artifacts";
    case "agent-behavior":
      return "engine adapter, prompt, or tool result contract";
  }
}

function defaultNextStep(failureClass: DebugBundleManifest["summary"]["failureClass"]): string {
  switch (failureClass) {
    case "tool-dispatch":
      return "Open tool-dispatch.jsonl and the matching handler test.";
    case "subagent":
      return "Open subagent-timeline.jsonl and confirm parent callId propagation.";
    case "ipc":
      return "Open ipc-streams.jsonl and inspect stream start/event/cancel ordering.";
    case "ui-render":
      return "Open renderer-outcomes.jsonl and inspect the UI component for the surfaced event.";
    case "persistence":
      return "Open db-snapshot.json and verify referenced rows before the failing write.";
    case "simulation":
      return "Open browser artifacts and compare expected versus observed student flow.";
    case "agent-behavior":
      return "Open engine-events.jsonl and compare the model-visible transcript to expected tool use.";
  }
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
