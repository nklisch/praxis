# Design: Phase 11 — Configure Mode + Lock + Authoring UI

## Overview

Phase 11 turns Praxis into a tunable system. A parent, teacher, or self-directed learner can author courses, edit gates, customize prompts, and inspect/manage student memory — through a dedicated **configure mode** that's gated by a local lock code. The same conversational shape from `bootstrap` mode (Phase 6) extends with broader authoring tools and a richer UI surface.

After Phase 11: configurator clicks "Configure" in the nav → if a lock is set, types code → lands on `/configure` with four tabs (Course, Gates, Prompt, Memory). Each tab uses a split-pane layout: chat with the agent on the left, structured editor on the right. The agent can call authoring tools (`course.edit`, `lesson.edit`, `gate.edit`, `prompt.override_fragment`, `memory.reset_concept`, `memory.clear_misconception`) to make changes; the editor reflects them in real time. The `/configure` surface is hidden when a lock is set; a small lock icon in the nav shows the current state and offers an "Unlock" prompt.

**Key design moves (from user discussion):**

1. **Lock is opt-in, never enforced on first launch.** Configure surface open by default; configurator opts in by clicking "Set lock code" inside configure. Once set, next launch hides configure behind the lock. Solo self-directed learners (Praxis's primary v1 audience) aren't friction-blocked by mandatory lock setup.

2. **Single `/configure` route with tabs.** Course / Gates / Prompt / Memory tabs in one route. Cohesive workspace feel; matches the `/courses` and `/packs` single-route convention. State persists across tab switches within a session.

3. **Per-mode-fragment prompt overrides only** (existing `prompt_overrides` schema). The configurator can override any `customizable: true` fragment in any mode. Style sliders (Socratic↔Lecture, Terse↔Verbose, Formal↔Casual) produce composite fragment overrides at known fragment IDs (e.g., `role.tutor`). Single source of truth at the fragment level. Per-course overrides are deferred to Phase 14+.

4. **Memory inspector ships with safe writes**: `reset_concept`, `clear_misconception`, `export`, `delete`. No `force_mastery` write — forcing mastery without practice would corrupt the BKT model. The "unlock without practice" case is already served by `GateState.kind: "overridden"`. Mutation events are written to a new `configurator_actions` log for audit.

5. **Configure mode subsumes bootstrap mode's tools** but keeps them separate at the **mode** level. Bootstrap mode (Phase 6) ships unchanged; configure mode is a richer mode with `bootstrap` mode's tools + new authoring/editing tools. The configurator in configure mode can do everything bootstrap can do, plus edit existing courses, edit gates, customize prompts, and manage memory.

**What ships:**

- **Lock service hardening** in `@praxis/core/services/lock-service.ts` — `LockServiceImpl` replaces the Phase 3 `ConfigServiceImpl` stubs for lock-related methods. Uses Argon2id (or PBKDF2 fallback) hashing with the install ID as salt component. `setLockCode`, `unlock`, `isLocked`, `clearLock` (used after successful unlock + explicit `lock` action, or via factory reset).
- **Schema additions** (`@praxis/core/src/schema.ts`):
  - `configurator_actions` table — append-only audit log of every memory mutation, course edit, gate edit, prompt override. Required for SPEC.md "students own their memory" — configurator changes are visible.
  - `lockState` table extended with `lockedAt: timestamp_ms?` to track session-level lock state (when set; cleared when unlocked-this-session).
- **`configure` mode** in `@praxis/curriculum/src/modes/configure.ts` — new mode definition. Tools: bootstrap's tool set + new authoring/editing tools. Role fragment instructs the agent on configurator-specific behaviors (broader scope, write actions, audit-trail awareness).
- **Authoring tools** in `@praxis/tools/src/authoring/`:
  - `course.edit` — edit existing course title, subject, gradeLevel, thresholds. Read-modify-write through `ArtifactsService.updateCourse`.
  - `lesson.edit` — edit lesson title, conceptIds (add/remove/reorder), references, suggestedStrategy, estimatedMinutes.
  - `lesson.create` — add a new lesson to an existing course.
  - `lesson.delete` — remove a lesson (cascade clears `lesson_progress`, `concept_progress` entries linked to it).
  - `gate.edit` — edit `successCriteria`, `prerequisites`, threshold values; also allows setting state to `"overridden"` with a reason.
  - `gate.create` / `gate.delete` — for editing the gate graph.
  - `prompt.override_fragment` — set/clear a fragment override (writes to `prompt_overrides`).
  - `prompt.set_style` — sets the three style-slider values (Socratic↔Lecture, Terse↔Verbose, Formal↔Casual); composes into known fragment overrides.
- **Memory tools** in `@praxis/tools/src/memory/` (extends Phase 7 directory):
  - `memory.reset_concept` — set a (studentId, conceptId) row to initial BKT state with a documented reason. Logs to `configurator_actions`.
  - `memory.clear_misconception` — flip status to `"manually-cleared"` with reason. Logs.
  - `memory.export` — wraps the existing `MemoryService.export` for tool-level access; writes a file via the file-picker IPC.
  - `memory.delete_all` — calls `MemoryService.delete({confirm: true})` after a second-confirmation step in the agent prompt.
- **Reuse Phase 6 bootstrap tools** in configure mode's `toolNames`: `course.list_documents`, `course.propose_draft`, `course.show_draft`, `course.edit_draft`, `course.confirm_draft`, `course.discard_draft`, `course.list_canonical_packs`, `course.use_canonical_pack`. Configurator can author from materials OR a pack OR by direct edit, all in the same mode.
- **`AuthoringServiceImpl`** in `@praxis/core/services/authoring-service.ts` — orchestration layer for the new authoring/editing/memory tools. Server-side gate: refuses calls when the lock is set and the current session isn't unlocked (lock check). Implements the existing Phase 3 `AuthoringService` interface plus new methods.
- **`ArtifactsService` extensions**: `updateCourse`, `updateLesson`, `createLesson`, `deleteLesson`, `updateGate`, `createGate`, `deleteGate`, `getCourseSummary` (full snapshot for the editor's structured view). All idempotent.
- **`/configure` UI route** at `packages/ui/src/routes/configure.tsx` with four tabs:
  - **Course tab** — split-pane chat (left) + structured course outline editor (right). The outline renders editable lessons + concept lists. Edits flow through `client.author.updateLesson` etc. Agent can also edit via tools.
  - **Gates tab** — React Flow editor extending Phase 9's read-only progress map. Add/remove edges (prerequisites), click a gate to open inspector pane (threshold sliders, success-criteria editor). State changes flow through `client.author.updateGate` etc.
  - **Prompt tab** — fragment-by-mode selector + override textarea + style sliders + live preview. Writes to `prompt_overrides`.
  - **Memory tab** — sub-tabs (Student model, Misconceptions, Strategies, Affective, Episodic). Read-mostly with edit actions per the design.
- **Lock UI**:
  - Nav lock icon shows current state: `🔓` (no lock), `🔒` (locked), `🔓` (unlocked-this-session).
  - Click `🔒` → unlock prompt modal.
  - Inside `/configure`, "Set lock code" / "Change lock code" / "Lock now" buttons in a Settings sub-section (or a dedicated tab if it gets bigger).
- **`praxis.author.*` IPC + `AuthoringClient`** — typed client surface. Mirrors `AuthoringService`. Lock check happens server-side in IPC handlers (refuses calls when locked and session not unlocked).
- **`praxis.lock.*` IPC** — `setLockCode`, `unlock`, `lock`, `isLocked`. Replaces the Phase 3 `ConfigClient` stubs (or extends — depending on chosen consolidation).
- **Configure mode session integration** — when the user clicks "Configure" and the lock is unlocked, a `configure` mode session is started. The agent surfaces in the chat pane of `/configure`.
- **`pnpm db:configurator-actions` CLI** — list configurator actions for audit visibility.
- **Doc updates**: `docs/ROADMAP.md` Phase 11 description tightened; `docs/CURRICULUM.md` adds configure-mode details; `docs/CONTRACT.md` adds AuthoringService v1 status + lock service interface; `docs/SPEC.md` confirms the lock semantics.

**What does not ship (deferred):**

- **Per-course prompt overrides** — Phase 14+. Single global per-fragment override only.
- **Force-mastery writes** in memory inspector — verification stance.
- **Multi-student configurator dashboards** — v1 is single-student.
- **Multi-configurator support** — single configurator per install. The `ConfiguratorId` type in `GateState.overridden.by` is reserved (defaults to `"default"` in v1).
- **Custom mode authoring** — configurator can't define new modes in v1. Phase 14+ when the mode plugin system lands.
- **Pack editing** — configurator can't edit canonical packs (treat them as read-only). Editing extracted graphs (Phase 6 bootstrap output) IS supported. Phase 14+ might add canonical-pack editing for power users.
- **Gate-evaluator parameter overrides** — `RouterConfig` (Phase 10) is global. Per-student / per-course overrides deferred.
- **Authoring undo/redo** — every action writes to `configurator_actions` (forward audit) but there's no UI to roll back. Future.
- **Authoring permissions / roles** — single configurator with full power.
- **OS-keychain lock storage** — v1 uses Argon2id-hashed code in SQLite. Per-OS keychain integration is post-v1.

## Why these choices (decision rationale)

**Why opt-in lock (not first-run mandatory).** Praxis's v1 audience is dominated by self-directed learners (per VISION.md). For them, a mandatory lock-setup step on first launch is friction, not safety — they're the only user. For the parent/teacher case, the configurator is the same person opening configure — they can set a lock the moment they're ready. UX.md verbatim says "Lock code (optional)" — Phase 11 honors that.

**Why a single `/configure` route with tabs.** Five reasons: (1) The four tabs are coherent — one workspace, four lenses; (2) State preservation across tab switches matters when authoring (clicking from Course → Gates → back to Course shouldn't reset the editor's scroll position or selection); (3) The chat pane is shared across tabs — the agent's conversation continues regardless of which tab is active; (4) Phase 6 (`/courses`), Phase 10 (`/packs`) follow single-route conventions; (5) Multi-route means more URL state to coordinate, more transitions, harder to reason about lock state.

**Why per-mode-fragment overrides only (deferring per-course).** The existing `prompt_overrides` table already keys on `(modeId, fragmentId)` — single source of truth. Per-course overrides would require: a third key column, precedence rules ("course override wins over global, but only if applicable"), a UI to express the precedence, schema migration. Adding flexibility before a real demand exists is yak-shaving. Phase 14+ can add this when a configurator says "I want different teaching styles per subject."

**Why memory inspector ships safe writes.** SPEC.md commits to "students own their memory: export, delete, move between installations." Configurator-driven memory edits are different: a parent might want to reset a misconception that the system mistakenly recorded, or reset mastery on a concept the student just had a bad day on. These are documented edits (logged to `configurator_actions`), not arbitrary writes. The hard rule: no `force_mastery` write — that would corrupt BKT and is the wrong escape hatch (gate override is the right one).

**Why a `configurator_actions` audit log.** Phase 7 makes mastery + misconceptions projection-layer concerns — they're regenerable from episodic. Configurator-driven writes break that invariant: a `reset_concept` action throws away evidence. The audit log makes those throws visible. A configurator viewing memory can see "you reset Linear Equations on March 14, reason: 'student requested fresh start'" — full provenance. Phase 14+ might add undo, but even without undo, the audit is enough for "what happened?"

**Why authoring tools live in `@praxis/tools/src/authoring/` (not in a new `@praxis/authoring` package).** Tools are tools, regardless of which mode uses them. Existing pattern: math/code/retrieval/course/assignment/memory all live as subdirectories under `@praxis/tools/src/`. Authoring follows the same pattern. The package boundary cost (new workspace package, exports map, etc.) isn't justified.

**Why `ArtifactsService` gains write methods (instead of a separate `EditingService`).** The Phase 6 / 7 / 8 / 9 / 10 pattern is: `ArtifactsService` is the single read-write surface for course/lesson/gate/concept artifacts. Adding `updateCourse`/`updateLesson`/`updateGate` keeps that pattern. Splitting into `ArtifactsReadService` + `EditingService` would create a parallel surface with the same dependencies and unclear ownership. The existing `markLessonStarted` / `markConceptStudied` methods on `ArtifactsService` are already writes; adding configurator-driven writes is consistent.

**Why lock semantics: hashed locally + install-ID-salted.** SPEC.md verbatim: "Lock is stored locally (hashed; salt is the install ID)." Argon2id is the modern choice (memory-hard, GPU-resistant). PBKDF2-SHA256 is acceptable as a fallback (Node's `crypto.scrypt` works without native deps). Per UX.md, "the lock is a UX gate, not a security boundary" — defending against a kid trying to game the system, not an attacker with filesystem access. Argon2id is more than enough.

**Why nav-level lock icon (not modal-only flow).** The lock state is ambient — at all times the configurator can see whether configure is locked, set, or unlocked-this-session. Clicking the icon is the entry point: prompt to unlock if locked; show "Lock now" if unlocked-this-session. Discoverable; doesn't depend on the configurator finding a settings menu.

## Scope and assumptions

- **Single-student per install** (v1).
- **Single configurator per install** (v1). The `GateState.overridden.by` field uses a default `ConfiguratorId` in v1.
- **Lock is enforced on the IPC layer**, not just the UI. `praxis.author.*` and `praxis.memory.*` write methods refuse when locked AND the current session isn't unlocked. UI lock-gating is a UX layer; IPC enforcement is the safety layer.
- **Unlock state is per-process**, not persisted. Quit and relaunch → re-locked. Within a process, "unlocked-this-session" persists until "Lock now" is clicked or the app exits.
- **All authoring writes are atomic.** Multi-step edits (e.g., "rename lesson + add 2 concepts") run in one Drizzle transaction.
- **Cascade behavior** for deletes: `lesson.delete` cascades through `lesson_progress`, `concept_progress` (entries for concepts that are now orphaned), `gates` whose `guards.kind: "lesson"` references the deleted lesson. Configurator confirms via the agent before destructive writes.
- **Prompt overrides validate against the active mode's fragments.** Trying to override a `customizable: false` fragment fails with a clear error (per Phase 6's existing `composeSystemPrompt` validation).
- **Memory write semantics**: `reset_concept` sets `pKnown` to `pL0` (BKT prior), `uncertainty` to 0.5, clears `evidenceJson`, sets `lastPracticedAt = null`. Effectively "as if never observed."
- **Memory write attribution**: every memory write logs the configurator who made it, the time, and the reason. The audit log is per-install.
- **Configure-mode session lifetime**: a single configure session can span multiple authoring actions. The agent's conversational state persists; tool calls write to the DB atomically per call.
- **No retroactive write of student-facing notifications**: when a configurator edits a course, no notification fires to the student. The next student session sees the updated structure naturally via the brief composer.
- **Gate edits don't trigger immediate re-evaluation** — the next session-end re-evaluation picks up new gate criteria. Same as Phase 9 semantics.
- **Lock check is global** at the IPC layer. A locked install with no unlocked session refuses all `praxis.author.*` and `praxis.memory.*` writes. The progress map and other student-surface IPC reads stay open.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` — Phase 11 has no real-engine tests; integration tests use FakeEngine.

## Dependency direction (Phase 11 additions)

```
@praxis/core/schema.ts
  ├─ MODIFIED: lockState — add lockedAt
  └─ NEW: configurator_actions table

@praxis/core/types
  ├─ MODIFIED: tool.ts — server-side AuthoringService interface; LockService port
  ├─ MODIFIED: client.ts — extended AuthoringClient; new LockClient or extended ConfigClient
  └─ NEW: configurator.ts — ConfiguratorAction discriminated union

@praxis/core/src/services
  ├─ NEW: lock-service.ts — LockServiceImpl (Argon2id / scrypt hashing, install-id salt)
  ├─ NEW: authoring-service.ts — AuthoringServiceImpl (server-side; orchestrates writes; lock check)
  ├─ MODIFIED: artifacts-service.ts — add updateCourse, updateLesson, createLesson, deleteLesson, updateGate, createGate, deleteGate, getCourseSummary
  └─ MODIFIED: config-service.ts — replace stubs with delegations to LockServiceImpl

@praxis/curriculum/src/
  ├─ NEW: modes/configure.ts (configure mode definition)
  ├─ NEW: modes/fragments/configure-role.ts
  ├─ NEW: modes/fragments/configure-tools.ts
  └─ NEW: brief/style-composer.ts (compose style-slider values into fragment overrides)

@praxis/tools/src/authoring/
  ├─ course/{edit,update-thresholds}.ts
  ├─ lesson/{create,edit,delete}.ts
  ├─ gate/{create,edit,delete}.ts
  ├─ prompt/{override-fragment,set-style}.ts
  └─ index.ts

@praxis/tools/src/memory/ (extends Phase 7 dir)
  ├─ NEW: reset-concept.ts
  ├─ NEW: clear-misconception.ts
  ├─ NEW: export.ts
  └─ NEW: delete-all.ts

@praxis/desktop/electron/main/
  ├─ MODIFIED: services.ts — wire LockServiceImpl + AuthoringServiceImpl + new tools
  └─ MODIFIED: ipc-server.ts — praxis.author.* and praxis.lock.* with lock-check guard

@praxis/client/src/services/
  ├─ MODIFIED: authoring-client.ts — replace Phase 3 stub with real impl
  └─ MODIFIED: config-client.ts (or new lock-client.ts) — real lock methods

@praxis/ui/src/
  ├─ NEW: routes/configure.tsx + .module.css (single route; four tabs)
  ├─ NEW: routes/configure/course-tab.tsx (or in-route component)
  ├─ NEW: routes/configure/gates-tab.tsx
  ├─ NEW: routes/configure/prompt-tab.tsx
  ├─ NEW: routes/configure/memory-tab.tsx
  ├─ NEW: components/lock-icon.tsx + .module.css
  ├─ NEW: components/unlock-modal.tsx + .module.css
  ├─ NEW: components/lesson-editor.tsx + .module.css
  ├─ NEW: components/gate-inspector.tsx + .module.css (writeable extension of Phase 9 components)
  ├─ NEW: components/prompt-fragment-editor.tsx + .module.css
  ├─ NEW: components/style-slider.tsx + .module.css
  ├─ NEW: components/memory-inspector-tabs.tsx + .module.css
  ├─ NEW: hooks/use-configure-state.ts (cross-tab state coordination)
  ├─ NEW: hooks/use-lock.ts
  ├─ MODIFIED: components/nav.tsx — add lock icon + Configure link
  └─ MODIFIED: router.tsx — register /configure route

scripts/
  └─ NEW: db-configurator-actions.ts

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 11 description tightened)
  ├─ MODIFIED: CURRICULUM.md (configure mode + style sliders + memory inspector v1 details)
  ├─ MODIFIED: CONTRACT.md (AuthoringService + LockService + ConfiguratorAction)
  └─ MODIFIED: SPEC.md (lock-storage technical detail; opt-in vs mandatory commitment)
```

No Python in Phase 11.

---

## Implementation Units

### Unit 1: Type contract additions

**Files**:
- `packages/core/src/types/configurator.ts` (new)
- `packages/core/src/types/tool.ts` (modified — server-side `AuthoringService` + `LockService`)
- `packages/core/src/types/client.ts` (modified — extended `AuthoringClient`, new `LockClient` interface)
- `packages/core/src/types/index.ts` (re-export)

```typescript
// packages/core/src/types/configurator.ts (new)

import type { Timestamp } from "./common.js";
import type { ConceptId, CourseId, GateId, LessonId, MisconceptionId } from "./ids.js";

/**
 * Brand for a configurator identity. v1 is single-configurator; the
 * default value is `"default"`. Phase 14+ may extend.
 */
export type ConfiguratorId = string & { readonly __brand: "ConfiguratorId" };

/** A single configurator action — append-only audit row. */
export type ConfiguratorAction =
  | { kind: "course.edit"; courseId: CourseId; patch: unknown; reason?: string }
  | { kind: "lesson.create"; courseId: CourseId; lessonId: LessonId }
  | { kind: "lesson.edit"; lessonId: LessonId; patch: unknown }
  | { kind: "lesson.delete"; lessonId: LessonId; reason?: string }
  | { kind: "gate.create"; gateId: GateId; courseId: CourseId }
  | { kind: "gate.edit"; gateId: GateId; patch: unknown; reason?: string }
  | { kind: "gate.delete"; gateId: GateId; reason?: string }
  | { kind: "gate.override"; gateId: GateId; reason: string }
  | { kind: "prompt.override_fragment"; modeId: string; fragmentId: string }
  | { kind: "prompt.clear_fragment"; modeId: string; fragmentId: string }
  | { kind: "prompt.set_style"; level: { socratic: number; verbosity: number; formality: number } }
  | { kind: "memory.reset_concept"; conceptId: ConceptId; reason: string }
  | { kind: "memory.clear_misconception"; misconceptionId: MisconceptionId; reason: string }
  | { kind: "memory.export"; }
  | { kind: "memory.delete_all"; reason: string };

export interface ConfiguratorActionRow {
  id: string;
  configuratorId: ConfiguratorId;
  ts: Timestamp;
  action: ConfiguratorAction;
}
```

```typescript
// packages/core/src/types/tool.ts — additions

/** Lock service — local code-gating. */
export interface LockService {
  /** Whether a lock code is set. */
  isSet(): Promise<boolean>;
  /** Whether the current process has been unlocked. Always true when no lock is set. */
  isUnlocked(): Promise<boolean>;
  /** Set/replace the lock code. Throws if the new code fails policy (length 4-8 digits). */
  setLockCode(input: { code: string }): Promise<void>;
  /** Verify code; on success, marks the current process unlocked. */
  unlock(input: { code: string }): Promise<{ ok: boolean }>;
  /** Lock the current process (clears the unlocked-this-session flag). */
  lock(): Promise<void>;
  /** Clear the lock entirely (factory-reset path). Requires the current code. */
  clearLock(input: { currentCode: string }): Promise<void>;
}

/** Server-side AuthoringService — extends the Phase 3 client interface with v1 methods. */
export interface AuthoringService {
  // Existing Phase 3 surface (now real):
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;

  // Phase 11 additions:
  updateCourse(input: { courseId: CourseId; patch: Partial<Pick<Course, "title" | "subject" | "gradeLevel" | "thresholds">> }): Promise<Course>;
  createLesson(input: { courseId: CourseId; title: string; conceptIds: ConceptId[]; orderIndex?: number; suggestedStrategy?: StrategyId; estimatedMinutes?: number; references?: Reference[] }): Promise<Lesson>;
  updateLesson(input: { lessonId: LessonId; patch: Partial<Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">> }): Promise<Lesson>;
  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;
  createGate(input: { courseId: CourseId; guards: GateTarget; prerequisites: GateId[]; successCriteria: SuccessCriteria }): Promise<Gate>;
  updateGate(input: { gateId: GateId; patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">> }): Promise<Gate>;
  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;
  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate>;
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;
  resetConcept(input: { studentId: StudentId; conceptId: ConceptId; reason: string }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: { studentId: StudentId; targetPath: string }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { studentId: StudentId; reason: string; confirm: true }): Promise<void>;
  listConfiguratorActions(input?: { fromTs?: Timestamp; limit?: number }): Promise<ConfiguratorActionRow[]>;
}

/** Extended ToolServices. */
export interface ToolServices {
  // ... existing ...
  authoring: AuthoringService;  // ← Phase 11
  lock: LockService;            // ← Phase 11 (so tools can check lock state when needed)
}
```

```typescript
// packages/core/src/types/client.ts — additions

/** Client-side AuthoringService surface (no studentId on methods; resolved server-side). */
export interface AuthoringClient {
  createCourse(input: CreateCourseInput): Promise<Course>;
  editGate(id: GateId, patch: Partial<Gate>): Promise<Gate>;
  bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse>;
  customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void>;

  // Phase 11:
  updateCourse(input: { courseId: CourseId; patch: Partial<Pick<Course, "title" | "subject" | "gradeLevel" | "thresholds">> }): Promise<Course>;
  createLesson(input: { courseId: CourseId; title: string; conceptIds: ConceptId[]; orderIndex?: number; suggestedStrategy?: StrategyId; estimatedMinutes?: number; references?: Reference[] }): Promise<Lesson>;
  updateLesson(input: { lessonId: LessonId; patch: Partial<Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">> }): Promise<Lesson>;
  deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void>;
  createGate(input: { courseId: CourseId; guards: GateTarget; prerequisites: GateId[]; successCriteria: SuccessCriteria }): Promise<Gate>;
  updateGate(input: { gateId: GateId; patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">> }): Promise<Gate>;
  deleteGate(input: { gateId: GateId; reason?: string }): Promise<void>;
  overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate>;
  clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void>;
  setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void>;
  resetConcept(input: { conceptId: ConceptId; reason: string }): Promise<void>;
  clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void>;
  exportMemory(input: { targetPath: string }): Promise<{ ok: true; bytesWritten: number }>;
  deleteAllMemory(input: { reason: string; confirm: true }): Promise<void>;
  listConfiguratorActions(input?: { fromTs?: Timestamp; limit?: number }): Promise<ConfiguratorActionRow[]>;
}

export interface LockClient {
  isSet(): Promise<boolean>;
  isUnlocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  lock(): Promise<void>;
  clearLock(currentCode: string): Promise<void>;
}

export interface PraxisClient {
  // ... existing ...
  author: AuthoringClient;  // ← real impl in Phase 11 (replaces Phase 3 stub)
  lock: LockClient;         // ← Phase 11 NEW
}
```

**Implementation notes**:
- The `studentId` parameter on server-side memory methods is resolved via `getOrCreateDefaultStudentId(db)` in IPC handlers — client-side methods don't take it.
- `ConfiguratorAction` is a discriminated union; switch over `kind` for exhaustiveness.

**Acceptance criteria**:
- [ ] All new types re-exported from `packages/core/src/types/index.ts`.
- [ ] `LockService` and `AuthoringService` interfaces are server-side (with `studentId` where relevant).
- [ ] `LockClient` and `AuthoringClient` interfaces are client-side (no studentId).
- [ ] `ToolServices.authoring` and `.lock` added.

---

### Unit 2: Schema additions

**File**: `packages/core/src/schema.ts` (modified)

```typescript
export const lockState = sqliteTable("lock_state", {
  installId: text("install_id").primaryKey(),
  hashedCode: text("hashed_code"), // null = not set
  salt: text("salt").notNull(),
  setAt: integer("set_at", { mode: "timestamp_ms" }),
  /** Phase 11: timestamp when the lock was last set. NULL if never set. */
  lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
});

export const configuratorActions = sqliteTable(
  "configurator_actions",
  {
    id: text("id").primaryKey(),
    configuratorId: text("configurator_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    actionJson: text("action_json", { mode: "json" }).notNull(), // ConfiguratorAction
  },
  (t) => ({
    tsIdx: index("configurator_actions_ts_idx").on(t.ts),
  }),
);

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
  configuratorActions, // ← Phase 11
};
```

**Implementation notes**:
- Migration generated via `pnpm db:generate`.
- `lockedAt` on `lockState` is informational — used to display "lock set on March 14" in the UI. The actual lock check uses `hashedCode IS NOT NULL`.

**Acceptance criteria**:
- [ ] `pnpm db:generate` produces a migration adding `configurator_actions` and altering `lockState`.
- [ ] `pnpm db:migrate` applies cleanly.
- [ ] Existing rows survive (nullable column added).

---

### Unit 3: `LockServiceImpl`

**File**: `packages/core/src/services/lock-service.ts` (new)

```typescript
import { eq } from "drizzle-orm";
import { lockState } from "../schema.js";
import type { PraxisDb } from "../db/index.js";
import type { LockService, Logger } from "../types/index.js";
import { hashCode, verifyCode, getInstallId, generateSalt } from "../auth/lock-crypto.js";

export interface LockServiceDeps {
  db: PraxisDb;
  log: Logger;
}

const CODE_POLICY = /^\d{4,8}$/;

/**
 * LockServiceImpl — local code-gating.
 *
 * Storage: lockState table. installId is the row PK; per-install salt + hashed code.
 * In-process state: a module-level boolean tracks whether the current process has
 * unlocked. Quit-and-relaunch resets the flag.
 *
 * Hashing: Argon2id via @node-rs/argon2 if available; fallback to scrypt.
 */
export class LockServiceImpl implements LockService {
  /** Process-scoped unlock flag. Cleared on quit; cleared on `lock()`. */
  private unlocked = false;

  constructor(private readonly deps: LockServiceDeps) {}

  async isSet(): Promise<boolean> {
    const row = this.readRow();
    return row !== null && row.hashedCode !== null;
  }

  async isUnlocked(): Promise<boolean> {
    if (!(await this.isSet())) return true;
    return this.unlocked;
  }

  async setLockCode(input: { code: string }): Promise<void> {
    if (!CODE_POLICY.test(input.code)) {
      throw new Error("Lock code must be 4–8 digits");
    }
    const row = this.readRow();
    const salt = row?.salt ?? generateSalt();
    const installId = row?.installId ?? getInstallId();
    const hashed = await hashCode(input.code, salt);
    const now = new Date();

    if (row) {
      this.deps.db
        .update(lockState)
        .set({ hashedCode: hashed, setAt: now, lockedAt: now })
        .where(eq(lockState.installId, installId))
        .run();
    } else {
      this.deps.db
        .insert(lockState)
        .values({ installId, hashedCode: hashed, salt, setAt: now, lockedAt: now })
        .run();
    }
    // Setting (or replacing) a lock leaves the current process unlocked.
    this.unlocked = true;
    this.deps.log.info("lock.set", { installId });
  }

  async unlock(input: { code: string }): Promise<{ ok: boolean }> {
    const row = this.readRow();
    if (!row || !row.hashedCode) {
      // No lock set → considered "unlocked" already.
      this.unlocked = true;
      return { ok: true };
    }
    const ok = await verifyCode(input.code, row.salt, row.hashedCode);
    if (ok) {
      this.unlocked = true;
      this.deps.log.info("lock.unlocked", { installId: row.installId });
    } else {
      this.deps.log.warn("lock.unlock_failed");
    }
    return { ok };
  }

  async lock(): Promise<void> {
    this.unlocked = false;
    this.deps.log.info("lock.locked");
  }

  async clearLock(input: { currentCode: string }): Promise<void> {
    const row = this.readRow();
    if (!row || !row.hashedCode) return; // already cleared

    const ok = await verifyCode(input.currentCode, row.salt, row.hashedCode);
    if (!ok) throw new Error("Current code does not match");

    this.deps.db
      .update(lockState)
      .set({ hashedCode: null, lockedAt: null })
      .where(eq(lockState.installId, row.installId))
      .run();
    this.unlocked = true;
    this.deps.log.info("lock.cleared");
  }

  private readRow(): typeof lockState.$inferSelect | null {
    const rows = this.deps.db.select().from(lockState).all();
    return rows[0] ?? null;
  }
}
```

```typescript
// packages/core/src/auth/lock-crypto.ts (new)

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { networkInterfaces } from "node:os";

const scrypt = promisify(scryptCb);

const SCRYPT_KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Compute a derived install ID. Combines a stable network MAC (or hostname
 * fallback) so the salt is install-stable across restarts but tied to this
 * machine. Used as the salt component in lock hashing per SPEC.md
 * ("salt is the install ID").
 *
 * Note: a malicious user with filesystem access can read the salt and brute-
 * force the lock — this is a UX gate, not a security boundary, per UX.md.
 */
export function getInstallId(): string {
  // Pick the first non-internal MAC address; fall back to hostname.
  const macs: string[] = [];
  for (const ifaceList of Object.values(networkInterfaces())) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        macs.push(iface.mac);
      }
    }
  }
  if (macs.length > 0) return macs[0]!;
  return `host-${process.platform}-${process.arch}`;
}

/** Hash a code with scrypt. Returns hex digest. */
export async function hashCode(code: string, salt: string): Promise<string> {
  const buf = (await scrypt(code, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS)) as Buffer;
  return buf.toString("hex");
}

/** Constant-time verify. */
export async function verifyCode(code: string, salt: string, expectedHex: string): Promise<boolean> {
  const buf = (await scrypt(code, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  if (buf.length !== expected.length) return false;
  return timingSafeEqual(buf, expected);
}
```

**Implementation notes**:
- scrypt is built into Node — no native dep. Argon2id would require `@node-rs/argon2` which is fine but adds a dep; scrypt is acceptable for the UX-gate threat model.
- `getInstallId` derives from network MAC for stability across restarts. If the machine's networking changes (rare), the install id changes — the lock would still validate because the hash uses the SALT, not the install ID directly. The install ID is just used as a row PK / salt-stability hint.
- The `unlocked` flag is process-scoped. Multiple `LockServiceImpl` instances in the same process don't share state — but Phase 11 wires a single instance via `buildServices`, so this is fine.

**Acceptance criteria**:
- [ ] `setLockCode` rejects non-4-8-digit codes.
- [ ] `setLockCode` then `unlock(code)` returns `{ ok: true }`.
- [ ] Wrong code returns `{ ok: false }`.
- [ ] After `unlock`, `isUnlocked()` returns true within the same process.
- [ ] After `lock()`, `isUnlocked()` returns false.
- [ ] `clearLock` requires the current code; on success, `isSet()` returns false thereafter.
- [ ] When no lock is set, `isUnlocked()` always returns true.

---

### Unit 4: `ArtifactsService` write extensions

**File**: `packages/core/src/services/artifacts-service.ts` (modified)

```typescript
// New methods on ArtifactsServiceImpl:

async updateCourse(input: {
  courseId: CourseId;
  patch: Partial<Pick<Course, "title" | "subject" | "gradeLevel" | "thresholds">>;
}): Promise<Course> {
  const now = new Date();
  this.deps.db
    .update(courses)
    .set({
      ...(input.patch.title !== undefined && { title: input.patch.title }),
      ...(input.patch.subject !== undefined && { subject: input.patch.subject }),
      ...(input.patch.gradeLevel !== undefined && { gradeLevel: input.patch.gradeLevel }),
      ...(input.patch.thresholds !== undefined && { thresholdsJson: input.patch.thresholds }),
      updatedAt: now,
    })
    .where(eq(courses.id, input.courseId))
    .run();
  const result = await this.course(input.courseId);
  if (!result) throw new Error(`Course not found: ${input.courseId}`);
  return result;
}

async createLesson(input: {
  courseId: CourseId;
  title: string;
  conceptIds: ConceptId[];
  orderIndex?: number;
  suggestedStrategy?: StrategyId;
  estimatedMinutes?: number;
  references?: Reference[];
}): Promise<Lesson> {
  // If orderIndex omitted, append at the end.
  const id = uuidv7();
  const orderIndex = input.orderIndex ?? this.nextLessonOrderIndex(input.courseId);
  // ... insert lesson row, return parsed Lesson.
}

async updateLesson(input: {
  lessonId: LessonId;
  patch: Partial<Pick<Lesson, "title" | "conceptIds" | "references" | "suggestedStrategy" | "estimatedMinutes">>;
}): Promise<Lesson> {
  // Read-modify-write through Drizzle update; return parsed result.
}

async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
  return this.deps.db.transaction((tx) => {
    // 1. Delete lesson_progress rows.
    tx.delete(lessonProgress).where(eq(lessonProgress.lessonId, input.lessonId)).run();
    // 2. Delete gates whose guards.lessonId matches (cascade-style).
    //    Gates with guards.kind === "lesson" pointing at this lesson are removed.
    const gateRows = tx.select().from(gates).all();
    const gatesToDelete = gateRows
      .filter((g) => {
        const guards = g.guardsJson as { kind: string; lessonId?: string };
        return guards.kind === "lesson" && guards.lessonId === input.lessonId;
      })
      .map((g) => g.id);
    if (gatesToDelete.length > 0) {
      tx.delete(gates).where(inArray(gates.id, gatesToDelete)).run();
    }
    // 3. Delete the lesson row.
    tx.delete(lessons).where(eq(lessons.id, input.lessonId)).run();
  });
}

async createGate(input: {
  courseId: CourseId;
  guards: GateTarget;
  prerequisites: GateId[];
  successCriteria: SuccessCriteria;
}): Promise<Gate> {
  const id = uuidv7();
  this.deps.db
    .insert(gates)
    .values({
      id,
      courseId: input.courseId,
      guardsJson: input.guards,
      prerequisitesJson: input.prerequisites,
      successCriteriaJson: input.successCriteria,
      stateJson: { kind: "locked", missingPrerequisites: input.prerequisites },
      evidenceJson: [],
    })
    .run();
  return /* parsed gate row */;
}

async updateGate(input: {
  gateId: GateId;
  patch: Partial<Pick<Gate, "guards" | "prerequisites" | "successCriteria">>;
}): Promise<Gate> {
  // Apply patch fields; preserve state and evidence.
}

async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
  this.deps.db.delete(gates).where(eq(gates.id, input.gateId)).run();
  // Also remove from gate_unlock_events (FK cascades automatically? verify).
}

async overrideGate(input: { gateId: GateId; reason: string; configuratorId: ConfiguratorId }): Promise<Gate> {
  const now = Date.now() as Timestamp;
  const newState: GateState = {
    kind: "overridden",
    by: input.configuratorId,
    reason: input.reason,
    at: now,
  };
  this.deps.db
    .update(gates)
    .set({ stateJson: newState })
    .where(eq(gates.id, input.gateId))
    .run();
  // Also write a gate_unlock_events row (the "overridden" transition is auditable).
  // ...
  return /* parsed gate */;
}

async getCourseSummary(courseId: CourseId): Promise<{
  course: Course;
  lessons: Lesson[];
  gates: Gate[];
  concepts: Concept[];
}> {
  // Full snapshot for the editor's structured view.
}
```

**Implementation notes**:
- Each write method is a single Drizzle transaction (multi-row writes).
- `getCourseSummary` is a heavy read used by the configure UI's editor pane on tab open.
- `overrideGate` writes a `gate_unlock_events` row to maintain Phase 9's audit trail.

**Acceptance criteria**:
- [ ] `updateCourse({patch: {title: "New"}})` updates the title; `updatedAt` advances.
- [ ] `createLesson` inserts a row with auto-incremented orderIndex when omitted.
- [ ] `updateLesson({patch: {conceptIds: [...]}})` replaces the conceptIds array.
- [ ] `deleteLesson` cascades to lesson_progress + gates guarding the lesson.
- [ ] `createGate` produces a locked initial state.
- [ ] `overrideGate` writes a `gate_unlock_events` row.
- [ ] `getCourseSummary` returns one consistent snapshot.

---

### Unit 5: `AuthoringServiceImpl`

**File**: `packages/core/src/services/authoring-service.ts` (new)

```typescript
import { v7 as uuidv7 } from "uuid";
import { configuratorActions, promptOverrides } from "../schema.js";
import type { PraxisDb } from "../db/index.js";
import type {
  ArtifactsService,
  AuthoringService,
  ConfiguratorAction,
  ConfiguratorActionRow,
  ConfiguratorId,
  Logger,
  MemoryService,
  StudentId,
  Timestamp,
} from "../types/index.js";

export interface AuthoringServiceDeps {
  db: PraxisDb;
  log: Logger;
  artifacts: ArtifactsService;
  memory: MemoryService;
  /** ConfiguratorId factory — v1 returns "default". Phase 14+ may resolve from session. */
  configuratorId: () => ConfiguratorId;
  /** Resolves the active student. v1: getOrCreateDefaultStudentId. */
  studentId: () => StudentId;
}

const DEFAULT_CONFIGURATOR_ID = "default" as ConfiguratorId;

/**
 * AuthoringServiceImpl — server-side orchestration for configurator writes.
 *
 * Every write method:
 *   1. Calls the underlying service (artifacts / memory / prompt store).
 *   2. Appends a configurator_actions row with the action discriminated.
 *
 * Lock-check enforcement happens in the IPC layer, not here.
 */
export class AuthoringServiceImpl implements AuthoringService {
  constructor(private readonly deps: AuthoringServiceDeps) {}

  // ─── Course / lesson / gate ────────────────────────────────────────────────

  async createCourse(input: CreateCourseInput): Promise<Course>;
  async updateCourse(input: { courseId: CourseId; patch: Partial<...> }): Promise<Course> {
    const result = await this.deps.artifacts.updateCourse(input);
    this.appendAction({ kind: "course.edit", courseId: input.courseId, patch: input.patch });
    return result;
  }
  async createLesson(input: { ... }): Promise<Lesson> {
    const result = await this.deps.artifacts.createLesson(input);
    this.appendAction({ kind: "lesson.create", courseId: input.courseId, lessonId: result.id });
    return result;
  }
  async updateLesson(input: { lessonId: LessonId; patch: ... }): Promise<Lesson> {
    const result = await this.deps.artifacts.updateLesson(input);
    this.appendAction({ kind: "lesson.edit", lessonId: input.lessonId, patch: input.patch });
    return result;
  }
  async deleteLesson(input: { lessonId: LessonId; reason?: string }): Promise<void> {
    await this.deps.artifacts.deleteLesson(input);
    this.appendAction({ kind: "lesson.delete", lessonId: input.lessonId, ...(input.reason && { reason: input.reason }) });
  }
  async createGate(input: { ... }): Promise<Gate> {
    const result = await this.deps.artifacts.createGate(input);
    this.appendAction({ kind: "gate.create", gateId: result.id, courseId: input.courseId });
    return result;
  }
  async updateGate(input: { gateId: GateId; patch: ... }): Promise<Gate> {
    const result = await this.deps.artifacts.updateGate(input);
    this.appendAction({ kind: "gate.edit", gateId: input.gateId, patch: input.patch });
    return result;
  }
  async editGate(id: GateId, patch: Partial<Gate>): Promise<Gate> {
    // Phase 3 surface — delegate to updateGate for the v1 edit subset.
    return this.updateGate({ gateId: id, patch: patch as never });
  }
  async deleteGate(input: { gateId: GateId; reason?: string }): Promise<void> {
    await this.deps.artifacts.deleteGate(input);
    this.appendAction({ kind: "gate.delete", gateId: input.gateId, ...(input.reason && { reason: input.reason }) });
  }
  async overrideGate(input: { gateId: GateId; reason: string }): Promise<Gate> {
    const result = await this.deps.artifacts.overrideGate({
      ...input,
      configuratorId: this.deps.configuratorId(),
    });
    this.appendAction({ kind: "gate.override", gateId: input.gateId, reason: input.reason });
    return result;
  }

  // ─── Prompt customization ──────────────────────────────────────────────────

  async customizePrompt(modeId: string, fragmentId: string, override: string): Promise<void> {
    const now = new Date();
    this.deps.db
      .insert(promptOverrides)
      .values({ modeId, fragmentId, override, updatedAt: now })
      .onConflictDoUpdate({
        target: [promptOverrides.modeId, promptOverrides.fragmentId],
        set: { override, updatedAt: now },
      })
      .run();
    this.appendAction({ kind: "prompt.override_fragment", modeId, fragmentId });
  }
  async clearFragmentOverride(input: { modeId: string; fragmentId: string }): Promise<void> {
    this.deps.db
      .delete(promptOverrides)
      .where(
        and(
          eq(promptOverrides.modeId, input.modeId),
          eq(promptOverrides.fragmentId, input.fragmentId),
        ),
      )
      .run();
    this.appendAction({ kind: "prompt.clear_fragment", ...input });
  }
  async setStyleSliders(input: { socratic: number; verbosity: number; formality: number }): Promise<void> {
    // Compose the three slider values into per-fragment overrides at known fragment IDs.
    // See packages/curriculum/src/brief/style-composer.ts (Unit 6).
    const overrides = composeStyleOverrides(input);
    for (const o of overrides) {
      this.customizePrompt(o.modeId, o.fragmentId, o.template);
    }
    this.appendAction({ kind: "prompt.set_style", level: input });
  }

  // ─── Memory ────────────────────────────────────────────────────────────────

  async resetConcept(input: { studentId: StudentId; conceptId: ConceptId; reason: string }): Promise<void> {
    await this.deps.memory.resetConcept(input);
    this.appendAction({ kind: "memory.reset_concept", conceptId: input.conceptId, reason: input.reason });
  }
  async clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void> {
    await this.deps.memory.clearMisconception(input);
    this.appendAction({ kind: "memory.clear_misconception", misconceptionId: input.misconceptionId, reason: input.reason });
  }
  async exportMemory(input: { studentId: StudentId; targetPath: string }): Promise<{ ok: true; bytesWritten: number }> {
    const result = await this.deps.memory.exportToFile(input);
    this.appendAction({ kind: "memory.export" });
    return result;
  }
  async deleteAllMemory(input: { studentId: StudentId; reason: string; confirm: true }): Promise<void> {
    await this.deps.memory.delete({ studentId: input.studentId, confirm: input.confirm });
    this.appendAction({ kind: "memory.delete_all", reason: input.reason });
  }

  // ─── Bootstrap (Phase 6 surface — proxy through) ───────────────────────────

  async createCourse(input: CreateCourseInput): Promise<Course> {
    // Phase 6 createCourse — leave to BootstrapServiceImpl integration.
    throw new Error("createCourse: use bootstrap mode flow (Phase 6) or course.use_canonical_pack (Phase 10)");
  }
  async bootstrap(files: FileRef[], opts: BootstrapOpts): Promise<DraftCourse> {
    // Phase 11: configurators use the existing bootstrap-mode tools through the agent loop.
    // This method is not the v1 path; document and throw.
    throw new Error("bootstrap: use bootstrap mode (Phase 6) or pack import (Phase 10)");
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async listConfiguratorActions(input?: { fromTs?: Timestamp; limit?: number }): Promise<ConfiguratorActionRow[]> {
    const limit = input?.limit ?? 100;
    const rows = this.deps.db
      .select()
      .from(configuratorActions)
      .where(input?.fromTs ? gte(configuratorActions.ts, new Date(input.fromTs)) : undefined)
      .orderBy(desc(configuratorActions.ts))
      .limit(limit)
      .all();
    return rows.map((r) => ({
      id: r.id,
      configuratorId: r.configuratorId as ConfiguratorId,
      ts: r.ts.getTime() as Timestamp,
      action: r.actionJson as ConfiguratorAction,
    }));
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private appendAction(action: ConfiguratorAction): void {
    this.deps.db
      .insert(configuratorActions)
      .values({
        id: uuidv7(),
        configuratorId: this.deps.configuratorId(),
        ts: new Date(),
        actionJson: action,
      })
      .run();
  }
}
```

**Implementation notes**:
- `MemoryService.resetConcept` is a NEW method on the existing `MemoryServiceImpl` (Phase 7). Add it.
- `MemoryService.clearMisconception` is a NEW method on `MemoryServiceImpl`.
- `MemoryService.exportToFile` is a NEW method that wraps the existing `export()` and writes to a file (uses Node `fs/promises`).
- The `appendAction` helper is the single write path for the audit log; every public method calls it after the underlying service write succeeds.
- The Phase 3 `AuthoringService` interface had `createCourse`, `editGate`, `bootstrap`, `customizePrompt` — `editGate` becomes an alias of `updateGate`; `createCourse` and `bootstrap` are flagged as "use the agent loop instead" in v1.

**Acceptance criteria**:
- [ ] Every `AuthoringServiceImpl` write method appends a `configurator_actions` row.
- [ ] `listConfiguratorActions` returns rows in descending ts order.
- [ ] `setStyleSliders` writes one `prompt_overrides` row per affected fragment.
- [ ] `customizePrompt` for an unknown fragmentId writes the row regardless (validation against `customizable: false` happens in the IPC layer or tool layer).

---

### Unit 6: Style composer

**File**: `packages/curriculum/src/brief/style-composer.ts` (new)

```typescript
export interface StyleOverride {
  modeId: string;
  fragmentId: string;
  template: string;
}

export interface StyleSliderValues {
  /** -1 = pure Socratic, +1 = pure Lecture. */
  socratic: number;
  /** -1 = terse, +1 = verbose. */
  verbosity: number;
  /** -1 = formal, +1 = casual. */
  formality: number;
}

/**
 * Compose three style-slider values into prompt-fragment overrides.
 * Writes overrides to a few well-known fragment IDs across the modes that
 * have them as `customizable: true`.
 */
export function composeStyleOverrides(values: StyleSliderValues): StyleOverride[] {
  const out: StyleOverride[] = [];

  // role.tutor (teach + quiz + homework + study-skills modes)
  for (const modeId of ["teach", "quiz", "homework", "study-skills"]) {
    out.push({
      modeId,
      fragmentId: "role.tutor",
      template: composeTutorRole(values),
    });
  }

  // constraints.productive-struggle (teach mode)
  out.push({
    modeId: "teach",
    fragmentId: "constraints.productive-struggle",
    template: composeProductiveStruggle(values),
  });

  return out;
}

function composeTutorRole(values: StyleSliderValues): string {
  const lines: string[] = [];
  if (values.socratic <= -0.3) {
    lines.push("Lead with questions; ask the student to discover before you tell. Resist explaining until they've grappled.");
  } else if (values.socratic >= 0.3) {
    lines.push("Explain clearly; offer worked examples. Ask questions when they help check understanding, not as a default.");
  } else {
    lines.push("Balance asking and telling. Question when discovery serves the student; explain when efficiency does.");
  }

  if (values.verbosity <= -0.3) {
    lines.push("Be concise. Short sentences; minimal preamble.");
  } else if (values.verbosity >= 0.3) {
    lines.push("Be expansive. Connect ideas; offer multiple framings; pause for context.");
  }

  if (values.formality <= -0.3) {
    lines.push("Use formal academic language; avoid casual contractions.");
  } else if (values.formality >= 0.3) {
    lines.push("Use casual conversational tone; first-person plural is fine ('let's').");
  }

  return lines.join(" ");
}

function composeProductiveStruggle(_values: StyleSliderValues): string {
  // Currently doesn't depend on sliders; placeholder for future tuning.
  // Returns the canonical productive-struggle text per Phase 6.
  return "Productive struggle is teaching's tool. When the student says 'just tell me', respond with a scaffold or smaller question.";
}
```

**Implementation notes**:
- The composer is a pure function. Tests verify each slider position produces the expected fragment text.
- Style sliders compose into multiple fragments because consistency across modes matters. Configurator picks one slider; the system applies it everywhere relevant.
- Future iteration can let configurators pick slider scope (one mode vs all). v1 applies globally.

**Acceptance criteria**:
- [ ] Sliders at neutral (0, 0, 0) produce a default-tone tutor role.
- [ ] Socratic = -1 produces "Lead with questions" line.
- [ ] Verbosity = +1 produces "Be expansive" line.
- [ ] Formality = -1 produces "formal academic language" line.

---

### Unit 7: `MemoryService` extensions

**File**: `packages/core/src/services/memory/memory-service.ts` (modified)

```typescript
// New methods on MemoryServiceImpl:

async resetConcept(input: { studentId: StudentId; conceptId: ConceptId; reason: string }): Promise<void> {
  const initialState = bktInitial(); // Phase 7 helper
  const now = new Date();
  this.deps.db
    .insert(studentMastery)
    .values({
      studentId: input.studentId,
      conceptId: input.conceptId,
      pKnown: Math.round(initialState.pKnown * 1000),
      uncertainty: Math.round(initialState.uncertainty * 1000),
      effectivePKnown: Math.round(initialState.pKnown * 1000),
      lastPracticedAt: null,
      evidenceJson: [],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [studentMastery.studentId, studentMastery.conceptId],
      set: {
        pKnown: Math.round(initialState.pKnown * 1000),
        uncertainty: Math.round(initialState.uncertainty * 1000),
        effectivePKnown: Math.round(initialState.pKnown * 1000),
        lastPracticedAt: null,
        evidenceJson: [],
        updatedAt: now,
      },
    })
    .run();
  this.deps.log.info("memory.concept_reset", { conceptId: input.conceptId, reason: input.reason });
}

async clearMisconception(input: { misconceptionId: MisconceptionId; reason: string }): Promise<void> {
  const now = new Date();
  this.deps.db
    .update(misconceptions)
    .set({ status: "manually-cleared", lastObservedAt: now })
    .where(eq(misconceptions.id, input.misconceptionId))
    .run();
  this.deps.log.info("memory.misconception_cleared", { misconceptionId: input.misconceptionId, reason: input.reason });
}

async exportToFile(input: { studentId: StudentId; targetPath: string }): Promise<{ ok: true; bytesWritten: number }> {
  const exportData = await this.export(input.studentId);
  // Convert Map → entries array for JSON serialization (Phase 7 pattern).
  const serializable = {
    ...exportData,
    studentModel: {
      ...exportData.studentModel,
      conceptMastery: Array.from(exportData.studentModel.conceptMastery.entries()),
    },
  };
  const json = JSON.stringify(serializable, null, 2);
  const bytes = Buffer.byteLength(json, "utf-8");
  await fs.writeFile(input.targetPath, json, "utf-8");
  return { ok: true, bytesWritten: bytes };
}
```

**Implementation notes**:
- `resetConcept` uses `bktInitial()` from `packages/core/src/services/memory/bkt.ts` (Phase 7).
- `clearMisconception` flips status to `"manually-cleared"` (existing enum value).
- `exportToFile` wraps `export()` with file-write logic. Reuses Phase 7's JSON shape.

**Acceptance criteria**:
- [ ] After `resetConcept`, the row's `pKnown` matches `bktInitial().pKnown` and `evidenceJson` is empty.
- [ ] After `clearMisconception`, the row's `status` is `"manually-cleared"`.
- [ ] `exportToFile` writes a JSON file at the target path; returns byte count.

---

### Unit 8: Configure mode + fragments

**Files**:
- `packages/curriculum/src/modes/configure.ts` (new)
- `packages/curriculum/src/modes/fragments/configure-role.ts` (new)
- `packages/curriculum/src/modes/fragments/configure-tools.ts` (new)
- `packages/curriculum/src/modes/index.ts` (modified — register `configureMode`)

```typescript
// configure.ts

import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { configureRoleFragment } from "./fragments/configure-role.js";
import { configureToolsFragment } from "./fragments/configure-tools.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";

export const configureMode: Mode = {
  id: "configure",
  label: "Configure",
  description:
    "Lock-gated authoring mode for parents, teachers, and self-directed learners. Author courses, edit gates, customize prompts, manage memory.",
  requiredRole: "configurator",
  promptFragments: [
    preambleFragment,
    configureRoleFragment,
    principlesFragment,
    configureToolsFragment,
    courseContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    // Phase 6 bootstrap tools (course authoring from materials):
    "course.list_documents",
    "course.propose_draft",
    "course.show_draft",
    "course.edit_draft",
    "course.confirm_draft",
    "course.discard_draft",
    "retrieve_from_textbook",
    // Phase 10 pack tools (canonical pack imports):
    "course.list_canonical_packs",
    "course.use_canonical_pack",
    // Phase 11 authoring tools (existing course/lesson/gate edits):
    "course.edit",
    "lesson.create",
    "lesson.edit",
    "lesson.delete",
    "gate.create",
    "gate.edit",
    "gate.delete",
    "gate.override",
    // Phase 11 prompt customization:
    "prompt.override_fragment",
    "prompt.clear_fragment",
    "prompt.set_style",
    // Phase 11 memory administration:
    "memory.reset_concept",
    "memory.clear_misconception",
    "memory.export",
    "memory.delete_all",
  ],
  uiSurface: "configure",
};
```

```typescript
// configure-role.ts

import type { PromptFragment } from "@praxis/core/types";

export const configureRoleFragment: PromptFragment = {
  id: "role.configure",
  position: "role",
  customizable: true,
  template: `You are a course-design and tuning assistant. The user — a parent, teacher, or self-directed learner — is configuring Praxis. You can:
- Author or edit courses (from materials, from canonical packs, or by direct edit).
- Edit gates: change prerequisites, success criteria, override locked gates with a reason.
- Customize teaching prompts: set style sliders (Socratic↔Lecture, Terse↔Verbose, Formal↔Casual) or override individual prompt fragments.
- Inspect and manage student memory: reset concept mastery, clear misconceptions, export memory, delete all (with confirmation).

Every change you make is logged to a configurator-actions audit. The user can review past actions in the configure UI.

Be conversational. Confirm destructive changes (lesson deletion, gate deletion, memory deletion) by asking for a reason before calling the tool. Surface the reason in the audit by passing it through the tool's reason argument.`,
};
```

```typescript
// configure-tools.ts

import type { PromptFragment } from "@praxis/core/types";

export const configureToolsFragment: PromptFragment = {
  id: "tools.configure",
  position: "tools",
  customizable: false,
  template: `Tools available in configure mode:

Course authoring (same as bootstrap mode — start here for new courses):
- course.list_documents, course.propose_draft, course.show_draft, course.edit_draft, course.confirm_draft, course.discard_draft
- course.list_canonical_packs, course.use_canonical_pack
- retrieve_from_textbook

Course/lesson/gate editing (Phase 11 — for existing courses):
- course.edit — change title, subject, grade level, thresholds.
- lesson.create / lesson.edit / lesson.delete — manage lessons and their concept lists.
- gate.create / gate.edit / gate.delete — manage the gate graph.
- gate.override — bypass a gate with a documented reason (creates an "overridden" GateState).

Prompt customization:
- prompt.override_fragment — set a custom template for a specific (modeId, fragmentId).
- prompt.clear_fragment — remove a previously-set override.
- prompt.set_style — set the three style sliders (Socratic, Verbosity, Formality) which compose into multiple fragment overrides.

Memory administration:
- memory.reset_concept — reset BKT state for a (student, concept) pair to prior. Pass a reason.
- memory.clear_misconception — mark a misconception as manually-cleared. Pass a reason.
- memory.export — write memory to a JSON file.
- memory.delete_all — wipe ALL projection layers (mastery, misconceptions, procedural, affective). Episodic survives but is marked redacted. Requires confirmation.

Workflow rules:
- Confirm destructive operations (delete lesson, delete gate, delete all memory) by asking for a reason.
- Pass the reason through the tool's reason argument so it lands in the audit.
- Show changes via the existing show_draft / show_grade tools where applicable; the structured editor in the UI will reflect direct edits automatically.`,
};
```

**Implementation notes**:
- `uiSurface: "configure"` is a NEW UISurface ID — add it to `packages/core/src/types/mode.ts` (or wherever `UISurfaceId` lives).
- `configureRoleFragment.customizable: true` — configurators can override it (e.g., to specialize for tutoring multiple students).
- `configureToolsFragment.customizable: false` — tool descriptions are non-overridable.
- The role fragment instructs the agent to ask for a reason on destructive operations; the tool descriptions repeat this. Belt-and-suspenders.

**Acceptance criteria**:
- [ ] `getMode("configure")` returns the new mode.
- [ ] `configureMode.toolNames` contains all 25+ expected tools.
- [ ] `configureMode.requiredRole === "configurator"`.

---

### Unit 9: Authoring tools (course/lesson/gate/prompt/memory)

**Directory**: `packages/tools/src/authoring/` (new)

Each tool follows the Phase 6 / 8 / 9 pattern: Zod input/output, handler that delegates to `ctx.services.authoring`, tier `"grounded"` (or `"deterministic"` for prompt edits), effects `["artifact.mutate"]` or `["memory.write"]`.

```typescript
// course/edit.ts

const InputSchema = z.object({
  courseId: z.string(),
  patch: z.object({
    title: z.string().min(1).optional(),
    subject: z.string().min(1).optional(),
    gradeLevel: z.string().min(1).optional(),
    thresholds: z.object({
      conceptMastery: z.number().min(0).max(1),
      examPass: z.number().min(0).max(1),
      allowRetake: z.boolean(),
      decayDays: z.number().int().positive(),
    }).optional(),
  }),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  course: z.unknown(), // Course
});

export const editCourseTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.edit",
  description: "Edit course-level metadata: title, subject, grade level, mastery thresholds. Pass only the fields you want to change.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const result = await ctx.services.authoring.updateCourse({
      courseId: brandId<"CourseId">(args.courseId),
      patch: args.patch as never,
    });
    return { ok: true, course: result };
  },
};

// lesson/create.ts, lesson/edit.ts, lesson/delete.ts — same pattern.
// gate/create.ts, gate/edit.ts, gate/delete.ts, gate/override.ts — same pattern.
// prompt/override-fragment.ts, prompt/clear-fragment.ts, prompt/set-style.ts — same pattern.
// memory/reset-concept.ts, memory/clear-misconception.ts, memory/export.ts, memory/delete-all.ts — same pattern.
```

```typescript
// lesson/delete.ts (sample of destructive tool)

const InputSchema = z.object({
  lessonId: z.string(),
  reason: z.string().min(1).describe("Why is this lesson being deleted? Logged to the configurator audit."),
});

const OutputSchema = z.object({ ok: z.literal(true) });

export const deleteLessonTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "lesson.delete",
  description: "Delete a lesson and cascade-clear its progress + guarding gates. Destructive — confirm with the user before calling.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    await ctx.services.authoring.deleteLesson({
      lessonId: brandId<"LessonId">(args.lessonId),
      reason: args.reason,
    });
    return { ok: true };
  },
};
```

```typescript
// memory/reset-concept.ts

