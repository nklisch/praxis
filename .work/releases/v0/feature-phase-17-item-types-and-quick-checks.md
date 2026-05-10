---
id: feature-phase-17-item-types-and-quick-checks
kind: feature
stage: done
tags: [content, ui]
parent: null
depends_on: [feature-phase-16b-modalities-and-assessment-loop]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 17 — Item type expansion + inline quick checks

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-17-item-types-and-quick-checks.md`.

**Goal that shipped:** Expand the assessment item palette from five kinds to nine and introduce inline formative checks. The tutor gains a lightweight `quick_check.*` tool family for single-question probes mid-conversation — no assignment tab required, no context switch, just a card in the thread and a reaction in the same turn.

**Notes:** Implementation landed across three commits — backend (discriminated `AssignmentItem` + new graders + `QuickCheckService`), tools (`quick_check.*` family + teach-mode prompt), UI (per-kind item bodies + `<QuickCheckCard>` inline in chat). ROADMAP not yet ticked at bootstrap time; substrate treats it as shipped.
