---
id: bug-scan-invalid-workspace-tab-blank
kind: story
stage: review
tags: [bug, language-footgun]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: low
bug_domain: language-footgun
bug_location: packages/ui/src/routes/workspace.tsx:41
---

# Invalid workspace tab query blanks the workspace

**Location**: `packages/ui/src/routes/workspace.tsx:41` · **Severity**: low · **Pattern**: unchecked cast of router search params

The cast makes any `?tab=` value look like a valid workspace tab, so `/workspace?tab=bogus` renders none of the panels instead of falling back to Notes. Validate `search.tab` against the known tab IDs before assigning `activeTab`.

```ts
const search = useSearch({ strict: false }) as any as WorkspaceSearch;
const activeTab: WorkspaceTab = search.tab ?? "notes";
```

## Implementation notes

- Changed `packages/ui/src/routes/workspace.tsx` to validate `search.tab` against the known workspace tab ids before selecting a tab.
- Invalid tab query values now fall back to Notes instead of rendering an empty workspace.
- Added regression coverage in `packages/ui/src/__tests__/workspace-route.test.tsx`.
