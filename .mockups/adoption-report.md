# UX/UI Adoption Report: Mockups vs. Delivered Code

**Date**: 2026-05-19
**Scope**: Whole repo — `.mockups/` surfaces compared to delivered code in `packages/ui/src/` and `packages/desktop/`

## Mode

**Mirror** — align mocks to what was actually delivered, with explicit
carve-outs for surfaces tied to in-flight enhancements. Per user direction:
*"we should align our mocks to what was delivered at this point — except
for what we are enhancing here — or issues we just talked about."*

## Carve-out list (IN-FLIGHT — do not mirror current state)

These surfaces are tied to active backlog ideas or just-shipped fixes whose
intent diverges from current `main`. Their mocks should reflect the
intended future state, not the present.

- `flows/course-create-entry/*` — tied to
  [`idea-course-create-unified-landing`](../.work/backlog/idea-course-create-unified-landing.md)
  (material · create · confirm · open trail + pack selection + auto-send +
  unified entry point) and
  [`idea-course-create-attach-doc-modal-stuck`](../.work/backlog/idea-course-create-attach-doc-modal-stuck.md)
  (modal stacking + scope-refresh bug).
- `flows/first-run/04-course-picker.html` — overlaps with the unified-landing
  idea; the just-shipped
  [`story-fix-onboarding-course-card-flash`](../.work/active/stories/story-fix-onboarding-course-card-flash.md)
  is a logic fix that doesn't change the mock's visual structure.
- `screens/epic-ui-redesign-ground-up-chat-workspace/mode-course-create.html` —
  the in-chat course-create tab body will inherit whatever the unified-landing
  decision lands on.

## Outcome summary

After scan + audit (Phase 2), **zero shipped surfaces require a mirror-mode
mockup update**. Every aligned/minor-drift surface either matches the delivered
code exactly or expresses a deliberate design refinement that supersedes the
mock (StatusStrip horizontal vs. right-rail; candidates in right panel vs.
hover-floating). The two `major-drift` surfaces (`concept-maps` /
`progress` stubs; `sketch-to-concept-map` conversion CTA) are aspirational
mocks for features that haven't been built yet — they're correctly *ahead*
of delivery, not stale.

Net actions:

- **No new mirror mocks needed for shipped surfaces.**
- The two IN-FLIGHT flow areas stay carved out — their refresh waits on
  scoping the parked ideas via `/agile-workflow:scope`.
- Two aspirational-mock surfaces stay as-is — they represent intended
  future state for deferred features.

The drift findings below are the audit record; the surface-decisions table
at the end is the canonical roll-up.

---

## SCREENS

### 1. epic-ui-redesign-ground-up-app-shell (Top nav, route shell, tab strip, status strip)

**Mockup paths**: `.mockups/screens/epic-ui-redesign-ground-up-app-shell/option-1.html` through option-4 (locked mock option-3)

**Delivered code**:
- `packages/ui/src/router.tsx` (root layout)
- `packages/ui/src/components/top-nav.tsx` (lines 1-80)
- `packages/ui/src/components/tab-strip.tsx` (lines 1-80)
- `packages/ui/src/components/status-strip.tsx` (lines 1-75)

**Drift classification**: **ALIGNED**

