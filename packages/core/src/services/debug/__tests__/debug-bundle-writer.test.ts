import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DebugBundleManifest } from "../../../types/index.js";
import {
  DEBUG_BUNDLE_MANIFEST_FILENAME,
  FsDebugBundleWriter,
  normalizeBundleRelativePath,
} from "../debug-bundle-writer.js";

let tmpDir = "";

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-debug-bundle-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeManifest(overrides: Partial<DebugBundleManifest> = {}): DebugBundleManifest {
  return {
    kind: "debug_evidence_bundle",
    schemaVersion: 1,
    runId: "run-1",
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
        type: "evidence_captured",
        source: "trace",
        artifactPath: "trace-records.jsonl",
      },
    ],
    summary: {
      title: "Trace replay",
      failureClass: "tool-dispatch",
    },
    ...overrides,
  };
}

describe("normalizeBundleRelativePath", () => {
  it("normalizes backslashes to bundle separators", () => {
    expect(normalizeBundleRelativePath("nested\\trace.jsonl")).toBe("nested/trace.jsonl");
  });

  it.each([
    "",
    "/tmp/trace.jsonl",
    "C:\\tmp\\trace.jsonl",
    "C:tmp\\trace.jsonl",
    "../trace.jsonl",
    "nested/../trace.jsonl",
    "nested//trace.jsonl",
    "./trace.jsonl",
    DEBUG_BUNDLE_MANIFEST_FILENAME,
  ])("rejects unsafe bundle path %s", (path) => {
    expect(() => normalizeBundleRelativePath(path)).toThrow();
  });
});

describe("FsDebugBundleWriter", () => {
  it("writes artifacts before the manifest and round-trips manifest JSON", async () => {
    const writer = new FsDebugBundleWriter();
    const outputDir = join(tmpDir, "bundle");
    const manifest = makeManifest();

    const result = await writer.write({
      outputDir,
      manifest,
      artifacts: [{ path: "trace-records.jsonl", contents: '{"type":"turn_start"}\n' }],
    });

    expect(result.bundleDir).toBe(outputDir);
    expect(result.manifestPath).toBe(join(outputDir, DEBUG_BUNDLE_MANIFEST_FILENAME));
    await expect(readFile(join(outputDir, "trace-records.jsonl"), "utf8")).resolves.toBe(
      '{"type":"turn_start"}\n',
    );
    const manifestText = await readFile(result.manifestPath, "utf8");
    expect(JSON.parse(manifestText)).toMatchObject({
      kind: "debug_evidence_bundle",
      runId: "run-1",
      artifacts: [{ path: "trace-records.jsonl" }],
    });
  });

  it("rejects duplicate artifact paths", async () => {
    const writer = new FsDebugBundleWriter();

    await expect(
      writer.write({
        outputDir: join(tmpDir, "bundle"),
        manifest: makeManifest(),
        artifacts: [
          { path: "trace-records.jsonl", contents: "" },
          { path: "trace-records.jsonl", contents: "" },
        ],
      }),
    ).rejects.toThrow("duplicate debug bundle artifact path");
  });

  it("rejects unsafe paths in manifest artifacts and capture events", async () => {
    const writer = new FsDebugBundleWriter();

    await expect(
      writer.write({
        outputDir: join(tmpDir, "bundle"),
        manifest: makeManifest({
          artifacts: [
            {
              kind: "jsonl",
              path: "../trace-records.jsonl",
              source: "trace",
              capture: "metadata_only",
            },
          ],
        }),
        artifacts: [],
      }),
    ).rejects.toThrow("must not traverse directories");

    await expect(
      writer.write({
        outputDir: join(tmpDir, "bundle-2"),
        manifest: makeManifest({
          captureEvents: [
            {
              type: "evidence_captured",
              source: "trace",
              artifactPath: "/tmp/trace-records.jsonl",
            },
          ],
        }),
        artifacts: [],
      }),
    ).rejects.toThrow("must be relative");
  });

  it("validates manifest paths before writing artifacts", async () => {
    const writer = new FsDebugBundleWriter();
    const outputDir = join(tmpDir, "bundle");

    await expect(
      writer.write({
        outputDir,
        manifest: makeManifest({
          artifacts: [
            {
              kind: "jsonl",
              path: "../trace-records.jsonl",
              source: "trace",
              capture: "metadata_only",
            },
          ],
        }),
        artifacts: [{ path: "trace-records.jsonl", contents: '{"type":"turn_start"}\n' }],
      }),
    ).rejects.toThrow("must not traverse directories");
    await expect(readFile(join(outputDir, "trace-records.jsonl"), "utf8")).rejects.toThrow();
  });
});
