import type { ConceptGraphId, ConceptId } from "./ids.js";

export interface ConceptGraph {
  id: ConceptGraphId;
  source: "canonical" | "extracted" | "hybrid";
  standardsRef?: { body: string; version: string };
  concepts: Concept[];
  edges: PrerequisiteEdge[];
}

export interface Concept {
  id: ConceptId;
  graphId: ConceptGraphId;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
  /**
   * Optional vector embedding for cross-graph linking.
   * NOT persisted in Phase 1 schema — sqlite-vec virtual tables land in Phase 5.
   * Type field exists for forward compatibility.
   */
  embedding?: number[];
}

export interface PrerequisiteEdge {
  fromId: ConceptId;
  toId: ConceptId;
  strength: number; // 0..1
  source: "canonical" | "extracted" | "manual";
}

// Note: Citation is exported from common.ts via the types/index.ts barrel.
