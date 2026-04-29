import type { FtsSearchResult, VectorSearchResult } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../rrf.js";

function makeVec(chunkId: string, documentId = "doc1", distance = 0.1): VectorSearchResult {
  return { chunkId, documentId, chunkText: `text for ${chunkId}`, distance };
}

function makeFts(chunkId: string, documentId = "doc1", score = -1.5): FtsSearchResult {
  return { chunkId, documentId, chunkText: `text for ${chunkId}`, score };
}

describe("reciprocalRankFusion", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(reciprocalRankFusion([], [], 10)).toHaveLength(0);
  });

  it("returns empty array when topK is 0", () => {
    const vec = [makeVec("c1")];
    const fts = [makeFts("c1")];
    expect(reciprocalRankFusion(vec, fts, 0)).toHaveLength(0);
  });

  it("single chunk in only vector hits at rank 1 scores 1/(k+1)", () => {
    const vec = [makeVec("c1")];
    const result = reciprocalRankFusion(vec, [], 5);

    expect(result).toHaveLength(1);
    expect(result[0]?.chunkId).toBe("c1");
    // k=60, rank=1 → 1/61
    expect(result[0]?.score).toBeCloseTo(1 / 61);
    expect(result[0]?.fromVector).toBe(true);
    expect(result[0]?.fromFts).toBe(false);
  });

  it("single chunk in only FTS hits at rank 1 scores 1/(k+1)", () => {
    const fts = [makeFts("c1")];
    const result = reciprocalRankFusion([], fts, 5);

    expect(result).toHaveLength(1);
    expect(result[0]?.chunkId).toBe("c1");
    expect(result[0]?.score).toBeCloseTo(1 / 61);
    expect(result[0]?.fromVector).toBe(false);
    expect(result[0]?.fromFts).toBe(true);
  });

  it("chunk in both lists at rank 1 each scores 2/(k+1)", () => {
    const vec = [makeVec("c1")];
    const fts = [makeFts("c1")];
    const result = reciprocalRankFusion(vec, fts, 5);

    expect(result).toHaveLength(1);
    expect(result[0]?.chunkId).toBe("c1");
    // 1/61 + 1/61 = 2/61
    expect(result[0]?.score).toBeCloseTo(2 / 61);
    expect(result[0]?.fromVector).toBe(true);
    expect(result[0]?.fromFts).toBe(true);
  });

  it("chunk in both lists scores higher than chunk in only one list", () => {
    // c1 in both; c2 only in vector; c3 only in fts
    const vec = [makeVec("c1"), makeVec("c2")];
    const fts = [makeFts("c1"), makeFts("c3")];
    const result = reciprocalRankFusion(vec, fts, 10);

    const c1 = result.find((r) => r.chunkId === "c1");
    const c2 = result.find((r) => r.chunkId === "c2");
    const c3 = result.find((r) => r.chunkId === "c3");

    expect(c1?.score).toBeGreaterThan(c2!.score);
    expect(c1?.score).toBeGreaterThan(c3!.score);
  });

  it("results are sorted descending by score", () => {
    // c1 at rank 1 in both → highest score
    // c2 at rank 2 in vec only
    // c3 at rank 1 in fts only → 1/61; c2 at rank 2 in vec → 1/62
    const vec = [makeVec("c1"), makeVec("c2")];
    const fts = [makeFts("c1"), makeFts("c3")];
    const result = reciprocalRankFusion(vec, fts, 10);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.score).toBeGreaterThanOrEqual(result[i + 1]!.score);
    }
  });

  it("truncates to topK", () => {
    const vec = [makeVec("c1"), makeVec("c2"), makeVec("c3"), makeVec("c4"), makeVec("c5")];
    const result = reciprocalRankFusion(vec, [], 3);
    expect(result).toHaveLength(3);
  });

  it("preserves page and section from vector hit", () => {
    const vec: VectorSearchResult[] = [
      {
        chunkId: "c1",
        documentId: "doc1",
        chunkText: "text",
        distance: 0.1,
        page: 42,
        section: "Chapter 3",
      },
    ];
    const result = reciprocalRankFusion(vec, [], 5);
    expect(result[0]?.page).toBe(42);
    expect(result[0]?.section).toBe("Chapter 3");
  });

  it("preserves page and section from fts hit when not in vector", () => {
    const fts: FtsSearchResult[] = [
      {
        chunkId: "c1",
        documentId: "doc1",
        chunkText: "text",
        score: -1.5,
        page: 7,
        section: "Intro",
      },
    ];
    const result = reciprocalRankFusion([], fts, 5);
    expect(result[0]?.page).toBe(7);
    expect(result[0]?.section).toBe("Intro");
  });

  it("correctly handles many chunks without page or section", () => {
    const vec = Array.from({ length: 20 }, (_, i) => makeVec(`c${i}`));
    const fts = Array.from({ length: 20 }, (_, i) => makeFts(`c${i + 10}`)); // overlap c10-c19
    const result = reciprocalRankFusion(vec, fts, 15);

    expect(result).toHaveLength(15);
    // All have fromVector or fromFts set
    for (const r of result) {
      expect(r.fromVector || r.fromFts).toBe(true);
    }
  });

  it("custom k value changes scores", () => {
    const vec = [makeVec("c1")];
    const result20 = reciprocalRankFusion(vec, [], 5, 20);
    const result60 = reciprocalRankFusion(vec, [], 5, 60);

    // k=20: 1/21 > k=60: 1/61
    expect(result20[0]!.score).toBeGreaterThan(result60[0]!.score);
  });
});
