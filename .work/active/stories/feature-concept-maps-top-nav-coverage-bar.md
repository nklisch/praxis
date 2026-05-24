---
id: feature-concept-maps-top-nav-coverage-bar
kind: story
stage: implementing
tags: [ui, design-system]
parent: feature-concept-maps-top-nav
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# CoverageBar primitive + course-detail.tsx adoption

## Brief

Per the parent feature's Unit 2, ship a thin `<CoverageBar>` visual
primitive at `packages/ui/src/components/coverage-bar.tsx` and adopt it
in `course-detail.tsx`'s existing concept-maps section. This is also
the dependency target for `feature-progress-top-nav`'s per-course
mastery bar — keep the API generic (percent + compact) so it composes
across features.

## Scope

### Component

```typescript
// packages/ui/src/components/coverage-bar.tsx
interface CoverageBarProps {
  /** 0..1; values outside this range are clamped */
  percent: number;
  /** compact mode: 3px height (default 4px) */
  compact?: boolean;
  /** optional aria-label; default "Coverage: N%" */
  ariaLabel?: string;
}
export function CoverageBar({ percent, compact, ariaLabel }: CoverageBarProps): JSX.Element;
```

### CSS

```css
/* coverage-bar.module.css */
.coverageBar {
  flex: 1;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}
.coverageBar--compact { height: 3px; }
.coverageBarFill {
  height: 100%;
  background: var(--color-accent);
  transition: width var(--dur-2) var(--ease-standard);
}
```

### course-detail.tsx adoption

In `packages/ui/src/routes/course-detail.tsx:233-277` (the concept-maps
section), update each map row to render a `<CoverageBar>` plus the
"X / Y · Z% mapped" label below the title + version line.

Pattern from the locked Option 2 mock:

```tsx
<div className={styles.mapMeta}>
  <CoverageBar
    percent={map.linkedNodeCount / Math.max(map.totalNodeCount, 1)}
    compact
  />
  <span className={styles.coverageLabel}>
    <span className={styles.num}>{map.linkedNodeCount} / {map.totalNodeCount}</span>
    {" · "}
    {Math.round(100 * map.linkedNodeCount / Math.max(map.totalNodeCount, 1))}% mapped
  </span>
</div>
```

This depends on the list-extension story landing the
`linkedNodeCount` + `totalNodeCount` fields on the summary. If this
story runs in parallel with list-extension (Wave 1), use the planned
field names — the parallel agents will land both in the same wave.

## Acceptance Criteria

- [ ] `<CoverageBar percent={0.58} />` renders a bar at 58% width.
- [ ] `<CoverageBar percent={0} />` renders an empty bar (no visible fill).
- [ ] `<CoverageBar percent={1} />` renders a fully-filled bar.
- [ ] Values <0 or >1 are clamped to [0, 1].
- [ ] `compact` prop reduces bar height to 3px.
- [ ] `course-detail.tsx` concept-maps section renders CoverageBar +
  label for each map.
- [ ] Unit tests cover all CoverageBar prop shapes (including clamp
  behavior + compact).
- [ ] `course-detail.tsx` test updated (or added) to verify coverage
  label appears.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- The component uses CSS modules per project convention. Tokens
  (`--color-accent`, `--color-bg-tertiary`, `--dur-2`,
  `--ease-standard`) all already exist in the design-system tokens.
- The Option 2 mock shows the bar as `flex: 1` so it expands to fill
  the row. Document this in the component JSDoc so consumers know
  to put it inside a flex container.

## Out of scope

- Server-side coverage computation (list-extension story).
- /concept-maps route UI (route story).
- Adopting CoverageBar in `feature-progress-top-nav` (that's the
  progress feature's job; this story just ships the primitive and
  adopts it in course-detail.tsx).