const InputSchema = z.object({
  conceptId: z.string(),
  reason: z.string().min(1),
});

const OutputSchema = z.object({ ok: z.literal(true) });

export const resetConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "memory.reset_concept",
  description: "Reset BKT mastery state for a concept. The student's pKnown returns to the prior; evidence is cleared; lastPracticedAt is unset. Pass a reason; logged to audit. Destructive — confirm with the user before calling.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx) {
    await ctx.services.authoring.resetConcept({
      studentId: ctx.studentId,
      conceptId: brandId<"ConceptId">(args.conceptId),
      reason: args.reason,
    });
    return { ok: true };
  },
};
```

```typescript
// authoring/index.ts

export { editCourseTool } from "./course/edit.js";
export { createLessonTool } from "./lesson/create.js";
export { editLessonTool } from "./lesson/edit.js";
export { deleteLessonTool } from "./lesson/delete.js";
export { createGateTool } from "./gate/create.js";
export { editGateTool } from "./gate/edit.js";
export { deleteGateTool } from "./gate/delete.js";
export { overrideGateTool } from "./gate/override.js";
export { overrideFragmentTool } from "./prompt/override-fragment.js";
export { clearFragmentTool } from "./prompt/clear-fragment.js";
export { setStyleTool } from "./prompt/set-style.js";

