---
id: gate-tests-set-annotations-inverted-range-classification
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `setAnnotations` IPC envelope returns `INTERNAL` instead of `VALIDATION_FAILED` for inverted range

## Priority
Medium

## Spec reference
Item: `epic-backend-fills-for-redesign-note-annotations-and-filters-annotations`

Acceptance criterion: feature review nits — "IPC-layer annotation schema
does not cross-check `rangeStart < rangeEnd` (service layer handles it;
callers get `INTERNAL` rather than `VALIDATION_FAILED`)."

Service-layer test at `notes-service.test.ts:320` confirms the service
rejects via thrown error, but the IPC channel should reject at the trust
boundary with `VALIDATION_FAILED` for consistency with other range-bearing
channels (`citations-channel-envelope.test.ts:161` rejects negative
offsets). Current behavior returns
`{ ok: false, error: { code: "INTERNAL" } }` — semantically wrong for
malformed input.

## Gap type
adversarial-spec-silent / error-code classification mismatch

## Suggested test
```ts
// packages/desktop/electron/main/__tests__/notes-flashcards-channel-envelope.test.ts
it("setAnnotations returns VALIDATION_FAILED for inverted range (rangeStart >= rangeEnd)", async () => {
  const handler = handlers.get("praxis.notes.setAnnotations");
  const result = await handler?.({},
    { noteId: "n-1", annotations: [{ rangeStart: 5, rangeEnd: 3, text: "x", severity: "soft" }] });
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
});
```

**Design decision (2026-05-18)**: schema-level only — single source of
truth at the IPC boundary. Delete the redundant service-layer throw and
its unit test.

Concrete edits:
- `packages/desktop/electron/main/notes-channel.ts`: add
  `.refine(a => a.rangeStart < a.rangeEnd, { message: "rangeStart must be < rangeEnd" })`
  on the annotation entry schema in `SetAnnotationsSchema`.
- `packages/core/src/services/notes-service.ts`: remove the
  `rangeStart >= rangeEnd` throw guard inside `setAnnotations` — the
  schema is now the boundary.
- `packages/core/src/services/__tests__/notes-service.test.ts:320`:
  delete the `setAnnotations rejects rangeStart >= rangeEnd` test (no
  longer reachable through normal call paths).
- `packages/desktop/electron/main/__tests__/notes-flashcards-channel-envelope.test.ts`:
  add the `VALIDATION_FAILED for inverted range` IPC envelope test.

## Test location (suggested)
`packages/desktop/electron/main/__tests__/notes-flashcards-channel-envelope.test.ts`
plus the schema in `packages/desktop/electron/main/notes-channel.ts`
