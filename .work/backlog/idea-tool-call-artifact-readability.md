---
id: idea-tool-call-artifact-readability
created: 2026-05-13
tags: []
---

Tool-call artifacts in the chat stream often flash by too quickly to read — a tool fires, briefly renders, and is gone (or scrolled past) before the user can see what happened. Two possible directions to explore: (1) **persist** the tool-call entries inline in the chat history so they remain readable after the turn ends, treating each tool call as a first-class message bubble the student can scroll back to; or (2) **delay/animate** them with a minimum visible duration (e.g., hold each tool call's "running" state for ~600ms even if it completes faster) so the eye can follow what the tutor just did. Open question at scope time: persist vs. delay vs. both, and how this interacts with the existing episodic log already storing tool events.
