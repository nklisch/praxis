---
id: epic-ui-redesign-ground-up-configure-prompts-tab-canvas
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Configure Prompts tab canvas — composed fragment document

## Scope

Rebuild Prompts tab canvas per `tab-prompts.html`:
- Left rail: mode picker (teach / quiz / homework / exam /
  course-create / study-skills / configure).
- Canvas: composed prompt document with ordered fragments.
- Per-fragment lock-status pill (locked / default / custom / added
  today) and knobs (scaffold / tone / formality / verbosity).
- Composed-prompt summary at bottom shows fragment composition order.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/prompt-tab.tsx`.
2. New `<ModePickerRail>` (rail of mode buttons).
3. New `<FragmentDocument>` showing ordered fragments per mode;
   per-fragment editor + lock pill + knobs.
4. Composed-prompt summary at bottom.
5. Wire to `praxisClient.authoring.{listFragmentOverrides,
   customizePrompt, clearFragmentOverride, previewPromptWithAttribution}`.
6. Tests cover mode switch + fragment edit + composition preview.
7. Quality checks green.

## Acceptance criteria

- [ ] Prompts tab matches the locked mock.
- [ ] Mode picker + fragment editing works.
- [ ] Composed-prompt preview surfaces.
- [ ] All quality checks green.
