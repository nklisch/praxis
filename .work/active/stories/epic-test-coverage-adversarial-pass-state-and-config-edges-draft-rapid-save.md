---
id: epic-test-coverage-adversarial-pass-state-and-config-edges-draft-rapid-save
kind: story
stage: review
tags: [testing]
parent: epic-test-coverage-adversarial-pass-state-and-config-edges
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# SqliteDraftStore rapid back-to-back save — draft-store.test.ts

## Scope

Pin the `SqliteDraftStore.save()` last-writer-wins contract under
rapid same-tick contention in
`packages/core/src/__tests__/draft-store.test.ts`. The existing
suite covers the happy-path upsert (`upsert: re-saving overwrites
content and preserves createdAt`) but does so with an intermediate
spread/mutation; the "rapid back-to-back, no await between"
adversarial case is unverified.

## Anchors

- Test file: `packages/core/src/__tests__/draft-store.test.ts`
- Implementation: `packages/core/src/services/draft-store.ts`
  (`save()` via `onConflictDoUpdate` at line 60-84)
- Fixture helpers already in test file: `makeDraft`,
  `BASE_PROPOSED`, `STUDENT_A`, `db = useTempDb()`

## Pattern anchors

- `temp-db-test-helper` — reuse `useTempDb()` already at line 67.
- `load-or-throw` — N/A (test asserts round-trip directly).

## Implementation

Add one `it(...)` block at the end of the existing
`describe("SqliteDraftStore", ...)` block. Body is fully
specified in the parent feature's Unit 2 section.

Key points:
- Two synchronous `store.save()` calls in the same tick with no
  await between them.
- `load()` returns the second state (last-writer-wins).
- `createdAt` is preserved from the first save (upsert contract).

## Acceptance criteria

- [ ] One new `it(...)` block exists with this exact name:
  `"rapid back-to-back save() calls preserve the last-written state (single-process race window)"`
- [ ] One-line `// Spec:` source comment pinning intent.
- [ ] Test passes under
  `pnpm --filter @praxis/core vitest run src/__tests__/draft-store.test.ts`.
- [ ] `pnpm typecheck && pnpm lint` green from repo root.
- [ ] No changes to `services/draft-store.ts`.
