---
id: feature-content-renderer-pipeline
kind: feature
stage: implementing
tags: [content, rendering, design-system]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Content renderer pipeline + educational typography primitives

## Brief

The foundation feature for this epic. Establishes the 3-stage chat-text renderer pipeline (markdown parse with Praxis extensions → tool-result splice → post-render passes) in `@praxis/ui`, and promotes the educational-content typography primitives from `.mockups/design-system/content-types.html` into `components.css` as Tier-2 widgets sibling to the existing chat-surface family.

In scope: callout primitives (`--theorem` / `--lemma` / `--hint` / `--warning`), citation chips, passage blocks, definitions (first-introduction tracking), concept refs (with `concept:` link-scheme handler), glossary terms, figures (caption + body + verdict), procedural step lists, numerical (units + tabular figures), code primitives (inline + block with syntax tokens), file paths. Plus the markdown extension framework: container directives (CommonMark spec), GitHub admonition syntax, link-scheme handlers, attribute-list extension.

Out of scope: math rendering (separate feature, depends on this pipeline existing); per-mode question-tool schema caps (separate feature, agent-side concern not renderer concern); shared indicator primitive refactor (separate feature, scoped to choice indicators).

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **foundation feature** — every other feature in this epic composes against this pipeline. `feature-math-rendering` adds the math layer to it; `feature-mode-aware-question-constraints` adds agent-prompt-side instruction for it; `feature-refactor-shared-choice-indicators` rides alongside without touching it.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Proposed treatments: `.mockups/design-system/content-types.html` — every primitive in every state with proposed CSS treatment. Design pass on this feature promotes them to `components.css`.
- Components showcase context: `.mockups/design-system/components.html` § Chat surface (existing chat primitives; new content-type primitives append as a sibling Tier-2 section).

## Foundation references

- `docs/UX.md` § "Streamed messages" — the existing chat-text rendering surface this pipeline extends.
- `docs/UX.md` § "Citations are first-class" — citation chip behavior contract.
- `docs/ARCHITECTURE.md` § `@praxis/ui` — the package this feature touches.
- Epic body § "Agent contract — markup conventions + parser strategy" — full mapping table per content type; this feature implements the renderer side for every row that isn't math, schema-caps, or indicator-refactor.

## Existing production stack (grounding — 2026-05-24)

`packages/ui/src/components/markdown-content.tsx` is the existing chat-body renderer. Already wired:

- `react-markdown` (built on `unified`/`remark`/`rehype` ecosystem)
- `remark-gfm` — GFM tables, task lists, autolinks
- `remark-math` + `rehype-katex` — math via KaTeX (Phase 13)
- `rehype-highlight` — code syntax highlighting (highlight.js, default theme)
- `rehype-citation-chips` — local custom plugin for inline `[N]` citation chips
- `balanceFences` — handles streaming-partial unclosed code fences and `$$` blocks gracefully
- Custom regex normalization for `\(...\)` → `$...$` and `\[...\]` → `$$...$$`

This feature **extends** the existing pipeline; it does NOT introduce a new markdown library or replace the existing one. New plugins layer onto `REMARK_PLUGINS` and `REHYPE_PLUGINS` arrays in `markdown-content.tsx`. Same surface, same streaming-partial safety, same component overrides API.

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **Plugin strategy**: mix of community + custom. Use `remark-directive` (community, CommonMark-spec) for container directives like `::: figure ... :::` — worth the dependency for spec compliance and ecosystem maturity. Write a small **custom remark plugin** for GitHub admonition syntax (`> [!hint]` etc.) — the syntax is simple enough that a few-line custom plugin gives full control over AST shape and avoids the community admonition packages' assumptions. Custom local plugins for the project-specific concerns: bare-glyph math wrapping, unit auto-detect, first-introduction definition tracking, concept-link-scheme handler. Keep existing community plugins (`remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`, `rehype-citation-chips`) as-is.

