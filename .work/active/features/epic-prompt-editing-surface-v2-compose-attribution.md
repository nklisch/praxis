---
id: epic-prompt-editing-surface-v2-compose-attribution
kind: feature
stage: implementing
tags: [core, curriculum, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Compose returns source attribution

## Brief

Today `composeSystemPrompt` in `packages/curriculum/src/brief/compose.ts:52-66`
returns a single concatenated string. The diff-aware preview the epic wants
needs to know which span of the composed prompt came from which source —
default fragment, user override, per-mode append, or global fragment — to
highlight what the user actually changed.

This feature extends the composition layer to optionally return a structured
segment list alongside (or in place of) the joined string, where each segment
carries `{ fragmentId, position, source: "default" | "override" | "append" |
"global" | "additional", text, defaultText?, customizable }`. The existing
`string` return path stays for callers that just want the prompt (engines,
brief assembly); the new attribution path is opt-in for the preview pipeline.

This is the foundation feature for the epic — the diff-aware preview depends
on it directly, and the unified configure surface benefits from it for
in-place source labels.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: **foundation feature** — `diff-aware-preview` depends on
  this; can land in parallel with `unified-configure-surface`.

## Foundation references

- `docs/ARCHITECTURE.md` — `@praxis/curriculum` is "modes, prompt fragments,
  composition" (line ~50, line ~353); this feature extends the composition
  output without changing the package's responsibility.

## Anchors

- `composeSystemPrompt` — `packages/curriculum/src/brief/compose.ts:52-66`
- `FRAGMENT_ORDER` — `packages/curriculum/src/brief/compose.ts:35-45`
- `PromptFragment` type — `packages/core/src/types/mode.ts:29-34`
- Caller: `PromptCustomizationServiceImpl.previewPrompt` —
  `packages/core/src/services/prompt-customization-service.ts:153-194`
- IPC channel —
  `packages/desktop/electron/main/` (authoring channel family, `praxis.author.previewPrompt`)
- Client — `packages/client/src/services/authoring-client.ts:180-186`
- Existing tests:
  `packages/core/src/services/__tests__/prompt-customization-service.test.ts`,
  `packages/curriculum/src/brief/__tests__/compose.test.ts` (if present)

## Architectural choice

**Additive: new function, new method, new IPC channel.** Don't change the
existing `composeSystemPrompt(input): string` signature; add a sibling
`composeSystemPromptWithAttribution(input): ComposedSystemPromptWithAttribution`
that returns `{ prompt, segments }`. Refactor the existing function to
call the new one and discard everything but `prompt` — keeps a single
source of truth for sort/override semantics.

Two alternatives rejected:
- *Replace the string return with the structured shape.* Breaks every
  existing caller (engines, session service, runOneShot helper). The
  caller list is bounded but the change is irreversible at scope time.
- *Return an opt-in tagged tuple based on a flag arg.* Mixes two return
  shapes in one signature; harder to type and reason about than two
  cleanly-named functions.

## Design decisions (resolved by autopilot)

- **Segment shape**: flat array per the user's epic-design resolution.
  No tree, no nested structure — segments are the post-sort sequence
  that joins with `"\n\n"` to produce the final prompt. Each segment
  carries enough info to render itself + diff against its default.
- **Source taxonomy**: `"default" | "override" | "append" | "global" |
  "additional"`. The fifth source `"additional"` captures system-injected
  fragments that aren't user-authored (course context, lock indicator,
  memory inspector — fragments passed via `additionalFragments` whose
  position is something other than `user-global` / `user-append`). The
  diff renderer treats `"additional"` as "non-customized system context"
  — display but don't diff against a default.
- **Per-segment `defaultText`**: included for mode fragments only
  (where a default exists). Absent for `append`, `global`, and
  `additional` segments (those have no notion of "the user's default").
- **IPC channel evolution**: add `praxis.author.previewPromptWithAttribution`
  as a NEW channel rather than changing `praxis.author.previewPrompt`'s
  return shape. The old channel stays for the simple string case
  (`unified-configure-surface`'s live editor preview pane while the
  user is still on the Composed tab can use either; `diff-aware-preview`
  uses the new one). Coordinating shape changes across the IPC boundary
  for a single in-flight epic is cheaper than a versioned channel.