export const AUTHORING_TOOLS = [/* ... all imported ... */] as const;
```

```typescript
// memory/index.ts (Phase 11 additions)

export { resetConceptTool } from "./reset-concept.js";
export { clearMisconceptionTool } from "./clear-misconception.js";
export { exportMemoryTool } from "./export.js";
export { deleteAllMemoryTool } from "./delete-all.js";

// Existing Phase 7 tools:
export { updateMasteryTool } from "./update-mastery.js";
export { recordMisconceptionTool } from "./record-misconception.js";

export const MEMORY_TOOLS = [
  updateMasteryTool,
  recordMisconceptionTool,
  resetConceptTool,
  clearMisconceptionTool,
  exportMemoryTool,
  deleteAllMemoryTool,
] as const;

/** Subset that's only available in configure mode. */
export const CONFIGURE_MEMORY_TOOLS = [
  resetConceptTool,
  clearMisconceptionTool,
  exportMemoryTool,
  deleteAllMemoryTool,
] as const;
```

**Implementation notes**:
- All authoring tools call `ctx.services.authoring.*` — never go directly to `artifacts` or `memory`. The authoring service is the audit-log boundary.
- Destructive tools (`lesson.delete`, `gate.delete`, `memory.delete_all`, `memory.reset_concept`) require a `reason` field.
- Tools' `effects` array reflects what's actually mutated. Phase 14+ might use this for cost-tracking.

**Acceptance criteria**:
- [ ] All 16 new authoring + memory tools registered with `InProcessToolRegistry`.
- [ ] Calling `lesson.delete` with no reason fails Zod validation.
- [ ] Each tool's handler calls the corresponding `AuthoringServiceImpl` method.
- [ ] After a successful tool call, a `configurator_actions` row exists for the action.

---

### Unit 10: SessionService — configure mode + lock check at start

**File**: `packages/core/src/services/session-service.ts` (modified)

```typescript
async start(opts: { courseId?: CourseId; modeId: string; assignmentId?: AssignmentId }): Promise<SessionHandle> {
  // Phase 11: configure mode requires unlock (when lock is set).
  if (opts.modeId === "configure") {
    const isUnlocked = await this.deps.lockService.isUnlocked();
    if (!isUnlocked) {
      throw new Error("Cannot start configure session: lock is set and current process is not unlocked");
    }
  }
  // ... existing start logic
}
```

`ServiceDeps` gets a new field: `lockService: LockService` (already added in Unit 1's `ToolServices` and as a top-level dep).

**Acceptance criteria**:
- [ ] `start({modeId: "configure"})` succeeds when lock is unset OR unlocked.
- [ ] `start({modeId: "configure"})` throws when lock is set AND process is not unlocked.

---

### Unit 11: IPC + AuthoringClient + LockClient

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/authoring-client.ts` (modified — replace stub)
- `packages/client/src/services/lock-client.ts` (new)
- `packages/client/src/client.ts` (modified)

