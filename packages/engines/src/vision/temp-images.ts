import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Write a set of base64-encoded images to a fresh temp directory.
 *
 * Returns the `tempDir` path, the ordered list of written `filePaths`, and a
 * `cleanup()` function that removes the temp directory.  Callers should invoke
 * `cleanup()` in their own `finally` block so cleanup runs even when the
 * downstream SDK call throws.
 *
 * If an image-write fails mid-loop the temp directory is removed before
 * re-throwing, so partial failures never leak files on disk.
 */
export async function writeVisionImages(
  images: ReadonlyArray<{ mimeType: string; data: string }>,
): Promise<{ tempDir: string; filePaths: string[]; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(join(tmpdir(), "praxis-vision-"));
  const filePaths: string[] = [];
  try {
    let imgIndex = 0;
    for (const img of images) {
      const ext =
        img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png";
      const filePath = join(tempDir, `image-${imgIndex}.${ext}`);
      await writeFile(filePath, Buffer.from(img.data, "base64"));
      filePaths.push(filePath);
      imgIndex += 1;
    }
    return {
      tempDir,
      filePaths,
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (err) {
    // If image-write fails, clean up before re-throwing so callers don't leak.
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}
