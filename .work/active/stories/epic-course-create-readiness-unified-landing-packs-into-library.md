---
id: epic-course-create-readiness-unified-landing-packs-into-library
kind: story
stage: implementing
tags: [ui, refactor, navigation]
parent: epic-course-create-readiness-unified-landing
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# /packs into Library + remove top-level route

## Brief

Per the parent feature's design decision, fold `/packs` into the Library
route as a section and remove the top-level `/packs` route. The
pack-picker inside `/course-create` (see sibling story
`epic-course-create-readiness-unified-landing-source-picker`) is the
primary source path for "use this pack"; the Library section is the
browse-and-discover surface.

## Scope

1. **Extract `<PacksSection>`** from `packages/ui/src/routes/packs.tsx`'s
   current content. Place in `packages/ui/src/components/library/packs-section.tsx`
   following the existing library section pattern (see
   `documents-section.tsx`).
2. **Add `<PacksSection>` to the Library route** at
   `packages/ui/src/routes/library.tsx`. Place per the library's section
   ordering convention (see other sections for examples).
3. **Remove the top-level `/packs` route** from
   `packages/ui/src/router.tsx:155`. Add a redirect from `/packs` to
   `/library` for backward compatibility with external links.
4. **Audit inbound links to `/packs`** — search the codebase for
   `to="/packs"`, `navigate("/packs")`, `href="/packs"`, and update each
   to point at `/library` (the Library section anchor, if a fragment-id
   anchor exists; otherwise just the page).
5. **Delete `packages/ui/src/routes/packs.tsx`** once all references are
   gone.

## Acceptance Criteria

- [ ] Library route shows a Packs section listing canonical packs.
- [ ] `/packs` redirects to `/library` (or 404s cleanly with a meaningful
  message — pick redirect for backward-compat).
- [ ] All inbound links to `/packs` updated (verified via codebase search).
- [ ] `packs.tsx` route file deleted.
- [ ] Top-nav references to `/packs` (if any) updated.
- [ ] UI tests cover: Library renders the new section; navigating to
  `/packs` redirects appropriately.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- File-overlap caveat: the sibling story `*-source-picker` may also want
  to consume a `<PackList>` component. If so, design the extracted
  `<PacksSection>` so its inner list is a reusable `<PackList>`
  primitive shared between Library and the course-create source picker.
  Coordinate via the export, not parallel edits.
- The `router.tsx:155` line is approximate — confirm by reading the file.

## Out of scope

- Source-picker UI work (separate story).
- Bypass-route rerouting (separate story).
- Any changes to the pack data source / IPC.
