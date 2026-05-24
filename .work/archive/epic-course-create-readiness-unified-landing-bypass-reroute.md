---
id: epic-course-create-readiness-unified-landing-bypass-reroute
kind: story
stage: done
tags: [ui, navigation, course-authoring]
parent: epic-course-create-readiness-unified-landing
depends_on: [epic-course-create-readiness-unified-landing-source-picker]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Bypass routes reroute pass

## Brief

Per the parent feature's design decision, reroute cold-start course-create
entry points through `/course-create` instead of starting sessions
directly. Resume paths (where re-picking source material would be
pointless mid-flight) stay direct.

## Scope

Per the routing matrix in the parent feature body:

| File:Line | Caller | New behavior |
|---|---|---|
| `packages/ui/src/routes/courses.tsx:20` | `handleNewCourse` | `navigate({ to: "/course-create" })` |
| `packages/ui/src/routes/courses.tsx:29` | `handleResumeDraft` | **unchanged** (resume is direct) |
| `packages/ui/src/routes/library.tsx:79` | `handleUsePack` | `navigate({ to: "/course-create", search: { pack: packId } })` |
| `packages/ui/src/routes/library.tsx:130` | `resume_draft` rec | **unchanged** (resume is direct) |

(Onboarding's `onboarding-flow.tsx:341` is handled in the sibling story
`epic-course-create-readiness-unified-landing-onboarding-slim`.)

## Acceptance Criteria

- [ ] `handleNewCourse` navigates to `/course-create` instead of starting
  a session directly.
- [ ] `handleUsePack` navigates to `/course-create?pack=<id>` using the
  URL contract established in the source-picker story.
- [ ] Resume paths unchanged (`handleResumeDraft`, `resume_draft` rec
  both still start sessions directly).
- [ ] No `openSessionInTab({ ..., modeId: "course-create" })` calls
  remain in the rerouted paths (search the codebase to confirm).
- [ ] UI tests cover: cold-start paths route through landing; resume
  paths don't.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- The source-picker story landed the URL contract (`?pack=<id>`). Use it
  here.
- `navigate({ to: "/course-create", search: { pack: packId } })` is the
  TanStack Router shape; confirm by reading the source-picker
  implementation.
- For `handleNewCourse` (no pack pre-selection), just navigate to
  `/course-create` with no search params.

## Out of scope

- Source-picker UI changes (separate story).
- Onboarding refactor (separate story).
- /packs route removal (separate story).

## Implementation notes

### Navigate call shapes

**`courses.tsx` — `handleNewCourse`** (`packages/ui/src/routes/courses.tsx:18`):
```ts
const handleNewCourse = async () => {
  await navigate({ to: "/course-create" });
};
```
Replaced the old `client.session.start({ modeId: "course-create" })` + navigate to `"/"` with sessionId.
The landing page now owns session orchestration.

**`library.tsx` — `handleUsePack`** (`packages/ui/src/routes/library.tsx:72`):
```ts
const handleUsePack = useCallback(
  async (packId: string, _packName: string) => {
    setImporting(packId);
    try {
      await client.packs.import(packId);
      await navigate({ to: "/course-create", search: { pack: packId } });
    } finally {
      setImporting(null);
    }
  },
  [client, navigate],
);
```
Pack import still happens here (idempotent, packs data needs to be local before course-create
mounts). Navigate passes `pack: packId` as the search param — matching the URL contract from the
source-picker story (`validateSearch: z.object({ pack: z.string().optional() })`).

### Resume paths confirmed unchanged

- `handleResumeDraft` (`courses.tsx:22`) — still calls `client.session.start({ modeId: "course-create" })` + navigates to `"/"` with sessionId + seeds the conversation. No change.
- `resume_draft` rec dispatch (`library.tsx:127`) — still calls `openSessionInTab({ ..., modeId: "course-create" })`. No change.

### Test coverage

- `packages/ui/src/__tests__/courses-route.test.tsx` — updated test "New course button" to assert `navigate({ to: "/course-create" })` is called and `session.start` is NOT called (cold-start vs resume distinction).
- `packages/ui/src/__tests__/library-route.test.tsx` — added test "'Use this pack' imports the pack then navigates to /course-create?pack=<packId>" asserting `client.packs.import` called then `navigate({ to: "/course-create", search: { pack: "math.algebra-1" } })` and `session.start` NOT called.

### Verification

`pnpm typecheck && pnpm test` — green (4672 tests pass, 23 skipped by slow-test gates). Biome clean on changed TS files.

## Review (2026-05-23)

**Verdict**: Approve

Surgical reroute pass per the matrix. Cold-start paths (handleNewCourse,
handleUsePack) now route through /course-create; resume paths preserved
intact. `handleUsePack` keeps pack import as an idempotent pre-condition
before navigating with the pack pre-selected. Tests cover the cold-start
vs resume distinction at both routes.

**Blockers**: none
**Important**: none
**Nits**: none
