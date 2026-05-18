---
id: refactor-note-body-schema-restore-discriminated-union
stage: implementing
created: 2026-05-18
tags: [refactor, perf]
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
