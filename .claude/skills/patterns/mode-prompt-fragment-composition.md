# Mode Prompt-Fragment Composition

A `Mode` declares its system prompt as an ordered list of `PromptFragment` objects (`{ id, position, customizable, template }`). `composeSystemPrompt` sorts the union of mode + additional fragments by their `position` against a fixed `FRAGMENT_ORDER`, then joins them. Customizable fragments may be replaced by id via an `overrides` map; a non-customizable override throws.

## Rationale

Seven modes share most of their prompt skeleton (preamble, principles, postamble) and differ in a handful of position slots (role, tools, context, constraints). Decomposing the prompt into named fragments lets shared content live in one file (`principles.ts`, `preamble.ts`) and per-mode content live in named role/tools fragments (`teach-role.ts`, `exam-role.ts`, etc.). The fixed `FRAGMENT_ORDER` makes it impossible to accidentally reorder fragments across modes — the position slot is the only thing that matters for ordering. The `customizable` flag declares which fragments the configurator surface may override at runtime; non-customizable fragments (preamble, postamble, principles) hard-throw on override attempts so the configurator UI can't silently corrupt the framework's invariants.

## Examples

### Example 1: A fragment is a static value with a position slot
**File**: `packages/curriculum/src/modes/fragments/principles.ts`
```typescript
export const principlesFragment: PromptFragment = {
  id: "principles",
  position: "principles",
  customizable: false,
  template: `Core principles:\n- Worked examples > pure exposition\n...`,
};
```

### Example 2: A mode is a list of fragments
**File**: `packages/curriculum/src/modes/teach.ts:18`
```typescript
export const teachMode: Mode = {
  id: "teach",
  // ...
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    metacognitivePromptsFragment({ triggers: ["pre-reading", "post-error", "session-end"] }),
    toolsFragment,
    sketchAwarenessFragment,
    courseContextFragmentDefault,
    behaviorInCourseFragmentDefault.teach,
    constraintsFragment,
    postambleFragment,
  ],
  // ...
};
```

### Example 3: composeSystemPrompt — fixed-order sort + override application
**File**: `packages/curriculum/src/brief/compose.ts:52`
```typescript
// 9-entry FRAGMENT_ORDER as of prompt-customization-layers feature.
// "user-global" and "user-append" slot in between "constraints" and "postamble":
//   - user-global: cross-mode user instruction (Settings global prompt)
//   - user-append: per-mode user instruction (Configure per-mode append)
// Both are injected via `additionalFragments` at session open time by
// SessionServiceImpl; they are never part of a mode's `promptFragments` array.
const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble", "role", "principles", "tools", "context", "constraints",
  "user-global", "user-append", "postamble",
];

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue;
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const all = [...input.mode.promptFragments, ...(input.additionalFragments ?? [])];
  const sorted = all.sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  return sorted.map((f) => overrides.get(f.id) ?? f.template).join("\n\n");
}
```

20 fragment files exist under `packages/curriculum/src/modes/fragments/`; 7 modes (teach, quiz, homework, exam, study-skills, configure, bootstrap) compose them. Some fragments are factories (`metacognitivePromptsFragment(input)`) when they need parameterization at compose time.

## user-global and user-append semantics

These two positions are reserved for user-authored customization layers managed by `PromptCustomizationService`:

- **`user-global`** (`id: "user.global"`): A single cross-mode fragment stored in `config_kv` at key `prompt.global_fragment`. Injected into every mode's prompt. Surfaced via the Settings global-prompt editor.
- **`user-append`** (`id: "user.append.<modeId>"`): A per-mode fragment stored in `mode_prompt_appends`. Only injected when a session of that mode is opened. Surfaced via the Configure per-mode-append editor.

Both are injected via `additionalFragments` in `SessionServiceImpl.openActive()` — they are **never** added to a `Mode.promptFragments` definition. Modes don't need to know about them. Composition is purely additive; the user layers cannot be non-customizable (they are always `customizable: true`) and are skipped entirely when the stored text is empty/null.

## When to Use

- Adding a new mode: pick the relevant existing fragments, add a per-mode role + tools fragment if the mode's voice/capabilities are distinct
- Adding cross-mode prompt content: write one fragment with the right `position` slot, include it in every mode that should carry it (don't inline into a role fragment — defeats reuse)
- Per-session computed content (course context, lock indicator): pass via `additionalFragments` rather than mutating the mode. The same defaults-plus-runtime-override shape also produces the `in-course-behavior` fragment in teach/quiz/homework/exam/study-skills modes: each mode carries `behaviorInCourseFragmentDefault.<modeId>` as a placeholder, and `composeInCourseBehaviorFragment(modeId, courseCtx)` supplies the override via the `overrides` map at session open time.
- User-authored additions: use `PromptCustomizationService.setGlobalFragment` / `setModeAppend` — these feed into `additionalFragments` automatically

## When NOT to Use

- Per-prompt one-off content (assistant pre-fill, dynamic context retrieval) — those go in the user-message-side `BriefContext`, not as system-prompt fragments
- A fragment that needs runtime params and *also* belongs in many modes — prefer a fragment factory (`metacognitivePromptsFragment(input)`) over copy-pasting

## Common Violations

- Inlining role-specific content into a shared fragment (e.g. adding teach-mode-specific guidance to `principles.ts`) — bleeds across modes
- Setting `customizable: true` on a fragment that the framework relies on (postamble carries the assistant's "ask one question at a time" coda; making it overridable means the configurator can break the chat loop)
- Adding a new fragment but forgetting to include it in any mode — ghost code; never gets composed
