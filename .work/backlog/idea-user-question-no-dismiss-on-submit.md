---
id: idea-user-question-no-dismiss-on-submit
created: 2026-05-24
tags: [bug, ui]
---

When the user submits an in-chat structured user-question (the inline quick-check / dialog prompt the tutor poses), the question doesn't dismiss after submit — it just greys itself out (presumably the disabled-after-submit state) and stays parked on screen instead of advancing. The submit handler appears to fire the disable transition but never tears down or collapses the dialog into a settled answer state. Trace the submit flow and make sure submission resolves the question UI into its post-answer rest state.