- **No behavior change for existing callers**: `composeSystemPrompt`
  returns exactly the same string for the same input. The refactor must
  be byte-equivalent — covered by keeping the existing compose tests
  passing.

## Implementation Units

### Unit 1: New types

**File**: `packages/curriculum/src/brief/compose.ts` (extend in-place;
no new file needed — the API surface is small and lives with its
function).

Add exports:

```typescript
export type SegmentSource =
  | "default"      // mode fragment, no override active
  | "override"     // mode fragment, user override active
  | "append"       // user-append synthetic fragment
  | "global"       // user-global synthetic fragment
  | "additional";  // system-injected fragment (course context, lock indicator, etc.)

export interface ComposedSegment {
  /** Stable id of the fragment this segment was rendered from. */
  fragmentId: string;
  /** Position slot in `FRAGMENT_ORDER`. */
  position: PromptFragment["position"];
  /** Where this segment's text came from. */
  source: SegmentSource;
  /** The rendered text — exactly what appears in the joined `prompt`. */
  text: string;
  /**
   * The fragment's unmodified default template. Present only for mode
   * fragments (source `"default"` or `"override"`). Absent for user
   * layers and system-injected fragments — they have no notion of a
   * default to diff against.
   */
  defaultText?: string;
  /** Mirrors `PromptFragment.customizable` for UI affordances. */
  customizable: boolean;
}

export interface ComposedSystemPromptWithAttribution {
  /** Joined output, equivalent to `composeSystemPrompt(input)`. */
  prompt: string;
  /** Segments in render order. `segments.map(s => s.text).join("\\n\\n") === prompt`. */
  segments: ComposedSegment[];
}
```

**Acceptance Criteria**:
- [ ] Types exported from `@praxis/curriculum/brief` (re-export path
      that existing callers of `composeSystemPrompt` already use).

---

### Unit 2: `composeSystemPromptWithAttribution`

**File**: `packages/curriculum/src/brief/compose.ts`

```typescript
export function composeSystemPromptWithAttribution(
  input: ComposeSystemPromptInput,
): ComposedSystemPromptWithAttribution {
  const overrides = input.overrides ?? new Map<string, string>();

  // Same validation as composeSystemPrompt today.
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue; // tolerate stale overrides
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }

  // Build the set of mode-fragment ids once for O(1) attribution lookups.
  const modeFragmentIds = new Set(input.mode.promptFragments.map((f) => f.id));

  const all = [...input.mode.promptFragments, ...(input.additionalFragments ?? [])];
  const sorted = all.sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );

  const segments: ComposedSegment[] = sorted.map((f) => {
    const isModeFragment = modeFragmentIds.has(f.id);
    const hasOverride = overrides.has(f.id);

    if (isModeFragment) {
      const source: SegmentSource = hasOverride ? "override" : "default";
      const text = hasOverride ? overrides.get(f.id)! : f.template;
      return {
        fragmentId: f.id,
        position: f.position,
        source,
        text,
        defaultText: f.template,
        customizable: f.customizable,
      };
    }

    // Additional fragment: classify by position.
    let source: SegmentSource;
    if (f.position === "user-global") source = "global";
    else if (f.position === "user-append") source = "append";
    else source = "additional";

    return {
      fragmentId: f.id,
      position: f.position,
      source,
      text: f.template,
      customizable: f.customizable,
    };
  });

  return {
    prompt: segments.map((s) => s.text).join("\n\n"),
    segments,
  };
}
```

Then refactor the existing `composeSystemPrompt`:

```typescript
export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  return composeSystemPromptWithAttribution(input).prompt;
}
```

**Implementation Notes**:
- `sort()` mutates the array. The existing code already does this on
  a fresh array, so behavior is preserved.
