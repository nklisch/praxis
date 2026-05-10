import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Resolved on-disk locations for pdfjs-dist asset directories.
 *
 * pdfjs-dist needs these to decode PDFs that reference non-embedded standard
 * fonts (Helvetica, Times, Symbol, ZapfDingbats, etc.) and CJK / non-Latin
 * CMaps. Without them, pdfjs emits "UnknownErrorException: Ensure that the
 * standardFontDataUrl API parameter is provided" warnings and silently drops
 * affected text — pages can come back empty.
 *
 * IMPORTANT: pdfjs's NodeBinaryDataFactory passes the URL string directly to
 * `fs.readFile()`. Node's fs only accepts URL *instances*, not URL strings —
 * a `file://...` string fails with ENOENT. So we hand pdfjs a plain
 * filesystem path with a trailing separator. Its `getFactoryUrlProp` only
 * checks for the trailing slash, then does `baseUrl + filename`, producing
 * a valid path that fs can read.
 */
export interface PdfjsAssetUrls {
  /** Path of pdfjs-dist/standard_fonts/ — trailing separator required by pdfjs. */
  standardFontDataUrl: string;
  /** Path of pdfjs-dist/cmaps/ — trailing separator required by pdfjs. */
  cMapUrl: string;
  /** Path of pdfjs-dist/wasm/ — trailing separator required by pdfjs. */
  wasmUrl: string;
}

let cached: PdfjsAssetUrls | undefined;

/**
 * Resolve the on-disk locations of pdfjs-dist's asset directories.
 *
 * Cached after the first call. Works in both dev (tsx loader, real fs) and
 * packaged Electron (assets live inside the asar archive — Electron's asar
 * shim makes fs reads transparent).
 *
 * pdfjs's `getFactoryUrlProp` requires a trailing "/" check; we use the
 * platform separator so Windows paths still validate.
 */
export function resolvePdfjsAssetUrls(): PdfjsAssetUrls {
  if (cached) return cached;

  const require = createRequire(import.meta.url);
  // Resolve via package.json so we get the package root regardless of which
  // entry point (legacy/build/pdf.mjs etc.) is in use.
  const pkgJsonPath = require.resolve("pdfjs-dist/package.json");
  const pkgRoot = dirname(pkgJsonPath);

  // pdfjs's `getFactoryUrlProp` requires `.endsWith("/")` literally, so always
  // terminate with a forward slash regardless of platform. fs.readFile on
  // Windows tolerates mixed `/` and `\` in paths, so the resulting
  // `C:\…\standard_fonts/Filename.pfb` is still readable.
  const toDirPath = (sub: string): string => `${join(pkgRoot, sub)}/`;

  cached = {
    standardFontDataUrl: toDirPath("standard_fonts"),
    cMapUrl: toDirPath("cmaps"),
    wasmUrl: toDirPath("wasm"),
  };
  return cached;
}
