---
id: feature-editorial-polish-pass-notes-markdown
kind: story
stage: implementing
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: [feature-editorial-polish-pass-theme-tokens]
release_binding: null
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

<!-- Implementation Notes accumulate here as work progresses. -->
