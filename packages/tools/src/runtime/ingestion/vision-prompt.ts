/**
 * The prompt sent to the configured engine's vision capability for each PDF
 * page during VisionPdfIngestor. Extracted to its own file so changes are
 * reviewable in one diff and the prompt can be customized later (e.g., per
 * subject pack) without touching the ingestor.
 *
 * Output target: Markdown with LaTeX math, code fences, image placeholders,
 * and proper tables. The chunker downstream relies on `#`/`##`/`###`
 * headings for section boundaries.
 */
export const VISION_PROMPT = `Extract all content from this page of a document. Output as Markdown.

Formatting rules (follow exactly):
- Use # / ## / ### / #### for headings, preserving the page's heading hierarchy.
- Use $$ ... $$ for display math equations (LaTeX).
- Use $ ... $ for inline math.
- Use Markdown table syntax for tables (| col | col | format with --- separator row).
- Use triple-backtick code fences for code blocks. Include the language if recognizable (e.g., \`\`\`python).
- For figures, diagrams, or images, emit a placeholder line:
    ![Figure: brief one-sentence description of what the figure depicts]
  Be specific (e.g., "Figure: bar chart comparing quarterly sales", not "Figure: a chart").
- Preserve numbered and bulleted lists as Markdown lists.
- Preserve paragraph structure with blank lines between paragraphs.

Skip noise (do NOT include in output):
- Page numbers
- Running headers and footers
- Watermarks
- Decorative borders or pure-style elements

Edge cases:
- If the page is blank or contains only decorative elements, output exactly: [BLANK PAGE]
- If the page contains only images with no extractable text content, output the figure placeholder(s) only.
- If you cannot read part of the page (low-quality scan, damage, etc.), use [UNREADABLE] in place of the unreadable section.

Output ONLY the Markdown content. No preamble. No explanation. No acknowledgment of the task.`;