```typescript
// IPC handlers — both author + lock channels.
// All `praxis.author.*` handlers GUARD against locked state.

const requireUnlocked = async () => {
  const unlocked = await services.lock.isUnlocked();
  if (!unlocked) throw new Error("Locked: configure surface requires unlock");
};

ipcMain.handle("praxis.lock.isSet", async () => services.lock.isSet());
ipcMain.handle("praxis.lock.isUnlocked", async () => services.lock.isUnlocked());
ipcMain.handle("praxis.lock.setLockCode", async (_e, code: string) => services.lock.setLockCode({ code }));
ipcMain.handle("praxis.lock.unlock", async (_e, code: string) => services.lock.unlock({ code }));
ipcMain.handle("praxis.lock.lock", async () => services.lock.lock());
ipcMain.handle("praxis.lock.clearLock", async (_e, currentCode: string) => services.lock.clearLock({ currentCode }));

// Author channels — every handler calls requireUnlocked() first.
ipcMain.handle("praxis.author.updateCourse", async (_e, input) => {
  await requireUnlocked();
  return services.authoring.updateCourse(input);
});
// ... 14 more author.* handlers similar pattern
```

```typescript
// authoring-client.ts (real impl)

export class AuthoringClient implements AuthoringClient {
  constructor(private readonly transport: ClientTransport) {}

  updateCourse(input): Promise<Course> {
    return this.transport.invoke("praxis.author.updateCourse", input);
  }
  // ... mirror all 16 methods
}
```