- **First-introduction definition tracking — memory-backed with optional out-of-band LLM lookup**: definitions track via `@praxis/memory` (persistent projection — survives session restart, semantically correct: the student really HAS seen this term before across their course history). The renderer reads the memory projection per render to know "is this the student's first-ever introduction to this term?" and emits `.definition` styling only on the genuine first occurrence within the student's history. *Stretch / follow-on*: when the agent writes `[[def:term]]` for a term that has no memory record AND no prior introduction in the current turn, the renderer can issue an **out-of-band one-shot LLM call** to generate the definition on-demand (gives the agent a way to introduce terms it didn't explicitly define — e.g., "the **derivative** is..." with the renderer pulling the definition from a one-shot call). Implementation detail for feature-design Phase 5; flagged here so it's not lost. Mode prompt fragment teaches the agent that definitions are tracked persistently — they don't need to redefine terms across sessions.

- **Per-mode toggles for post-render treatments**: configurable. `@praxis/curriculum` mode definitions get an optional `renderToggles?: { bareGlyphMath?, unitAutoDetect?, firstIntroDefinitions?, callouts?, ... }` shape. Defaults: all treatments on. Modes that are prose-heavy and would suffer from false positives (a future literature-tutor mode disabling unit auto-detect, for instance) can opt out per-treatment. Same plumbing pattern as `questionConstraints` from sibling feature `feature-mode-aware-question-constraints` — mode config drives renderer behavior. Both features touch the mode definition shape; coordinate at design-pass time.

- **Code-block syntax theme**: keep `rehype-highlight` (already in production); write a custom Studio Quiet theme via CSS that uses our tokens — `--color-accent` for keywords, `--color-success` for strings, `--color-info` for function names, `--color-text-tertiary` for comments, `--color-text-primary` for default text, `--color-bg-tertiary` for the block background. Drop the default highlight.js theme. Tight control over how syntax tokens compose with the editorial voice without migrating to a heavier alternative (Shiki).

- **Tool-result splicing scope**: narrow to the citation-chip pattern + the figure directive — do NOT generalize to "any tool-result inline by position" in this feature. Citations already work via `rehype-citation-chips` reading `[N]` markers; figures will work via the `::: figure :::` directive (block-level markdown extension). Diagrams, drafts, notes, etc. stay as sibling cards below the markdown (current behavior). A future feature can generalize if/when more inline tool-results are needed.

- **File-path detection**: regex post-pass only — no `[[path]]` markup. Markup would collide with `[[def:term]]` and force the agent to learn another convention. Conservative regex: `\b[\w-]+(?:/[\w.-]+)+\.\w{1,8}\b` — requires at least one slash + a short extension; skips ancestors with tag `code` / `pre` so inline code doesn't double-style.

- **First-introduction tracking storage**: new `term_first_occurrences` projection table in `@praxis/memory`, keyed `(student_id, term_normalized)` with `first_seen_session_id` + `first_seen_at`. Idempotent `ON CONFLICT DO NOTHING` insert when the renderer encounters a `[[def:term]]` marker. Query: `hasSeenTerm(studentId, term): Promise<boolean>` — renderer reads this per definition occurrence to decide whether to emit `.definition` styling or fall through to plain prose. The out-of-band LLM lookup for unknown definitions is a Phase-5 stretch goal flagged as a follow-up — infrastructure here supports it, no LLM call in this feature.

- **Component-vs-class split for content types**: structural elements (callouts, figures, definitions, concept refs) get **React components** rendered via react-markdown's `components` map — they need behavior (click handlers, state). Typographic micro-treatments (`.math-glyph`, `.unit`, `.file-path`, `.glossary`) get **CSS classes only** added via rehype post-passes — no React component needed.

## Architectural choice

