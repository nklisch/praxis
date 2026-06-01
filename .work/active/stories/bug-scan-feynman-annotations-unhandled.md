---
id: bug-scan-feynman-annotations-unhandled
kind: story
stage: done
tags: [bug, async]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: low
bug_domain: async
bug_location: packages/ui/src/components/note-editor-feynman.tsx:74
---

# Feynman annotation load drops IPC failures into an unhandled rejection

**Location**: `packages/ui/src/components/note-editor-feynman.tsx:74` · **Severity**: low · **Pattern**: unhandled promise rejection

The effect guards the success path with `cancelled` but has no `.catch`, so a validation, service, or transport failure becomes an unhandled rejection. Attach a catch and ignore or surface the failure when not cancelled.

```ts
client.notes.getAnnotations(noteId).then((ann) => {
  if (!cancelled) setAnnotations(ann);
});
```

## Implementation notes

- Changed `packages/ui/src/components/note-editor-feynman.tsx` to catch annotation load failures and suppress updates after cancellation.
- Added coverage in `packages/ui/src/__tests__/note-editor-feynman.test.tsx` for a rejected `getAnnotations()` call so the Promise chain is handled.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp/vitest pnpm vitest run packages/ui/src/__tests__/claude-auth-modal.test.tsx packages/ui/src/__tests__/use-streamed-send.test.tsx packages/ui/src/__tests__/course-create-tab-body-layout.test.tsx packages/ui/src/hooks/__tests__/use-sub-agent.test.tsx packages/ui/src/__tests__/note-editor-feynman.test.tsx`; `pnpm --filter @praxis/ui typecheck`; `pnpm exec biome check <touched UI files>`.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
