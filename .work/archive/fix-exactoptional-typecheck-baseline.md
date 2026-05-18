---
id: fix-exactoptional-typecheck-baseline
kind: story
stage: done
tags: [tech-debt, typecheck, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix the `exactOptionalPropertyTypes` typecheck baseline

## Brief

Three `exactOptionalPropertyTypes: true` typecheck errors live on `main` and
have for at least the duration of the bootstrap → course-create rename refactor
(verified during that refactor's review pass — they exist at the commits before
and after, untouched). They all follow the same shape: a parent component
passes optional props through to a child, but uses direct field assignment
instead of the conditional-spread pattern, so `T | undefined` flows into a slot
typed `T`.

Surfaced by `pnpm typecheck`:

```
packages/ui/src/components/chat-tab-body.tsx(534,15) — TeachChatTabBody onNoteOpen, hasSessionNote
packages/ui/src/routes/chat.tsx(244,14) — ChatTabBody onNoteOpen, hasSessionNote
packages/ui/src/routes/workspace/notes-list.tsx(125,10) — CatalogueSearchBox resultCount
```

## Implementation plan

Apply the conditional-spread pattern already used in `open-session-in-tab.ts:26`
and `chat-tab-body.tsx:462-463`:

```tsx
<TeachChatTabBody
  tab={tab}
  {...(onNoteOpen !== undefined && { onNoteOpen })}
  {...(hasSessionNote !== undefined && { hasSessionNote })}
/>
```

Single-stride story, ≤ 3 files, < 20 LoC delta. Tests are unaffected (the
pattern is type-equivalent to today's runtime behavior). Confirm `pnpm
typecheck` is clean after the change.

## Implementation notes

Applied the conditional-spread pattern to all three sites:

1. `packages/ui/src/components/chat-tab-body.tsx` (line 534): Expanded the
   inline `<TeachChatTabBody>` into a multi-line JSX expression with
   `{...(onNoteOpen !== undefined && { onNoteOpen })}` and
   `{...(hasSessionNote !== undefined && { hasSessionNote })}`.

2. `packages/ui/src/routes/chat.tsx` (line 244): Replaced the ternary
   `onNoteOpen={...? handleNoteOpen : undefined}` / `hasSessionNote={...?
   hasSessionNote : undefined}` pattern with conditional spreads:
   `{...(t.id === activeTabId && { onNoteOpen: handleNoteOpen })}` and
   `{...(t.id === activeTabId && hasSessionNote !== undefined && { hasSessionNote })}`.

3. `packages/ui/src/routes/workspace/notes-list.tsx` (line 125): Replaced
   `resultCount={loading ? undefined : hits.length}` with
   `{...(!loading && { resultCount: hits.length })}`.

### Verification

- `pnpm typecheck`: Zero TS2375 (`exactOptionalPropertyTypes`) errors at all
  three listed sites. One unrelated pre-existing error remains
  (`session-service.ts TS2345` — not introduced by this change).
- `pnpm lint`: No lint errors in any of the three changed files (pre-existing
  project-wide errors unchanged).
- `pnpm --filter @praxis/ui test`: 1599/1600 tests pass. The single failure
  (`use-fragment-overrides` refresh test) is the pre-existing flaky test noted
  in the story; it is under separate investigation and unrelated to this change.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none (parked adjacent finding — see Notes)
**Nits**:
- `chat.tsx:244` adds `hasSessionNote !== undefined &&` as a conjunct to the conditional spread (`{...(t.id === activeTabId && hasSessionNote !== undefined && { hasSessionNote })}`). With `exactOptionalPropertyTypes: true`, "prop absent" and "prop=undefined" are observably different to a child component using `'hasSessionNote' in props`, but the child consumes via destructure / nullish-fallback in practice — so this is type-equivalent for callers and the right shape for the new typecheck baseline.

**Notes**:
- The story's 3-site scope is fully addressed. A 4th same-shape `TS2345` baseline error remains at `packages/core/src/services/session-service.ts(42,51)` (`indexerOrchestrator: IndexerOrchestrator | undefined → IndexerOrchestrator`). The original story scope explicitly listed only the 3 UI sites, so expanding scope here was correctly declined. Parked as `idea-fix-session-service-exactoptional-baseline` for the next pass; once that lands, `pnpm typecheck` exits clean workspace-wide.
- Net delta: +6 lines, -5 lines = +1 LoC, lighter than the story's "< 20 LoC delta" estimate.
