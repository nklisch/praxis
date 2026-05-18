---
id: refactor-note-body-schema-restore-discriminated-union
kind: story
stage: done
tags: [refactor, perf]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

`NoteBodySchema` in `packages/core/src/services/notes-service.ts` and
`packages/tools/src/notes/schema.ts` was changed from `z.discriminatedUnion`
to `z.union` to accommodate two outline shapes (rows vs root) with the same
`"outline"` kind value. `z.union` does linear first-match scanning;
`z.discriminatedUnion` does O(1) lookup by discriminator.

With 5 variants the difference is negligible in practice, but the regression is
avoidable. The outline ambiguity can be resolved by collapsing both outline shapes
into a single `z.object` branch with both fields optional — matching the
`{ kind: "outline"; rows?: OutlineRow[]; root?: OutlineNode }` TS type:

```ts
// Instead of z.union([outlineRows, outlineRoot]):
z.object({
  kind: z.literal("outline"),
  rows: z.array(OutlineRowSchema).optional(),
  root: z.lazy(() => OutlineNodeSchema).optional(),
}),
```

This allows restoring `z.discriminatedUnion("kind", [...])` for the outer
`NoteBodySchema`.

Also doubles as a SSOT fix: the single-branch approach removes the need for
`OutlineBodySchema` (internal detail) and keeps the Zod shape congruent with
the TypeScript type.

Origin: review of `epic-ui-redesign-ground-up-workspace-note-editor-outline`.

## Implementation notes

Collapsed both outline variants (`{ kind: "outline", rows: OutlineRow[] }` and `{ kind: "outline", root: OutlineNode }`) into a single `z.object` branch with both fields optional. This allowed restoring `z.discriminatedUnion("kind", [...])` in both locations:

- `packages/tools/src/notes/schema.ts` — removed `OutlineBodySchema`, inlined merged outline branch into `NoteBodySchema`
- `packages/core/src/services/notes-service.ts` — same: removed `OutlineBodySchema`, inlined merged branch

The `OutlineBodySchema` intermediate was deleted from both files — it only existed to work around the two-discriminator problem.

`parseNoteBody` in `packages/core/src/types/notes.ts` already handles both shapes at runtime; no change needed there as stated in the brief.

All 19 notes-body tests and all 1060 core package tests pass. Pre-existing typecheck and lint failures (in unrelated UI files) are unchanged.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: The merged outline branch now accepts `{ kind: "outline" }` with neither `rows` nor `root` through Zod (both fields are optional), whereas the old two-branch `z.union` required one or the other. This is benign — `NoteBodySchema` is used only for LLM output validation (`fromSessionSummary`), not for DB reads, and `parseNoteBody` enforces the at-least-one-field constraint downstream. The TS type `NoteBody` already allowed both fields to be absent, so Zod and TS are now congruent rather than Zod being accidentally stricter.

**Notes**: Change is well-scoped. Both `NoteBodySchema` definitions (tools and core) restored to `z.discriminatedUnion`. `OutlineBodySchema` intermediary correctly removed. JSDoc on `OutlineNodeSchema` in `notes-service.ts` corrected (old comment was mis-attributed). No foundation-doc drift; no breaking changes to public API. No tests required — the structural change is purely in the Zod schema construction; behavioral coverage already exists via the 1060 passing tests.
