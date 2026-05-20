#!/usr/bin/env node
/**
 * check-css-contract.mjs
 *
 * Walks packages/ui/src/ for all *.module.css files and enforces the
 * design-system contract. Fails with exit code 1 if any violations are found.
 *
 * Usage:
 *   node scripts/check-css-contract.mjs
 *   node scripts/check-css-contract.mjs --check <path>
 *   node scripts/check-css-contract.mjs --json
 *
 * Exit codes: 0 = clean, 1 = violations found
 *
 * Inline exception: add  /* design-system-exception: <reason> * /
 * on the same line or the line directly above to suppress a violation.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const checkIdx = args.indexOf("--check");
const __dir = fileURLToPath(new URL(".", import.meta.url));
const defaultRoot = join(__dir, "..", "packages", "ui", "src");
const scanRoot = checkIdx !== -1 ? args[checkIdx + 1] : defaultRoot;

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Each rule is { id, description, test(line, prevLine) }.
 * test() returns the column index of the first violation, or -1 if clean.
 * A violation is suppressed when:
 *   - the current line contains  /* design-system-exception: *  /
 *   - prevLine contains  /* design-system-exception: *  /
 */

// Both exception comment forms are recognized:
//   /* design-system-exception: <reason> */  — canonical form (new code)
//   /* intentional literal: <reason> */       — legacy form from sweep steps 2–6
const EXCEPTION_RE = /\/\*\s*(design-system-exception|intentional literal):/;

/** Strip CSS block comments from a line so we don't flag values inside comments. */
function stripComments(line) {
  // Remove /* ... */ within the same line
  return line.replace(/\/\*[^*]*(\*(?!\/)[^*]*)*\*\//g, "");
}

const RULES = [
  {
    id: "hex-color",
    description: "Hex color literal — use var(--color-*) instead",
    test(line) {
      const stripped = stripComments(line);
      // Skip lines that are just variable definitions (e.g. inside tokens.css-style :root blocks)
      const match = stripped.match(/#[0-9a-fA-F]{3,8}\b/);
      if (!match) return -1;
      return stripped.indexOf(match[0]);
    },
  },
  {
    id: "bare-px-spacing",
    description:
      "Bare px value in padding/margin/gap — use var(--space-*) instead",
    test(line) {
      const stripped = stripComments(line);
      // Match padding, margin, or gap property declarations anywhere on the line.
      // The regex captures the colon position via the match index + length.
      const propRe = /(^|[{;\s])(padding|margin|gap)(-\w+)?\s*:/gi;
      let propMatch;
      while ((propMatch = propRe.exec(stripped)) !== null) {
        const colonIdx = propMatch.index + propMatch[0].length - 1;
        const value = stripped.slice(colonIdx + 1);
        if (value.includes("var(--")) continue;
        const valMatch = value.match(/\b\d+px\b/);
        if (valMatch) {
          return stripped.indexOf(valMatch[0], colonIdx);
        }
      }
      return -1;
    },
  },
  {
    id: "cubic-bezier-literal",
    description:
      "cubic-bezier() literal — use var(--ease-*) instead",
    test(line) {
      const stripped = stripComments(line);
      const match = stripped.match(/cubic-bezier\s*\(/);
      if (!match) return -1;
      return stripped.indexOf(match[0]);
    },
  },
  {
    id: "bare-duration",
    description:
      "Bare duration in transition/animation — use var(--dur-*) or var(--t-*) instead",
    test(line) {
      const stripped = stripComments(line);
      // Match transition/animation property declarations anywhere on the line.
      const propRe = /(^|[{;\s])(transition|transition-duration|animation|animation-duration)(-\w+)?\s*:/gi;
      let propMatch;
      while ((propMatch = propRe.exec(stripped)) !== null) {
        const colonIdx = propMatch.index + propMatch[0].length - 1;
        const value = stripped.slice(colonIdx + 1);
        if (value.includes("var(--")) continue;
        const valMatch = value.match(/\b\d+(\.\d+)?(ms|s)\b/);
        if (valMatch) {
          return stripped.indexOf(valMatch[0], colonIdx);
        }
      }
      return -1;
    },
  },
];

// ─── File walker ─────────────────────────────────────────────────────────────

function* walkCssModules(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkCssModules(full);
    } else if (stat.isFile() && extname(full) === ".css" && full.endsWith(".module.css")) {
      yield full;
    }
  }
}

// ─── Scan a single file ───────────────────────────────────────────────────────

/**
 * @param {string} filePath
 * @returns {{ file, line, col, rule, snippet }[]}
 */
function scanFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const violations = [];
  let prevLine = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1; // 1-indexed

    for (const rule of RULES) {
      const col = rule.test(line, prevLine);
      if (col === -1) continue;

      // Check for inline exception or exception on the preceding line
      if (EXCEPTION_RE.test(line) || EXCEPTION_RE.test(prevLine)) continue;

      violations.push({
        file: filePath,
        line: lineNo,
        col: col + 1, // 1-indexed
        rule: rule.id,
        description: rule.description,
        snippet: line.trim().slice(0, 100),
      });
    }

    prevLine = line;
  }

  return violations;
}

// ─── Export for tests ─────────────────────────────────────────────────────────

export { scanFile, RULES, EXCEPTION_RE };

// ─── Main (only when run directly) ───────────────────────────────────────────

// ESM doesn't have require.main === module, but we can check via import.meta.url
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const allViolations = [];

  for (const file of walkCssModules(scanRoot)) {
    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify(allViolations, null, 2) + "\n");
  } else {
    const relBase = join(__dir, "..");
    for (const v of allViolations) {
      const rel = relative(relBase, v.file);
      console.error(`${rel}:${v.line}:${v.col}: ${v.rule}: ${v.snippet}`);
    }
  }

  if (allViolations.length > 0) {
    if (!jsonMode) {
      console.error(
        `\n${allViolations.length} design-system contract violation${allViolations.length === 1 ? "" : "s"} found.`
      );
    }
    process.exit(1);
  }

  process.exit(0);
}
