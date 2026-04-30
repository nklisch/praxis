import type { ConceptGraphId } from "@praxis/core/types";

/** Pack manifest — the JSON file shape. */
export interface PackManifest {
  /** Stable id, e.g., "algebra-1". */
  id: string;
  /** Semver-compatible version; new versions create new conceptGraphIds. */
  version: string;
  /** Display name. */
  name: string;
  /** Subject id used for bootstrap-mode auto-detect, e.g., "math.algebra-1". */
  subject: string;
  /** Grade level — `GradeBand`. */
  gradeLevel: string;
  /** Optional standards reference. */
  standardsRef?: { body: string; version: string };
  /** Authoring metadata. */
  authoredBy: string;
  /** ISO-8601 date the pack was last modified in source. */
  authoredAt: string;
  /** Concepts in the pack — ordered by intended teaching sequence. */
  concepts: PackConcept[];
  /** Prerequisite edges. */
  edges: PackEdge[];
}

export interface PackConcept {
  /** Stable concept id, e.g., "algebra-1.linear-equations". Stable across pack versions. */
  id: string;
  name: string;
  description: string;
  aliases: string[];
  /** CCSS or other standards tags, e.g., ["CCSS.Math.Content.HSA-CED.A.1"]. */
  standardsTags: string[];
}

export interface PackEdge {
  /** Concept id of the prerequisite. */
  fromId: string;
  /** Concept id of the dependent. */
  toId: string;
  /** 0..1; how strongly fromId is required for toId. */
  strength: number;
}

/** Compact summary used by the agent / UI for pack picker. */
export interface PackSummary {
  id: string;
  version: string;
  name: string;
  subject: string;
  gradeLevel: string;
  conceptCount: number;
  edgeCount: number;
  /** True when this pack version has been imported on the current install. */
  imported: boolean;
}

/** Record of an imported pack. Persisted in pack_imports table. */
export interface ImportedPack {
  packId: string;
  version: string;
  conceptGraphId: ConceptGraphId;
  importedAt: number;
}
