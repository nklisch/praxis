/**
 * PromptCustomizationServiceImpl — storage layer for the two user-authored
 * prompt layers introduced by the prompt-customization-layers feature.
 *
 * Layer 1: global fragment — a cross-mode user prompt stored in `config_kv`
 *   at key `prompt.global_fragment`. Injected at the `user-global` position.
 *
 * Layer 2: per-mode append — a mode-specific user prompt stored in
 *   `mode_prompt_appends`. Injected at the `user-append` position.
 *
 * Both setters use trim-and-null semantics: empty/whitespace-only input
 * deletes the row rather than storing an empty string.
 *
 * Char cap: 20,000 per field — fails loudly on accidental pastes; the SQLite
 * `text` column has no inherent size limit. Validated at write time via Zod.
 */

import {
  type ComposeSystemPromptInput,
  composeSystemPrompt,
  composeSystemPromptWithAttribution,
} from "@praxis/curriculum/brief";
import { requireMode } from "@praxis/curriculum/modes";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv, modePromptAppends, promptOverrides } from "../schema.js";
import type { PromptFragment } from "../types/index.js";
import type { ComposedSystemPromptWithAttribution } from "../types/prompt-attribution.js";

const CONFIG_KEY = "prompt.global_fragment";

const FragmentTextSchema = z.object({
  text: z.string().max(20_000),
});

export interface FragmentOverride {
  modeId: string;
  fragmentId: string;
  override: string;
}

export interface PreviewPromptInput {
  modeId: string;
  /**
   * Draft text for the global fragment. When provided (including `null`),
   * overrides the stored value. `undefined` means "use stored value".
   */
  draftGlobal?: string | null;
  /**
   * Draft text for the mode-specific append. Same undefined/null/string semantics.
   */
  draftAppend?: string | null;
}

export interface PromptCustomizationService {
  /** Returns `null` when no global fragment has been set or its text is empty after trim. */
  getGlobalFragment(): string | null;
  /** Pass `null` or empty/whitespace string to clear. Cap: 20,000 chars. */
  setGlobalFragment(text: string | null): void;

  /** Returns `null` when no per-mode append has been set for `modeId`. */
  getModeAppend(modeId: string): string | null;
  /** Pass `null` or empty/whitespace string to clear. Cap: 20,000 chars. */
  setModeAppend(modeId: string, text: string | null): void;

  /** Returns all prompt_overrides rows for the given mode (fragment-level overrides). */
  listFragmentOverrides(modeId: string): FragmentOverride[];

  /**
   * Compose the full system prompt for `modeId` against current stored state,
   * optionally substituting draft values for the two user layers.
   *
   * - `draftGlobal === undefined` → use the stored global fragment.
   * - `draftGlobal === null` → omit the global slot entirely.
   * - `draftGlobal === "some text"` → use that text instead of the stored value.
   * Same semantics apply for `draftAppend`.
   *
   * Throws when `modeId` is not found in the mode registry.
   */
  previewPrompt(input: PreviewPromptInput): string;

  /**
   * Structured preview returning the composed prompt plus per-segment source
   * attribution. Used by the diff-aware preview pane to render overridden spans
   * and diff against fragment defaults. Same draft/null/undefined semantics as
   * `previewPrompt`.
   *
   * Throws when `modeId` is not found in the mode registry.
   */
  previewPromptWithAttribution(input: PreviewPromptInput): ComposedSystemPromptWithAttribution;
}

export interface PromptCustomizationServiceDeps {
  db: PraxisDb;
}

export class PromptCustomizationServiceImpl implements PromptCustomizationService {
  constructor(private readonly deps: PromptCustomizationServiceDeps) {}

  getGlobalFragment(): string | null {
    const row = this.deps.db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).get();
    if (!row) return null;
    // The stored value is a JSON object { text: string }.
    const parsed = FragmentTextSchema.safeParse(row.valueJson);
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
    // Validate cap before writing.
    const value = FragmentTextSchema.parse({ text: t });
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
    // Validate cap before writing.
    FragmentTextSchema.parse({ text: t });
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

  previewPrompt(input: PreviewPromptInput): string {
    return composeSystemPrompt(this.buildPreviewInput(input));
  }

  previewPromptWithAttribution(input: PreviewPromptInput): ComposedSystemPromptWithAttribution {
    return composeSystemPromptWithAttribution(this.buildPreviewInput(input));
  }

  /**
   * Resolves the mode, stored overrides, and user-layer fragments for `input`,
   * then returns a `ComposeSystemPromptInput` ready to pass to either compose
   * function. Extracted to keep `previewPrompt` and `previewPromptWithAttribution`
   * DRY — both methods share identical input-building logic.
   *
   * Throws when `modeId` is not found in the mode registry.
   */
  private buildPreviewInput(input: PreviewPromptInput): ComposeSystemPromptInput {
    const mode = requireMode(input.modeId);

    const storedOverrides = this.listFragmentOverrides(input.modeId);
    const overrides = new Map(storedOverrides.map((o) => [o.fragmentId, o.override]));

    const additional: PromptFragment[] = [];

    // Resolve global text: undefined means "use stored", null means "omit".
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

    // Resolve append text: same semantics.
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

    return {
      mode,
      ...(overrides.size > 0 && { overrides }),
      ...(additional.length > 0 && { additionalFragments: additional }),
    };
  }
}