Extend the existing `markdown-content.tsx` pipeline rather than replace it. Add new plugins to `REMARK_PLUGINS` / `REHYPE_PLUGINS` arrays; add component overrides to the `components={}` map; add CSS class definitions to `markdown-content.module.css`. New custom plugins live in `packages/ui/src/lib/markdown-plugins/`, each shaped like the existing `lib/rehype-citation-chips.ts`. The `Mode.renderToggles?` field threads from `@praxis/core/types/mode.ts` → `ServiceDeps` → `ChatTabBody` → `MarkdownContent`'s plugin selection at runtime.

Rejected alternatives:
- **Replace react-markdown with a custom parser** — huge investment, zero benefit; the unified ecosystem is mature and our plugin needs are modest.
- **Migrate from rehype-highlight to Shiki** — heavier bundle, slower runtime. Custom Studio Quiet hljs theme via CSS tokens gives us editorial control without the swap.
- **Split this feature into pipeline-framework vs typography-primitives** — the epic body flags this as a sizing risk. Re-examined: each primitive is genuinely small (one plugin OR one component OR one CSS block), and splitting would force a fake sequencing dependency. Decompose via stories within one feature instead.

## Implementation Units

### Unit 1: `Mode.renderToggles` field + backfill
**File**: `packages/core/src/types/mode.ts`, every file under `packages/curriculum/src/modes/`
**Story**: `feature-content-renderer-pipeline-step-1-mode-render-toggles`

```typescript
// packages/core/src/types/mode.ts — extend
export interface RenderToggles {
  callouts?: boolean;              // default true
  figures?: boolean;               // default true
  definitions?: boolean;           // default true
  conceptRefs?: boolean;           // default true
  glossary?: boolean;              // default true
  bareGlyphMath?: boolean;         // default true (defined here; consumer is feature-math-rendering)
  unitAutoDetect?: boolean;        // default true
  filePathAutoDetect?: boolean;    // default true
}

export interface Mode {
  // ...existing fields
  renderToggles?: RenderToggles;   // NEW — omitted means all-defaults (all on)
}

export const DEFAULT_RENDER_TOGGLES: Required<RenderToggles> = {
  callouts: true, figures: true, definitions: true,
  conceptRefs: true, glossary: true, bareGlyphMath: true,
  unitAutoDetect: true, filePathAutoDetect: true,
};

export function resolveRenderToggles(mode: Pick<Mode, "renderToggles">): Required<RenderToggles> {
  return { ...DEFAULT_RENDER_TOGGLES, ...(mode.renderToggles ?? {}) };
}
```

**Implementation notes**:
- All 8 existing modes (`teach`, `homework`, `quiz`, `exam`, `course-create`, `configure`, `study-skills`, plus any others discovered) leave `renderToggles` undefined → defaults apply. No behavior change for existing modes.
- `resolveRenderToggles` is exported as the single point that merges user toggles with defaults — any future caller (`ChatTabBody`, `MarkdownContent`, tests) calls this, never reads `mode.renderToggles` directly.

**Acceptance criteria**:
- [ ] `Mode.renderToggles?: RenderToggles` field added
- [ ] `DEFAULT_RENDER_TOGGLES` exported with all-true defaults
- [ ] `resolveRenderToggles(mode)` returns merged toggles
- [ ] All existing modes typecheck unchanged (no field required)
- [ ] Unit tests cover: undefined → defaults; partial overrides preserve defaults for unset keys

---

### Unit 2: Remark plugins — admonitions + directives + attribute lists
**File**: `packages/ui/src/lib/markdown-plugins/remark-admonitions.ts` (NEW) + add `remark-directive` (community) to deps + `packages/ui/package.json`
**Story**: `feature-content-renderer-pipeline-step-2-remark-plugins`

