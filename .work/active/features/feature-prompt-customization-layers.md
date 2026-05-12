---
id: feature-prompt-customization-layers
kind: feature
stage: done
tags: [content, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

UX surfaces:
- **Settings** → global prompt editor (textarea, monospace, with a "view
  default prompt" disclosure).
- **Per-mode configuration** (already exists for some modes) → append-text
  field, plus a "view default prompt for this mode" disclosure.
- Both surfaces show the *effective* composed prompt so the user can see what
  the model will actually receive.

## Design decisions

These resolve ambiguities surfaced during the design pass.

- **Pre-existing wiring bug folded in.** Phase 11's `prompt_overrides` table is
  written by `AuthoringService.customizePrompt` / `clearFragmentOverride` /
  `setStyleSliders` but **never read** in the session compose path — today's
  "save override" UI is a no-op at session time. Story 1 fixes this. The same
  composition pipeline carries the two new layers, so it's the right surface
  to wire end-to-end once.
- **Slot order — two new positions before postamble.** `FRAGMENT_ORDER`
  becomes: `preamble, role, principles, tools, context, constraints,
  user-global, user-append, postamble`. Global fragment first (broadest
  scope), per-mode append after (more specific). Postamble stays last — it
  carries the framework's "ask one question at a time" coda, which is
  load-bearing for the chat loop. Clear separation between framework content
  and user content.
- **Live preview pane next to the editor.** Both UI surfaces show a live
  preview of the effective composed prompt, debounced on textarea changes.
  Backed by a new `praxis.author.previewPrompt({ modeId, draftGlobal?,
  draftAppend? })` IPC that composes against the modeRegistry + stored values
  + draft overrides.
- **Full-prompt replace is NOT a new affordance.** The existing
  `PromptFragmentEditor` (Phase 11) already lets users replace any
  customizable fragment's text. That's the "I know what I'm doing" power-user
  escape hatch and is lock-gated + audit-logged. The two new layers are the
  lightweight customization paths the brief asks for — they're additive, not
  replacement.

## Architectural choice

Build on the existing prompt-fragment composition system. Add two new
`PromptFragmentPosition` slots — `"user-global"` and `"user-append"` — both
before `"postamble"` in `FRAGMENT_ORDER`. Loaded as `additionalFragments` in
`session-service.openActive()`. A new `PromptCustomizationService` owns the
storage layer (config_kv for global, new `mode_prompt_appends` table for
per-mode) and the compose-time read path.

### Rejected alternatives

- **Concatenate both layers into a single "user" position slot.** Loses the
  semantic separation; harder to extend later (e.g., a "per-course append"
  layer later this year would want its own position).
- **Place user layers AFTER postamble.** Lets user text override the
  postamble coda. Risks the user accidentally undoing the framework's
  "ask one question at a time" pedagogy commitment by trailing prose.
- **Store global fragment in a new table.** Overkill for one string. `config_kv`
  is already the singleton-config home (engine config, bootstrap budget,
  first-run flag); adding one more key fits the pattern.
- **Store per-mode appends in `prompt_overrides` with a sentinel `fragmentId`
  like `@append`.** Mixes semantics — `override` rows mean "replace fragment
  X's text" while an append is "add text at a new position". A separate
  `mode_prompt_appends` table keeps the meanings clean and the queries
  trivial.

## Implementation Units

### Unit 1: Type contract + FRAGMENT_ORDER extension
**Files**: `packages/core/src/types/mode.ts`, `packages/curriculum/src/brief/compose.ts`
**Story**: `feature-prompt-customization-layers-compose-wiring`

```typescript
// packages/core/src/types/mode.ts — extend the position union:
export type PromptFragmentPosition =
  | "preamble"
  | "role"
  | "principles"
  | "tools"
  | "context"
  | "constraints"
  | "user-global"   // ← new
  | "user-append"   // ← new
  | "postamble";
```

```typescript
// packages/curriculum/src/brief/compose.ts — extend the order:
const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble",
  "role",
  "principles",
  "tools",
  "context",
  "constraints",
  "user-global",
  "user-append",
  "postamble",
];
```

**Implementation Notes**:
- These are pure additive changes. Existing fragments and modes are unaffected because none of them use the new positions today.
- Update the existing `compose.test.ts` to verify the new positions sort correctly between `constraints` and `postamble`.
- The `mode-prompt-fragment-composition` pattern file (`.claude/skills/patterns/mode-prompt-fragment-composition.md`) should be updated to reflect the new positions — landed as part of this story.

**Acceptance Criteria**:
- [ ] `PromptFragmentPosition` includes `"user-global"` and `"user-append"`.
- [ ] `FRAGMENT_ORDER` has 9 entries in the documented order.
- [ ] A fragment with `position: "user-global"` and one with `position: "user-append"` sort between `constraints` and `postamble` in `composeSystemPrompt`.

---

### Unit 2: `mode_prompt_appends` table + migration + schema export
**Files**: `packages/core/src/schema.ts`, `drizzle/<next-migration>.sql`
**Story**: `feature-prompt-customization-layers-compose-wiring`

```typescript
// packages/core/src/schema.ts — new table:
export const modePromptAppends = sqliteTable("mode_prompt_appends", {
  modeId: text("mode_id").primaryKey(),
  text: text("text").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Add to coreSchema export object alongside the others.
```

**Implementation Notes**:
- Run `pnpm db:generate` to produce the SQL migration. Commit the generated SQL.
- No data backfill needed — empty table at first install.
- Key is `modeId` alone (no studentId column) — Praxis is single-student per install in v1 (SPEC.md "Out of scope for v1: multi-student installations"). When multi-student lands later, this table grows a `studentId` column.

**Acceptance Criteria**:
- [ ] `mode_prompt_appends` table exists in the schema and is exported from `coreSchema`.
- [ ] Migration SQL committed under `drizzle/`.
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB.
- [ ] Drizzle types compile.

---

### Unit 3: `PromptCustomizationService`
**Files**: `packages/core/src/services/prompt-customization-service.ts` (new), `packages/core/src/types/services.ts` (extend `ServiceDeps`), `packages/core/src/services/index.ts` (barrel)
**Story**: `feature-prompt-customization-layers-compose-wiring`

```typescript
// packages/core/src/services/prompt-customization-service.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv, modePromptAppends, promptOverrides } from "../schema.js";

const CONFIG_KEY = "prompt.global_fragment";

const GlobalFragmentSchema = z.object({
  text: z.string().max(20_000),
});

export interface FragmentOverride {
  modeId: string;
  fragmentId: string;
  override: string;
}

export interface PromptCustomizationService {
  /** Returns null when no global fragment has been set or its text is empty. */
  getGlobalFragment(): string | null;
  /** Set to null/empty to clear. */
  setGlobalFragment(text: string | null): void;

  /** Returns null when no per-mode append has been set for this mode. */
  getModeAppend(modeId: string): string | null;
  /** Set to null/empty to clear. */
  setModeAppend(modeId: string, text: string | null): void;

  /** Returns every prompt_overrides row for the given mode. Used by compose path. */
  listFragmentOverrides(modeId: string): FragmentOverride[];
}

export interface PromptCustomizationServiceDeps {
  db: PraxisDb;
}

export class PromptCustomizationServiceImpl implements PromptCustomizationService {
  constructor(private readonly deps: PromptCustomizationServiceDeps) {}

  getGlobalFragment(): string | null {
    const row = this.deps.db
      .select()
      .from(configKv)
      .where(eq(configKv.key, CONFIG_KEY))
      .get();
    if (!row) return null;
    const parsed = GlobalFragmentSchema.safeParse(row.valueJson);
    if (!parsed.success) return null;
    const t = parsed.data.text.trim();
    return t.length > 0 ? t : null;
  }

  setGlobalFragment(text: string | null): void {
    const t = (text ?? "").trim();
    const now = new Date();
    if (t.length === 0) {
      this.deps.db.delete(configKv).where(eq(configKv.key, CONFIG_KEY)).run();
      return;
    }
    const value = GlobalFragmentSchema.parse({ text: t });
    this.deps.db
      .insert(configKv)
      .values({ key: CONFIG_KEY, valueJson: value, updatedAt: now })
      .onConflictDoUpdate({
        target: configKv.key,
        set: { valueJson: value, updatedAt: now },
      })
      .run();
  }

  getModeAppend(modeId: string): string | null {
    const row = this.deps.db
      .select()
      .from(modePromptAppends)
      .where(eq(modePromptAppends.modeId, modeId))
      .get();
    if (!row) return null;
    const t = row.text.trim();
    return t.length > 0 ? t : null;
  }

  setModeAppend(modeId: string, text: string | null): void {
    const t = (text ?? "").trim();
    const now = new Date();
    if (t.length === 0) {
      this.deps.db.delete(modePromptAppends).where(eq(modePromptAppends.modeId, modeId)).run();
      return;
    }
    this.deps.db
      .insert(modePromptAppends)
      .values({ modeId, text: t, updatedAt: now })
      .onConflictDoUpdate({
        target: modePromptAppends.modeId,
        set: { text: t, updatedAt: now },
      })
      .run();
  }

  listFragmentOverrides(modeId: string): FragmentOverride[] {
    return this.deps.db
      .select()
      .from(promptOverrides)
      .where(eq(promptOverrides.modeId, modeId))
      .all();
  }
}
```

```typescript
// packages/core/src/types/services.ts — extend ServiceDeps + ToolServices
// (whichever holds the existing services bag):
export interface ServiceDeps {
  // ... existing ...
  promptCustomization: PromptCustomizationService;
}
```

**Implementation Notes**:
- Maximum length 20,000 chars on the global fragment (and ideally the per-mode append) prevents accidental DoS by user input. Validate at write time via Zod.
- Trim-and-null semantics: empty/whitespace-only inputs delete the row rather than storing empty strings. Consumers see `null` and skip injection.
- Single global key (`prompt.global_fragment`) — Praxis is single-student per install in v1.
- Service injected into the same `ServiceDeps` bag as `ConfigService`, `AuthoringService`, etc. Constructed in `buildServices` (`packages/desktop/electron/main/services.ts`).

**Acceptance Criteria**:
- [ ] `PromptCustomizationServiceImpl` class implements all five interface methods.
- [ ] `getGlobalFragment` returns null when the row is absent or empty after trim.
- [ ] `setGlobalFragment(null)` or `setGlobalFragment("   ")` deletes the row.
- [ ] `getModeAppend("teach")` returns null when not set; round-trips after set.
- [ ] `listFragmentOverrides("teach")` returns a snapshot of stored overrides for that mode.
- [ ] Service wired into `ServiceDeps` and constructed in `buildServices`.

---

### Unit 4: Session-service compose-path wiring
**Files**: `packages/core/src/services/session-service.ts`
**Story**: `feature-prompt-customization-layers-compose-wiring`

```typescript
// packages/core/src/services/session-service.ts — extend openActive:
// (current lines 567-639 hold the existing overrides + composeSystemPrompt call)

// 1) Read stored prompt_overrides for this mode and fold into the overrides map.
const storedOverrides = this.deps.promptCustomization.listFragmentOverrides(args.mode.id);
let overrides: Map<string, string> | undefined;
if (storedOverrides.length > 0) {
  overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));
}

// 2) Existing dynamic course-context / assignment-context injection (unchanged
//    logic, but now layered ON TOP of the stored overrides — explicit course
//    state always wins over a user's static replacement of the same fragment id).
// ... existing if (args.courseId) ... etc. blocks set `overrides` ...

// 3) Build additionalFragments from the two new user-customization layers.
const additionalFragments: PromptFragment[] = [];

const globalText = this.deps.promptCustomization.getGlobalFragment();
if (globalText !== null) {
  additionalFragments.push({
    id: "user.global",
    position: "user-global",
    customizable: true,
    template: globalText,
  });
}

const appendText = this.deps.promptCustomization.getModeAppend(args.mode.id);
if (appendText !== null) {
  additionalFragments.push({
    id: `user.append.${args.mode.id}`,
    position: "user-append",
    customizable: true,
    template: appendText,
  });
}

// 4) Compose with both knobs threaded through.
const systemPrompt = composeSystemPrompt({
  mode: args.mode,
  ...(overrides !== undefined && { overrides }),
  ...(additionalFragments.length > 0 && { additionalFragments }),
});
```

**Implementation Notes**:
- **Ordering of overrides**: stored fragment-overrides go in first; dynamic course-context / assignment-context overrides set later via `overrides.set(...)`. The dynamic overrides win for the same fragment id — that's the correct precedence (a stale user override of `context.course-state` should NOT mask the live course state).
- `additionalFragments` are pushed only when their text is non-null. An empty user-global produces zero fragments in that slot — no `\n\n` gap in the composed prompt.
- The composition path stays deterministic. Same DB state + same args → same prompt.
- This is the wiring fix for the Phase 11 bug. Existing `customizePrompt` saves now take effect at session start.

**Acceptance Criteria**:
- [ ] Saving a fragment override via `AuthoringService.customizePrompt(modeId, fragmentId, override)` produces a prompt at session start where that fragment's text is the override.
- [ ] Setting a global fragment via `PromptCustomizationService.setGlobalFragment(text)` injects it at the `user-global` slot in every mode.
- [ ] Setting a per-mode append via `setModeAppend("teach", text)` injects it at the `user-append` slot in teach mode only.
- [ ] A user override of `context.course-state` is masked by the live course-context fragment when a courseId is set on the session (dynamic always wins for same id).
- [ ] An assignment override of `context.assignment` is masked by the live assignment fragment when an assignmentId is set.
- [ ] No regression: existing session tests still pass.

---

### Unit 5: `previewPrompt` IPC
**Files**: `packages/core/src/services/prompt-customization-service.ts` (extend), `packages/core/src/services/authoring-service.ts` (extend), `packages/desktop/electron/main/ipc-server.ts` (handler), `packages/client/src/services/authoring-client.ts` (client), `packages/curriculum/src/modes/registry.ts` (verify export)
**Story**: `feature-prompt-customization-layers-compose-wiring`

```typescript
// packages/core/src/services/prompt-customization-service.ts — add:
export interface PreviewPromptInput {
  modeId: string;
  /** Draft text for the global fragment. Use this to preview unsaved edits. When undefined, falls back to stored. */
  draftGlobal?: string | null;
  /** Draft text for the mode-specific append. */
  draftAppend?: string | null;
}

// Add to interface:
previewPrompt(input: PreviewPromptInput): string;

// Impl:
previewPrompt(input: PreviewPromptInput): string {
  const mode = modeRegistry.get(input.modeId);
  if (!mode) throw new Error(`Unknown mode: ${input.modeId}`);

  const storedOverrides = this.listFragmentOverrides(input.modeId);
  const overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));

  const additional: PromptFragment[] = [];

  const globalText = input.draftGlobal !== undefined
    ? (input.draftGlobal ?? "").trim() || null
    : this.getGlobalFragment();
  if (globalText !== null) {
    additional.push({ id: "user.global", position: "user-global", customizable: true, template: globalText });
  }

  const appendText = input.draftAppend !== undefined
    ? (input.draftAppend ?? "").trim() || null
    : this.getModeAppend(input.modeId);
  if (appendText !== null) {
    additional.push({ id: `user.append.${input.modeId}`, position: "user-append", customizable: true, template: appendText });
  }

  return composeSystemPrompt({
    mode,
    ...(overrides.size > 0 && { overrides }),
    ...(additional.length > 0 && { additionalFragments: additional }),
  });
}
```

```typescript
// packages/core/src/services/authoring-service.ts — add four methods:
async setGlobalPrompt(text: string | null): Promise<void> {
  this.deps.promptCustomization.setGlobalFragment(text);
  this.appendAction({ kind: "prompt.set_global_fragment", chars: (text ?? "").trim().length });
}

async getGlobalPrompt(): Promise<string | null> {
  return this.deps.promptCustomization.getGlobalFragment();
}

async setModeAppend(input: { modeId: string; text: string | null }): Promise<void> {
  this.deps.promptCustomization.setModeAppend(input.modeId, input.text);
  this.appendAction({
    kind: "prompt.set_mode_append",
    modeId: input.modeId,
    chars: (input.text ?? "").trim().length,
  });
}

async getModeAppend(modeId: string): Promise<string | null> {
  return this.deps.promptCustomization.getModeAppend(modeId);
}

async previewPrompt(input: PreviewPromptInput): Promise<string> {
  return this.deps.promptCustomization.previewPrompt(input);
}
```

```typescript
// packages/desktop/electron/main/ipc-server.ts — add five handlers next to praxis.author.customizePrompt:
"praxis.author.setGlobalPrompt": ({ text }) => services.authoring.setGlobalPrompt(text),
"praxis.author.getGlobalPrompt": () => services.authoring.getGlobalPrompt(),
"praxis.author.setModeAppend":  (input) => services.authoring.setModeAppend(input),
"praxis.author.getModeAppend":  ({ modeId }) => services.authoring.getModeAppend(modeId),
"praxis.author.previewPrompt":  (input) => services.authoring.previewPrompt(input),
```

```typescript
// packages/client/src/services/authoring-client.ts — add matching client methods:
async setGlobalPrompt(text: string | null): Promise<void> { /* invoke */ }
async getGlobalPrompt(): Promise<string | null> { /* invoke */ }
async setModeAppend(input: { modeId: string; text: string | null }): Promise<void> { /* invoke */ }
async getModeAppend(modeId: string): Promise<string | null> { /* invoke */ }
async previewPrompt(input: { modeId: string; draftGlobal?: string | null; draftAppend?: string | null }): Promise<string> { /* invoke */ }
```

**Implementation Notes**:
- `modeRegistry` — verify the exported lookup helper in `@praxis/curriculum`. If only the array exists, add a `getMode(modeId): Mode | undefined` helper.
- `previewPrompt` is server-side because it needs the mode registry + stored values + same composition logic the session-service uses. Doing it client-side would force duplicating fragment definitions in the renderer.
- New `ConfiguratorAction` variants (`prompt.set_global_fragment`, `prompt.set_mode_append`) — add to the action union type. Audit log entry only records char count, not content, so secrets typed into prompts don't end up in the audit log forever.
- The "author" namespace IPC channels are gated by the configurator-lock guard the existing channels use — same auth/lock check applies.

**Acceptance Criteria**:
- [ ] `previewPrompt({ modeId: "teach" })` returns a string that equals what `composeSystemPrompt` would produce with the current stored values.
- [ ] `previewPrompt({ modeId: "teach", draftGlobal: "Hi" })` returns a prompt with the draft text injected at the user-global slot, regardless of stored value.
- [ ] `previewPrompt({ modeId: "teach", draftGlobal: null })` returns a prompt with NO user-global slot, even if a global is stored.
- [ ] IPC channels round-trip; client methods invoke them correctly.
- [ ] Configurator actions audit log captures char count on `setGlobalPrompt` and `setModeAppend`.
- [ ] Lock guard rejects `setGlobalPrompt` / `setModeAppend` calls when locked.

---

### Unit 6: Settings global-prompt editor
**Files**: `packages/ui/src/routes/settings.tsx` (extend), `packages/ui/src/components/global-prompt-editor.tsx` (new), `packages/ui/src/components/global-prompt-editor.module.css` (new)
**Story**: `feature-prompt-customization-layers-settings-global`

```tsx
// packages/ui/src/components/global-prompt-editor.tsx
import { useEffect, useState, useDeferredValue } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./global-prompt-editor.module.css";

const PREVIEW_MODES = ["teach", "quiz", "homework", "exam", "configure", "bootstrap", "study-skills"] as const;

export function GlobalPromptEditor(): JSX.Element {
  const client = usePraxisClient();
  const [stored, setStored] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [previewMode, setPreviewMode] = useState<string>("teach");
  const [preview, setPreview] = useState<string>("");
  const deferredDraft = useDeferredValue(draft);

  // Load stored value on mount.
  useEffect(() => {
    void (async () => {
      try {
        const text = (await client.author.getGlobalPrompt()) ?? "";
        setStored(text);
        setDraft(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [client]);

  // Recompute preview when draft or previewMode changes (debounced via useDeferredValue).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const composed = await client.author.previewPrompt({
          modeId: previewMode,
          draftGlobal: deferredDraft,
        });
        if (!cancelled) setPreview(composed);
      } catch { /* keep prior preview on transient errors */ }
    })();
    return () => { cancelled = true; };
  }, [client, previewMode, deferredDraft]);

  const dirty = draft.trim() !== stored.trim();

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const value = draft.trim() === "" ? null : draft;
      await client.author.setGlobalPrompt(value);
      setStored(draft);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>loading…</p>;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Global prompt</h2>
      <p className={styles.lede}>
        Text appended to every mode's system prompt. Use this for cross-cutting
        teaching style or persona that should apply universally.
      </p>

      <div className={styles.editorGrid}>
        <div className={styles.editorPane}>
          <label htmlFor="global-prompt-textarea" className={styles.label}>
            Your text
          </label>
          <textarea
            id="global-prompt-textarea"
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            maxLength={20_000}
            placeholder="Add cross-mode guidance for your tutor…"
            disabled={saving}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void save()}
              disabled={!dirty || saving}
            >
              {saving ? "saving…" : "save"}
            </button>
            {savedAt && !dirty && (
              <span className={styles.savedHint}>
                saved · {savedAt.toLocaleTimeString()}
              </span>
            )}
            {error && <span className={styles.error}>error: {error}</span>}
          </div>
        </div>

        <div className={styles.previewPane}>
          <div className={styles.previewHeader}>
            <label htmlFor="preview-mode" className={styles.label}>preview against</label>
            <select
              id="preview-mode"
              value={previewMode}
              onChange={(e) => setPreviewMode(e.target.value)}
              className={styles.modeSelect}
            >
              {PREVIEW_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <pre className={styles.preview}>{preview}</pre>
        </div>
      </div>
    </section>
  );
}
```

```tsx
// packages/ui/src/routes/settings.tsx — render the new editor:
<GlobalPromptEditor />
```

**Implementation Notes**:
- `useDeferredValue` gives natural debounce — React's concurrent scheduler defers the preview recompute until the user stops typing. No manual debounce timer.
- Save semantics: explicit save button. Matches Settings' existing engine-config form. Save is gated by `dirty && !saving`.
- Preview shows the FULL effective composed prompt — not just the user content. The user sees exactly what the model receives, including the framework's preamble, principles, etc. Read-only `<pre>` element with horizontal scroll on overflow.
- `editorial` CSS class composes for the prose, but the `<textarea>` and `<pre>` use monospace for accuracy.
- 20,000 char limit matches the server-side cap. Browser-side enforcement via `maxLength`.
- When `draft.trim() === ""`, save clears the stored fragment (passes `null`).

**Acceptance Criteria**:
- [ ] On mount, the textarea is populated with the stored global fragment (empty if none).
- [ ] As the user types, the preview pane updates (via useDeferredValue) to show the composed prompt with the draft text injected.
- [ ] Changing the "preview against" mode dropdown updates the preview to that mode's composed prompt.
- [ ] Save button is disabled until the draft differs from stored.
- [ ] Clicking save persists via `client.author.setGlobalPrompt(text)` and shows a "saved" indicator.
- [ ] Saving with an empty/whitespace-only textarea passes `null` and clears the stored row.
- [ ] Server-side validation errors surface inline.
- [ ] Lock-gated: when the configurator is locked, the editor renders read-only with an "unlock to edit" hint (or hides the save button — match the existing prompt-tab behavior).

---

### Unit 7: Configure prompt-tab per-mode append editor
**Files**: `packages/ui/src/routes/configure/prompt-tab.tsx` (extend), `packages/ui/src/components/mode-append-editor.tsx` (new), `packages/ui/src/components/mode-append-editor.module.css` (new)
**Story**: `feature-prompt-customization-layers-configure-mode-append`

```tsx
// packages/ui/src/components/mode-append-editor.tsx
// Same shape as <GlobalPromptEditor> but scoped to a single mode:
//   - Mode selector dropdown at the top (picks which mode's append to edit).
//   - On mode change: fetch the stored append for that mode, repopulate textarea.
//   - Live preview pane composes against the selected mode using
//     draftAppend (not draftGlobal).
//   - Save calls client.author.setModeAppend({ modeId, text }).
// Reuse <GlobalPromptEditor>'s preview pane component if possible (extract
// a shared <PromptPreviewPane mode previewBody /> primitive).
```

```tsx
// packages/ui/src/routes/configure/prompt-tab.tsx — add a new section ABOVE
// the existing PromptFragmentEditor:
<section>
  <h2>Per-mode append</h2>
  <p>Add text to the end of a specific mode's prompt. The text appears after the
     framework's content and before the postamble.</p>
  <ModeAppendEditor />
</section>

<section>
  <h2>Style sliders</h2>
  {/* existing */}
</section>

<section>
  <h2>Fragment overrides</h2>
  <p className={styles.advancedHint}>
    Advanced: replace specific framework fragments wholesale. Use append above
    for additive customization first.
  </p>
  <PromptFragmentEditor />
</section>
```

**Implementation Notes**:
- Reframe the existing `<PromptFragmentEditor>` as "advanced" — a small intro paragraph guides users to the per-mode append first.
- Mode picker dropdown lists all student-facing modes: `teach`, `quiz`, `homework`, `exam`, `configure`, `bootstrap`, `study-skills`. Drives both the textarea content (load on mode change) and the preview.
- Saving an empty/whitespace textarea clears the stored append for that mode.
- Extract a shared `<PromptPreviewPane modeId draftGlobal? draftAppend?>` component used by both editors (DRY for the preview rendering + debounce + IPC call).

**Acceptance Criteria**:
- [ ] Mode selector defaults to `teach`; loads the stored append for whatever mode is selected.
- [ ] Textarea drives a live preview pane.
- [ ] Save persists via `client.author.setModeAppend({ modeId, text })`.
- [ ] Existing style sliders and fragment editor surfaces still work (no regression).
- [ ] The "Advanced: replace specific framework fragments wholesale" framing copy is present above the existing `<PromptFragmentEditor>`.
- [ ] Lock-gated: matches the existing prompt-tab's lock behavior.

---

## Implementation order

```
Story 1 (compose-wiring)             ─── foundation: types, table, service, session-service reads
Story 2 (settings-global)            ─── depends on Story 1
Story 3 (configure-mode-append)      ─── depends on Story 1
```

Stories 2 and 3 can run in parallel after Story 1 lands.

## Testing

### Story 1 (compose-wiring)

**`packages/curriculum/src/__tests__/compose.test.ts`** — extend:
- Two new fragments at `position: "user-global"` and `"user-append"` are sorted between `constraints` and `postamble`.
- A fragment at `"user-append"` appears AFTER one at `"user-global"` in the composed output.
- Combined with an `overrides` map, fragment overrides take effect and additionalFragments are still appended at their positions.

**`packages/core/src/services/__tests__/prompt-customization-service.test.ts`** (new) — full unit suite:
- `getGlobalFragment` returns null when absent.
- `setGlobalFragment` round-trips.
- `setGlobalFragment(null)` deletes the row.
- `setGlobalFragment("  ")` deletes the row.
- `setGlobalFragment` over 20_001 chars throws via Zod.
- `getModeAppend` / `setModeAppend` round-trip per mode.
- `listFragmentOverrides("teach")` returns rows for "teach" only.
- `previewPrompt({ modeId: "teach" })` returns the composed string against stored values.
- `previewPrompt({ modeId: "teach", draftGlobal: "X" })` uses the draft, not the stored value.
- `previewPrompt({ modeId: "teach", draftGlobal: null })` returns a prompt with no user-global slot.
- Use `useTempDb()` from `tests/helpers/db-setup.ts`.

**`packages/core/src/services/__tests__/session-service.test.ts`** (extend the integration tests):
- A session opened against a mode with a stored fragment override produces a prompt containing the override text.
- A session opened with a stored global produces a prompt containing the user-global slot.
- A session opened with a stored per-mode append produces a prompt containing the user-append slot in that mode only.
- A session against a different mode does NOT carry the other mode's append.
- The dynamic course-context fragment still wins over a stored `context.course-state` override (regression: dynamic state overrides stale user overrides).

**`packages/core/src/services/__tests__/authoring-service.test.ts`** (extend):
- `setGlobalPrompt` writes the value AND appends a `prompt.set_global_fragment` audit row with char count.
- `setModeAppend` similarly.
- `previewPrompt` round-trips through the auditing layer (no audit row for previews — read-only).

### Story 2 (settings-global)

**`packages/ui/src/components/__tests__/global-prompt-editor.test.tsx`** (new):
- Renders initial state from stored value.
- Typing updates the draft; preview pane reflects via `useDeferredValue` (advance fake timers).
- Mode-picker dropdown changes the preview's composed mode.
- Save button disabled when draft === stored.
- Save calls `client.author.setGlobalPrompt(text)` and updates the "saved" indicator.
- Empty draft → save passes `null`.

Mock the `PraxisClient` via `makeFakeClient({ author: { getGlobalPrompt, setGlobalPrompt, previewPrompt } })`.

### Story 3 (configure-mode-append)

**`packages/ui/src/components/__tests__/mode-append-editor.test.tsx`** (new):
- Same structure as global-prompt-editor test but with mode selector.
- Changing the mode selector fetches a different stored append.
- Save calls `client.author.setModeAppend({ modeId, text })`.

**`packages/ui/src/__tests__/configure-prompt-tab.test.tsx`** (extend):
- New "Per-mode append" section renders ABOVE the existing fragment editor.
- "Advanced" intro copy renders above the fragment editor.
- Existing style-sliders and fragment-editor tests still pass.

## Risks

1. **Existing UI behavior latches onto a broken read path.** Phase 11's
   `PromptFragmentEditor` already saves overrides; users may have saved values
   that they thought weren't taking effect. After Story 1 lands, those saved
   overrides will start applying — possibly with unexpected results.
   **Mitigation**: surface a "last touched" timestamp in the existing fragment
   editor's UI so the user can see if any prior saves exist; the audit log
   (`listConfiguratorActions`) provides the underlying data. Park a follow-up
   if user reports of "weird behavior" arise; not a release blocker.
2. **20,000-char limit might be too low.** Some users want to paste entire
   teaching philosophies. **Mitigation**: 20k chars is ~3000 words — enough
   for a substantial preamble. The mode registry's own prompts run smaller.
   Loosen to 40k if feedback warrants; the SQLite text column can hold any
   size. The cap is mostly to fail loudly on accidental dumps.
3. **Live preview IPC cost.** Each keystroke after the deferred-value settles
   triggers a `previewPrompt` IPC roundtrip. **Mitigation**: `useDeferredValue`
   plus React's concurrent batching collapses adjacent updates; in practice
   one IPC per pause. Server-side composition is pure string concat. If still
   too chatty, fall back to a 250ms manual debounce on `draft`.
4. **Mode registry lookup**. The current `@praxis/curriculum` may export the
   modes only as an array (`modes: Mode[]`) rather than a keyed lookup.
   **Mitigation**: spike at the start of Story 1 — if no `getMode(modeId)`
   helper exists, add one alongside the existing array export. Cheap and
   needed for the preview path anyway.
5. **Configurator audit log records char counts only.** A user could read a
   prior version of their global fragment by replaying audit-log events plus
   the timestamp deltas — but only the char count is logged, not the content.
   **Mitigation**: this is by design; the audit log avoids storing prompt
   text long-term in case it contains personal info. The current
   `prompt.override_fragment` audit entry follows the same pattern. Document
   this in the action-type's JSDoc.
6. **Composition behavior change: stored overrides now take effect.** This
   is technically a behavior change from current shipped behavior (the bug
   was silent). **Mitigation**: this IS the fix the user wants — the Phase 11
   UI was specced to work this way. Document it as a release-note item for
   the next version; not a blocker.

<!-- Implementation Notes accumulate here as work progresses. -->

## Children complete (2026-05-12)

All three child stories have landed and are at `stage: review` or `done`:

- `feature-prompt-customization-layers-compose-wiring` — **done** (commit `341fa63`, reviewed and approved `f36549b`). Foundation: types, `mode_prompt_appends` table + migration `0013_chilly_zombie.sql`, `PromptCustomizationServiceImpl`, session-service compose path (fixes Phase 11 read gap), `previewPrompt` IPC + client.
- `feature-prompt-customization-layers-settings-global` — **review** (commit `e93f7f0`). `<GlobalPromptEditor>` in Settings; extracted shared `<PromptPreviewPane>` primitive; 12 tests.
- `feature-prompt-customization-layers-configure-mode-append` — **review** (commit `1f1fb28`). `<ModeAppendEditor>` in Configure → Prompt tab above style sliders; reframes `<PromptFragmentEditor>` as "Advanced"; consumes shared `<PromptPreviewPane>`; mode-switch unsaved-draft confirm; 14 + 7 tests.

**Cross-cutting deviations**: `ServiceDeps.promptCustomization` made optional (`?:`) rather than mandatory so legacy tests that don't wire it stay compatible. Composition root in `services.ts:467,480,552` always wires `PromptCustomizationServiceImpl`, so production behavior is unaffected.

**Verification (workspace-wide)**: `pnpm typecheck` green across all 10 packages (including the now-enabled root-tsconfig gate); `pnpm test` ~2700+ passing; `pnpm lint` shows only pre-existing claude-cli-sdk warnings unrelated to this feature's changes.

Advancing feature `implementing → review`. The next autopilot review pass will evaluate the realized capability end-to-end.

## Review (2026-05-12, feature-level)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Brief satisfied end-to-end: cross-mode global prompt (Settings) + per-mode append (Configure), both with live preview, both lock-gated, both auditable (char count only).
- Decomposition matches design's "Implementation order" (compose-wiring → Settings + Configure in parallel).
- Cross-cutting deviation: `ServiceDeps.promptCustomization?:` optional vs mandatory in design — already flagged in compose-wiring child review; composition root always wires it, production behavior is correct.
- Foundation-doc alignment: ARCHITECTURE.md's `@praxis/ui` row already names "prompt customization" — still accurate post-change.
- Capability check (end-to-end): a user can set a global prompt → see live preview against any mode → save → that text flows through `additionalFragments` at session-compose time. Same for per-mode append. Phase 11 bug fix (stored fragment overrides now read) folded in as a beneficial behavior change.
- Breaking changes: migration `0013_chilly_zombie.sql` adds `mode_prompt_appends`; new ServiceDeps field is optional. No removals, no API breakage.

Feature delivered as briefed. Advancing to done.
