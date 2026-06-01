---
id: bug-scan-feynman-annotations-unhandled
kind: story
stage: implementing
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
