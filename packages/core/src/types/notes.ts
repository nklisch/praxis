/**
 * A selection-anchored annotation on a note body.
 *
 * `rangeStart`/`rangeEnd` are character-offset indices into the note body
 * string. `rangeStart < rangeEnd`, both non-negative.
 * `severity` distinguishes light highlights ("soft") from load-bearing
 * annotations the editor should not silently discard ("load_bearing").
 *
 * NOTE: Re-anchoring when the note body changes is out of scope for v1 — callers
 * must be aware that offsets may become stale after a body update.
 */
export interface Annotation {
  rangeStart: number;
  rangeEnd: number;
  text: string;
  severity: "soft" | "load_bearing";
}

/**
 * Phase 12: NoteBody — discriminated union over the four supported text formats.
 * Phase 15a adds "sketch" (tldraw snapshot stored as opaque JSON).
 *
 * Each value field can contain markdown — the type enforces structure (which
 * region holds what), not content format. Students write naturally in any region.
 */

export type NoteBody =
  | { kind: "cornell"; questions: string[]; details: string[]; summary: string }
  | { kind: "feynman"; explanation: string; followUps: string[] }
  | { kind: "outline"; root: OutlineNode }
  | { kind: "free"; text: string }
  /** Phase 15a: tldraw snapshot. `snapshot` is opaque JSON from `editor.getSnapshot()`. */
  | { kind: "sketch"; snapshot: unknown };

/** Recursive outline node. Leaves have no children (empty array). */
export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

/**
 * Parse a JSON-encoded NoteBody string from the DB `notes.body` column.
 * `format` tells us which shape to expect for validation.
 * Throws on malformed JSON or format/body kind mismatch.
 */
export function parseNoteBody(
  format: "cornell" | "feynman" | "outline" | "free" | "sketch",
  bodyJson: string | null | undefined,
): NoteBody {
  if (bodyJson == null) {
    throw new Error(`parseNoteBody: body is null/undefined for format '${format}'`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns unknown; validated below
  let parsed: any;
  try {
    parsed = JSON.parse(bodyJson);
  } catch {
    throw new Error(`parseNoteBody: invalid JSON for format '${format}': ${bodyJson.slice(0, 60)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`parseNoteBody: expected object, got ${typeof parsed}`);
  }

  const kind = parsed.kind as string | undefined;

  switch (format) {
    case "cornell": {
      if (kind !== "cornell") {
        throw new Error(`Note format 'cornell' does not match body kind '${kind}'`);
      }
      if (
        !Array.isArray(parsed.questions) ||
        !Array.isArray(parsed.details) ||
        typeof parsed.summary !== "string"
      ) {
        throw new Error(
          "parseNoteBody: cornell body missing required fields (questions, details, summary)",
        );
      }
      return {
        kind: "cornell",
        questions: parsed.questions as string[],
        details: parsed.details as string[],
        summary: parsed.summary,
      };
    }
    case "feynman": {
      if (kind !== "feynman") {
        throw new Error(`Note format 'feynman' does not match body kind '${kind}'`);
      }
      if (typeof parsed.explanation !== "string" || !Array.isArray(parsed.followUps)) {
        throw new Error(
          "parseNoteBody: feynman body missing required fields (explanation, followUps)",
        );
      }
      return {
        kind: "feynman",
        explanation: parsed.explanation,
        followUps: parsed.followUps as string[],
      };
    }
    case "outline": {
      if (kind !== "outline") {
        throw new Error(`Note format 'outline' does not match body kind '${kind}'`);
      }
      if (typeof parsed.root !== "object" || parsed.root === null) {
        throw new Error("parseNoteBody: outline body missing required field 'root'");
      }
      return {
        kind: "outline",
        root: parseOutlineNode(parsed.root),
      };
    }
    case "free": {
      if (kind !== "free") {
        throw new Error(`Note format 'free' does not match body kind '${kind}'`);
      }
      if (typeof parsed.text !== "string") {
        throw new Error("parseNoteBody: free body missing required field 'text'");
      }
      return { kind: "free", text: parsed.text };
    }
    case "sketch": {
      // Phase 15a: snapshot is opaque tldraw JSON — we just pass it through.
      return { kind: "sketch", snapshot: parsed.snapshot ?? parsed };
    }
    default: {
      // Exhaustiveness guard.
      const _exhaust: never = format;
      throw new Error(`parseNoteBody: unknown format '${_exhaust}'`);
    }
  }
}

function parseOutlineNode(raw: unknown): OutlineNode {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("parseNoteBody: outline node must be an object");
  }
  // biome-ignore lint/suspicious/noExplicitAny: raw JSON input
  const node = raw as any;
  if (typeof node.text !== "string") {
    throw new Error("parseNoteBody: outline node missing 'text' field");
  }
  const children: OutlineNode[] = Array.isArray(node.children)
    ? node.children.map(parseOutlineNode)
    : [];
  return { text: node.text as string, children };
}

/**
 * Serialize a NoteBody to a JSON string for storage in the DB `notes.body` column.
 */
export function serializeNoteBody(body: NoteBody): string {
  return JSON.stringify(body);
}
