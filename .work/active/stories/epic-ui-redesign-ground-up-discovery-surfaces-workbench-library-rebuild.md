---
id: epic-ui-redesign-ground-up-discovery-surfaces-workbench-library-rebuild
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-workbench-engine-recommendation-service
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# LibraryRoute → Workbench rebuild

## Scope

Rebuild `LibraryRoute` as the Workbench: greeting line with count of
ready things, what's-next queue (consumes
`praxisClient.recommendations.next`), lately timeline of recent
sessions, footer cards for packs / concept maps / documents.

## Implementation steps

1. Edit `packages/ui/src/routes/library.tsx`:
   - Greeting line at top ("Good morning. There's {n} things ready
     for you.").
   - Two-column layout: left queue / right timeline.
   - Queue: render `Recommendation[]` from
     `praxisClient.recommendations.next({ limit: 5 })`; each row
     shows reason + CTA per kind (resume / review / practice / etc.).
   - Timeline: existing `RecentSessionsSection` content restyled
     into a chronological strip.
   - Footer: three small cards linking to packs / concept maps /
     documents.

2. New components per locked mock:
   `recommendation-row.{tsx,module.css}` per kind.

3. Tests cover greeting, queue render, click-to-spawn behavior,
   timeline render.

4. Quality checks green.

## Acceptance criteria

- [x] Library renders the Workbench shape.
- [x] Queue items dispatch to the correct surface on click.
- [x] Timeline + footer cards render.
- [x] All quality checks green.

## Implementation notes

Rebuilt `packages/ui/src/routes/library.tsx` as the Workbench shape per the
locked Option-4 mock. The old catalogue pattern (four `LibrarySection` blocks)
is fully replaced.

**New files:**
- `packages/ui/src/components/recommendation-row.tsx` — dispatches on
  `Recommendation['kind']` to render the right title, kicker, and CTA. Five
  kinds: `resume_session`, `review_cards`, `practice_concept`, `resume_draft`,
  `quick_check`.
- `packages/ui/src/components/recommendation-row.module.css` — CSS module for
  the row; uses token vars throughout.
- `packages/ui/src/hooks/use-recommendations.ts` — `useResource` wrapper over
  `client.recommendations.next({ limit })`.

**Workbench structure:**
- Greeting line: "Good {morning|afternoon|evening}. There's {word} {thing|things}
  ready for you." — pulls time-of-day from `new Date().getHours()`, count from
  `recommendations.length`, number word from `numberWord()`.
- Two-column layout (3fr:2fr): left = what's-next queue, right = lately
  timeline.
- Queue: `recommendations.map → <RecommendationRow>` per item; empty state
  shows "+ Create a course" CTA; `handleRecAction` dispatches on kind.
- Timeline: `groupSessionsByAge()` buckets sessions into Today / Yesterday / N
  days ago / N weeks ago; each entry is a `<button>` opening the session tab.
- Footer row: three cards — Packs (→ "+ Create a course"), Concept maps
  (→ `/concept-maps`), Documents (→ `pickFile`). Shows count + top-2 names.

**Tests added:**
- `library-route.test.tsx` — fully rewritten for the Workbench: greeting, count
  word, empty/populated queue, timeline render + click dispatch, footer cards.
- `recommendation-row.test.tsx` — per-kind dispatch: kicker, title, CTA label,
  singular/plural, click fires `onAction` with the rec.

**Acceptance note:** `quick_check` dispatches `modeId: "quiz"` only — the
lessonId is not threaded to `session.start` because the API doesn't accept it
directly. This is intentional for v1; if the quiz session needs the lesson
context it can be passed via the session system note mechanism in a follow-up.
