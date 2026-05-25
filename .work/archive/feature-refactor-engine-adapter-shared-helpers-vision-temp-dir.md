---
id: feature-refactor-engine-adapter-shared-helpers-vision-temp-dir
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-engine-adapter-shared-helpers
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract `writeVisionImages` helper shared by Claude Code + Codex vision adapters

## Brief
`ClaudeCodeVision` (`packages/engines/src/claude-code/vision.ts`) and `CodexVision`
(`packages/engines/src/codex/vision.ts`) duplicate the same temp-dir setup, ext-mapping,
and image-write loop, with identical `finally` cleanup.

## Current duplication

**`packages/engines/src/claude-code/vision.ts:22–35`:**
```ts
const tempDir = await mkdtemp(join(tmpdir(), "praxis-vision-"));
try {
  const filePaths: string[] = [];
  let imgIndex = 0;
  for (const img of req.images) {
    const ext =
      img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png";
    const filePath = join(tempDir, `image-${imgIndex}.${ext}`);
    await writeFile(filePath, Buffer.from(img.data, "base64"));
    filePaths.push(filePath);
    imgIndex += 1;
  }
  ...
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
```

**`packages/engines/src/codex/vision.ts:28–40`:** identical setup; only the prompt
construction and SDK call differ.

## Target
Extract a shared helper in `packages/engines/src/vision/temp-images.ts` (or similar):
```ts
export async function writeVisionImages(
  images: ReadonlyArray<{ mimeType: string; data: string }>,
): Promise<{ tempDir: string; filePaths: string[]; cleanup: () => Promise<void> }>;
```

Both adapters call `writeVisionImages(req.images)`, use the returned `filePaths`, and
invoke `cleanup()` in their own `finally` blocks. Direct doesn't need this (no temp
files required by its provider path).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- Both `ClaudeCodeVision.describe` and `CodexVision.describe` use the shared helper
- Cleanup still runs on error paths
- No behavior change to either adapter's `VisionDescribeResponse`

## Implementation notes

**New helper:** `packages/engines/src/vision/temp-images.ts` — 43 lines
Signature: `writeVisionImages(images: ReadonlyArray<{ mimeType: string; data: string }>): Promise<{ tempDir: string; filePaths: string[]; cleanup: () => Promise<void> }>`
Partial-write failures clean up before re-throwing; callers own the `finally { await cleanup() }` block for SDK-level errors.

**claude-code/vision.ts:** 69 lines → 55 lines (removed `mkdtemp`, `rm`, `writeFile`, `tmpdir`, `join` imports; replaced 13-line write loop with one `writeVisionImages` call)

**codex/vision.ts:** 85 lines → 71 lines (same removal; `tempDir` not destructured since Codex path doesn't need it for `workDir`)

**Verification:** `pnpm typecheck` clean across all packages; `pnpm test` — 440 test files passed, 0 failures.

## Review

**Verdict: done** — clean extraction with no blockers.

Verified:
- Signature matches spec: `writeVisionImages(images): Promise<{ tempDir, filePaths, cleanup }>`
- Partial-write error path: `try/catch` inside the helper runs `rm(tempDir, ...)` before re-throwing — no temp dir leak on partial failure
- `cleanup` is returned as a callable; callers own `finally { await cleanup() }` — confirmed in both adapters
- Both `ClaudeCodeVision` and `CodexVision` import `writeVisionImages` from `../vision/temp-images.js` and call it at the start of `describe()`; `finally { await cleanup() }` replaces the inline `rm` call in each
- All five node stdlib imports (`mkdtemp`, `rm`, `writeFile`, `tmpdir`, `join`) removed from both adapters
- Behavior preserved: `praxis-vision-` prefix, same ext-mapping (jpeg→jpg, webp→webp, default→png), same `image-${idx}.${ext}` filename pattern
- 440 tests, 0 failures per implementation notes

No findings.
