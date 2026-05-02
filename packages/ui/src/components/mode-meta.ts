/**
 * Editorial metadata for each session mode. The chat header reads from this
 * SSOT so adding a new mode is one entry, not three files.
 *
 * Glyphs are real Unicode typographic marks (section sign, pilcrow, dagger,
 * floral heart, asterism) — they render in any installed serif and carry
 * editorial weight that emoji/icons cannot.
 */

export interface ModeMeta {
  /** Lowercase display name shown in the italic serif (e.g. "teach"). */
  readonly name: string;
  /** Italic deck line shown beneath the name. May be empty for the unknown case. */
  readonly deck: string;
  /** Single typographic ornament rendered in the display serif. */
  readonly ornament: string;
  /**
   * CSS color string used as the mode's tint — a hairline rule, ornament fill,
   * 4% header gradient, and hover accent. Kept whisper-faint by design.
   */
  readonly tint: string;
}

const META: Record<string, ModeMeta> = {
  teach: {
    name: "teach",
    deck: "a guided lesson",
    ornament: "§",
    tint: "#d4a373",
  },
  bootstrap: {
    name: "bootstrap",
    deck: "shaping a new course together",
    ornament: "¶",
    tint: "#a3b18a",
  },
  quiz: {
    name: "quiz",
    deck: "a brief check of understanding",
    ornament: "‡",
    tint: "#8d99ae",
  },
  homework: {
    name: "homework",
    deck: "practice set in progress",
    ornament: "❦",
    tint: "#6b7ef8",
  },
  exam: {
    name: "exam",
    deck: "in progress — the chat is muted until you submit",
    ornament: "†",
    tint: "#c1666b",
  },
  configure: {
    name: "configure",
    deck: "tending the course",
    ornament: "⁂",
    tint: "#9b9b9b",
  },
};

const UNKNOWN: ModeMeta = {
  name: "session",
  deck: "",
  ornament: "·",
  tint: "#888888",
};

export function getModeMeta(modeId: string | undefined | null): ModeMeta {
  if (!modeId) return UNKNOWN;
  return META[modeId] ?? UNKNOWN;
}
