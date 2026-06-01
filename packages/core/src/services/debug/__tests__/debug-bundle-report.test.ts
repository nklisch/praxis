import { describe, expect, it } from "vitest";
import type { DebugBundleManifest, SessionId } from "../../../types/index.js";
import { generateDebugBundleReport } from "../debug-bundle-report.js";

describe("generateDebugBundleReport", () => {
  it("prints compact failure, correlation, owner, artifacts, and next-step details", () => {
    const report = generateDebugBundleReport({ manifest: makeManifest() });

    expect(report).toContain("# Debug Bundle: Course create crash");
    expect(report).toContain("- Failure class: persistence");
    expect(report).toContain(
      "- Likely owner: packages/core sub-agent registry / tool callId wiring",
    );
    expect(report).toContain("- Run: run-1");
    expect(report).toContain("- Session: session-1");
    expect(report).toContain("- Turns: session-1:turn:0");
    expect(report).toContain("- Calls: call-1");
    expect(report).toContain("- Streams: stream-1");
    expect(report).toContain("- Renderer events: renderer-1");
    expect(report).toContain("- First bad observation: FOREIGN KEY constraint failed");
    expect(report).toContain("- Next debug step: Inspect document scopes.");
    expect(report).toContain("- trace-records.jsonl (jsonl, trace, metadata_only)");
    expect(report).toContain("- subagent: no matching sub-agent trace records found");
  });

  it("renders browser artifacts and trace viewer commands without a Playwright dependency", () => {
    const manifest = makeManifest({
      artifacts: [
        {
          kind: "trace-zip",
          path: "browser/trace.zip",
          source: "browser_trace",
          capture: "full_local",
        },
        {
          kind: "screenshot",
          path: "browser/failure.png",
          source: "browser_trace",
          capture: "full_local",
        },
        {
          kind: "dom-excerpt",
          path: "browser/dom.html",
          source: "browser_trace",
          capture: "full_local",
        },
      ],
    });

    const report = generateDebugBundleReport({ manifest });

    expect(report).toContain("- browser/trace.zip (trace-zip)");
    expect(report).toContain("- Trace viewer: `pnpm exec playwright show-trace browser/trace.zip`");
    expect(report).toContain("- browser/failure.png (screenshot)");
    expect(report).toContain("- browser/dom.html (dom-excerpt)");
  });
});

function makeManifest(overrides: Partial<DebugBundleManifest> = {}): DebugBundleManifest {
  return {
    kind: "debug_evidence_bundle",
    schemaVersion: 1,
    runId: "run-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    localOnly: true,
    exportKind: "none",
    session: { sessionId: "session-1" as SessionId },
    correlation: {
      turnIds: ["session-1:turn:0"],
      callIds: ["call-1"],
      parentCallIds: [],
      streamIds: ["stream-1"],
      rendererEventIds: ["renderer-1"],
    },
    artifacts: [
      {
        kind: "jsonl",
        path: "trace-records.jsonl",
        source: "trace",
        capture: "metadata_only",
      },
    ],
    captureEvents: [
      {
        type: "evidence_missing",
        source: "subagent",
        reason: "no matching sub-agent trace records found",
      },
    ],
    summary: {
      title: "Course create crash",
      failureClass: "persistence",
      firstBadObservation: "FOREIGN KEY constraint failed",
      nextDebugStep: "Inspect document scopes.",
    },
    ...overrides,
  };
}
