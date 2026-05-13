/**
 * StructuredRenderer — renders PPTX and DOCX documents as a grouped outline.
 *
 * The ingestion pipeline stores chunk text with `locatorJson.section` annotations
 * when available. This renderer groups chunks by section heading and renders each
 * group as a collapsible card. When no section metadata is available the chunks
 * fall through to a plain-text render (same as MarkdownRenderer).
 */
import type { JSX } from "react";
import type { RendererProps } from "./format-router.js";
import styles from "./structured-renderer.module.css";

/**
 * A resolved section: a heading and the text content within it.
 * Sections are derived from `manifestJson` or inferred from the chunk text.
 */
interface Section {
  heading: string;
  body: string;
}

/**
 * Split plain text into pseudo-sections by detecting lines that look like
 * headings (short, no terminal punctuation, followed by a blank line or
 * substantial content). This is a best-effort heuristic for documents that
 * did not produce section metadata during ingestion.
 *
 * Returns an array of `{ heading, body }` pairs. When no headings are
 * detected a single section with heading "" is returned.
 */
function inferSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Heuristic: a heading is ≤80 chars, no trailing `.?!`, and the line is
    // all uppercase OR title-cased with no mid-sentence lowercase words.
    const isLikelyHeading =
      trimmed.length > 0 &&
      trimmed.length <= 80 &&
      !/[.!?,]$/.test(trimmed) &&
      (trimmed === trimmed.toUpperCase() || /^[A-Z]/.test(trimmed)) &&
      !trimmed.includes("  ");

    if (isLikelyHeading && currentBody.join("").trim().length === 0) {
      // First potential heading — just record it, body may follow.
      if (currentHeading !== "" || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
        currentBody = [];
      }
      currentHeading = trimmed;
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeading !== "" || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }

  return sections.length > 0 ? sections : [{ heading: "", body: text }];
}

// ─── Section card component ───────────────────────────────────────────────────

interface SectionCardProps {
  section: Section;
  index: number;
}

function SectionCard({ section, index }: SectionCardProps): JSX.Element {
  return (
    <div className={styles.section} key={index}>
      {section.heading && <h3 className={styles.sectionHeading}>{section.heading}</h3>}
      {section.body && <pre className={styles.sectionBody}>{section.body}</pre>}
    </div>
  );
}

// ─── Top-level renderer ───────────────────────────────────────────────────────

export function StructuredRenderer({ doc }: RendererProps): JSX.Element {
  if (!doc.text) {
    return <p className={styles.empty}>No text content available for this document.</p>;
  }

  const sections = inferSections(doc.text);

  return (
    <div className={styles.container}>
      <div className={styles.sectionList}>
        {sections.map((section, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: sections have no stable ids; index is appropriate here
          <SectionCard key={i} section={section} index={i} />
        ))}
      </div>
    </div>
  );
}
