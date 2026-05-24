---
id: epic-course-create-readiness-unified-landing-source-picker
kind: story
stage: review
tags: [ui, ingestion, course-authoring]
parent: epic-course-create-readiness-unified-landing
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Source picker UI shell + paste source + stepper rename

## Brief

Per the parent feature's Unit 1, implement the 3-tab source picker in
`/course-create` (Pack as landing tab, Upload with "create your own" tag,
Paste with ingestion path), the italic "Or —" alternative bar below the
tabs, the `?pack=<id>` URL contract for pre-selection, and the stepper
rename `Explore → Create`. Stepper rename is bundled here to avoid a file
conflict with the source-picker change (same file: `course-create.tsx`).

## Scope

### Source picker shell
- Add a 3-tab control to `/course-create.tsx` above the current attached-files
  area. Tab 1: **Pack** (landing); Tab 2: **Upload** (tagged `create your own`);
  Tab 3: **Paste**.
- Below the active tab, render an italic "Or — try [other A] · [other B]"
  bar; clicking either alternative switches the active tab.
- Reference mock:
  `.mockups/screens/epic-course-create-readiness-unified-landing-source-picker/index.html`
  (Option 4).

### Pack tab
- List canonical packs via `client.packs.list` (or equivalent — check the
  existing `/packs` route for the data source).
- Each row: pack name + short description + "Use this pack" CTA.
- Selecting a pack sets it as the attached source (visible in the
  attached-files list area below the picker).

### Upload tab
- Preserve existing drop-zone + file browse behavior (already implemented
  in `course-create.tsx`).
- Add the `create your own` tag/label to the tab itself.

### Paste tab
- Textarea + "Add as source" button.
- On submit: create a Document via the existing ingestion path
  (`client.ingest.start` or equivalent). Content type: `text/plain`.
  Document filename: prompt the user OR auto-generate (`Pasted notes (date)`).
- The new Document appears in the attached-files list, identical to an
  uploaded `.txt`.

### URL contract
- `/course-create?pack=<packId>` pre-selects the Pack tab on mount and
  pre-attaches that pack as source.
- Use TanStack Router search params (typed if possible).

### Stepper rename
- `course-create.tsx:139` — change `Explore` → `Create` so the stepper
  reads `Material · Create · Confirm · Open`.

## Acceptance Criteria

- [ ] 3 tabs render with Pack as the landing (active) tab on first load.
- [ ] Upload tab carries a `create your own` label/tag.
- [ ] "Or —" bar shows the OTHER two source options and switches tabs on
  click.
- [ ] Pack tab lists packs and supports selection → pre-attached source.
- [ ] Paste tab creates a Document via ingestion; appears in attached-files
  list with content type `text/plain`.
- [ ] `/course-create?pack=<id>` pre-selects Pack tab and pre-attaches the
  pack.
- [ ] Stepper reads `Material · Create · Confirm · Open`.
- [ ] UI tests cover: tab switching via the Or-bar, paste-creates-document,
  URL param pre-selection, stepper label.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- Read `packages/ui/src/routes/course-create.tsx` first to understand the
  current shape — the route already has attached-files plumbing, context
  textarea, and the 4-step stepper.
- Read `packages/ui/src/routes/packs.tsx` for the existing pack list
  shape; extracting a reusable `<PackList>` here would also help the
  packs-into-library story (separate story; coordinate via imports rather
  than parallel edits to the same file).
- For Paste → ingest: check `packages/ui/src/hooks/use-ingestion.ts` and
  the IPC for `client.ingest.start` — there should be an entry point that
  accepts raw text content, or that can be adapted by writing the content
  to a temp file before ingestion.
- Pack id contract: check `client.packs.list` return shape to see what
  `id` field to use in the URL param.

## Out of scope

- Bypass-route rerouting (separate story).
- Onboarding slim-down (separate story).
- /packs route removal (separate story).

## Implementation notes

### Tab shell location
`packages/ui/src/components/source-picker.tsx` — new `SourcePicker` component with
`PackPane` / `UploadPane` / `PastePane` sub-components.
CSS module: `packages/ui/src/components/source-picker.module.css`.
Imported and wired into `packages/ui/src/routes/course-create.tsx`.

### Pack id format chosen
`PackSummaryClient.id` is a dotted string e.g. `"math.algebra-1"` (the canonical
pack slug from the pack JSON manifest). The URL param contract is
`/course-create?pack=math.algebra-1`. Sibling stories (bypass-reroute,
onboarding-slim) should use this exact id format when constructing `?pack=` URLs.

### URL contract validation location
`packages/ui/src/router.tsx` — `courseCreateRoute` definition now includes:
```ts
validateSearch: z.object({ pack: z.string().optional() })
```
`z` imported at the top of router.tsx. The search param is read in
`course-create.tsx` via `useSearch({ strict: false })`.

### Paste-to-ingest approach
Paste content cannot be written by the renderer process directly (Electron
sandboxing). The approach chosen: **temp file via main process IPC**.

- New method added to `IngestionClient` interface:
  `packages/core/src/types/ingestion.ts` — `writeTempText(content, filename): Promise<string>`
- IPC handler registered in:
  `packages/desktop/electron/main/ingest-channel.ts` — `praxis.ingest.writeTempText`
  writes content to `os.tmpdir()/<sanitized-filename>` and returns the absolute path.
- Client implementation in:
  `packages/client/src/services/ingest-client.ts` — `writeTempText()` wraps the IPC invoke.
- The UI calls `client.ingest.writeTempText(text, filename)` then passes the returned
  path to `ingestion.startBatchWithPaths([tmpPath])` — normal batch ingestion path from
  there. Filename: `"Pasted notes (YYYY-MM-DD).txt"`.

### Stepper rename location
`packages/ui/src/routes/course-create.tsx` — the `<span>Explore</span>` at the former
line 142 is now `<span className={styles.stepPending}>Create</span>`. Stepper now reads
`Material · Create · Confirm · Open`.

### Test coverage
- `packages/ui/src/__tests__/source-picker.test.tsx` — 17 tests covering:
  tab defaults, tab switching, Or-bar content + switching, pack selection,
  paste submission, empty/loading/error states.
- `packages/ui/src/__tests__/course-create-source-picker.test.tsx` — 9 tests covering:
  stepper label, Pack landing tab, URL param pre-selection (match / absent / unknown),
  paste workflow (writeTempText called + source appears), Or-bar tab switching.
- `packages/ui/src/__tests__/course-create-route.test.tsx` — 7 existing tests updated:
  added `useSearch` mock, `packs` mock, `writeTempText` mock; upload-tab tests now
  switch to Upload tab before clicking "browse files".

### Verification
`pnpm typecheck && pnpm test` — all 4674 tests pass; typecheck clean.
Lint: our changed files clean; existing pre-existing errors in `.mockups/` and
`packages/claude-cli-sdk/` are not introduced by this story.
