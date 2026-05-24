---
id: idea-questions-tabbed-display
created: 2026-05-24
tags: [ui]
related: [idea-user-question-no-dismiss-on-submit]
---

When the tutor poses multiple structured user-questions in one turn, the current display stacks them vertically and they fill the entire screen, completely occluding the chat behind them. This means the user can't see any of the chat updates the tutor is producing in parallel (thinking indicator, intermediate messages, tool-call surfacing, etc.) while the question panel is up — even if the chat is actively trying to show progress, the question panel is in the way. Compounded by `idea-user-question-no-dismiss-on-submit`: even after the user finishes answering, the panel stays parked on screen throughout the entire thinking phase, continuing to block the chat. Switch to a tabbed (or pager-style) display where each question shows one at a time and the user advances via tab/next controls, keeping the question surface compact enough that the chat flow remains visible alongside it regardless of how many questions are in the set.
