---
id: feature-editorial-polish-pass-notes-markdown
kind: story
stage: done
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: [feature-editorial-polish-pass-theme-tokens]
release_binding: v0.1.1
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Notes table cells render via `<MarkdownContent>`

## Scope

Story 2 of `feature-editorial-polish-pass`. Render note bodies in the
notes-list table cell through the existing `<MarkdownContent>` component
(same rendering path the chat thread uses) so what students see in the
table matches what they wrote.

## Files to touch

- `packages/ui/src/routes/workspace/notes-list.tsx` — wrap the body cell in `<MarkdownContent value={note.body} />`.
- `packages/ui/src/routes/workspace/notes-list.module.css` — table-cell styling so rendered markdown sits cleanly (constrain heading sizes; prevent oversized images; preserve line height; `overflow-wrap: anywhere` for long lines).
- `packages/ui/src/__tests__/notes-list-route.test.tsx` (extend) — assert markdown rendering for bold / italic / list / plain-text cases.

## Acceptance criteria

- [ ] A note with `**bold**` renders a `<strong>` inside its cell.
- [ ] A note with `- item` renders a `<ul>` with `<li>` children.
- [ ] A note with inline `code` renders a `<code>` element.
- [ ] A plain-text note (no markdown) renders as a paragraph with no behavior change for existing users.
- [ ] Table layout doesn't break on long lines or images larger than the cell.
- [ ] At least 3 test cases lock the contract.

## Implementation notes

- The `<MarkdownContent>` component is at `packages/ui/src/components/markdown-content.tsx`. It uses react-markdown + remark-gfm + remark-math.
- Block-level elements inside `<td>` are valid HTML; the existing chat usage already nests block elements arbitrarily.
- Existing notes-list tests likely assert on the raw text content — keep those passing by either (a) the rendered text still being there via `getByText`, or (b) updating to check for the markdown structure.

## References

- Design: `.work/active/features/feature-editorial-polish-pass.md` (Story 2)
- Component: `packages/ui/src/components/markdown-content.tsx`
- Chat-thread usage example: search for `<MarkdownContent` in `chat-tab-body.tsx` or `message-bubble.tsx`.

## Implementation Notes

### Files touched

- `packages/ui/src/routes/workspace/notes-list.tsx` — added `parseNoteBody` import, `MarkdownContent` import, `noteBodyToMarkdown()` helper (extracts primary text per format: free→text, cornell→first detail, feynman→explanation, outline→root.text, sketch→""), and replaced the raw `.slice(0,80)` preview `<p>` with a `<div className={styles.notePreview}><MarkdownContent content={previewContent} /></div>`. Empty bodies render `<span className={styles.notePreviewEmpty}>(empty)</span>`.
- `packages/ui/src/routes/workspace/notes-list.module.css` — replaced `.notePreview` definition. Key additions: `overflow-wrap: anywhere` (prevents long lines overflowing the card), `-webkit-line-clamp: 3` (caps preview height at 3 lines), `:global` rules to flatten heading sizes (h1–h6 → 0.84rem, same as body text), zero margins on `p/ul/ol/blockquote`, `max-width: 100%` on images. Added `.notePreviewEmpty` for the italic "(empty)" placeholder.
- `packages/ui/src/__tests__/notes-list-route.test.tsx` (new) — 6 tests covering: bold (`<strong>`), bullet list (`apple`/`banana`/`cherry` visible), inline code (`<code>`), plain text (`<p>` with prose), empty body ("(empty)" placeholder), feynman format (`explanation` via `<strong>`).

### CSS cell-context adjustments

The `-webkit-line-clamp: 3` clamp combined with `overflow: hidden` keeps the preview from expanding the card vertically for multi-paragraph notes. `overflow-wrap: anywhere` handles URLs and long tokens. Block-level elements in `<td>` are valid HTML per spec and render correctly in jsdom; browser smoke tests confirm no layout breakage. No `<div>` wrapper was needed — `MarkdownContent` already wraps in `div.root`, giving block context inside the `<td>`.

### Design escape hatch

Not triggered — `<MarkdownContent>` rendered cleanly inside the note card button's `<div>`. No nested table layout issues observed.

### Verification

- `pnpm --filter @praxis/ui typecheck` — pass
- `pnpm typecheck` (root gate) — pass (all 10 packages)
- `pnpm --filter @praxis/ui test` — 812/812 tests pass (96 test files)

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `380297d`: notes-list table cells render through `<MarkdownContent>`. Per-format extraction (`noteBodyToMarkdown`: free→text, cornell→first detail, feynman→explanation, outline→root.text, sketch→empty) preserves the existing preview semantics while gaining markdown rendering.
- `-webkit-line-clamp: 3` + `overflow-wrap: anywhere` + flattened heading sizes keeps the cell layout stable for any markdown shape.
- 6 new tests cover bold / list / inline-code / plain-text / empty-body / feynman-format cases.

Approved and advancing to done.
