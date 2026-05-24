---
id: idea-question-free-answer-and-cancel-path
created: 2026-05-24
tags: [ui]
related: [idea-questions-tabbed-display, idea-user-question-no-dismiss-on-submit]
---

The structured user-question tool needs two escape hatches the current shape lacks. (1) Each question should expose a free-form answer field alongside the structured options, so the user can type a real response when none of the choices fit instead of being forced to pick a near-match. (2) The tool's description / agent-facing instructions should explicitly tell the model NOT to add "tell me in chat" / "I'll explain in chat" / "let me clarify" as one of its multiple-choice options — that path is already handled by the chat itself and just clutters the option list. (3) Canceling/dismissing a question (rather than submitting an answer) should be a first-class path that explicitly tells the agent the user wants to clarify in chat instead, so the agent can drop the structured-question framing and resume normal Q&A. Together these stop the question UI from being a forced funnel and let the user fall back to free conversation whenever the structure isn't serving them.
