---
id: idea-prompt-customization-per-mode-and-global
created: 2026-05-09
tags: [content, ui]
---

Prompts should show the default prompt to the user, with two layers of customization:
1. **Per-mode append** — the user can append text to the prompt of a specific mode (teach, configure, etc.).
2. **Global prompt** — a CLAUDE.md-style global prompt-fragment that injects into every mode.

Their should be a full override of primary system prompt option as well, in both scopes, or the primary prompt should be thin enough that most customization comes in the append / claude.md style

Pattern: same model as how Claude Code's CLAUDE.md works (project-level + user-level). Surfaces in Settings or per-mode configuration.