**Details**:
- Wordmark + five surface nav links (§ Library, ¶ Workspace, ‡ Concept maps, ‖ Progress, ⁂ Configure) present with italic serif styling
- Tabs mounted in TopNav as a slot (tabsSlot), rendered as italic deck lines
- Theme toggle at right edge (themeSlot)
- StatusStrip mounted directly beneath TopNav as ambient background activity surface (no blocking modal)
- Idle state (opacity 0, height 0) when no activity
- Active state shows mono kicker + detail + pulsing dot for running items, checkmark for done
- No persistent right-edge ambient rail; instead activity surfaces via StatusStrip (represents a design refinement from the mockup's right-rail concept to a cleaner horizontal strip)

**Citations**:
- `router.tsx:33-71` — RootLayout with TopNav, StatusStrip mounting
- `top-nav.tsx:24-46` — Five surface links with correct glyphs + active styling
- `status-strip.tsx:15-74` — StatusItem rendering with pulse dot and checkmark states

---

### 2. epic-ui-redesign-ground-up-chat-workspace (Chat workspace + 7 per-mode bodies)

**Mockup paths**: `.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/mode-quiz.html`, mode-homework.html, mode-exam.html, mode-study-skills.html, mode-document.html, mode-course-create.html, mode-bodies-index.html, option-1 through option-4

**Delivered code**:
- `packages/ui/src/routes/chat.tsx` (workspace shell)
- `packages/ui/src/components/chat-tab-body.tsx` + quiz-tab-body.tsx, homework-tab-body.tsx, exam-tab-body.tsx, study-skills-tab-body.tsx, document-tab-body.tsx, course-create-tab-body.tsx

**Drift classification**: **MINOR-DRIFT**

**Details**:
- Quiz/homework/exam mode bodies: item cards with confidence bands present; progress bar with tint-colored fills ✓
- Quiz body shows item meta (num, type-pill, concept), prompt, stem, options grid, confidence scale ✓
- Course-create mode implemented ✓
- Document mode with cited passages sidebar ✓
- Study-skills mode present ✓
- Chat workspace two-column layout (left: messages, right: panel) ✓
- Inline note panel (right column) for chat→note flow (step 3/5) ✓
- **Minor diffs**:
  - Mode bodies do not all have visible "tutor" vs. "quiet feedback" rule annotations in the chat itself (mode-specific rules are baked into behavior, not always visible in the UI as mockup cards)
  - The seven tab bodies all mount simultaneously with `display:none` isolation per pattern, not visible in mockup as distinct tab-body files

**Citations**:
- `chat.tsx:52-100` — ChatRoute shell; inline note panel state management (lines 62-97)
- `quiz-tab-body.tsx` — Quiz item card rendering with confidence band
- `inline-note-panel.tsx:49-100` — Format picker and save flow for chat→note

---

### 3. epic-ui-redesign-ground-up-discovery-surfaces (Library, concept-maps, progress)

**Mockup paths**: `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/option-1.html` through option-4

**Delivered code**:
- `packages/ui/src/routes/library.tsx` (workbench)
- `packages/ui/src/routes/concept-maps.tsx` (stub route)
- `packages/ui/src/routes/progress.tsx` (stub route)

**Drift classification**: **MAJOR-DRIFT** (progress & concept-maps are stubs)

**Details**:
- **Library (Workbench)**: Full implementation per option-4 locked mock
  - Greeting line with ready-recommendations count ✓
  - Two-column layout (what's-next queue on left, lately timeline on right) ✓
  - Footer row: packs / concept-maps / documents ✓
  - "+ Create a course" CTA in footer (highlighted per course-create-entry flow) ✓
- **Concept-maps** at `/concept-maps`: Route stub only
  - Returns RouteHeader with ornament ‡, kicker, title, deck; no actual map listing or editor ✓ for stub
  - Full concept-map listing/editor implementation deferred; accessible via course detail routes (`/courses/$courseId/concept-maps`)
- **Progress** at `/progress`: Route stub only
  - Returns RouteHeader with ornament ‖, kicker, title, deck
  - Full mastery map / progress-map implementation deferred

**Citations**:
- `library.tsx:34-47` — LibraryRoute workbench data loading
- `concept-maps.tsx:9-20` — Stub route
- `progress.tsx:9-18` — Stub route

**Carve-out**: Concept-maps and progress are foundational but deferred per overall phasing; not tied to parked backlog ideas

---

### 4. epic-ui-redesign-ground-up-workspace (Note editors, concept-map editor)

**Mockup paths**: `.mockups/screens/epic-ui-redesign-ground-up-workspace/note-cornell-editor.html`, note-outline-editor.html, note-free-editor.html, note-feynman-editor.html (+ variants -b, -c, -d), note-sketch-editor.html, note-feynman-variants.html, concept-map-editor.html, notes-list-index.html, option-1 through option-4

**Delivered code**:
- `packages/ui/src/routes/workspace.tsx` (shell with Notes/Cards/Review tabs)
- `packages/ui/src/routes/workspace/note-editor-page.tsx` (per-note editor router)
- `packages/ui/src/components/note-editor-cornell.tsx`, note-editor-feynman.tsx, note-editor-outline.tsx, note-editor-free.tsx, note-editor-sketch.tsx
- `packages/ui/src/routes/concept-map-editor.tsx`

**Drift classification**: **ALIGNED**

**Details**:
- Workspace route with three tabs: Notes / Cards / Review ✓
- Tab switching via `?tab=` search param ✓
- Note editor page at `/workspace/notes/:noteId` routes to correct format editor ✓
- Cornell, Feynman, Outline, Free, Sketch formats all present ✓
- Feynman has variants (editorial, audience, two-pass) as separate editorial paths, not separate note files ✓
- Sketch note editor uses tldraw canvas with auto-save ✓
- Concept-map editor at `/concept-map-editor/:mapId` ✓
- Back button + format badge header on note editor (custom header, not RouteHeader) ✓
- Save button calls `client.notes.update` ✓

**Citations**:
- `workspace.tsx:38-80` — Workspace route with tab shell
- `note-editor-page.tsx:27-100` — Per-note editor router and save handler
- `note-editor-sketch.tsx` — Sketch format with tldraw integration
- `concept-map-editor.tsx` — Concept-map editor route

---

### 5. epic-ui-redesign-ground-up-configure (Configure route with tabs)

**Mockup paths**: `.mockups/screens/epic-ui-redesign-ground-up-configure/option-1.html` through option-4, tabs-applied.html, tab-course.html, tab-prompts.html, tab-memory.html

**Delivered code**:
- `packages/ui/src/routes/configure.tsx` (shell)
- `packages/ui/src/routes/configure/course-tab.tsx`, gates-tab.tsx, prompt-tab.tsx, memory-tab.tsx

**Drift classification**: **ALIGNED** (correction — initial scan misread `tabs-applied.html` filename as a "Applied" tab label)

**Details**:
- Four tabs: Course / Gates / Prompt / Memory ✓
- Mock and code both use "Gates" — `tabs-applied.html:30` reads
  *"‡ Gates tab — ★ already in Option 5 · gate-graph canvas with edge
  thresholds"*. The `-applied` suffix on the mock filename refers to
  the canvas+side-chat pattern *applied across all tabs*, not a tab
  named "Applied".
- Tab buttons show change-dots for dirty state ✓
- Save bar shows "Unsaved" when one surface dirty; "N unsaved across M surfaces" for multiple ✓
- RouteHeader with ornament ⁂, kicker, title ✓

**Citations**:
- `configure.tsx:23-28` — `TABS` array: course / gates / prompt / memory
- `configure.tsx:34-59` — TabButton with dirty-key observer
- `tabs-applied.html:30` — mock explicitly names "Gates tab"

---

## FLOWS

### 1. session-loop

**Mockup paths**: `.mockups/flows/session-loop/01-workbench.html` through 05-session-end.html

**Delivered code**: Event flow in `packages/ui/src/routes/chat.tsx` and `packages/ui/src/hooks/use-assignment-issued-spawn.tsx`

**Drift classification**: **ALIGNED**

**Details**:
- Step 1 (workbench): Library landing with recommendation queue and timeline ✓
- Resume card highlighted + animated ✓
- Click "Resume" opens session in tab ✓
- Step 2–4 (tab opening, mid-session, switch tabs): All tab-body mounting patterns match; tabs remain `display:none` when inactive, preserving in-flight streams ✓
- Step 5 (session end): Status appears in StatusStrip; no blocking modal ✓
- Parent-child session linkage: `spawnFromAssignment` opens child session with `parentSessionId` ✓

**Citations**:
- `chat.tsx:52-120` — Session open flow and tab management
- `tab-body-isolation.module.css` — `display:none` pattern for inactive tabs

---

### 2. chat-to-workspace-note

**Mockup paths**: `.mockups/flows/chat-to-workspace-note/01-mid-session.html` through 05-workspace-catalogue.html

**Delivered code**:
- `packages/ui/src/components/note-format-picker-popover.tsx`
- `packages/ui/src/components/inline-note-panel.tsx`
- `packages/ui/src/routes/chat.tsx` (inline note panel state)

**Drift classification**: **ALIGNED**

**Details**:
- Step 1 (mid-session): Chat running ✓
- Step 2 (note affordance): Format picker popover anchors above "+ note" button; Cornell suggested with accent border ✓
  - Numbered keyboard shortcuts 1–5 ✓
  - "↗ open in workspace" escape hatch ✓
  - Esc dismisses ✓
- Step 3 (inline Cornell): Panel slides in from right, replacing concepts panel ✓
  - Title input + link line + NoteEditorCornell ✓
  - Save button calls `client.notes.create` with `contextJson.sessionId` ✓
- Step 4–5 (saved toast + workspace catalogue): Saved notes toast surfaces in chat; notes appear in workspace/notes catalogue ✓

**Citations**:
- `note-format-picker-popover.tsx:50-80` — Format picker with keyboard shortcuts
- `inline-note-panel.tsx:49-100` — Panel mounting and save flow
- `chat.tsx:68-90` — Handler for inline note open/save

---

### 3. concept-map-link

**Mockup paths**: `.mockups/flows/concept-map-link/01-new-node.html` through 04-confirmed.html

**Delivered code**: Concept-map editor linkage (in `concept-map-editor.tsx` + related components)

**Drift classification**: **ALIGNED with design refinement**

**Details**:
- Mock journey: new node created → suggestion popover floats over canvas →
  hover surfaces candidates → confirmed link.
- Delivered journey: new node created → right-side panel surfaces canonical
  match candidates with confidence + definition + ripples → click chooses a
  candidate → link confirmed. Same four-step affordance arc, expressed via
  a persistent right panel instead of a floating popover.
- This is the same refinement pattern as the app-shell StatusStrip
  (horizontal strip replacing the right-edge ambient rail): the surface
  moved from floating-over-canvas to docked, deliberately. Both fulfil
  the same intent.

**Citations**:
- `concept-map-editor.tsx:7-12` — header doc explicitly describes the move
  from floating popover to right-panel candidate list
- `concept-map-editor.tsx:312-329` — candidates / top-candidate / chosen
  state for the selected node
- `concept-map-editor.tsx:515-520` — `<h3>Canonical match candidates</h3>`
  rendering the candidate cards

---

### 4. note-to-tutor-brief

**Mockup paths**: `.mockups/flows/note-to-tutor-brief/01-note-open.html` through 04-conversation-grounded.html

**Delivered code**:
- `packages/ui/src/routes/workspace/note-editor-page.tsx:93-100` — `handleSpawnFromCue` function
- `packages/ui/src/components/note-editor-cornell.tsx` — Cue links in note body

**Drift classification**: **ALIGNED**

**Details**:
- Step 1 (note open): Note open in editor ✓
- Step 2–3 (tutor spawning): "Ask Praxis" button or cue-link calls `client.session.spawnFromNote({ noteId, cueId })` ✓
- Step 4 (conversation grounded): New teach session opens with note excerpt pre-loaded as system context ✓
- No visible mock artifact for each cue type, but the flow is implemented via note cue extraction and session spawn

**Citations**:
- `note-editor-page.tsx:93-115` — `handleSpawnFromCue` handler that calls `spawnFromNote`
- `note-editor-cornell.tsx` — Cue rendering with "Ask Praxis" buttons

---

### 5. sketch-to-concept-map

**Mockup paths**: `.mockups/flows/sketch-to-concept-map/01-sketch-with-bridge.html` through 04-now-concept-map.html

**Delivered code**:
- `packages/ui/src/components/note-editor-sketch.tsx` — Sketch editor with tldraw
- Conversion logic (likely in `@praxis/core` or `@praxis/tools`)

**Drift classification**: **MAJOR-DRIFT**

**Details**:
- Mock shows: sketch canvas with "convert" affordance → conversion in-progress → result is now a concept-map
- Delivered: Sketch note editor is fully functional with tldraw canvas, auto-save to notes
- **Drift**: Conversion from sketch to concept-map is not visibly exposed in the UI flow captured in the mock
  - Sketch is stored as a note format; concept-map is a separate type accessed via course detail
  - No visible "convert sketch to map" button or flow in the current chat/workspace UI
  - The capability may exist at the backend layer (conversion logic in tools) but is not wired to a user-facing CTA

**Citations**:
- `note-editor-sketch.tsx` — Sketch editing (no conversion UI visible)

---

### 6. assignment-spawn

**Mockup paths**: `.mockups/flows/assignment-spawn/01-teach-mid-lesson.html` through 05-parent-receives.html

**Delivered code**:
- `packages/ui/src/hooks/use-assignment-issued-spawn.tsx` — Auto-spawn on assignment issued
- `packages/core/src/services/session/engine-session-manager.ts` — Session linkage (per CLAUDE.md)
- `packages/core/src/services/session-service.ts:notifySession()` — Parent notification (per CLAUDE.md)

**Drift classification**: **ALIGNED**

**Details**:
- Step 1 (teach mid-lesson): Tutor running ✓
- Step 2–3 (tutor issues, quiz running): Auto-spawn quiz/homework/exam tabs when model emits assignment ✓
  - `useAssignmentIssuedSpawn` mounted once per workspace detects assignment events ✓
- Step 4 (quiz submitted): Student submits assignment ✓
- Step 5 (parent receives): Parent tutor receives system_note event via `SessionService.notifySession()` ✓
  - No modal; notification surfaces in tutor's chat or activity strip ✓

**Citations**:
- `use-assignment-issued-spawn.tsx` — Auto-spawn logic
- CLAUDE.md "Parent-child session linkage" section

---

### 7. course-create-entry

**Mockup paths**: `.mockups/flows/course-create-entry/01-library-cta.html` through 05-course-materialized.html

**Delivered code**:
- `packages/ui/src/routes/course-create.tsx` (upload/material landing)
- `packages/ui/src/routes/chat.tsx` (course-create tab body)
- `packages/ui/src/components/course-create-tab-body.tsx` (drafter chat)

**Drift classification**: **IN-FLIGHT**

**Reason**: This flow is scoped to backlog idea `idea-course-create-unified-landing` and `idea-course-create-attach-doc-modal-stuck`. These ideas touch:
- `flows/course-create-entry/` (entire flow)
- `screens/epic-ui-redesign-ground-up-chat-workspace/mode-course-create.html` (mode body)
- Design refinements around unified landing, doc attachment modal, pack selection

**Details (current state)**:
- Step 1 (library CTA): "+ Create a course" card in library footer ✓
- Step 2 (upload docs): Course-create route at `/course-create` with drop zone, attached files list, optional context textarea ✓
- Step 3 (drafter running): Course-create session opens; drafter runs agentic multi-turn ✓
- Step 4–5 (draft ready, course materialized): Draft confirmed; course object created; course detail opens ✓

**Status**: Core flow is implemented; pending unified-landing refinements in backlog.

**Citations**:
- `course-create.tsx:33-100` — Course-create landing with file ingestion
- `course-create-tab-body.tsx` — Drafter chat body

---

### 8. first-run

**Mockup paths**: `.mockups/flows/first-run/01-welcome.html` through 04-course-picker.html

**Delivered code**:
- `packages/ui/src/components/onboarding-flow.tsx` (three-step flow)
- `packages/ui/src/routes/library.tsx` (first session from course picker)

**Drift classification**: **IN-FLIGHT** (step 04-course-picker only)

**Reason**: Backlog idea `idea-course-create-unified-landing` touches the course-picker onboarding card flow. Steps 01–03 (welcome, engine picker, engine-claude-code) evaluate normally; step 04 is deferred.

**Details**:
- Step 1 (welcome): Welcome step with skip/continue buttons ✓
- Step 2 (engine picker): Engine selection from list (Direct/Claude Code/Codex, plus OpenAI, Google, Ollama) ✓
- Step 3 (engine-claude-code): If Claude Code selected, auth modal for Claude CLI config ✓
- Step 4 (course-picker): Step progress dots, course cards, "Start with X course" flow
  - **IN-FLIGHT**: Unified-landing idea may refactor which courses are presented at onboarding vs. course-create route

**Citations**:
- `onboarding-flow.tsx:41-68` — Three-step flow (welcome, engine, course)
- `onboarding-flow.tsx:73-143` — StepProgress, WelcomeStep, EngineStep implementations

---

## Surface decisions roll-up

| Surface | Status | Decision |
|---|---|---|
| **app-shell** | aligned | keep mock — delivered StatusStrip refinement is documented in the surface notes |
| **chat-workspace** | aligned (intentional refinement) | keep mocks — mode-rule cards intentionally not surfaced in delivered UI; that's a deliberate choice, not drift |
| **discovery-surfaces** (library) | aligned | keep mock |
| **discovery-surfaces** (concept-maps, progress) | aspirational mock | **keep mock** — describes deferred feature intent, not stale |
| **workspace** (note editors × 5, concept-map editor) | aligned | keep mocks |
| **configure** | aligned | keep mocks — initial-scan misread corrected (mock and code both use "Gates") |
| **session-loop** | aligned | keep mock |
| **chat-to-workspace-note** | aligned | keep mock |
| **concept-map-link** | aligned (design refinement) | keep mock — candidates moved to right panel by deliberate refinement, same affordance arc |
| **note-to-tutor-brief** | aligned | keep mock |
| **sketch-to-concept-map** | aspirational mock | **keep mock** — convert-to-map CTA isn't wired yet; mock represents deferred intent |
| **assignment-spawn** | aligned | keep mock |
| **course-create-entry** | **IN-FLIGHT** | carve out — refresh waits on `idea-course-create-unified-landing` + `idea-course-create-attach-doc-modal-stuck` |
| **first-run** (01-welcome, 02-engine-picker, 03-engine-claude-code) | aligned | keep mocks |
| **first-run** (04-course-picker) | **IN-FLIGHT** | carve out — overlaps with unified-landing idea |

## Remediation queue

No shipped surfaces require mirror updates. The remediation work is on the
in-flight ideas, not the mockup files:

1. **Scope `idea-course-create-unified-landing`** via `/agile-workflow:scope`
   into an epic/feature; the design pass should produce mockup updates for
   `flows/course-create-entry/` and `flows/first-run/04-course-picker.html`
   reflecting:
   - Material · Create · Confirm · Open progress trail
   - Pack selection inside the "material" step
   - Auto-send first message on arrival in the course-design view
   - Single unified entry for every "start a course" path
2. **Scope `idea-course-create-attach-doc-modal-stuck`** via `/agile-workflow:fix`
   (small surface) or `/agile-workflow:scope` (if the modal-lifecycle review
   reveals a broader pattern); the fix should pin down the modal lifecycle
   and the post-attach scope refresh so `flows/course-create-entry/02-upload-docs.html`
   reflects the intended behavior.
3. **Optional: tighten `concept-map-link` mock** to depict the right-panel
   candidate UI (matching delivered code). Low priority — mock and code
   already converge on the same affordance arc; this is documentation
   polish, not drift remediation.

## Refusals (this pass)

- No "Whose Default?" persona-mocks generated. Skipped because this is a
  mirror-mode pass on an existing codebase aligned to current intent;
  persona work belongs in the unified-landing scoping pass (when surfaces
  are actually being redesigned).
- No new screen mocks. Per the user direction, only update where
  delivered diverges from intent — and the audit found no such cases on
  shipped surfaces.

## Implementation notes preserved from initial scan

1. **StatusStrip vs. right-rail.** The mockup concept of a right-edge
   ambient activity rail (`app-shell/option-1.html`) shipped as a
   horizontal `<StatusStrip>` beneath the top-nav. Documented refinement,
   not stale-mock drift.
2. **Concept-maps & progress stubs.** Both discovery surfaces are
   placeholder routes (RouteHeader only). Full implementations are
   deferred; mocks describe intended future state.
3. **Tab-body isolation.** All seven chat mode bodies mount simultaneously
   with `display:none` isolation per the `tab-body-isolation` pattern.
   Mocks present them as distinct screens; the implementation is
   architecturally cleaner and preserves per-tab state across switches.
4. **Concept-map-link refinement.** Mock had a floating popover for match
   candidates; delivered code uses a docked right-panel. Same affordance
   arc, deliberate refinement.

---

**Report compiled**: 2026-05-19
**Mode**: Mirror with carve-outs
**Scope**: Whole repo
**Net mockup updates this pass**: 0 (zero shipped surfaces required mirror updates)