```typescript
// remark-admonitions.ts — parses GitHub-style > [!type] blocks
import type { Root, Blockquote } from "mdast";
import { visit } from "unist-util-visit";

export type AdmonitionType = "theorem" | "lemma" | "hint" | "warning" | "steps";

export const remarkAdmonitions: () => (tree: Root) => void = () => (tree) => {
  visit(tree, "blockquote", (node: Blockquote, index, parent) => {
    // Match first paragraph text against /^\s*\[!(theorem|lemma|hint|warning|steps)\]\s*\n?/
    // If match: convert blockquote → custom node { type: "containerDirective", name: "admonition", attributes: { type } }
    // First-paragraph match removes the [!type] line; rest of blockquote body becomes admonition children
  });
};
```

**Implementation notes**:
- Hand-rolled in the same shape as `lib/rehype-citation-chips.ts` (collects replacements during walk, applies after).
- Emits a `containerDirective` node so the existing `remark-directive` + `remark-rehype` pipeline lifts it to HAST automatically.
- Add `remark-directive ^4.0.0` to `packages/ui/package.json` dependencies. Verify version via `npm view remark-directive versions` at implementation time.
- Both plugins added to `REMARK_PLUGINS` in `markdown-content.tsx` (in Unit 8).

**Acceptance criteria**:
- [ ] `remark-admonitions.ts` parses all four types (`theorem`, `lemma`, `hint`, `warning`) plus `steps`
- [ ] Plugin skips blockquotes whose first paragraph doesn't start with `[!type]`
- [ ] Unit tests: each type renders; non-admonition blockquote unaffected; nested markdown inside admonition preserved
- [ ] `remark-directive` added to deps; integration test renders `::: figure :::` through the pipeline successfully
- [ ] No regression on existing blockquote rendering (passage `>` quotes still work)

---

### Unit 3: CSS primitives — promote content-types.html to production
**File**: `packages/ui/src/components/markdown-content.module.css` (extend)
**Story**: `feature-content-renderer-pipeline-step-3-css-primitives`

