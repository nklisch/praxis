---
id: feature-phase-4-verification-tools
kind: feature
stage: done
tags: [content]
parent: null
depends_on: [feature-phase-3-ui-shell]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 4 — Verification tools (math + code)

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-4-verification-tools.md`.

**Goal that shipped:** Tutor grades math symbolically and runs code in a sandbox.

**Notes:** Established `@praxis/tools` with Zod-schema'd handlers, sympy-based math grader, and the language-sandbox port that Phase 15+'s registry refactor later generalized.