- The `modeFragmentIds` set lets attribution decide "default vs.
  override vs. additional" by id — handles the edge case noted in the
  existing JSDoc: an additional fragment sharing an id with a mode
  fragment. (Behavior under that edge: both would be present pre-sort,
  the additional would NOT auto-override; attribution treats the
  mode-fragment instance as `default`/`override` and the duplicate
  additional as... well, also a mode-fragment-id-matching additional.
  This is the documented "don't share ids" foot-gun; attribution
  preserves that by checking `modeFragmentIds.has(f.id)` — both
  duplicates get classified as mode fragments since they share the id.
  Acceptable: the existing function is already known to behave oddly
  here, and attribution faithfully reflects the existing behavior.)

**Acceptance Criteria**:
- [ ] `composeSystemPromptWithAttribution(input).prompt ===
      composeSystemPrompt(input)` for every test input.
- [ ] `segments.map(s => s.text).join("\\n\\n") === prompt` is an
      invariant verified by a property-style test.
- [ ] Default segment: text === defaultText.
- [ ] Override segment: text !== defaultText (when override differs).
- [ ] Global segment: source === "global", defaultText === undefined.
- [ ] Append segment: source === "append", defaultText === undefined.
- [ ] Additional fragment at non-user position → source === "additional".

---

### Unit 3: Service method + interface

**File**: `packages/core/src/services/prompt-customization-service.ts`

Add to the interface (after the existing `previewPrompt` declaration,
around line 76):

```typescript
/**
 * Structured preview returning the composed prompt plus per-segment
 * source attribution. Used by the diff-aware preview pane to render
 * overridden spans and diff against defaults. Same draft/null/undefined
 * semantics as `previewPrompt`.
 */
previewPromptWithAttribution(
  input: PreviewPromptInput,
): ComposedSystemPromptWithAttribution;
```

Re-export the return type from a stable path. The type is defined in
`@praxis/curriculum/brief` — `prompt-customization-service.ts` imports
it (alongside the existing `composeSystemPrompt` import).

Add the implementation (after `previewPrompt`, around line 195):

```typescript
previewPromptWithAttribution(
  input: PreviewPromptInput,
): ComposedSystemPromptWithAttribution {
  const mode = requireMode(input.modeId);

  const storedOverrides = this.listFragmentOverrides(input.modeId);
  const overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));

  const additional: PromptFragment[] = [];

  const globalText =
    input.draftGlobal !== undefined
      ? (input.draftGlobal ?? "").trim() || null
      : this.getGlobalFragment();
  if (globalText !== null) {
    additional.push({
      id: "user.global",
      position: "user-global",
      customizable: true,
      template: globalText,
    });
  }

  const appendText =
    input.draftAppend !== undefined
      ? (input.draftAppend ?? "").trim() || null
      : this.getModeAppend(input.modeId);
  if (appendText !== null) {
    additional.push({
      id: `user.append.${input.modeId}`,
      position: "user-append",
      customizable: true,
      template: appendText,
    });
  }

  return composeSystemPromptWithAttribution({
    mode,
    ...(overrides.size > 0 && { overrides }),
    ...(additional.length > 0 && { additionalFragments: additional }),
  });
}
```

This is the same dispatch as `previewPrompt` but ends in the attribution
function. Worth a small DRY refactor — extract the
`{ mode, overrides, additional }` builder into a private helper that
both methods call:

```typescript
private buildPreviewInput(input: PreviewPromptInput): ComposeSystemPromptInput {
  // returns { mode, overrides?, additionalFragments? } — same logic as today
}

previewPrompt(input: PreviewPromptInput): string {
  return composeSystemPrompt(this.buildPreviewInput(input));
}

previewPromptWithAttribution(input: PreviewPromptInput): ComposedSystemPromptWithAttribution {
  return composeSystemPromptWithAttribution(this.buildPreviewInput(input));
}
```

**Acceptance Criteria**:
- [ ] Service interface includes the new method.
- [ ] `previewPromptWithAttribution(input).prompt ===
      previewPrompt(input)` for every test input.
- [ ] No new state — both methods are pure over the stored config.

---

### Unit 4: IPC channel + client

**File**: `packages/desktop/electron/main/` — wherever
`praxis.author.previewPrompt` is registered.

Add a sibling handler:

```typescript
handle(
  "praxis.author.previewPromptWithAttribution",
  async (_event, input: PreviewPromptInput) => {
    return services.promptCustomization.previewPromptWithAttribution(input);
  },
);
```