```typescript
// lock-client.ts (new)

export class LockClient implements LockClient {
  constructor(private readonly transport: ClientTransport) {}

  isSet(): Promise<boolean> {
    return this.transport.invoke("praxis.lock.isSet");
  }
  isUnlocked(): Promise<boolean> {
    return this.transport.invoke("praxis.lock.isUnlocked");
  }
  setLockCode(code: string): Promise<void> {
    return this.transport.invoke("praxis.lock.setLockCode", code);
  }
  unlock(code: string): Promise<{ ok: boolean }> {
    return this.transport.invoke("praxis.lock.unlock", code);
  }
  lock(): Promise<void> {
    return this.transport.invoke("praxis.lock.lock");
  }
  clearLock(currentCode: string): Promise<void> {
    return this.transport.invoke("praxis.lock.clearLock", currentCode);
  }
}
```

**Implementation notes**:
- The `requireUnlocked` guard is the authoritative server-side lock enforcement. UI-side guards are UX only.
- Client methods don't `await requireUnlocked` — that's a server concern.
- Failed `requireUnlocked` produces a rejected Promise the UI can catch and show a "Locked" state.

**Acceptance criteria**:
- [ ] All 6 lock IPC handlers route to `LockServiceImpl`.
- [ ] All 16 author IPC handlers call `requireUnlocked` before delegating.
- [ ] When locked, an author IPC call rejects with a clear error.
- [ ] `client.lock.*` methods invoke the right channel names.
- [ ] `client.author.*` real impl replaces the Phase 3 stub.

