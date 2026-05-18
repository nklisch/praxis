import type { FlashcardLibraryHit, LibraryHit, NoteLibraryHit } from "@praxis/core/types";
import styles from "./artifact-card.module.css";

// ── Format metadata ───────────────────────────────────────────────────────────

const FORMAT_META: Record<string, { label: string; glyph: string }> = {
  cornell: { label: "cornell note", glyph: "¶" },
  feynman: { label: "feynman note", glyph: "¶" },
  outline: { label: "outline", glyph: "¶" },
  free: { label: "free note", glyph: "¶" },
  sketch: { label: "sketch", glyph: "‡" },
};

function formatMeta(format: string): { label: string; glyph: string } {
  return FORMAT_META[format] ?? { label: format, glyph: "¶" };
}

// ── Age helper ────────────────────────────────────────────────────────────────

function relativeAge(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  const weeks = Math.floor(diffD / 7);
  return weeks === 1 ? "a week ago" : `${weeks}w ago`;
}

// ── Body parsing helpers ──────────────────────────────────────────────────────

interface NoteParts {
  title: string;
  excerpt: string;
  isSketch: boolean;
  sketchSnapshot: unknown;
}

function extractNoteParts(hit: NoteLibraryHit): NoteParts {
  if (!hit.body) {
    return { title: "(untitled)", excerpt: "", isSketch: false, sketchSnapshot: null };
  }

  try {
    // biome-ignore lint/suspicious/noExplicitAny: parsing opaque JSON body
    const parsed = JSON.parse(hit.body) as any;
    const kind: string = parsed?.kind ?? hit.format;

    switch (kind) {
      case "free": {
        const text: string = parsed.text ?? "";
        const lines = text.split("\n").filter((l: string) => l.trim());
        const title = lines[0]?.slice(0, 80) ?? "(untitled)";
        const excerpt = lines.slice(1, 4).join(" ").slice(0, 200);
        return { title, excerpt, isSketch: false, sketchSnapshot: null };
      }
      case "cornell": {
        const q: string = parsed.questions?.[0] ?? "";
        const d: string = parsed.details?.[0] ?? "";
        return {
          title: q.slice(0, 80) || "(untitled)",
          excerpt: d.slice(0, 200),
          isSketch: false,
          sketchSnapshot: null,
        };
      }
      case "feynman": {
        const exp: string = parsed.explanation ?? "";
        const lines = exp.split("\n").filter((l: string) => l.trim());
        const title = lines[0]?.slice(0, 80) ?? "(untitled)";
        const excerpt = lines.slice(1, 4).join(" ").slice(0, 200);
        return { title, excerpt, isSketch: false, sketchSnapshot: null };
      }
      case "outline": {
        const rootText: string = parsed.root?.text ?? "";
        const childText: string = (parsed.root?.children ?? [])
          .map((c: { text?: string }) => c.text ?? "")
          .filter(Boolean)
          .slice(0, 3)
          .join(" · ");
        return {
          title: rootText.slice(0, 80) || "(untitled)",
          excerpt: childText.slice(0, 200),
          isSketch: false,
          sketchSnapshot: null,
        };
      }
      case "sketch": {
        return {
          title: "Sketch",
          excerpt: "",
          isSketch: true,
          sketchSnapshot: parsed.snapshot ?? null,
        };
      }
      default: {
        return {
          title: "(untitled)",
          excerpt: hit.body.slice(0, 100),
          isSketch: false,
          sketchSnapshot: null,
        };
      }
    }
  } catch {
    return {
      title: "(untitled)",
      excerpt: hit.body.slice(0, 100),
      isSketch: false,
      sketchSnapshot: null,
    };
  }
}

// ── ArtifactCard ──────────────────────────────────────────────────────────────

interface ArtifactCardProps {
  hit: LibraryHit;
  onClick: () => void;
}

/**
 * Discriminated artifact card for the Catalogue grid.
 * - kind === "note"      → format kicker + italic title + excerpt (or sketch preview)
 * - kind === "flashcard" → kicker + Q (title) + A snippet
 */
export function ArtifactCard({ hit, onClick }: ArtifactCardProps) {
  if (hit.kind === "note") return <NoteCard hit={hit} onClick={onClick} />;
  return <FlashcardCard hit={hit} onClick={onClick} />;
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ hit, onClick }: { hit: NoteLibraryHit; onClick: () => void }) {
  const { label, glyph } = formatMeta(hit.format);
  const { title, excerpt, isSketch } = extractNoteParts(hit);
  const age = relativeAge(hit.updatedAt);

  // Build tag chips: we surface format + orphan status
  // biome-ignore lint/suspicious/noExplicitAny: linksJson from DB
  const links = (hit.linksJson as any[]) ?? [];
  // biome-ignore lint/suspicious/noExplicitAny: ArtifactRef
  const isOrphan = !links.some((l: any) => l && l.kind === "course");
  const tags: string[] = [];
  if (isOrphan) tags.push("orphan");

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.headRow}>
        <span className={styles.headGlyph} aria-hidden="true">
          {glyph}
        </span>
        {label}
        <span className={styles.when}>{age}</span>
      </div>

      <div className={styles.title}>{title}</div>

      {isSketch ? (
        <div className={styles.sketchPreview} role="img" aria-label="Sketch preview">
          sketch
        </div>
      ) : (
        excerpt && <div className={styles.excerpt}>{excerpt}</div>
      )}

      {tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── FlashcardCard ─────────────────────────────────────────────────────────────

function FlashcardCard({ hit, onClick }: { hit: FlashcardLibraryHit; onClick: () => void }) {
  const isDue = hit.nextReviewAt !== null && hit.nextReviewAt <= Date.now();
  const tags: string[] = [];
  if (isDue) tags.push("due today");
  if (!hit.conceptId) tags.push("orphan");

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.headRow}>
        <span className={styles.headGlyph} aria-hidden="true">
          ‖
        </span>
        flashcard
      </div>

      <div className={styles.title}>{hit.front.slice(0, 120)}</div>

      <div className={styles.answer}>
        <span aria-hidden="true">A.</span> {hit.back.slice(0, 160)}
      </div>

      {tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
