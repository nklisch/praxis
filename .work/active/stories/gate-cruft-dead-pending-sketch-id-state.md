---
id: gate-cruft-dead-pending-sketch-id-state
kind: story
stage: implementing
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Dead state hook `pendingSketchId` in chat-tab-body.tsx

## Confidence
High

## Category
dead function

## Location
`packages/ui/src/components/chat-tab-body.tsx:109,149`

## Evidence

```tsx
// Line 109 — Phase 15a: captured sketch attached to the next outgoing message.
const [pendingSketchId, setPendingSketchId] = useState<SketchId | undefined>(undefined);
...
// Line 149 — only write site; nothing reads pendingSketchId
setPendingSketchId(undefined);
```

`pendingSketchId` is never referenced anywhere after declaration (only two
hits in the file: the declaration on 109 and the reset on 149; no other
reads in the package). Biome flagged `pendingSketchId` as
`noUnusedVariables`.

## Removal

- Delete line 109 entirely.
- Delete line 149 (the `setPendingSketchId(undefined);` line) inside
  `handleSendWithSketch`.
- Remove the now-unused `SketchId` type import from the file's
  `@praxis/core/types` import block (verify no other use of `SketchId` in
  the file before removing).

The Phase 15a comment can stay if `handleSendWithSketch` still appends the
`[sketch:<id>]` marker via its parameter — the parameter-passing path
still works without the local state.
