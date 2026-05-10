---
id: feature-chat-markdown-and-code-rendering
kind: feature
stage: drafting
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Chat: render markdown, code, and inline math in tutor messages

## Brief

Tutor messages currently render as raw text inside a single `<p>`. The model
routinely produces markdown — bullet lists, bold/italic, headings, inline
backticks, fenced code blocks, links, and inline math (`$x^2$` / `\(x^2\)`) —
and the student sees it un-parsed. Code fences appear as literal triple-tick
blobs, lists collapse into prose, and math equations render as raw LaTeX
source. This is one of the most visible quality gaps in the chat surface.

The feature replaces `renderContentWithCitations` in
`packages/ui/src/components/message.tsx` (the function returns
`<p className={styles.content}>{content}</p>` today) with a markdown pipeline
that handles:

- **Markdown** — paragraphs, lists, bold/italic, links, headings, blockquotes,
  inline `code`
- **Fenced code blocks** — language-tagged, syntax-highlighted, monospace,
  scrollable; copy-to-clipboard affordance acceptable but not required
- **Inline + block math** — render `$...$` / `$$...$$` (and `\(...\)` /
  `\[...\]`) via a math typesetter
- **Citation chips** — preserve the existing `[N]` chip behavior (the new
  pipeline must not eat or escape `[1]` markers; today's regex extraction
  needs to compose with markdown parsing, not fight it)
- **Streaming** — must keep working with `useEasedStream` so partial markdown
  doesn't flicker into a half-parsed state mid-stream (e.g., a half-closed
  code fence shouldn't render as a giant fence then collapse)

The feature must hold the editorial constraints from `docs/VISION.md` —
restrained typography, no badges, no decorative iconography. The rendered
output should look like reading a textbook page, not a chat app.

The design phase picks the markdown library, the syntax highlighter, the math
renderer, and resolves the streaming-vs-partial-parse strategy. Candidates
worth evaluating: `react-markdown` + `remark-gfm` + `remark-math` +
`rehype-katex` + `rehype-highlight` (or `shiki`) — but the design phase owns
the call after weighing bundle size, SSR/Electron compatibility, and
token-stream reparse cost.

## Source

Promoted from `idea-chat-markdown-and-code-formatting` (parked 2026-05-09).