---

### Unit 12: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified — `ServiceDeps.toolServices.{authoring, lock}`)
- `packages/desktop/electron/main/services.ts` (modified)

```typescript
// services.ts — additions

import { LockServiceImpl } from "@praxis/core/services";
import { AuthoringServiceImpl } from "@praxis/core/services";
import { configureMode } from "@praxis/curriculum/modes";
import { AUTHORING_TOOLS } from "@praxis/tools/authoring";
import { CONFIGURE_MEMORY_TOOLS } from "@praxis/tools/memory";

const lockService = new LockServiceImpl({ db, log });
const authoringService = new AuthoringServiceImpl({
  db,
  log,
  artifacts: artifactsService,
  memory: memoryService,
  configuratorId: () => "default" as ConfiguratorId,
  studentId: () => brandId<"StudentId">(getOrCreateDefaultStudentId(db)),
});

const modes = new Map([
  // ... existing modes ...
  [configureMode.id, configureMode],
]);

const toolDefinitions = [
  // ... existing tools ...
  ...AUTHORING_TOOLS,
  ...CONFIGURE_MEMORY_TOOLS,
];

const deps: ServiceDeps = {
  // ... existing ...
  toolServices: {
    // ... existing ...
    authoring: authoringService,
    lock: lockService,
  },
  lockService, // ← Phase 11 NEW: SessionService also needs it directly
};

return {
  // ... existing services ...
  authoring: authoringService,
  lock: lockService,
};
```

