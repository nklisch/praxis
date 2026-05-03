import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolved file:// URLs for pdfjs-dist asset directories.
 *
 * pdfjs-dist needs these to decode PDFs that reference non-embedded standard
 * fonts (Helvetica, Times, Symbol, ZapfDingbats, etc.) and CJK / non-Latin
 * CMaps. Without them, pdfjs emits "UnknownErrorException: Ensure that the
 * standardFontDataUrl API parameter is provided" warnings and silently drops
 * affected text — pages can come back empty.
 */
export interface PdfjsAssetUrls {
  /** URL of pdfjs-dist/standard_fonts/ — trailing slash required by pdfjs. */
  standardFontDataUrl: string;
  /** URL of pdfjs-dist/cmaps/ — trailing slash required by pdfjs. */
  cMapUrl: string;
  /** URL of pdfjs-dist/wasm/ — trailing slash required by pdfjs. */
  wasmUrl: string;
}

let cached: PdfjsAssetUrls | undefined;

/**
 * Resolve the on-disk locations of pdfjs-dist's asset directories and return
 * them as file:// URLs (with the trailing slash pdfjs requires).
 *
 * Cached after the first call. Works in both dev (tsx loader, real fs) and
 * packaged Electron (assets live inside the asar archive — Electron's asar
 * shim makes fs reads transparent).
 */
export function resolvePdfjsAssetUrls(): PdfjsAssetUrls {
  if (cached) return cached;

  const require = createRequire(import.meta.url);
  // Resolve via package.json so we get the package root regardless of which
  // entry point (legacy/build/pdf.mjs etc.) is in use.
  const pkgJsonPath = require.resolve("pdfjs-dist/package.json");
  const pkgRoot = dirname(pkgJsonPath);

  const toDirUrl = (sub: string): string => `${pathToFileURL(join(pkgRoot, sub)).href}/`;

  cached = {
    standardFontDataUrl: toDirUrl("standard_fonts"),
    cMapUrl: toDirUrl("cmaps"),
    wasmUrl: toDirUrl("wasm"),
  };
  return cached;
}
