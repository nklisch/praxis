---
id: idea-index-ready-badge-alignment
created: 2026-05-24
tags: [ui]
---

The "indexed" / "ready" status icons (and similar small status badges) are rendering too small and aren't vertically aligned with the text that sits inside or beside them. Relatedly, the color dots / swatches sit too far below the visual center of the adjacent text and the color body itself may be undersized. Audit the status-badge and color-dot primitives, bump their size up, and recenter them against the cap height of their accompanying text so the alignment reads correctly.
