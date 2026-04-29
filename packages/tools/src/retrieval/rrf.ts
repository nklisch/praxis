import type { FtsSearchResult, VectorSearchResult } from "@praxis/core/types";

export interface FusedResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** Combined RRF score (higher = better). */
  score: number;
  /** Whether this chunk appeared in the vector search results. */
  fromVector: boolean;
  /** Whether this chunk appeared in the FTS search results. */
  fromFts: boolean;
}

/**
 * Reciprocal Rank Fusion — combines two ranked lists into one.
 *
 * For each chunk present in either list:
 *   score = sum over lists of 1 / (k + rank)
 *
 * `k = 60` is the conventional RRF default (Cormack et al., 2009). Do not
 * change without running a retrieval benchmark.
 *
 * Chunks in BOTH lists score higher than chunks in either list alone. This is
 * the desired behavior: a chunk that is semantically similar AND lexically
 * matching is typically the strongest answer.
 *
 * Results are returned sorted by score descending and truncated to `topK`.
 */
export function reciprocalRankFusion(
  vectorHits: ReadonlyArray<VectorSearchResult>,
  ftsHits: ReadonlyArray<FtsSearchResult>,
  topK: number,
  k = 60,
): FusedResult[] {
  const byChunkId = new Map<string, FusedResult>();

  for (let idx = 0; idx < vectorHits.length; idx++) {
    const hit = vectorHits[idx]!;
    const rank = idx + 1;
    byChunkId.set(hit.chunkId, {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      chunkText: hit.chunkText,
      ...(hit.page !== undefined && { page: hit.page }),
      ...(hit.section !== undefined && { section: hit.section }),
      score: 1 / (k + rank),
      fromVector: true,
      fromFts: false,
    });
  }

  for (let idx = 0; idx < ftsHits.length; idx++) {
    const hit = ftsHits[idx]!;
    const rank = idx + 1;
    const existing = byChunkId.get(hit.chunkId);
    if (existing) {
      existing.score += 1 / (k + rank);
      existing.fromFts = true;
    } else {
      byChunkId.set(hit.chunkId, {
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        chunkText: hit.chunkText,
        ...(hit.page !== undefined && { page: hit.page }),
        ...(hit.section !== undefined && { section: hit.section }),
        score: 1 / (k + rank),
        fromVector: false,
        fromFts: true,
      });
    }
  }

  return [...byChunkId.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}
