---
id: idea-unified-prompt-preview-blocks
created: 2026-05-13
tags: [ui]
---

The prompt editing surface currently has too many preview shapes — global prompt, append preview, composed preview, full-fragment view — each with its own layout. Unify on a single block-oriented view (one block per fragment / section) with a toggle (button or tab) to switch to a composed view that shows the assembled output. The global prompt should appear as just another block in that stack, married into the composed preview rather than rendered separately. The append preview should reuse the same composed-preview path with the appended block highlighted. Net effect: one canonical surface, with the only axis of variation being "blocks vs composed", instead of N parallel preview components that drift out of sync.
