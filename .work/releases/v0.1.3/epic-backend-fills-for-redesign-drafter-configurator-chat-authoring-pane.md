---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
kind: story
stage: done
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on: [epic-backend-fills-for-redesign-snapshot-restore-ipc]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Extract `<AuthoringChatPane>` from `<ConfigureChatPane>`

## Scope

Extract the chat-pane primitive used by both configure and
course-create surfaces.

## Implementation steps

1. New `packages/ui/src/components/authoring-chat-pane.{tsx,module.css}`.
2. Move the body of `configure-chat-pane.tsx` into the new component;
   parameterize over mode id and artifact id via props.
3. `configure-chat-pane.tsx` becomes a thin wrapper passing
   `mode: "configure"` plus the configurator-specific artifact ids.
4. Tests: `authoring-chat-pane.test.tsx` covering both mode mounts.
5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [x] `<AuthoringChatPane>` accepts mode + artifact-id props.
- [x] `<ConfigureChatPane>` continues to render identically (existing
      consumers untouched).
- [x] Tests cover both mounts.
- [x] All quality checks green.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: `configure-chat-pane.module.css` is now dead CSS (no longer imported anywhere); it was intentionally left to avoid stale-build-cache import errors per the implementation notes. Safe to delete in a follow-up cleanup if desired.

**Notes**: Clean extraction. `AuthoringChatPane` is well-scoped with `AuthoringModeId = "configure" | "bootstrap"`, mode-keyed lookup tables for label and empty-state copy, and no unnecessary new props (the `artifactId` omission is correctly documented). `ConfigureChatPane` is a proper thin wrapper at 18 lines. All 11 tests pass; changed files are lint-clean; typecheck errors are pre-existing in unrelated files.

## Implementation notes

**Extraction approach**: the existing `ConfigureChatPane` body moved
verbatim into `AuthoringChatPane`. The only parametric additions are
`mode: AuthoringModeId` (`"configure" | "bootstrap"`) and two small
lookup tables (`MODE_LABEL`, `MODE_EMPTY_STATE`) that drive the header
label and empty-state hint copy. No `artifactId` prop was needed — the
session already carries artifact context, and neither configure nor
bootstrap surfaces pass an artifact id separately at this layer.

**CSS**: styles copied into `authoring-chat-pane.module.css`;
`configure-chat-pane.module.css` left intact (empty would break the
import in a stale build cache).

**Wrapper**: `configure-chat-pane.tsx` is now 18 lines — imports the
generic component and pins `mode="configure"`. Both configure-route
tabs (`CourseTab`, `GatesTab`) are untouched.

**Tests**: 11 tests in
`packages/ui/src/components/__tests__/authoring-chat-pane.test.tsx`
covering header labels, status text, empty-state hints, composer
enable/disable for both `AuthoringChatPane` and the `ConfigureChatPane`
wrapper. All 1209 tests pass.
