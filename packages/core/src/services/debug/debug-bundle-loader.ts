import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DebugBundleManifest } from "../../types/index.js";
import {
  DEBUG_BUNDLE_MANIFEST_FILENAME,
  normalizeBundleRelativePath,
} from "./debug-bundle-writer.js";

export class DebugBundleLoadError extends Error {
  constructor(
    readonly code: "manifest_missing" | "manifest_invalid" | "artifact_missing",
    message: string,
  ) {
    super(message);
    this.name = "DebugBundleLoadError";
  }
}

export interface LoadedDebugBundle {
  bundleDir: string;
  manifest: DebugBundleManifest;
  readArtifactText(path: string): Promise<string>;
}

export async function loadDebugBundle(input: {
  bundleDir: string;
  requiredArtifacts?: readonly string[];
}): Promise<LoadedDebugBundle> {
  const manifestPath = join(input.bundleDir, DEBUG_BUNDLE_MANIFEST_FILENAME);
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch (err) {
    throw new DebugBundleLoadError(
      "manifest_missing",
      `debug bundle manifest not found: ${manifestPath} (${errorMessage(err)})`,
    );
  }

  const manifest = parseManifest(manifestText, manifestPath);
  const loaded: LoadedDebugBundle = {
    bundleDir: input.bundleDir,
    manifest,
    readArtifactText: (path) => readArtifactText(input.bundleDir, path),
  };

  for (const artifactPath of input.requiredArtifacts ?? []) {
    await loaded.readArtifactText(artifactPath);
  }
  return loaded;
}

async function readArtifactText(bundleDir: string, path: string): Promise<string> {
  const relativePath = normalizeBundleRelativePath(path);
  const artifactPath = join(bundleDir, ...relativePath.split("/"));
  try {
    return await readFile(artifactPath, "utf8");
  } catch (err) {
    throw new DebugBundleLoadError(
      "artifact_missing",
      `debug bundle artifact not found: ${relativePath} (${errorMessage(err)})`,
    );
  }
}

function parseManifest(text: string, manifestPath: string): DebugBundleManifest {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (err) {
    throw new DebugBundleLoadError(
      "manifest_invalid",
      `debug bundle manifest is not valid JSON: ${manifestPath} (${errorMessage(err)})`,
    );
  }
  if (!isManifest(value)) {
    throw new DebugBundleLoadError(
      "manifest_invalid",
      `debug bundle manifest has unsupported shape: ${manifestPath}`,
    );
  }
  return value;
}

function isManifest(value: unknown): value is DebugBundleManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "debug_evidence_bundle" &&
    record.schemaVersion === 1 &&
    typeof record.runId === "string" &&
    Array.isArray(record.artifacts) &&
    Array.isArray(record.captureEvents)
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
