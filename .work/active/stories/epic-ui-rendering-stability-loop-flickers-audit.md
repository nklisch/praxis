---
id: epic-ui-rendering-stability-loop-flickers-audit
kind: story
stage: review
tags: [ui, bug]
parent: epic-ui-rendering-stability-loop-flickers
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Stabilize `useConfiguratorActions` deps to stop the audit-log loop

## Scope

Fix the audit log tight-loop re-render in the Memory Inspector. The
hook `useConfiguratorActions` lists its `opts` object directly in the
`useCallback` deps for `refresh`, and the consumer at
`packages/ui/src/components/memory-inspector-tabs.tsx:65` passes a
fresh `{ limit: 100 }` literal every render. Result: `refresh`
identity changes every render → `useEffect(() => refresh(), [refresh])`
re-fires every render → `setLoading(true)` + `setActions(...)` flip state
→ another render → tight loop.

See parent feature
(`.work/active/features/epic-ui-rendering-stability-loop-flickers.md`)
for the full diagnosis under "Bug 2 — Audit log render loop" and the
design under "Unit 2".

## Files

- `packages/ui/src/hooks/use-configurator-actions.ts` — destructure
  `opts?.fromTs` and `opts?.limit` into local primitives, list those
  in the `useCallback` deps instead of the `opts` reference, and
  rebuild the request payload using the conditional-spread idiom from
  `use-notes.ts` (only include the key if defined).
- `packages/ui/src/hooks/__tests__/use-configurator-actions.test.ts` —
  new file; add the call-count regression test, the limit-change
  refetch test, the no-opts test, and the error-path test described in
  the parent feature's Testing section (Unit 2).

## Acceptance Criteria

- [ ] Mounting `<MemoryInspectorTabs />` calls
      `client.author.listConfiguratorActions` exactly ONCE on initial
      load.
- [ ] Subsequent unrelated parent re-renders do NOT trigger additional
      calls (the regression assertion).
- [ ] Changing the `limit` prop value (e.g. 50 → 100) DOES trigger a
      single refetch.
- [ ] No-args invocation (no `opts`) renders with empty payload and
      calls the client exactly once.
- [ ] Error path: spy rejects → `error` is set, `loading` is false,
      `actions` unchanged.
- [ ] `pnpm --filter @praxis/ui test` passes locally, including the
      new hook test.
- [ ] `pnpm typecheck` and `pnpm lint` are clean.

## Notes

- Conditional spread:
  `{ ...(fromTs !== undefined && { fromTs }), ...(limit !== undefined && { limit }) }`
  — same idiom as `use-notes.ts`. Respects
  `exactOptionalPropertyTypes`.
- Do NOT refactor `useConfiguratorActions` to layer on `useResource`
  in this story — that's a separate cleanup opportunity (flagged for
  the simplify gate). Keep this fix surgical.
- Do NOT change the consumer call site in `memory-inspector-tabs.tsx`
  — the contract is that the hook tolerates a literal at the call
  site. That's the fix.
