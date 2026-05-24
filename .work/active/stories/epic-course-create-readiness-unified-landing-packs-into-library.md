---
id: epic-course-create-readiness-unified-landing-packs-into-library
kind: story
stage: done
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

## Implementation notes

**PacksSection location**: `packages/ui/src/components/library/packs-section.tsx` — already existed (pre-built by sibling story tooling). The component accepts `packs`, `loading`, `onUsePack`, and `importing` props; renders via `LibrarySection` with the `¶` ornament and `PACKS` kicker.

**Library section placement**: `PacksSection` is rendered below the footer row in `packages/ui/src/routes/library.tsx`. The `handleUsePack` callback (which was already wired but suppressed with `void`) is now passed as `onUsePack`. The `importing` state is passed through. The packs data comes from `useLibrary()`'s `data?.packs`.

**Redirect setup**: `packages/ui/src/router.tsx` lines 153–159 — `packsRedirect` route was already in place (a `beforeLoad: () => { throw redirect({ to: "/library" }) }` route at path `/packs`). No changes needed; it was correctly implemented.

**Inbound links audit**: Searched for `to="/packs"`, `navigate("/packs")`, `href="/packs"` across all `.tsx`/`.ts` files. No inbound navigation links found — the only `/packs` reference was the redirect itself in `router.tsx` (which is correct to keep).

**packs.tsx deletion**: `packages/ui/src/routes/packs.tsx` deleted. `packages/ui/src/routes/packs.module.css` also deleted (no longer needed).

**Tests**: `packages/ui/src/__tests__/packs-route.test.tsx` replaced with `packages/ui/src/__tests__/packs-section.test.tsx`. The new test exercises `PacksSection` directly as a prop-driven component (no client needed): PACKS kicker, loading state, empty state (empty array and undefined), pack name/deck render, "Use this pack" button calls `onUsePack`, "Imported" badge for imported packs, disabled state while importing, and multi-pack rendering.

**Zod dependency**: The sibling story (`source-picker`) added `import { z } from "zod"` and `validateSearch` to `router.tsx` but did not add `zod` to `packages/ui/package.json`. Added `"zod": "4.3.6"` to fix the typecheck failure.

**Verification**: `pnpm typecheck && pnpm test` both green. 158 test files, 1637 tests all pass. Lint errors are pre-existing in `.mockups/` HTML files and other unchanged source files — none in changed files.

## Review (2026-05-23)

**Verdict**: Approve

Clean refactor. PacksSection extracted, Library route updated, top-level
/packs route replaced with redirect, packs.tsx + packs.module.css deleted.
Inbound-link audit confirmed zero links to /packs outside the redirect.
Old packs-route test replaced with PacksSection prop-driven tests (10
covering all states). Zod dependency proactively added to packages/ui to
support the sibling source-picker story's validateSearch — good cross-
agent coordination during parallel execution.

**Blockers**: none
**Important**: none
**Nits**: none
