---
id: idea-user-question-no-dismiss-on-submit
created: 2026-05-24
tags: [bug, ui]
related: [idea-questions-tabbed-display]
---

When the user submits an in-chat structured user-question (the inline quick-check / dialog prompt the tutor poses), the question stays on screen in a greyed-out disabled state for the entire duration that the tutor is thinking, instead of dismissing immediately on click. The desired behavior is: clicking submit should remove the question from the chat flow right away so the normal thinking indicator can take over, rather than the question lingering greyed-out throughout the LLM round-trip. This compounds with `idea-questions-tabbed-display` — while the panel sits greyed-out post-submit, it continues to occlude the chat below, so the user can't see any of the progress the tutor is producing in the gap between submit and the next visible response. Decouple the dismiss transition from the response-arrival event — fire it on submit.
