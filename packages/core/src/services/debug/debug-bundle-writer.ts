import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  DebugBundleArtifactContent,
  DebugBundleManifest,
  DebugBundleWriter,
} from "../../types/index.js";

export const DEBUG_BUNDLE_MANIFEST_FILENAME = "manifest.json";

export class FsDebugBundleWriter implements DebugBundleWriter {
  async write(input: {
    outputDir: string;
    manifest: DebugBundleManifest;
    artifacts: readonly DebugBundleArtifactContent[];
  }): Promise<{ bundleDir: string; manifestPath: string }> {
    const bundleDir = input.outputDir;
    const artifactWrites = prepareArtifactWrites(input.artifacts);
    validateManifestPaths(input.manifest);

    await mkdir(bundleDir, { recursive: true });

    for (const artifact of artifactWrites) {
      const relativePath = artifact.path;
      const absolutePath = join(bundleDir, ...relativePath.split("/"));
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, artifact.contents);
    }

    const manifestPath = join(bundleDir, DEBUG_BUNDLE_MANIFEST_FILENAME);
    await writeFile(manifestPath, `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8");

    return { bundleDir, manifestPath };
  }
}

export function createDebugBundleWriter(): DebugBundleWriter {
  return new FsDebugBundleWriter();
}

function prepareArtifactWrites(
  artifacts: readonly DebugBundleArtifactContent[],
): DebugBundleArtifactContent[] {
  const artifactPaths = new Set<string>();
  return artifacts.map((artifact) => {
    const relativePath = normalizeBundleRelativePath(artifact.path);
    if (artifactPaths.has(relativePath)) {
      throw new Error(`duplicate debug bundle artifact path: ${relativePath}`);
    }
    artifactPaths.add(relativePath);
    return { path: relativePath, contents: artifact.contents };
  });
}

function validateManifestPaths(manifest: DebugBundleManifest): void {
  for (const artifact of manifest.artifacts) {
    normalizeBundleRelativePath(artifact.path);
  }
  for (const event of manifest.captureEvents) {
    if (event.artifactPath !== undefined) normalizeBundleRelativePath(event.artifactPath);
  }
}

export function normalizeBundleRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length === 0) {
    throw new Error("debug bundle artifact path must not be empty");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`debug bundle artifact path must be relative: ${path}`);
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`debug bundle artifact path must not traverse directories: ${path}`);
  }
  if (parts.join("/") === DEBUG_BUNDLE_MANIFEST_FILENAME) {
    throw new Error(`${DEBUG_BUNDLE_MANIFEST_FILENAME} is reserved for the debug bundle manifest`);
  }

  return parts.join("/");
}