**Acceptance criteria**:
- [ ] `buildServices` exposes `authoring` and `lock` on the `Services` interface.
- [ ] `pnpm desktop:build` succeeds.
- [ ] First-run boot still works (no lock yet → `isUnlocked` returns true).

---

### Unit 13: `/configure` UI route + tab components

This is the biggest UI unit. Split across multiple files; keep each component focused.

**Files**:
- `packages/ui/src/routes/configure.tsx` + `.module.css` (route shell with tabs)
- `packages/ui/src/routes/configure/course-tab.tsx` + `.module.css`
- `packages/ui/src/routes/configure/gates-tab.tsx` + `.module.css`
- `packages/ui/src/routes/configure/prompt-tab.tsx` + `.module.css`
- `packages/ui/src/routes/configure/memory-tab.tsx` + `.module.css`
- `packages/ui/src/components/lock-icon.tsx` + `.module.css`
- `packages/ui/src/components/unlock-modal.tsx` + `.module.css`
- `packages/ui/src/components/lesson-editor.tsx` + `.module.css`
- `packages/ui/src/components/gate-inspector.tsx` + `.module.css`
- `packages/ui/src/components/prompt-fragment-editor.tsx` + `.module.css`
- `packages/ui/src/components/style-slider.tsx` + `.module.css`
- `packages/ui/src/components/memory-inspector-tabs.tsx` + `.module.css`
- `packages/ui/src/hooks/use-lock.ts`
- `packages/ui/src/hooks/use-configure-state.ts`
- `packages/ui/src/router.tsx` (modified — register route)
- `packages/ui/src/components/nav.tsx` (modified — Configure link + lock icon)

```tsx
// configure.tsx (sketch)

const TABS = ["course", "gates", "prompt", "memory"] as const;
type ConfigureTab = (typeof TABS)[number];

export function ConfigureRoute() {
  const navigate = useNavigate();
  const lock = useLock();
  const search = useSearch({ strict: false });
  const activeTab: ConfigureTab = (search?.tab as ConfigureTab) ?? "course";
  const [unlockOpen, setUnlockOpen] = useState(false);

  // Lock gate
  if (lock.isSet && !lock.isUnlocked) {
    return (
      <div className={styles.locked}>
        <h1>Configure is locked</h1>
        <button onClick={() => setUnlockOpen(true)}>Unlock</button>
        {unlockOpen && (
          <UnlockModal
            onUnlock={async (code) => {
              const r = await lock.unlock(code);
              if (r.ok) setUnlockOpen(false);
              else /* show error */;
            }}
            onClose={() => setUnlockOpen(false)}
          />
        )}
      </div>
    );
  }

  // ... session-start for the configure mode if not already started ...

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1>Configure</h1>
        <nav className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t}
              className={t === activeTab ? styles.tabActive : styles.tab}
              onClick={() => navigate({ to: "/configure", search: { tab: t } as never })}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "course" && <CourseTab />}
      {activeTab === "gates" && <GatesTab />}
      {activeTab === "prompt" && <PromptTab />}
      {activeTab === "memory" && <MemoryTab />}
    </div>
  );
}
```

```tsx
// course-tab.tsx (sketch)

export function CourseTab() {
  const [selectedCourseId, setSelectedCourseId] = useState<CourseId | null>(null);
  // Split-pane: chat (left) + outline editor (right)
  return (
    <div className={styles.split}>
      <aside className={styles.chatPane}>
        {/* Reuse the same chat surface as /configure session */}
        <ConfigureChatPane />
      </aside>
      <main className={styles.editorPane}>
        <CoursePicker onSelect={setSelectedCourseId} />
        {selectedCourseId && <CourseOutlineEditor courseId={selectedCourseId} />}
      </main>
    </div>
  );
}

function CourseOutlineEditor({ courseId }: { courseId: CourseId }) {
  const { course, lessons, refresh } = useCourseDetail(courseId);
  const client = usePraxisClient();

  return (
    <div>
      <h2>{course?.title}</h2>
      <ol>
        {lessons.map((l) => (
          <LessonEditor
            key={l.id}
            lesson={l}
            onSave={async (patch) => {
              await client.author.updateLesson({ lessonId: l.id, patch });
              await refresh();
            }}
            onDelete={async (reason) => {
              await client.author.deleteLesson({ lessonId: l.id, reason });
              await refresh();
            }}
          />
        ))}
      </ol>
      <button onClick={async () => {
        await client.author.createLesson({ courseId, title: "New Lesson", conceptIds: [] });
        await refresh();
      }}>+ Add lesson</button>
    </div>
  );
}
```

```tsx
// gates-tab.tsx — extends Phase 9's progress map with edit affordances

export function GatesTab() {
  const [selectedCourseId, setSelectedCourseId] = useState<CourseId | null>(null);
  const { gates, refresh } = useCourseGates(selectedCourseId);
  const [selectedGate, setSelectedGate] = useState<GateView | null>(null);

  return (
    <div className={styles.split}>
      <main className={styles.canvasPane}>
        <CoursePicker onSelect={setSelectedCourseId} />
        {selectedCourseId && (
          <ReactFlow
            nodes={/* gate nodes from gates */}
            edges={/* prereq edges */}
            onNodeClick={(_, node) => setSelectedGate(/* find gate by node.id */)}
            // For Phase 11: enable edge drag-create for adding prerequisites
          />
        )}
      </main>
      <aside className={styles.inspectorPane}>
        {selectedGate && (
          <GateInspector
            gate={selectedGate}
            onSave={async (patch) => {
              await client.author.updateGate({ gateId: selectedGate.gate.id, patch });
              await refresh();
            }}
            onDelete={async (reason) => {
              await client.author.deleteGate({ gateId: selectedGate.gate.id, reason });
              await refresh();
            }}
            onOverride={async (reason) => {
              await client.author.overrideGate({ gateId: selectedGate.gate.id, reason });
              await refresh();
            }}
          />
        )}
      </aside>
    </div>
  );
}
```

