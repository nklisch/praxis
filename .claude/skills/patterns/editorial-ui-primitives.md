# Pattern: Editorial UI Primitives

A family of structural components and utilities that implement the Praxis visual language
(display serif + mono kicker + mode tints + invitational copy) across every surface.
Every route header, library section, empty state, and loading state uses this system.

## Rationale

After Phase 13 established the editorial design language, a set of reusable React
components and a CSS utility class were extracted so future surfaces inherit the language
without re-implementing it. The primitives are: `<RouteHeader>`, `<LibrarySection>`,
`<EmptyState>`, `<LoadingState>`, `<ErrorMessage>`, the `COPY` module, and the
`composes: editorial from global;` CSS convention.

## Components

### `<RouteHeader>` — used on every non-chat route

**File**: `packages/ui/src/components/route-header.tsx`

```typescript
export interface RouteHeaderProps {
  ornament: string;       // typographic glyph — ¶ § · ⁂ etc.
  kicker: string;         // UPPERCASE MONO — "LIBRARY", "COURSES", etc.
  title: string;          // italic display serif — "your library"
  deck?: string;          // smaller italic subtitle
  actions?: ReactNode;    // right-aligned area (buttons, links)
  tint?: string;          // CSS color; defaults to var(--tint-route) graphite
}
```

Usage:

```tsx
// packages/ui/src/routes/courses.tsx:53
<RouteHeader
  ornament={meta.ornament}
  kicker={meta.kicker}
  title={meta.title}
  deck={meta.deck}
  actions={
    <>
      <ResumeDraftPicker onResume={handleResumeDraft} />
      <button type="button" className={styles.newCourseBtn} onClick={handleNewCourse}>
        + New course
      </button>
    </>
  }
/>
```

Route-specific ornament + kicker is the SSOT — see `components/route-meta.ts`.
Mode tints are reserved for session headers (`<ModeHeader>`); route headers use graphite.

### `<LibrarySection<T>>` — editorial list-with-envelope

**File**: `packages/ui/src/components/library/library-section.tsx`

```typescript
export interface LibrarySectionProps<T> {
  ornament: string;
  kicker: string;
  headerAction?: { label: string; onClick: () => void };
  loading: boolean;
  items: ReadonlyArray<T> | undefined;
  emptyMessage: string;         // from COPY.empty.*
  emptyAction?: { label: string; onClick: () => void };
  renderItems: (items: ReadonlyArray<T>) => ReactNode;
}
```

Usage:

```tsx
// packages/ui/src/components/library/courses-section.tsx
<LibrarySection
  ornament="¶"
  kicker="COURSES IN PROGRESS"
  loading={loading}
  items={courses}
  emptyMessage={COPY.library.coursesEmpty}
  renderItems={(courses) => (
    <ol className={styles.list}>
      {courses.map((c) => ( <li key={c.courseId}>...</li> ))}
    </ol>
  )}
/>
```

All 4 Library sections (`courses-section`, `packs-section`, `documents-section`,
`recent-sessions-section`) follow this shape.

### `<EmptyState>` / `<LoadingState>` / `<ErrorMessage>` — shared state display

**Files**: `packages/ui/src/components/{empty,loading,error}-state.tsx`

```tsx
// empty state — use COPY.empty.* for message
<EmptyState message={COPY.empty.courses} action={{ label: "New course", onClick: fn }} />
<EmptyState message={COPY.empty.tabs} compact />   // compact=true for inline use inside sections

// loading state — editorial italic ellipsis
<LoadingState message={COPY.loading.courses} />    // or default: "loading…"

// error state — rendered inline, red tint
<ErrorMessage error={err} />   // accepts string | Error
```

`<EmptyState compact>` renders inline (paragraph); without `compact` it's full-screen centered.
`<LibrarySection>` always passes `compact` since it's inside a constrained container.

## `COPY` module — editorial voice

**File**: `packages/ui/src/lib/copy.ts`

```typescript
export const COPY = {
  empty: {
    courses: "No courses yet. Start one from a knowledge pack…",
    tabs: "No tabs open. Choose a session from your library…",
    // ...
  },
  loading: {
    default: "loading…",
    courses: "looking through your courses…",
    // ...
  },
  error: {
    generic: (whatYouTriedToDo: string) => `Couldn't ${whatYouTriedToDo}. Try again…`,
    // ...
  },
  composer: { placeholder: "Type a message… (Enter to send)" },
} as const;
```

Usage: every inline `"Loading…"` or `"No items found"` string is replaced with a
`COPY.*` reference so the voice stays consistent.

## CSS `composes: editorial from global;`

The editorial italic serif pair is a global utility class:

```css
/* packages/ui/src/styles/global.css */
.editorial {
  font-family: var(--font-display);
  font-style: italic;
}
```

Any CSS module that needs the editorial pair composes it instead of duplicating:

```css
/* in any .module.css */
.title {
  composes: editorial from global;  /* first declaration in the rule */
  font-size: 1.65rem;
  color: var(--color-text);
}
```

Verified in `loading-state.module.css:2`, `tab-strip.module.css:57`,
`packs-section.module.css:31`, `mode-header.module.css`, and 14 others.

## Mode tints via CSS custom property

Mode-specific color flows through the `--mode-tint` CSS custom property:

```tsx
// components/mode-header.tsx:95
// components/tab-strip.tsx:34
<div style={{ "--mode-tint": getModeMeta(modeId).tint } as CSSProperties}>
  {/* CSS uses var(--mode-tint, var(--color-text-muted)) as fallback */}
</div>
```

Mode tints are for **active session headers only** (teach=amber, quiz=slate, etc.).
Route headers use `--tint-route` (graphite) by default.

## When to Use

- Add a new route → use `<RouteHeader>` from `route-meta.ts` entry
- Add a new library content section → use `<LibrarySection>`
- Show an empty list → use `<EmptyState message={COPY.empty.xxx}>`
- Show loading → use `<LoadingState>` (not a spinner, an italic ellipsis)
- Show an error inline → use `<ErrorMessage error={err}>`
- New CSS rule needs the display-serif italic pair → `composes: editorial from global;`

## When NOT to Use

- Chat tab headers use `<ModeHeader>` (not `<RouteHeader>`) because they carry mode context
- The `COPY.error.generic(verb)` function takes a verb like "save your changes", not a
  pre-built string — don't pass full sentences

## Common Violations

- Using `<EmptyTabsState />` (it was deleted) — use `<EmptyState message={COPY.empty.tabs}>`
- Writing `font-family: var(--font-display); font-style: italic;` inline in a new CSS
  module instead of composing the global utility
- Using mode tints on route headers — route headers are graphite only
- Hardcoding `"Loading…"` or `"No items found"` strings instead of `COPY.*` constants
