import type { SketchClientApi, SketchId, SketchSummary } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.sketches" as const;

/** Convert an ArrayBuffer to a base64 string (renderer-safe, no Node Buffer). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Convert a base64 string to an ArrayBuffer (renderer-safe). */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf.buffer;
}

/**
 * Phase 15a: SketchClient — renderer-side sketch API.
 *
 * Uses Blob (not Buffer) so it works in the Electron renderer / browser.
 * Images are encoded as base64 for IPC transport; the main-process handler
 * decodes them back to Buffer before passing to SketchServiceImpl.
 */
export class SketchClient implements SketchClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async put(input: {
    snapshot: unknown;
    image: Blob;
    width: number;
    height: number;
  }): Promise<SketchSummary> {
    const buf = await input.image.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(buf);
    return this.transport.invoke<SketchSummary>(`${C}.put`, {
      snapshot: input.snapshot,
      imageBase64,
      width: input.width,
      height: input.height,
    });
  }

  async get(
    sketchId: SketchId,
  ): Promise<{ snapshot: unknown; image: Blob; width: number; height: number }> {
    const result = await this.transport.invoke<{
      id: SketchId;
      snapshot: unknown;
      imageBase64: string;
      width: number;
      height: number;
    }>(`${C}.get`, sketchId);
    return {
      snapshot: result.snapshot,
      image: new Blob([base64ToArrayBuffer(result.imageBase64)], { type: "image/png" }),
      width: result.width,
      height: result.height,
    };
  }

  getSummary(sketchId: SketchId): Promise<SketchSummary | null> {
    return this.transport.invoke<SketchSummary | null>(`${C}.getSummary`, sketchId);
  }
}