**File**: `packages/client/src/services/authoring-client.ts` — extend
the client with a sibling method:

```typescript
previewPromptWithAttribution(
  input: PreviewPromptInput,
): Promise<ComposedSystemPromptWithAttribution> {
  return this.transport.invoke<ComposedSystemPromptWithAttribution>(
    `${C}.previewPromptWithAttribution`,
    input,
  );
}
```

Update the `AuthoringClientApi` interface in `@praxis/core/types/` (or
wherever it lives) to declare the new method.

**Acceptance Criteria**:
- [ ] New channel registered; old channel untouched.
- [ ] Client method added; old method untouched.
- [ ] Roundtrip test: client calls
      `previewPromptWithAttribution` → handler delegates to service →
      structured response shape returns intact (Date / undefined
      handling correct over the IPC boundary, although here all
      segment fields are primitive so this is straightforward).

---

## Implementation Order

Single-stride. No child stories — the feature is small (~150 lines net
new code) and tightly cohesive. Suggested order within the stride:

1. Unit 1 + Unit 2 in one pass on `compose.ts` (types + new function +
   refactor of `composeSystemPrompt` to delegate).
2. Unit 3 — service method + DRY refactor.
3. Unit 4 — IPC channel + client method + interface update.
4. Tests at each stage (don't defer all tests to the end).

## Testing

### Unit tests

**File**: `packages/curriculum/src/brief/__tests__/compose.test.ts`
(create if missing; otherwise extend)

Test cases for `composeSystemPromptWithAttribution`:
- **Equivalence**: result.prompt matches existing
  `composeSystemPrompt(input)` for representative modes (teach, quiz,
  bootstrap).
- **Default segments**: all source === "default", text === defaultText.
- **Override segments**: override applied, source === "override",
  defaultText preserved, text === override.
- **User-global additional**: source === "global", defaultText
  undefined.
- **User-append additional**: source === "append", defaultText
  undefined.
- **System additional at non-user position** (e.g., context fragment):
  source === "additional", defaultText undefined.
- **Stale override** (id not in mode): tolerated, doesn't crash, not
  reflected in any segment.
- **Non-customizable override**: throws (same as existing).
- **Invariant**: `segments.map(s => s.text).join("\\n\\n") === prompt`
  across all test cases.

**File**: `packages/core/src/services/__tests__/prompt-customization-service.test.ts`

Test cases for `previewPromptWithAttribution`:
- Mirrors every existing `previewPrompt` test with an
  `.previewPromptWithAttribution` assertion alongside, verifying
  `result.prompt` matches the existing string output.
- Asserts segment shape for a representative case (e.g., one mode
  with a stored override + a draft append + the global from
  config_kv).

### IPC integration

If there's an existing pattern for IPC roundtrip tests in
`packages/desktop/electron/main/__tests__/` or `packages/client/`,
follow it for the new channel. Otherwise rely on the unit tests +
manual smoke during `diff-aware-preview` integration.

## Risks

1. **Equivalence regression** (medium → mitigated). The refactor of
   `composeSystemPrompt` to call `composeSystemPromptWithAttribution`
   must produce byte-identical output. Mitigation: keep all existing
   `compose` tests passing unchanged; add the equivalence assertion to
   new tests. If the refactor proves fiddly (sort stability, separator
   exactness), revert to keeping the two functions independent and
   accept a small duplication.
2. **Edge case: additional fragment shares mode-fragment id** (low).
   Documented foot-gun in existing JSDoc; attribution preserves the
   existing odd-but-consistent behavior. Worth a comment in the
   implementation noting the choice.
3. **IPC type roundtrip** (low). The return shape is all primitive
   strings + optional string + literal-union enum. No `Date`, no
   special values. Safe over the existing IPC transport.

## Notes for downstream

`diff-aware-preview` (wave-2 feature) consumes `ComposedSegment[]` to
render diffs. Confirmed shape: per-segment `source` enum drives the
color/tag UI; `defaultText` (when present) drives the diff against
default. The renderer doesn't need additional information from
compose — everything diff-aware-preview needs is in the segment shape.
