import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DebugBundleManifest } from "../../../types/index.js";
import { type DebugBundleLoadError, loadDebugBundle } from "../debug-bundle-loader.js";
import { DEBUG_BUNDLE_MANIFEST_FILENAME } from "../debug-bundle-writer.js";

let tmpDir = "";

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-debug-bundle-loader-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("loadDebugBundle", () => {
  it("loads manifest and reads required artifacts", async () => {
    await writeBundle({
      manifest: makeManifest([
        {
          kind: "jsonl",
          path: "engine-events.jsonl",
          source: "session_event",
          capture: "full_local",
        },
      ]),
      artifacts: { "engine-events.jsonl": "{}\n" },
    });

    const loaded = await loadDebugBundle({
      bundleDir: tmpDir,
      requiredArtifacts: ["engine-events.jsonl"],
    });

    expect(loaded.manifest.runId).toBe("run-loader");
    await expect(loaded.readArtifactText("engine-events.jsonl")).resolves.toBe("{}\n");
  });

  it("fails explicitly when required artifacts are missing", async () => {
    await writeBundle({
      manifest: makeManifest([
        {
          kind: "jsonl",
          path: "engine-events.jsonl",
          source: "session_event",
          capture: "full_local",
        },
      ]),
      artifacts: {},
    });

    await expect(
      loadDebugBundle({ bundleDir: tmpDir, requiredArtifacts: ["engine-events.jsonl"] }),
    ).rejects.toMatchObject({
      code: "artifact_missing",
      name: "DebugBundleLoadError",
    } satisfies Partial<DebugBundleLoadError>);
  });

  it("fails explicitly when the manifest is invalid", async () => {
    await writeFile(join(tmpDir, DEBUG_BUNDLE_MANIFEST_FILENAME), "not json", "utf8");

    await expect(loadDebugBundle({ bundleDir: tmpDir })).rejects.toMatchObject({
      code: "manifest_invalid",
      name: "DebugBundleLoadError",
    } satisfies Partial<DebugBundleLoadError>);
  });
});

async function writeBundle(input: {
  manifest: DebugBundleManifest;
  artifacts: Record<string, string>;
}): Promise<void> {
  await writeFile(
    join(tmpDir, DEBUG_BUNDLE_MANIFEST_FILENAME),
    `${JSON.stringify(input.manifest, null, 2)}\n`,
    "utf8",
  );
  for (const [path, contents] of Object.entries(input.artifacts)) {
    await mkdir(dirname(join(tmpDir, path)), { recursive: true });
    await writeFile(join(tmpDir, path), contents, "utf8");
  }
}

function makeManifest(artifacts: DebugBundleManifest["artifacts"]): DebugBundleManifest {
  return {
    kind: "debug_evidence_bundle",
    schemaVersion: 1,
    runId: "run-loader",
    createdAt: "2026-06-01T00:00:00.000Z",
    localOnly: true,
    exportKind: "none",
    correlation: {
      turnIds: [],
      callIds: [],
      parentCallIds: [],
      streamIds: [],
      rendererEventIds: [],
    },
    artifacts,
    captureEvents: [],
    summary: {
      title: "Loader test",
      failureClass: "agent-behavior",
    },
  };
}
