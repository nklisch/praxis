---
id: epic-ui-redesign-ground-up-chat-workspace-tool-call-disclosure
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Tool-call rendering — `<details>` one-line disclosure

## Scope

Convert tool-call rendering in chat messages to a `<details>` one-line
disclosure pattern: verdict glyph + tool name + result preview +
chevron. Expands to show full input/output.

(Separate from
`epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry`
which adds the ↶ revert affordance for authoring tools. This story
covers the generic disclosure for all tools in chat surfaces.)

## Implementation steps

1. New `packages/ui/src/components/tool-call-disclosure.{tsx,module.css}`
   wrapping the `<details>` element.
2. Edit `Message` to dispatch tool-call render to the disclosure.
3. Verdict glyph derived from tool result (✓ on ok, ⊘ on error, …
   on running).
4. Tests cover render + expand/collapse.
5. Quality checks green.

## Acceptance criteria

- [x] Tool calls render as one-line disclosures in chat.
- [x] Expand shows full I/O.
- [x] Verdict glyph reflects state.
- [x] All quality checks green.

## Implementation notes

**New files:**
- `packages/ui/src/components/tool-call-disclosure.tsx` — `<ToolCallDisclosure>` wrapping a native `<details>` element. Props: `toolName`, `verdict` (`"ok" | "error" | "running"`), `input?`, `output?`, `errorMessage?`. Verdict glyphs: ✓ (ok, `--color-success`), ⊘ (error, `--color-danger`), … (running, `--color-text-tertiary`). Hidden tools render null. Result preview uses `getToolSummary` → `label.past` → `label.present` fallback chain. No React state needed — native `<details>` owns open/close.
- `packages/ui/src/components/tool-call-disclosure.module.css` — matches Option-4 locked mock: mono 11px bold header, `--color-bg-secondary` background with `--color-border` border, serif italic result preview (`composes: editorial from global`), chevron pushed right, detail panel with square top corners when open.
- `packages/ui/src/__tests__/tool-call-disclosure.test.tsx` — 15 tests covering: glyph per verdict, result preview (summarizer + fallback + error), chevron, collapsed-by-default, Input/Output/Error detail sections, no-detail-panel case, hidden tools, `<details>`/`<summary>` element structure.

**Changed files:**
- `packages/ui/src/components/chat-tab-body.tsx` — replaced `ToolEntry` import and usage (in `TeachChatTabBody` item dispatch) with `ToolCallDisclosure`; maps `status: "in_flight" | "settled" | "errored"` → `verdict: "running" | "ok" | "error"`.

**Design decisions:**
- `ToolEntry` is NOT deleted — it remains for the drafter/configurator surfaces (`epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry`). `ToolCallDisclosure` is the redesign-era primitive for teach-mode and generic chat.
- Native `<details>` avoids React state for open/close; the detail panel is always in the DOM (not conditionally rendered), which aligns with the browser's native behaviour and ensures content is accessible/findable.
- The summary `— dash` prefix for result preview is inline in JSX (not CSS `::before`) to keep the text selectable and accessible.
