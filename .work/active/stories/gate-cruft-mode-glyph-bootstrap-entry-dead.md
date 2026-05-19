---
id: gate-cruft-mode-glyph-bootstrap-entry-dead
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# Dead `bootstrap` glyph entry in mode-glyph map

## Confidence
High

## Category
residual-rename / dead code

## Location
`packages/ui/src/routes/configure/prompt-tab.tsx:20`

## Evidence
```ts
const MODE_GLYPHS: Record<string, string> = {
  teach: "§",
  quiz: "‡",
  homework: "❦",
  exam: "†",
  bootstrap: "¶",
  "study-skills": "‖",
  configure: "⁂",
  "course-create": "¶",
};
```

## Removal
Delete the `bootstrap: "¶"` line. No mode with `modeId === "bootstrap"` exists
in the codebase after the rename — only `"course-create"` is registered. The
lookup `MODE_GLYPHS[modeId]` will never hit this key.

## Implementation notes (2026-05-18)

One-line delete in `packages/ui/src/routes/configure/prompt-tab.tsx:20`.
`course-create` retains the `¶` glyph; no lookup site changes.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: `bootstrap: "¶"` entry deleted. Confirmed `course-create: "¶"` remains. Single-line change, no cascade. Batched in commit ab72ab4 with two other trivial items.
