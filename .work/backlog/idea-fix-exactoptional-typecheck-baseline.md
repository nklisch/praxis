---
id: idea-fix-exactoptional-typecheck-baseline
created: 2026-05-18
tags: [tech-debt, typecheck, ui]
---

Three `exactOptionalPropertyTypes: true` typecheck errors live on `main` and have for at least the duration of the bootstrap → course-create rename refactor (verified during that refactor's review pass — they exist at the commits before and after, untouched). They all follow the same shape: a parent component passes optional props through to a child, but uses direct field assignment instead of the conditional-spread pattern, so `T | undefined` flows into a slot typed `T`.

Surfaced by `pnpm typecheck`:

```
packages/ui/src/components/chat-tab-body.tsx(534,15) — TeachChatTabBody onNoteOpen, hasSessionNote
packages/ui/src/routes/chat.tsx(244,14) — ChatTabBody onNoteOpen, hasSessionNote
packages/ui/src/routes/workspace/notes-list.tsx(125,10) — CatalogueSearchBox resultCount
```

Fix shape (same pattern already used in `open-session-in-tab.ts:26` and `chat-tab-body.tsx:462-463`):

```tsx
<TeachChatTabBody
  tab={tab}
  {...(onNoteOpen !== undefined && { onNoteOpen })}
  {...(hasSessionNote !== undefined && { hasSessionNote })}
/>
```

Single-stride story, ≤ 3 files, < 20 LoC delta. Tests are unaffected (the pattern is type-equivalent to today's runtime behavior). Worth scoping when the autopilot picks the backlog next.
