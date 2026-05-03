/**
 * concept-link-matcher — pure fuzzy matcher for concept-map typeahead.
 *
 * Matches a free-text label against canonical concept names using a
 * token-overlap + normalized Levenshtein blend. No external deps.
 */

import type { ConceptId } from "../types/index.js";

/**
 * The minimal shape `matchConceptByLabel` needs from a concept. The full
 * `Concept` type satisfies this; so does the renderer-side shape returned
 * by `client.artifacts.concepts()` (which has wider fields like aliases,
 * standardsTags). Keep this loose so callers can pass either.
 */
export interface ConceptForMatching {
  readonly id: ConceptId | string;
  readonly name: string;
}

export interface ConceptMatch {
  conceptId: ConceptId;
  conceptName: string;
  /** 0..1 — higher is better. */
  confidence: number;
}

/**
 * Fuzzy-match `label` against `canonicalConcepts`. Returns matches with
 * confidence ≥ `minConfidence` (default 0.65), sorted descending.
 *
 * Algorithm: normalize → token-aware fuzzy score (prefix + Levenshtein per
 * token, scaled by token-count ratio) blended with full-string normalized
 * Levenshtein; take the max. Default threshold of 0.65 is low enough to
 * catch common abbreviations (e.g. "linear eqs" → "Linear Equations") while
 * filtering clear non-matches (e.g. "banana" scores < 0.2).
 */
export function matchConceptByLabel(
  label: string,
  canonicalConcepts: ReadonlyArray<ConceptForMatching>,
  minConfidence = 0.65,
): ConceptMatch[] {
  const normalized = normalizeLabel(label);
  if (normalized.length === 0) return [];

  const results: ConceptMatch[] = [];

  for (const concept of canonicalConcepts) {
    const conceptNorm = normalizeLabel(concept.name);
    if (conceptNorm.length === 0) continue;

    const confidence = scoreMatch(normalized, conceptNorm);
    if (confidence >= minConfidence) {
      results.push({
        conceptId: concept.id as ConceptId,
        conceptName: concept.name,
        confidence,
      });
    }
  }

  // Sort descending by confidence.
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Lowercase, trim, strip punctuation, collapse internal whitespace.
 */
function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // strip punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreMatch(a: string, b: string): number {
  // Exact match shortcut.
  if (a === b) return 1.0;

  const tokenScore = fuzzyTokenScore(a, b);
  const levScore = normalizedLevenshtein(a, b);

  // Take the higher signal so partial word matches and token matches both work.
  return Math.max(tokenScore, levScore);
}

/**
 * Token-aware fuzzy score. For each token in the query string, find the
 * best-matching token in the candidate concept name using:
 * - Exact match → 1.0
 * - Prefix match → 0.9 (handles abbreviations like "eqs" → "equations")
 * - Normalized Levenshtein otherwise
 *
 * Returns the average of best-per-token scores, scaled by the token-count
 * overlap ratio (to penalize large vocabulary differences).
 */
function fuzzyTokenScore(a: string, b: string): number {
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // For each token in A, find the best match in B.
  let totalScore = 0;
  for (const ta of tokensA) {
    let best = 0;
    for (const tb of tokensB) {
      let s: number;
      if (ta === tb) {
        s = 1.0;
      } else if (tb.startsWith(ta) || ta.startsWith(tb)) {
        // Prefix match — handles abbreviations: "eqs" is a prefix-match of "equations".
        // Score = 0.9 × (shorter / longer) to reward longer prefixes more.
        const shorter = Math.min(ta.length, tb.length);
        const longer = Math.max(ta.length, tb.length);
        s = 0.9 * (shorter / longer) + 0.1;
      } else {
        s = normalizedLevenshtein(ta, tb);
      }
      if (s > best) best = s;
    }
    totalScore += best;
  }

  // Average score per token in A, scaled by the token-count overlap ratio.
  const avgScore = totalScore / tokensA.length;
  const countRatio =
    Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length, tokensB.length);
  return avgScore * countRatio;
}

/** 1 - (editDistance / max(len(a), len(b))). Returns 0 for zero-length inputs. */
function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

/**
 * Classic dynamic-programming Levenshtein distance (~20 lines).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two rolling rows to keep memory O(n).
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] as number) + 1, // deletion
        (curr[j - 1] as number) + 1, // insertion
        (prev[j - 1] as number) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n] as number;
}