```tsx
// prompt-tab.tsx (sketch)

export function PromptTab() {
  const [modeId, setModeId] = useState("teach");
  const [fragmentId, setFragmentId] = useState<string | null>(null);
  return (
    <div className={styles.layout}>
      <section className={styles.styleSection}>
        <h2>Style</h2>
        <StyleSlider label="Socratic ↔ Lecture" /* ... */ />
        <StyleSlider label="Terse ↔ Verbose" /* ... */ />
        <StyleSlider label="Formal ↔ Casual" /* ... */ />
      </section>
      <section className={styles.fragmentSection}>
        <h2>Fragment overrides</h2>
        <ModeFragmentPicker modeId={modeId} fragmentId={fragmentId} onSelect={setFragmentId} />
        {fragmentId && (
          <PromptFragmentEditor
            modeId={modeId}
            fragmentId={fragmentId}
            onSave={async (override) => {
              await client.author.customizePrompt(modeId, fragmentId, override);
            }}
            onClear={async () => {
              await client.author.clearFragmentOverride({ modeId, fragmentId });
            }}
          />
        )}
      </section>
    </div>
  );
}
```

```tsx
// memory-tab.tsx (sketch)

export function MemoryTab() {
  return (
    <div className={styles.layout}>
      <MemoryInspectorTabs />
    </div>
  );
}

function MemoryInspectorTabs() {
  const [active, setActive] = useState<"student" | "misconceptions" | "strategies" | "affective" | "episodic">("student");
  // Tabs render different views; "Reset concept" / "Clear misconception" actions inline.
}
```

```tsx
// lock-icon.tsx + nav.tsx integration

export function LockIcon() {
  const { isSet, isUnlocked, lock } = useLock();
  if (!isSet) return <span>🔓</span>;
  if (isUnlocked) return <button onClick={lock}>🔓 (Lock now)</button>;
  return <button onClick={/* trigger unlock modal */}>🔒</button>;
}
```

**Implementation notes**:
- The configure mode session is started when the user navigates to `/configure` and the lock is unlocked. Use `useEffect` to call `client.session.start({modeId: "configure"})` once per mount.
- Reuse `useCourseDetail`, `useCourseGates` (Phase 9), `useStudentModel` (NEW thin hook) from existing patterns.
- The chat pane within configure uses the same `useStreamedSend` machinery as `/` chat — just bound to a configure-mode session.
- Style sliders write through `client.author.setStyleSliders({...})`; the result is fragment overrides visible in the Prompt tab's fragment list.

**Acceptance criteria**:
- [ ] `/configure` route renders with four tabs.
- [ ] Lock-set + locked: shows the unlock prompt.
- [ ] Course tab: lists courses, picking one opens the outline editor.
- [ ] Gates tab: shows the gate graph, clicking a gate opens the inspector.
- [ ] Prompt tab: style sliders + fragment override editor work.
- [ ] Memory tab: tabs for student model / misconceptions / etc.
- [ ] Nav has Configure link + lock icon.

---

### Unit 14: `pnpm db:configurator-actions` CLI

**File**: `scripts/db-configurator-actions.ts` (new)

```typescript
import { openDb } from "@praxis/core/db";
import { configuratorActions } from "@praxis/core/schema";
import { desc } from "drizzle-orm";

const { db } = openDb({ readonly: true });
const rows = db.select().from(configuratorActions).orderBy(desc(configuratorActions.ts)).limit(50).all();

console.table(
  rows.map((r) => ({
    when: r.ts.toISOString(),
    by: r.configuratorId,
    kind: (r.actionJson as { kind: string }).kind,
    detail: JSON.stringify(r.actionJson).slice(0, 80),
  })),
);
```

Add `db:configurator-actions` script entry to root `package.json`.

**Acceptance criteria**:
- [ ] Runs cleanly on empty DB.
- [ ] After a configure session with edits, lists the actions.

---

### Unit 15: Documentation updates

**Files**:
- `docs/ROADMAP.md` (modified — Phase 11 description)
- `docs/CURRICULUM.md` (modified — configure mode + style sliders)
- `docs/CONTRACT.md` (modified — AuthoringService + LockService + ConfiguratorAction)
- `docs/SPEC.md` (modified — confirm lock-storage technical detail)

```markdown
<!-- ROADMAP Phase 11 update -->
## Phase 11: Configure mode + lock + authoring UI

**Goal:** Parent / teacher / self-directed learner authors courses, edits gates, customizes prompts, and manages memory from a lock-gated UI.

**Build:**
- `LockServiceImpl` (scrypt-hashed code with install-id-derived salt; opt-in, never first-run-mandatory)
- `configure` mode + 16 new authoring/memory tools (course/lesson/gate edits; prompt fragment overrides + style sliders; memory reset_concept/clear_misconception/export/delete)
- `AuthoringServiceImpl` — orchestrates writes; appends every action to a configurator_actions audit log
- `/configure` UI route with four tabs (Course / Gates / Prompt / Memory). Split-pane chat + structured editor for course tab; React Flow editor for gates; fragment editor + style sliders for prompts; tabbed inspector for memory.
- Lock UI: nav-level lock icon; unlock modal; "Lock now" / "Set lock" / "Change code" actions in configure
- IPC lock-check guard on every `praxis.author.*` channel
- `pnpm db:configurator-actions` CLI

**Deferred:** per-course prompt overrides; multi-configurator; force-mastery writes; canonical pack editing; authoring undo/redo.

**Test checkpoint:** Set lock code. Restart. Configure surface gated. Unlock. Author a small course end-to-end (course.create from pack OR from materials, edit lesson, override a gate, customize a prompt). Course / Gate / Lesson / prompt_overrides / configurator_actions rows persisted.
```

**CURRICULUM.md** — extend modes section with `configure` mode + style sliders.

**CONTRACT.md** — note `AuthoringService`, `LockService`, `ConfiguratorAction` v1 status.

**SPEC.md** — confirm lock-storage uses scrypt with install-id-derived salt; opt-in.

**Acceptance criteria**:
- [ ] All four doc files reflect Phase 11.

---

### Unit 16: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/core/src/auth/__tests__/lock-crypto.test.ts` | unit, fast | scrypt hash round-trip; verify ok/fail; install-id stability. |
| `packages/core/src/services/__tests__/lock-service.test.ts` | unit, fast (real DB) | setLockCode + unlock flow; clearLock; isUnlocked semantics; non-digit code rejected. |
| `packages/core/src/services/__tests__/authoring-service.test.ts` | unit, fast (real DB) | Each method writes the action; reads return correct rows; configurator_actions log appended. |
| `packages/core/src/services/__tests__/artifacts-service-writes.test.ts` | unit, fast (real DB) | createLesson / updateLesson / deleteLesson cascades; createGate / updateGate / deleteGate; overrideGate writes gate_unlock_events. |
| `packages/curriculum/src/brief/__tests__/style-composer.test.ts` | unit, fast | Slider values produce expected fragment text. |
| `packages/curriculum/src/__tests__/configure-mode.test.ts` | unit, fast | Mode definition; toolNames complete. |
| `packages/tools/src/authoring/__tests__/*.test.ts` | unit, fast (mocked services) | Each authoring tool calls the right service method with the right args. |
| `packages/tools/src/memory/__tests__/{reset-concept,clear-misconception,delete-all}.test.ts` | unit, fast | Memory configure-mode tools call the right service methods. |
| `packages/desktop/src/__tests__/ipc-server-author.test.ts` | unit | All `praxis.author.*` handlers route correctly; refuse when locked. |
| `packages/desktop/src/__tests__/ipc-server-lock.test.ts` | unit | All `praxis.lock.*` handlers route correctly. |
| `packages/client/src/__tests__/{authoring-client,lock-client}.test.ts` | unit | Client methods invoke correct channels. |
| `packages/ui/src/__tests__/use-lock.test.tsx` | unit (jsdom) | Hook tracks lock state; refresh on unlock. |
| `packages/ui/src/__tests__/configure-route.test.tsx` | unit (jsdom) | Locked → unlock modal; unlocked → tab navigation. |
| `packages/ui/src/__tests__/lesson-editor.test.tsx` | unit (jsdom) | Edit + save calls client.author.updateLesson; delete asks for reason. |
| `tests/configure-end-to-end.test.ts` | integration, fast (FakeEngine) | Full flow: set lock → re-init service → IPC author calls refused → unlock → calls succeed → action log populated → memory.reset_concept resets the row. |

---

## Implementation Order

1. **Unit 1** — Type contract additions.
2. **Unit 2** — Schema additions.
3. **Unit 3** — `LockServiceImpl` + `lock-crypto`.
4. **Unit 7** — `MemoryService` extensions.
5. **Unit 4** — `ArtifactsService` write extensions.
6. **Unit 6** — Style composer.
7. **Unit 5** — `AuthoringServiceImpl`.
8. **Unit 8** — Configure mode + fragments.
9. **Unit 9** — Authoring tools.
10. **Unit 10** — SessionService configure-mode lock check.
11. **Unit 12** — ServiceDeps + buildServices wiring.
12. **Unit 11** — IPC + clients.
13. **Unit 13** — UI route + components (largest unit; can split agent-wise).
14. **Unit 14** — `pnpm db:configurator-actions` CLI.
15. **Unit 15** — Doc updates.
16. **Unit 16** — Tests interspersed.

Units 3, 4, 6, 7 are parallelizable (no inter-dependencies).

---

## Verification

```bash
pnpm rebuild better-sqlite3
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm db:configurator-actions

# Manual checkpoint (Phase 11)
pnpm desktop:build && pnpm dev
# 1. /configure — see four tabs (no lock yet).
# 2. Course tab: pick a course → outline editor appears → rename a lesson → save.
# 3. Gates tab: click a gate → inspector pane → change threshold → save.
# 4. Prompt tab: drag Socratic slider to -1 → see fragment overrides written.
# 5. Memory tab → student model → "Reset concept" on Linear Equations → confirm reason → row reset.
# 6. Settings (or top of configure): "Set lock code" → enter 1234 → confirm → "Lock now".
# 7. Restart app. /configure → "Locked" screen → click "Unlock" → enter 1234 → access restored.
# 8. `pnpm db:configurator-actions` shows all the actions with timestamps.
```
