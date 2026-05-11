---
id: feature-prompt-customization-layers
kind: feature
stage: drafting
tags: [content, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Prompt customization layers

## Brief

Surface the default prompt for each mode to the user, with layered customization
on top — modelled on how Claude Code's CLAUDE.md works (project-level +
user-level). Today the system prompt for each mode is hardcoded in mode-fragment
files and the user has no visibility or override. The result is that
opinionated pedagogy choices are baked in with no escape hatch for teachers,
parents, or self-directed learners who want a different teaching style.

Two layers of additive customization:
1. **Per-mode append** — the user can append text to the prompt of a specific
   mode (teach, configure, bootstrap, etc.). Surfaces in per-mode configuration.
2. **Global prompt** — a CLAUDE.md-style global prompt fragment that injects
   into every mode. Surfaces in Settings.

Both layers compose with the existing mode-fragment system rather than
replacing fragments. The `mode-prompt-fragment-composition` pattern already
sorts fragments by a fixed `FRAGMENT_ORDER` and applies `overrides`; the
customization layers slot in as two new fragment positions (one for the global
fragment, one for the per-mode append) at the end of the order.

A third option to weigh: **full primary-prompt override** at both scopes. The
design pass should decide whether to expose this as well — it's powerful but
risks the user blowing away the verification + pedagogy commitments that make
Praxis what it is. An alternative is to make the primary prompt thin enough
that most customization is satisfied by append + CLAUDE.md-style, with override
as a deliberate "I know what I'm doing" affordance.

UX surfaces:
- **Settings** → global prompt editor (textarea, monospace, with a "view
  default prompt" disclosure).
- **Per-mode configuration** (already exists for some modes) → append-text
  field, plus a "view default prompt for this mode" disclosure.
- Both surfaces show the *effective* composed prompt so the user can see what
  the model will actually receive.

## Scope notes

This is one feature, not an epic — the two layers + the override question are
one cohesive change to the prompt composition pipeline. Design pass should
produce 2-3 child stories: persistence + composition wiring, settings UI,
per-mode UI. Storage is straightforward (`config_kv` for the global fragment;
extend the per-mode config record for the append text — see `config-kv-store`
pattern).

The architectural commitment from `mode-prompt-fragment-composition` — share
fragments across modes, don't inline mode-specific content into shared ones —
holds here. Append text goes into a new mode-scoped fragment; global text
goes into a new project-scoped fragment.

Origin: `.work/backlog/idea-prompt-customization-per-mode-and-global.md`.

<!-- Design and Implementation Notes accumulate here as work progresses. -->
