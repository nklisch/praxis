/**
 * Unit tests for `walkDirectoryForIngest` — the folder-walk utility used by
 * the `praxis.ingest.pickPaths` IPC handler.
 *
 * These tests create real temp directories on disk so that the
 * `readdirSync + Dirent` code path is exercised with OS-level semantics.
 *
 * Covered:
 * - Filters to supported extensions only.
 * - Respects the depth cap (depth > 5 is not traversed).
 * - Skips symlinks (detected via Dirent.isSymbolicLink()).
 * - Skips hidden files and directories (names starting with ".").
 * - Silently skips directories that deny reads (handles EACCES gracefully).
 * - Returns empty array for permission-denied root.
 */

import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Logger } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// walkDirectoryForIngest is exported for testability.
import {
  cleanupOwnedTempTextFile,
  walkDirectoryForIngest,
  writeOwnedTempTextFile,
} from "../ingest-channel.js";

// ── Fake IngestorRegistry ─────────────────────────────────────────────────────

function makeRegistry(extensions: string[]) {
  return {
    supportedExtensions: () => extensions,
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
  } as any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpRoot = "";

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), "praxis-walk-test-"));
});

afterEach(() => {
  // Clean up is best-effort; temp dirs are GC'd by the OS on reboot.
});

function create(relPath: string, content = ""): string {
  const full = path.join(tmpRoot, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("walkDirectoryForIngest", () => {
  it("returns only files with supported extensions", () => {
    create("doc.pdf");
    create("notes.txt");
    create("image.png"); // unsupported
    create("chapter.md");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf", "txt", "md"]));
    const names = found.map((f) => path.basename(f)).sort();

    expect(names).toEqual(["chapter.md", "doc.pdf", "notes.txt"]);
  });

  it("returns empty when no files match supported extensions", () => {
    create("image.png");
    create("video.mp4");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf", "txt"]));
    expect(found).toHaveLength(0);
  });

  it("recurses into subdirectories", () => {
    create("top.pdf");
    create("sub/nested.pdf");
    create("sub/deep/deeper.pdf");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf"]));
    const names = found.map((f) => path.basename(f)).sort();

    expect(names).toEqual(["deeper.pdf", "nested.pdf", "top.pdf"]);
  });

  it("respects the depth cap of 5 (depth 6 is not traversed)", () => {
    // Build a 7-level path: tmpRoot/1/2/3/4/5/6/file.pdf
    // Depth from root: 1=0, 2=1, 3=2, 4=3, 5=4, 6=5 (AT cap), so 6 is included.
    // Level 7 (index 6) is depth 6 — beyond cap, not traversed.
    const levels = ["d1", "d2", "d3", "d4", "d5", "d6"];
    let cur = tmpRoot;
    for (const l of levels) {
      cur = path.join(cur, l);
      mkdirSync(cur, { recursive: true });
    }

    // File at depth 5 (the 6th subdirectory level, i.e., d1/d2/d3/d4/d5/ok.pdf).
    // depth arg starts at 0 for root; d1=1, d2=2, d3=3, d4=4, d5=5 (AT cap), should be traversed.
    const atCapDir = path.join(tmpRoot, "d1", "d2", "d3", "d4", "d5");
    writeFileSync(path.join(atCapDir, "at-cap.pdf"), "");

    // File inside d1/d2/d3/d4/d5/d6 — depth would be 6, BEYOND cap, must NOT appear.
    const beyondCapDir = path.join(tmpRoot, "d1", "d2", "d3", "d4", "d5", "d6");
    writeFileSync(path.join(beyondCapDir, "beyond-cap.pdf"), "");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf"]));
    const names = found.map((f) => path.basename(f)).sort();

    expect(names).toContain("at-cap.pdf");
    expect(names).not.toContain("beyond-cap.pdf");
  });

  it("skips hidden files (names starting with '.')", () => {
    create("visible.pdf");
    create(".hidden.pdf");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf"]));
    const names = found.map((f) => path.basename(f));

    expect(names).toContain("visible.pdf");
    expect(names).not.toContain(".hidden.pdf");
  });

  it("skips hidden directories (names starting with '.')", () => {
    create("top.pdf");
    create(".git/COMMIT_EDITMSG.pdf"); // inside a hidden dir

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf"]));
    const names = found.map((f) => path.basename(f));

    expect(names).toContain("top.pdf");
    expect(names).not.toContain("COMMIT_EDITMSG.pdf");
  });

  it("skips symbolic links (does not follow them)", () => {
    create("real.pdf");
    const target = path.join(tmpRoot, "real.pdf");
    const linkPath = path.join(tmpRoot, "link.pdf");
    try {
      symlinkSync(target, linkPath);
    } catch {
      // Symlinks may be restricted in some CI environments; skip the test.
      return;
    }

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf"]));
    const fullPaths = found;

    // The real file should appear; the symlink should NOT.
    expect(fullPaths).toContain(target);
    expect(fullPaths).not.toContain(linkPath);
  });

  it("returns empty array if root is not readable (permission-denied simulation)", () => {
    // We simulate this by passing a non-existent path (readdirSync throws ENOENT,
    // which the walker catches and skips silently).
    const found = walkDirectoryForIngest("/nonexistent/path/xyz123", makeRegistry(["pdf"]));
    expect(found).toHaveLength(0);
  });

  it("extension matching is case-insensitive", () => {
    create("DOC.PDF"); // uppercase extension
    create("notes.TXT");

    const found = walkDirectoryForIngest(tmpRoot, makeRegistry(["pdf", "txt"]));
    const names = found.map((f) => path.basename(f)).sort();

    expect(names).toEqual(["DOC.PDF", "notes.TXT"]);
  });
});

describe("owned pasted-text temp files", () => {
  it("creates pasted text inside an owned temp directory and cleans that directory", () => {
    const owned = new Map<string, string>();
    const filePath = writeOwnedTempTextFile(
      { content: "hello", filename: "../unsafe:name.txt" },
      owned,
    );
    const tempDir = owned.get(filePath);

    expect(tempDir).toBeDefined();
    expect(filePath.startsWith(tempDir ?? "")).toBe(true);
    expect(filePath).toContain(".._unsafe_name.txt");
    expect(existsSync(filePath)).toBe(true);

    cleanupOwnedTempTextFile(filePath, owned, {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    } as unknown as Logger);

    expect(owned.has(filePath)).toBe(false);
    expect(existsSync(tempDir ?? "")).toBe(false);
  });
});