**Promote from `.mockups/design-system/content-types.html`**:
- `.callout`, `.callout--theorem`, `.callout--lemma`, `.callout--hint`, `.callout--warning`
- `.figure`, `.figure__caption`, `.figure__body`, `.figure__verdict`, `.figure__verdict--ok`, `.figure__verdict--check`
- `.definition` (bold + accent underline; first-occurrence only)
- `.concept-ref` (italic + link color + `§` glyph suffix via `::after`)
- `.glossary` (dotted tertiary underline + `cursor: help`)
- `.passage`, `.passage__cite` (serif italic + left border + cite attribution)
- `.procedure` numbered step list (CSS counters + `::before` indent + mono step labels)
- `.units` / `.unit` (sans-serif inflection at 0.88em + primary color — per user feedback "units are hard to see"; NO `font-variant-caps`)
- `.code-block` (extend existing styling) + `.tok-keyword` / `.tok-string` / `.tok-comment` / `.tok-fn` mapped through hljs class names
- `.code-inline` (mono + tertiary bg + small padding)
- `.file-path` (mono + secondary color + dotted underline)
- `.math-glyph` (math font fallback + minimal letter-spacing — defined here; auto-applied by feature-math-rendering's post-pass)

**Implementation notes**:
- Use CSS Modules conventions consistent with the existing file. Map classes through token names (`var(--color-accent)`, `var(--space-3)`, etc.) — never hardcoded hex/px.
- Studio Quiet hljs theme (also part of this story):
  - `.hljs-keyword`, `.hljs-built_in` → `var(--color-accent)`
  - `.hljs-string`, `.hljs-regexp` → `var(--color-success)`
  - `.hljs-title.function_`, `.hljs-function` → `var(--color-info)`
  - `.hljs-comment` → `var(--color-text-tertiary)`
  - `.hljs-number`, `.hljs-literal` → `var(--color-text-primary)` (no special treatment; numbers compose with `.unit` for measured values)
  - `.code-block` background → `var(--color-bg-tertiary)`
- Respect `prefers-reduced-motion`: any decorative transitions on these primitives gate behind that media query.

**Acceptance criteria**:
- [ ] All listed classes present in `markdown-content.module.css`
- [ ] All values reference CSS custom properties from `tokens.css`/global; no hardcoded colors or spacing
- [ ] Studio Quiet hljs token classes replace the default highlight.js theme imports
- [ ] Visual smoke test: render a sample page that exercises each class; matches the `content-types.html` mock reference visually
- [ ] No regression in existing markdown-content rendering tests

---

### Unit 4: Callout + Figure React components
**File**: `packages/ui/src/components/markdown/callout.tsx` (NEW), `packages/ui/src/components/markdown/figure.tsx` (NEW)
**Story**: `feature-content-renderer-pipeline-step-4-callout-figure-components`

```typescript
// callout.tsx
export interface CalloutProps {
  type: "theorem" | "lemma" | "hint" | "warning";
  children: ReactNode;
}
export function Callout({ type, children }: CalloutProps): JSX.Element;

// figure.tsx
export interface FigureProps {
  caption?: string;
  verdict?: "ok" | "check";
  children: ReactNode;
}
export function Figure({ caption, verdict, children }: FigureProps): JSX.Element;
```

**Implementation notes**:
- Wired via `markdown-content.tsx` (Unit 8) into the `components={{ ... }}` map. The remark plugins emit custom HAST elements `<admonition type="hint">` / `<figure caption="..." verdict="ok">` which the components render.
- Pure functional components; no state; no effects.
- Editorial typographic primitives — compose against the CSS classes from Unit 3 (`.callout--<type>`, `.figure__caption` etc).

**Acceptance criteria**:
- [ ] Callout renders each type with matching modifier class
- [ ] Figure renders caption + body + optional verdict glyph
- [ ] Both components pass-through children unchanged (markdown inside admonitions renders)
- [ ] RTL tests assert role/structure for accessibility

---

### Unit 5: Definition tracking — projection + plugin + component
**File**: `packages/memory/src/schema.ts` (extend), `packages/memory/src/term-first-occurrences.ts` (NEW), `drizzle/<next>_term_first_occurrences.sql` (NEW), `packages/ui/src/lib/markdown-plugins/remark-definitions.ts` (NEW), `packages/ui/src/components/markdown/definition.tsx` (NEW)
**Story**: `feature-content-renderer-pipeline-step-5-definition-tracking`

```typescript
// packages/memory/src/schema.ts — append
export const termFirstOccurrences = sqliteTable("term_first_occurrences", {
  studentId: text("student_id").notNull(),
  termNormalized: text("term_normalized").notNull(),
  firstSeenSessionId: text("first_seen_session_id").notNull(),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.studentId, t.termNormalized] }),
}));

// packages/memory/src/term-first-occurrences.ts
export interface TermFirstOccurrencesService {
  hasSeenTerm(studentId: string, term: string): Promise<boolean>;
  markTermSeen(studentId: string, term: string, sessionId: string): Promise<void>;
}

// packages/ui/src/lib/markdown-plugins/remark-definitions.ts
// Parses [[def:term-name]] in text nodes, emits <definition term="term-name">term-name</definition> HAST.

// packages/ui/src/components/markdown/definition.tsx
export interface DefinitionProps {
  term: string;
  isFirstOccurrence: boolean;   // resolved by parent via hasSeenTerm + per-turn cache
}
export function Definition(props: DefinitionProps): JSX.Element;
```

**Implementation notes**:
- Term normalization: lowercase, strip punctuation, collapse whitespace. So `[[def:Derivative]]` and `[[def:derivative]]` are the same key.
- `markTermSeen` uses `ON CONFLICT DO NOTHING` — idempotent.
- Renderer flow: `MarkdownContent` receives `studentId` + `sessionId` (via props or context). After parse, walks the HAST for `<definition>` nodes; for each, calls `hasSeenTerm(studentId, term)` once per render; per-turn cache prevents N+1 (use `useMemo` keyed by `studentId + termList`).
- Per-turn cache implementation: a `Map<term, boolean>` built once per render; subsequent occurrences of the same term within the turn use the cache (so two `[[def:integral]]` in one tutor turn → first one renders `.definition`, second renders plain prose).
- Service registers in `@praxis/core` `ServiceDeps` via standard `build-memory-services` pattern.
- Future LLM lookup hook: leave a TODO comment + interface stub `definitionLookup?: (term: string) => Promise<string | null>` in `MarkdownContent` props for the Phase-5 follow-up; do not implement here.

**Acceptance criteria**:
- [ ] Drizzle migration creates `term_first_occurrences` table; `pnpm db:reset` succeeds
- [ ] `TermFirstOccurrencesService` implemented with `hasSeenTerm` + `markTermSeen`; tests cover idempotent insert + lookup
- [ ] `remark-definitions.ts` parses `[[def:term]]` markers, emits HAST `<definition>` elements
- [ ] `Definition` component renders `.definition` class when `isFirstOccurrence=true`, plain text otherwise
- [ ] Per-turn cache: second occurrence of same term in same turn renders as plain text
- [ ] Integration test: render text with three definitions, two repeated — exactly the unique-first occurrences get `.definition` class

---

### Unit 6: Concept refs + glossary handlers
**File**: `packages/ui/src/components/markdown/concept-ref.tsx` (NEW), small extension to `markdown-content.tsx` link-component-override
**Story**: `feature-content-renderer-pipeline-step-6-concept-glossary-components`

```typescript
// concept-ref.tsx
export interface ConceptRefProps {
  conceptSlug: string;
  children: ReactNode;
  onOpen?(slug: string): void;   // optional callback; renderer wires when in chat context
}
export function ConceptRef(props: ConceptRefProps): JSX.Element;
```

**Implementation notes**:
- Concept refs use a markdown link with scheme `concept:`. The existing `a` component override in `markdown-content.tsx` (lines 80-100) gets extended: when `href.startsWith("concept:")`, render `<ConceptRef conceptSlug={href.slice(8)}>` instead of a normal `<a>`.
- `onOpen` defaults to a no-op in the markdown override but `ChatTabBody` can pass a real handler that opens the concept side panel (existing pattern; check via grep for how concept-side-panel is currently opened).
- Glossary: handled entirely by CSS. The existing `<abbr title="...">` HTML5 semantic just needs `.glossary` styling — no new component or plugin. Add the class in markdown-content.module.css's component overrides (or wrap via `components={{ abbr: ({ children, title }) => <abbr className={styles.glossary} title={title}>{children}</abbr> }}`).

**Acceptance criteria**:
- [ ] `concept:` href triggers `<ConceptRef>` render
- [ ] Non-concept hrefs preserve current `<a>` behavior (target=_blank for external)
- [ ] `<abbr>` elements get `.glossary` class
- [ ] Integration test: `[chain rule](concept:chain-rule)` renders ConceptRef with slug=`chain-rule`
- [ ] Click on ConceptRef fires `onOpen("chain-rule")` if provided

---

### Unit 7: Post-render passes — file paths + units
**File**: `packages/ui/src/lib/markdown-plugins/rehype-file-paths.ts` (NEW), `packages/ui/src/lib/markdown-plugins/rehype-units.ts` (NEW)
**Story**: `feature-content-renderer-pipeline-step-7-post-render-passes`

```typescript
// rehype-file-paths.ts — text-node walk; wrap matches in <span class="file-path">
const FILE_PATH_RE = /\b[\w-]+(?:\/[\w.-]+)+\.\w{1,8}\b/g;

// rehype-units.ts — text-node walk; wrap "<num><unit>" patterns
const UNIT_TABLE = ["m", "kg", "s", "Hz", "N", "J", "W", "Pa", "K", "L", "mL",
                    "ft", "in", "mi", "lb", "oz", /*…*/];
const UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s?(${UNIT_TABLE.join("|")})\\b`, "g");
```

**Implementation notes**:
- Both plugins use the `visitParents` + collect-replacements-then-splice pattern from `lib/rehype-citation-chips.ts`.
- Both skip ancestors with tag `code`, `pre`, `kbd`, `samp` (raw text contexts where wrapping would be wrong).
- File path regex requires both a slash AND an extension (1-8 chars) — conservative to avoid false positives on URL fragments. URLs are handled by react-markdown's autolinker; skip nodes whose parent is `<a>`.
- Unit regex requires a digit-or-decimal immediately before the unit (no internal space allowed beyond optional `\s?`).
- Both plugins gated by their respective `renderToggles` flag (Unit 8 wires this).

**Acceptance criteria**:
- [ ] `packages/ui/src/__tests__/rehype-file-paths.test.ts`: matches `packages/core/src/foo.ts`; skips inside `<code>` and `<a>`
- [ ] `packages/ui/src/__tests__/rehype-units.test.ts`: matches `9.8 m/s²`, `5kg`, `100 Hz`; skips inside `<code>`; doesn't match `5km` if `km` not in unit table (table coverage tested)
- [ ] Both plugins gated by their toggle; tests verify off-state means no wrapping

---

### Unit 8: Pipeline wiring + toggle threading
**File**: `packages/ui/src/components/markdown-content.tsx` (modify)
**Story**: `feature-content-renderer-pipeline-step-8-pipeline-wiring`

```typescript
export interface MarkdownContentProps {
  // existing props
  renderToggles?: Required<RenderToggles>;  // NEW — resolved by caller
  studentId?: string;                        // NEW — for Definition first-occurrence tracking
  sessionId?: string;                        // NEW — for Definition tracking + term-seen writes
  conceptOpen?: (slug: string) => void;      // NEW — wired to ChatTabBody's concept panel
}
```

**Implementation notes**:
- Conditionally build `REMARK_PLUGINS` / `REHYPE_PLUGINS` arrays based on `renderToggles`. Each plugin is added only when its toggle is true. (Use `resolveRenderToggles` if `renderToggles` undefined.)
- Expand the `components={{ ... }}` map to include: `Callout`, `Figure`, `Definition` (wraps existing flow with `useFirstOccurrence` hook), `ConceptRef`, `abbr` (for glossary class).
- Add `useFirstOccurrence` hook (or inline equivalent): given `termList: string[]`, builds the per-turn Map and exposes `isFirst(term)`. Lives in `packages/ui/src/hooks/use-first-occurrence.ts` if shared; inline otherwise.
- The caller-side wiring (ChatTabBody passing `renderToggles` etc.) is part of Unit 8 too — small per-mode change; one place.

**Acceptance criteria**:
- [ ] `MarkdownContent` accepts `renderToggles`, `studentId`, `sessionId`, `conceptOpen` props
- [ ] Plugin arrays built conditionally per toggle
- [ ] All component overrides wired: Callout, Figure, Definition, ConceptRef, abbr
- [ ] `ChatTabBody` resolves toggles via `resolveRenderToggles(currentMode)` and passes through
- [ ] Smoke test: render a kitchen-sink message that exercises every primitive; matches the `content-types.html` mock
- [ ] All existing `markdown-content.test.tsx` tests still pass

---

## Implementation Order

1. **step-1-mode-render-toggles** (deps: `[]`) — config layer
2. **step-2-remark-plugins** (deps: `[]`) — admonitions + remark-directive
3. **step-3-css-primitives** (deps: `[]`) — CSS layer
4. **step-4-callout-figure-components** (deps: `[step-2, step-3]`) — React for new HAST elements
5. **step-5-definition-tracking** (deps: `[step-3]`) — memory + plugin + component
6. **step-6-concept-glossary-components** (deps: `[step-3]`) — link-scheme + glossary
7. **step-7-post-render-passes** (deps: `[step-3]`) — file-paths + units rehype plugins
8. **step-8-pipeline-wiring** (deps: `[step-1, step-4, step-5, step-6, step-7]`) — merge point

Parallel-friendly: steps 1 / 2 / 3 ship without waiting; 4 / 5 / 6 / 7 fan out after their deps; 8 is the merge point.

## Testing

### Unit tests (per story)
- `packages/core/src/__tests__/mode-render-toggles.test.ts` — defaults, partial override merging
- `packages/ui/src/__tests__/remark-admonitions.test.ts` — each type, nested markdown preserved, non-admonition blockquote unaffected
- `packages/ui/src/__tests__/markdown-content.test.tsx` (extend) — visual smoke for kitchen-sink render
- `packages/ui/src/__tests__/markdown/callout.test.tsx`, `figure.test.tsx`, `concept-ref.test.tsx`, `definition.test.tsx` — per component
- `packages/memory/src/__tests__/term-first-occurrences.test.ts` — service idempotency + lookups (uses `useTempDb()`)
- `packages/ui/src/__tests__/remark-definitions.test.ts` — parse `[[def:term]]` markers
- `packages/ui/src/__tests__/rehype-file-paths.test.ts`, `rehype-units.test.ts` — regex matches + skip ancestors

### Integration / smoke
- Kitchen-sink render test in `packages/ui/src/__tests__/markdown-content.test.tsx`: a message with one of every primitive (callout, figure, definition, concept-ref, glossary, code-block, file-path, units, citation, passage).
- Mode-toggle integration: render same content under a mode with `definitions: false` → no `.definition` classes emitted.

### Test helpers
- `useTempDb()` for memory tests (per `temp-db-test-helper` pattern)
- `makeFakeClient()` for renderer tests; extend to include `memory.hasSeenTerm` stub if needed (`ui-test-helper` pattern)

## Risks

- **Plugin order matters in unified pipelines.** Post-render passes (file-paths, units) must run AFTER component-emitting plugins (callouts, figures, definitions) so they don't try to wrap text inside structural elements. Verify order explicitly in `markdown-content.tsx` and add a test. **Mitigation**: ordered test that asserts post-pass plugins are positioned after structural plugins in `REHYPE_PLUGINS`.

- **`remark-directive` version drift.** The `:::` container-directive syntax is supported by `remark-directive` but the version we install must match `react-markdown`'s mdast version. **Mitigation**: at implementation time check `npm view remark-directive` for the latest stable + cross-reference with `react-markdown`'s mdast version. Lock to a specific version range.

- **First-occurrence definition tracking write timing**. If the renderer writes `markTermSeen` on every render, two simultaneous tabs viewing the same message double-write. `ON CONFLICT DO NOTHING` makes this safe but noisy. **Mitigation**: only write from the live-streaming tab (currentSessionId), not from historical renders; track via a `MarkdownContent`-level prop `recordDefinitionOccurrence: boolean` (default false; ChatTabBody sets true for the active stream).

- **Unit auto-detect false positives on prose-heavy modes**. "He weighed 5kg" wraps OK, but "5g of complexity" wraps `5g` as grams falsely if `g` is in the table. **Mitigation**: unit table excludes single-letter units that are commonly used as variable names (`g`, `m`, `s` alone). Multi-character units (`kg`, `mL`, `Hz`, `J`, `N`) are safer. Per-mode toggle (`unitAutoDetect: false`) escape hatch.

- **CSS module class-name leak.** `markdown-content.module.css` uses CSS Modules — class names are hashed at build time. New component overrides (Callout, Figure, etc.) need to import the module and use `styles.calloutTheorem` not `"callout--theorem"`. **Mitigation**: explicit pattern in each new component; smoke test that the hashed class makes it to rendered output.

- **Bundle size impact.** Adding `remark-directive` (~25KB) + custom plugins (~5KB total) + new component code (~10KB) is acceptable. `rehype-highlight` already in stack. **No KaTeX impact** — that's feature-math-rendering. **Mitigation**: no action; flag in PR if bundle size grows >30KB.
