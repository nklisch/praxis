# Design: Phase 15a — Sketch Foundation

## Overview

The sketch primitive that Phase 16's modality bodies depend on. **No concept maps, no
embedded image extraction** in this phase — both are tracked as Phase 15b and 15c follow-ups.

What lands:

- **`<SketchCanvas>`** — a tldraw v4 React wrapper, used everywhere the student draws.
  Inline mode (320px tall) for chat composer + per-problem submission; full-canvas mode for workspace sketch notes.
- **Sketch persistence** — `sketches` table + `FsSketchStore` for rendered PNGs. Content-addressed by SHA-256 of the snapshot JSON.
- **`SketchService`** in core + IPC + `SketchClient` in `@praxis/client`.
- **`<SketchCanvas>` integration in three surfaces**:
  - Chat composer — inline expansion above the textarea via a "✎ Sketch" affordance
  - Submission flow (Phase 8 assignment items) — replaces the placeholder "sketch your work" stub
  - Workspace notes — `format: "sketch"` becomes a real editor (not just a stored body)
- **`sketch.read` agent tool** — agent invokes with a `sketchId` to fetch `{ snapshot, image }`. Used in chat (when the user sketched) and during assignment grading.
- **`gradeMathTool` extension** — new `kind: "sketch"` discriminated case. Two-step pipeline: vision OCR → LaTeX → sympy validate. No fourth-step model verification (per scope decision).

## Decisions baked into this design

| Decision | Choice | Why |
|---|---|---|
| Library | **tldraw v4** | SPEC.md choice; license deferred (per user) |
| Composer surface | **Inline expansion above textarea** (~320px) with Submit | Stays in flow; matches editorial restraint |
| Vision pipeline | **Two-step**: vision → LaTeX → sympy validate | v1 simplicity; four-step deferred |
| Sketch storage | `sketches` table (snapshot JSON) + `FsSketchStore` (rendered PNG file) | SQLite handles JSON; PNG goes on disk — same pattern as `FsPageImageStore` from Phase 5 |
| Sketch identity | **Content-addressed SHA-256 of snapshot JSON** | Idempotent, dedupes identical drawings |
| Image rendering | **Renderer-side** (Electron renderer has DOM) → uploaded with snapshot | Server-side tldraw render needs headless Chromium; renderer already has the canvas |
| Agent access | **`sketch.read({ sketchId })` tool** | Engines don't yet attach images to user messages natively (deferred to Phase 15.x) |
| Inline-chat sketch reference | User message text includes `[sketch:<sketchId>]` marker | The agent's prompt instructs it to call `sketch.read` when it sees the marker |
| Sketch cleanup | None for v1 | Sketches accumulate; orphan-sweep is a future polish |

---

## Implementation Units

### Unit 1: Add tldraw to `@praxis/desktop` deps

**File**: `packages/desktop/package.json` (modify)

Add to `dependencies`:

```json
"tldraw": "^4.0.0"
```

Run `pnpm install` to update the lockfile.

**Implementation Notes**:
- Verify the exact published v4 minor version at install time. Pin to a specific minor (e.g. `~4.0.0`) if the library is mid-release.
- tldraw bundles its own CSS — must be imported in the renderer entry (Unit 7 handles this).
- tldraw is in `desktop` (not `ui`) because the renderer is the only consumer; `@praxis/ui` stays dep-free of canvas libraries.

**Acceptance Criteria**:
- [ ] `pnpm install` succeeds.
- [ ] `import { Tldraw } from "tldraw"` resolves in the renderer bundle.
- [ ] No new build warnings.

---

### Unit 2: `sketches` table + migration

**File**: `packages/memory/src/schema.ts` (modify) — add alongside existing tables

```typescript
export const sketches = sqliteTable(
  "sketches",
  {
    /**
     * SHA-256 hex of the snapshot JSON. Content-addressed — identical drawings
     * dedupe naturally. Use this id everywhere a sketch is referenced.
     */
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    /** Tldraw snapshot JSON (full document), serialized. */
    snapshotJson: text("snapshot_json", { mode: "json" }).notNull(),
    /**
     * Relative path under FsSketchStore root for the rendered PNG.
     * Format: `<id-prefix-2>/<id>.png` (sharded 2-char prefix to avoid one-dir-many-files).
     */
    imagePath: text("image_path").notNull(),
    /** Width/height in pixels of the rendered PNG. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("sketches_student_idx").on(t.studentId, t.createdAt),
  }),
);
```

Add `sketches` to the `memorySchema` barrel at the bottom of the file.

**File**: `drizzle/<auto-named>.sql` (new — generated)

Run `pnpm db:generate` to produce the migration; commit the generated SQL.

**Implementation Notes**:
- No FK on `studentId` — students aren't a table yet (single-student v1).
- No FK linking sketches to sessions/notes/responses — sketches are content-addressed and may be referenced from multiple places. The reference lives in the consumer artifact.
- Indexed on `(studentId, createdAt)` for "list recent sketches" queries (not used in v1 but cheap to add now).

**Acceptance Criteria**:
- [ ] `pnpm db:migrate` applies cleanly.
- [ ] `pnpm db:show` lists `sketches` with the expected columns.
- [ ] Drizzle infers the row type as `typeof sketches.$inferSelect` correctly.

---

### Unit 3: `FsSketchStore`

**File**: `packages/tools/src/runtime/sketch/fs-sketch-store.ts` (new)

```typescript
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface SketchStore {
  /**
   * Write the PNG bytes for `sketchId`. Returns the relative path (under root)
   * that should be stored in the `sketches.image_path` column.
   * Idempotent — content-addressed, so re-writes are no-ops.
   */
  put(sketchId: string, png: Buffer): Promise<string>;

  /** Read the PNG bytes back. Throws if not found. */
  get(relativePath: string): Promise<Buffer>;

  /** True if a sketch's PNG exists. */
  has(relativePath: string): Promise<boolean>;
}

export class FsSketchStore implements SketchStore {
  /** root: usually `${dbDir}/sketches`. Created on first put. */
  constructor(private readonly root: string) {}

  put(sketchId: string, png: Buffer): Promise<string>;
  get(relativePath: string): Promise<Buffer>;
  has(relativePath: string): Promise<boolean>;
}

/** Sharded path: first 2 chars of id as subdir → file. e.g. `ab/abc123…def.png`. */
export function sketchRelativePath(sketchId: string): string {
  return `${sketchId.slice(0, 2)}/${sketchId}.png`;
}
```

**Implementation Notes**:
- Mirror the `FsPageImageStore` pattern from Phase 5 — same shape, separate root directory.
- Sharding by first 2 hex chars caps any single directory at ~256 sketches per shard for the first ~65k sketches; fine for v1.
- `put` should `mkdir -p` the shard subdir on first write.
- Failures (disk full, permission denied) propagate as the underlying filesystem error.

**Acceptance Criteria**:
- [ ] `put(id, png)` writes the file and returns `sketchRelativePath(id)`.
- [ ] `get(path)` returns the PNG bytes.
- [ ] `has(path)` returns true after put, false beforehand.
- [ ] Re-putting the same id overwrites cleanly (idempotent).

---

### Unit 4: `SketchService` interface + impl

**File**: `packages/core/src/types/sketches.ts` (new)

```typescript
import type { StudentId, Timestamp } from "./common.js";

/** SHA-256 hex of the snapshot JSON. */
export type SketchId = string & { readonly __brand: "SketchId" };

export interface SketchSummary {
  readonly id: SketchId;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Timestamp;
}

export interface Sketch extends SketchSummary {
  /** The tldraw snapshot JSON, parsed. */
  readonly snapshot: unknown; // Tldraw's Snapshot type — opaque to core
  /** PNG bytes. */
  readonly image: Buffer;
}

export interface SketchService {
  /**
   * Idempotent upload. Computes id = sha256(snapshot JSON); returns existing
   * id if already stored. PNG bytes are written to the FsSketchStore.
   */
  put(input: {
    studentId: StudentId;
    snapshot: unknown;
    image: Buffer;
    width: number;
    height: number;
  }): Promise<SketchSummary>;

  /** Read full sketch (snapshot + image bytes). Throws on unknown id. */
  get(sketchId: SketchId): Promise<Sketch>;

  /** Read summary only — no image bytes. Returns null if unknown. */
  getSummary(sketchId: SketchId): Promise<SketchSummary | null>;
}
```

**File**: `packages/core/src/services/sketch-service.ts` (new)

```typescript
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { sketches } from "@praxis/memory/schema";
import type { Logger, Sketch, SketchId, SketchService, SketchSummary, StudentId, Timestamp } from "../types/index.js";
import { brandId } from "../types/index.js";
import type { PraxisDb } from "../db/index.js";
import type { SketchStore } from "@praxis/tools/runtime/sketch";
import { sketchRelativePath } from "@praxis/tools/runtime/sketch";

export interface SketchServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly store: SketchStore;
}

export class SketchServiceImpl implements SketchService {
  constructor(private readonly deps: SketchServiceDeps) {}

  async put(input: { studentId: StudentId; snapshot: unknown; image: Buffer; width: number; height: number }): Promise<SketchSummary> {
    const snapshotJson = JSON.stringify(input.snapshot);
    const id = createHash("sha256").update(snapshotJson).digest("hex");
    const sketchId = brandId<"SketchId">(id);
    // Check existing
    const existing = this.deps.db.select().from(sketches).where(eq(sketches.id, id)).get();
    if (existing) return rowToSummary(existing);
    // Persist PNG to store
    const imagePath = await this.deps.store.put(id, input.image);
    // Persist row
    const now = new Date();
    this.deps.db.insert(sketches).values({
      id,
      studentId: input.studentId,
      snapshotJson: input.snapshot,
      imagePath,
      width: input.width,
      height: input.height,
      createdAt: now,
    }).run();
    return { id: sketchId, width: input.width, height: input.height, createdAt: now.getTime() as Timestamp };
  }

  async get(sketchId: SketchId): Promise<Sketch> { /* ... */ }
  async getSummary(sketchId: SketchId): Promise<SketchSummary | null> { /* ... */ }
}
```

**Implementation Notes**:
- `put` is idempotent: same snapshot JSON → same SHA → same row. Re-uploads do NOT throw.
- `get` reads both the DB row and the PNG file; throws a descriptive error if either is missing.
- The `snapshot: unknown` type is intentional in core — core doesn't depend on tldraw types. The renderer + the sketch.read tool handler treat it as opaque JSON.

**Acceptance Criteria**:
- [ ] `put` returns the same id for two calls with identical snapshot JSON.
- [ ] `put` writes the PNG to the store on first call only (verify via spy).
- [ ] `get` returns `{ snapshot, image, ... }` with correct bytes.
- [ ] `getSummary` returns null for unknown ids; never throws.

---

### Unit 5: Wire `SketchServiceImpl` into Services + buildServices

**File**: `packages/desktop/electron/main/services.ts` (modify)

Three additive changes — same pattern as `TabsServiceImpl` from Phase 14:

1. Import `SketchServiceImpl` from `@praxis/core/services` and `FsSketchStore` from `@praxis/tools/runtime/sketch`.
2. Construct in `buildServices`: 
   ```typescript
   const sketchStore = new FsSketchStore(join(dataDir, "sketches"));
   const sketchService = new SketchServiceImpl({ db, log, store: sketchStore });
   ```
3. Add `sketches: SketchServiceImpl` to the `Services` interface and the returned object.

Also add `sketches` to `ServiceDeps.toolServices` so tool handlers can access it.

**Acceptance Criteria**:
- [ ] `services.sketches.put(...)` callable after `buildServices`.
- [ ] `dataDir/sketches/` directory exists or is created on first put.

---

### Unit 6: IPC handlers + `SketchClient`

**File**: `packages/desktop/electron/main/ipc-server.ts` (modify) — add a new section

```typescript
// ── Sketches ────────────────────────────────────────────────────────────

handle(
  "praxis.sketches.put",
  async (_event, opts: { snapshot: unknown; imageBase64: string; width: number; height: number }) => {
    const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
    const image = Buffer.from(opts.imageBase64, "base64");
    return services.sketches.put({
      studentId,
      snapshot: opts.snapshot,
      image,
      width: opts.width,
      height: opts.height,
    });
  },
);

handle("praxis.sketches.get", async (_event, sketchId: string) => {
  const sketch = await services.sketches.get(sketchId as SketchId);
  // Encode image as base64 for IPC transport
  return {
    id: sketch.id,
    snapshot: sketch.snapshot,
    width: sketch.width,
    height: sketch.height,
    createdAt: sketch.createdAt,
    imageBase64: sketch.image.toString("base64"),
  };
});

handle("praxis.sketches.getSummary", async (_event, sketchId: string) => {
  return services.sketches.getSummary(sketchId as SketchId);
});
```

**File**: `packages/client/src/services/sketch-client.ts` (new)

```typescript
import type { Sketch, SketchId, SketchService, SketchSummary } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.sketches" as const;

export class SketchClient implements Pick<SketchService, "getSummary"> {
  constructor(private readonly transport: ClientTransport) {}

  async put(input: { snapshot: unknown; image: Blob; width: number; height: number }): Promise<SketchSummary> {
    const buf = await input.image.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(buf);
    return this.transport.invoke<SketchSummary>(`${C}.put`, {
      snapshot: input.snapshot,
      imageBase64,
      width: input.width,
      height: input.height,
    });
  }

  async get(sketchId: SketchId): Promise<{ snapshot: unknown; image: Blob; width: number; height: number }> {
    const result = await this.transport.invoke<{
      id: SketchId;
      snapshot: unknown;
      imageBase64: string;
      width: number;
      height: number;
    }>(`${C}.get`, sketchId);
    return {
      snapshot: result.snapshot,
      image: new Blob([base64ToArrayBuffer(result.imageBase64)], { type: "image/png" }),
      width: result.width,
      height: result.height,
    };
  }

  getSummary(sketchId: SketchId): Promise<SketchSummary | null> {
    return this.transport.invoke<SketchSummary | null>(`${C}.getSummary`, sketchId);
  }
}
```

**File**: `packages/core/src/types/client.ts` (modify) — add `sketches: SketchClientApi` to `PraxisClient`. Define `SketchClientApi` interface (the shape above; `image: Blob` not `Buffer` on the client side).

**File**: `packages/client/src/client.ts` (modify) — wire `sketches: new SketchClient(transport)`.

**Acceptance Criteria**:
- [ ] `client.sketches.put({...})` round-trips and returns a `SketchSummary` with a stable id.
- [ ] `client.sketches.get(id)` returns a Blob the renderer can render in `<img>`.
- [ ] No existing client method signatures break.

---

### Unit 7: `<SketchCanvas>` React component

**File**: `packages/ui/src/components/sketch-canvas.tsx` (new)

```typescript
import { useCallback, useImperativeHandle, useRef, type ForwardedRef } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import styles from "./sketch-canvas.module.css";

export interface SketchSnapshot {
  /** tldraw snapshot — opaque to most consumers. */
  readonly snapshot: unknown;
  /** PNG of the rendered drawing as a Blob. */
  readonly image: Blob;
  readonly width: number;
  readonly height: number;
}

export interface SketchCanvasHandle {
  /** Capture current state as { snapshot, image, dimensions }. */
  capture: () => Promise<SketchSnapshot>;
  /** Clear the canvas. */
  clear: () => void;
}

export interface SketchCanvasProps {
  /** Inline mode renders at fixed 320px height. Full mode fills its parent. */
  variant?: "inline" | "full";
  /** Initial tldraw snapshot to load. */
  initialSnapshot?: unknown;
  /** Called whenever the canvas content changes (debounced internally to ~500ms). */
  onChange?: (snapshot: unknown) => void;
  /** Imperative ref to capture the current state on demand. */
  handleRef?: ForwardedRef<SketchCanvasHandle>;
}

export function SketchCanvas(props: SketchCanvasProps): JSX.Element;
```

**File**: `packages/ui/src/components/sketch-canvas.module.css` (new)

```css
.inline {
  width: 100%;
  height: 320px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
  position: relative;
}

.full {
  width: 100%;
  height: 100%;
  position: relative;
}
```

**Implementation Notes**:
- The component holds a `useRef<Editor | null>` populated via tldraw's `onMount`.
- `capture()` returns `{ snapshot: editor.getSnapshot(), image, width, height }` — `image` produced via `editor.toImage({ format: 'png', scale: 2 })` (high DPI for vision OCR).
- `useImperativeHandle` exposes capture + clear via the optional handleRef.
- Inline variant constrains tldraw's UI: hide the menu bar, the share panel, etc. Use tldraw's `components` prop to customize / hide built-in UI:
  ```tsx
  <Tldraw components={{ MenuPanel: null, MainMenu: null, NavigationPanel: null, ... }} />
  ```
- Persist tldraw's auto-save to memory only (no localStorage) — sketches are explicitly captured via `capture()`.
- Apply `inline` class for the bounded 320px container; `full` for parent-filling.
- On first mount, if `initialSnapshot` is provided, load via `editor.loadSnapshot(initialSnapshot)` after onMount.
- Debounce `onChange` by ~500ms to avoid flooding re-renders during active drawing.

**Acceptance Criteria**:
- [ ] Component mounts inside a 320px container in `variant="inline"`.
- [ ] Drawing on the canvas updates internal state.
- [ ] `capture()` returns `{ snapshot, image: Blob (PNG), width, height }` with non-zero dimensions.
- [ ] `clear()` empties the canvas.
- [ ] `onChange` fires no more than ~2/sec during continuous drawing.
- [ ] Hidden UI: no top-bar menu, no share panel, in inline mode (full mode shows the standard tldraw UI).

---

### Unit 8: Composer sketch affordance + inline expansion

**Files**:
- `packages/ui/src/components/composer.tsx` (modify — accept a `sketch` prop slot)
- `packages/ui/src/components/composer-sketch.tsx` (new — the inline expansion)
- `packages/ui/src/components/composer-sketch.module.css` (new)

**Composer changes**:

```typescript
export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, sketchId?: SketchId) => void;
  disabled?: boolean;
  /** Optional sketch capability — when set, renders a "✎ Sketch" affordance. */
  sketchEnabled?: boolean;
}
```

The composer surfaces a quiet "✎ Sketch" toggle next to the Send button when `sketchEnabled` is true. Clicking expands `<ComposerSketch />` above the textarea; submitting captures the sketch, uploads via `client.sketches.put`, gets a `SketchId`, and passes it to `onSend`.

**`<ComposerSketch />`**:

```typescript
export interface ComposerSketchProps {
  /** Called with the captured SketchId after upload. */
  onCaptured: (sketchId: SketchId) => void;
  /** Called when the user collapses without capturing. */
  onCancel: () => void;
}

export function ComposerSketch({ onCaptured, onCancel }: ComposerSketchProps): JSX.Element;
```

Renders `<SketchCanvas variant="inline" handleRef={...} />` plus two buttons (`Cancel`, `Submit sketch`). Submit calls the canvas's `capture()`, then `client.sketches.put(...)`, then `onCaptured(sketchId)`.

**Chat integration** (`packages/ui/src/components/chat-tab-body.tsx` modify):

When `onSend` receives a `sketchId`, the user message text is augmented with `"\n\n[sketch:<sketchId>]"` before sending to the agent. The agent's prompt (Phase 15a system prompt fragment) tells it to call `sketch.read({ sketchId })` when it sees this marker.

**Implementation Notes**:
- The "Sketch" affordance is part of the composer chrome, not the verb-chip rail (verb chips are starter words; sketch is a different modality).
- The expansion animates open/closed with a CSS transition (max-height 0 → 320px ease).
- Once a sketch is captured, the composer textarea retains the user's typed text; the marker is appended on send. The inline canvas closes after capture.
- If the user sends without capturing (just typed text), `sketchId` is undefined — no sketch attached.

**Acceptance Criteria**:
- [ ] When `sketchEnabled` is true, composer shows the "✎ Sketch" affordance.
- [ ] Clicking it expands the inline canvas.
- [ ] Drawing then clicking "Submit sketch" calls `client.sketches.put` once and invokes `onCaptured` with the new `SketchId`.
- [ ] After capture, sending the user message attaches the marker `[sketch:<id>]` to the text.
- [ ] Cancel collapses the canvas without uploading.

---

### Unit 9: Submission sketch input

**File**: `packages/ui/src/components/assignment-item-card.tsx` (modify — currently has placeholder UI per UX.md)

Replace the placeholder "sketch your work" with a real `<SketchCanvas variant="inline" />` per item. On submit (or on auto-save, depending on existing flow), capture and upload the sketch; store the resulting `SketchId` on the `assignment_responses` row alongside the typed answer.

**File**: `packages/memory/src/schema.ts` (modify) — add a column to `assignment_responses` (Phase 8 schema):

```typescript
sketchId: text("sketch_id"), // nullable; references sketches.id but no FK (deduplication-friendly)
```

Migration via `pnpm db:generate`.

**Implementation Notes**:
- The existing `assignment.submit` and `recordResponse` paths need to learn about `sketchId`.
- For grading, `gradeMathTool` (Unit 11) will receive the sketchId and trigger the vision pipeline.
- Per-problem auto-save: when the canvas changes (debounced), capture + upload + persist sketchId. This uses bandwidth — for v1 capture only on submit instead. (Note this in implementation; revisit if sketches feel laggy.)

**Acceptance Criteria**:
- [ ] Each assignment item exposes a `<SketchCanvas variant="inline" />` alongside the typed input.
- [ ] On submit, the captured sketchId is stored on the response row.
- [ ] `client.assignments.submit(...)` includes any per-item sketchIds in its payload.

---

### Unit 10: Note `format: "sketch"` editor

**File**: `packages/ui/src/components/note-editor-sketch.tsx` (new — sibling of existing note editors like `note-editor-cornell.tsx`)

```typescript
export interface NoteEditorSketchProps {
  noteId: NoteId;
  initialSnapshot?: unknown;
  onSave: (snapshot: unknown) => Promise<void>;
}

export function NoteEditorSketch(props: NoteEditorSketchProps): JSX.Element;
```

Renders `<SketchCanvas variant="full">` filling the workspace pane. Auto-saves on debounced changes (~2s) by capturing and calling `client.notes.update(noteId, { format: "sketch", body: { snapshot } })`.

**File**: `packages/ui/src/routes/workspace/note-editor-page.tsx` (modify)

Add a switch case for `format: "sketch"` that renders `<NoteEditorSketch>`.

**Implementation Notes**:
- `parseNoteBody`/`serializeNoteBody` already handle the sketch case (Phase 12 backend). The body shape is `{ kind: "sketch", snapshot: unknown }`.
- For sketch notes, the rendered image isn't stored on the note row — the `sketches` table holds it. The note body just stores the snapshot. When the agent reads the note, the renderer ALSO uploads the rendered image as a sketch row, and `note.show` includes the sketchId. (For v1 simplicity: skip the image-upload step for sketch notes — agent reads only the snapshot JSON. Vision OCR for note sketches is Phase 15.x.)
- Auto-save is debounced 2 seconds; explicit "Save" button also available.

**Acceptance Criteria**:
- [ ] Workspace note with `format: "sketch"` renders the full-canvas editor.
- [ ] Drawing then waiting 2s auto-saves via `client.notes.update`.
- [ ] Re-opening the note loads the saved snapshot.

---

### Unit 11: `sketch.read` agent tool

**File**: `packages/tools/src/sketch/sketch-read.ts` (new)

```typescript
import { z } from "zod";
import type { SketchId, ToolDefinition } from "@praxis/core/types";

export const sketchReadInput = z.object({
  sketchId: z.string().describe("The id from a [sketch:<id>] marker in the user's message."),
});

export const sketchReadOutput = z.object({
  snapshotJson: z.string().describe("The tldraw snapshot as a JSON string."),
  imageBase64: z.string().describe("PNG bytes, base64-encoded."),
  width: z.number(),
  height: z.number(),
});

export const sketchReadTool: ToolDefinition<typeof sketchReadInput, typeof sketchReadOutput> = {
  name: "sketch.read",
  description: "Fetch a sketch the user has drawn. Use when the user's message contains [sketch:<id>] markers, or when grading work that includes sketch references.",
  tier: "deterministic",
  input: sketchReadInput,
  output: sketchReadOutput,
  handler: async (input, ctx) => {
    if (!ctx.services.sketches) {
      return { ok: false, error: { code: "service_unavailable", message: "Sketch service is not wired into this context." } };
    }
    try {
      const sketch = await ctx.services.sketches.get(input.sketchId as SketchId);
      return {
        ok: true,
        value: {
          snapshotJson: JSON.stringify(sketch.snapshot),
          imageBase64: sketch.image.toString("base64"),
          width: sketch.width,
          height: sketch.height,
        },
      };
    } catch (err) {
      return { ok: false, error: { code: "not_found", message: err instanceof Error ? err.message : String(err) } };
    }
  },
};
```

**File**: `packages/tools/src/sketch/index.ts` (new) — barrel export.

**File**: `packages/core/src/services/types.ts` (modify) — add `sketches: SketchService` to `ServiceDeps.toolServices`.

**File**: `packages/curriculum/src/modes/teach.ts` (modify) — register `sketch.read` in teach mode's `toolNames` so the tutor can read sketches the student sends.

Also register in `homework`, `quiz`, `exam` modes (sketches in submissions). NOT in `bootstrap` (no sketches in bootstrap conversation).

**Implementation Notes**:
- The tool returns `snapshotJson` as a string (not the parsed object) so the LLM doesn't try to over-interpret tldraw's internal shape. The agent typically wants the IMAGE, not the JSON.
- `imageBase64` is the meat — the agent uses this in a vision-style follow-up. (See Unit 12.)
- The agent's system prompt (separate fragment, see below) explains: "When you see a `[sketch:<id>]` marker in a user message, call `sketch.read` first; the image describes their work."

**Acceptance Criteria**:
- [ ] `sketch.read({ sketchId })` returns the stored snapshot + image for an existing sketch.
- [ ] Returns `{ ok: false, code: "not_found" }` for unknown ids.
- [ ] Registered in teach, homework, quiz, exam modes' tool lists.

---

### Unit 12: `gradeMathTool` extension — sketch input case

**File**: `packages/tools/src/math/grade-math.ts` (modify)

Today the input is a discriminated union with kinds for typed/LaTeX expressions. Add a new case:

```typescript
export const gradeMathInput = z.discriminatedUnion("kind", [
  // existing cases ...
  z.object({
    kind: z.literal("sketch"),
    sketchId: z.string(),
    /** Optional — the expected answer, when known. Validated against vision-extracted LaTeX. */
    expected: z.string().optional(),
  }),
]);
```

In the handler, dispatch to a new branch:

```typescript
case "sketch": {
  if (!ctx.services.sketches) return { ok: false, error: { code: "service_unavailable", ... } };
  if (!ctx.services.vision) return { ok: false, error: { code: "vision_unavailable", ... } };
  // Step 1: fetch sketch
  const sketch = await ctx.services.sketches.get(input.sketchId as SketchId);
  // Step 2: vision OCR — describe the math as LaTeX
  const visionResult = await ctx.services.vision.describe({
    image: { base64: sketch.image.toString("base64"), mimeType: "image/png" },
    prompt: "Extract the mathematical expression(s) shown in this drawing as LaTeX. Reply with only the LaTeX, no other text.",
  });
  const latex = visionResult.text.trim();
  // Step 3: pass LaTeX to sympy via the existing typed-input pipeline
  const sympyResult = await ctx.services.sympy.evaluate({
    expression: latex,
    expected: input.expected,
  });
  // Step 4: return graded result; if sympy can't parse the LaTeX, return needs_human_review
  if (sympyResult.kind === "parse_error") {
    return { ok: true, value: { kind: "needs_human_review", visionLatex: latex, reason: sympyResult.reason } };
  }
  return { ok: true, value: { ...sympyResult, visionLatex: latex } };
}
```

**File**: `packages/core/src/services/types.ts` (modify) — add `vision?: VisionService` to `ServiceDeps.toolServices`. The `VisionService` is a thin wrapper around the configured engine's `VisionCapability`:

```typescript
export interface VisionService {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}
```

**File**: `packages/core/src/services/vision-service.ts` (new) — implementation that resolves the configured engine via `engineConfig` and delegates to its `vision.describe`.

**File**: `packages/desktop/electron/main/services.ts` (modify) — construct `visionService = new VisionServiceImpl({ engineFactory, log })` and pass into `toolServices.vision`.

**Implementation Notes**:
- `gradeMathOutput` discriminated union grows to include `needs_human_review` (with `visionLatex` for diagnostics).
- The sympy evaluation step assumes `ctx.services.sympy.evaluate(...)` exists with the right shape — verify against `packages/tools/src/math/grade-math.ts` existing implementation; reuse the same pipeline that handles typed LaTeX input.
- The `VisionService` is engine-agnostic: it spawns a fresh single-shot session via the engine factory and uses the engine's vision capability. This is consistent with how `VisionPdfIngestor` (Phase 5) works.
- Two-step verification (per scope decision): NO model-verification of "does this LaTeX match the original drawing?" between vision and sympy. Trust the vision adapter; if sympy parses, accept.

**Acceptance Criteria**:
- [ ] `gradeMath({ kind: "sketch", sketchId, expected })` returns the same `correct/incorrect` shape as typed input when the vision-extracted LaTeX validates.
- [ ] Returns `needs_human_review` with `visionLatex` when sympy can't parse the LaTeX.
- [ ] Vision and sympy are both invoked (verify via spies in tests).
- [ ] If `services.vision` is unavailable, returns a clean error rather than crashing.

---

### Unit 13: System-prompt fragment — sketch awareness

**File**: `packages/curriculum/src/modes/fragments/sketch-awareness.ts` (new)

```typescript
import type { PromptFragment } from "@praxis/core/types";

export const sketchAwarenessFragment: PromptFragment = {
  id: "sketch.awareness",
  customizable: false,
  template: `
When the student's message contains a marker like \`[sketch:<id>]\`, they have drawn
something for you to see. Call \`sketch.read({ sketchId })\` first; the returned image
describes their work. After looking at it, respond as you normally would — comment on
what you see, ask follow-up questions, or grade the math if that's the active task.

For grading sketched math specifically, prefer \`grade_math({ kind: "sketch", sketchId })\`
which runs your vision read against symbolic math validation in one step.
`.trim(),
};
```

**File**: `packages/curriculum/src/modes/teach.ts` (modify) — add `sketchAwarenessFragment` to teach mode's prompt fragment list. Same for `homework`, `quiz`, `exam` modes.

**Acceptance Criteria**:
- [ ] Fragment exists and is customizable: false (verification stance — don't let configurators remove the read-sketch instruction).
- [ ] Fragment is in teach, homework, quiz, exam mode prompts.

---

### Unit 14: Surface cleanup + COPY additions

**File**: `packages/ui/src/lib/copy.ts` (modify) — add:

```typescript
composer: {
  placeholder: "...",   // existing
  sketchToggleAriaLabel: "Open sketch input",
  sketchSubmitButton: "Submit sketch",
  sketchCancelButton: "Cancel",
},
sketch: {
  noVision: "Vision isn't available with the current engine. Switch to one that supports vision.",
  needsReview: "I read your work but couldn't verify it cleanly. Could you re-write or clarify?",
},
```

**Acceptance Criteria**:
- [ ] All sketch-flow UI strings come from COPY, not inline literals.

---

## Implementation Order

Backend → IPC → component → integration. Each step independently verifiable.

1. **Unit 1** — install tldraw.
2. **Unit 2** — `sketches` table + migration.
3. **Unit 3** — `FsSketchStore`.
4. **Unit 4** — `SketchService` interface + impl.
5. **Unit 5** — wire SketchService into `services.ts` + ServiceDeps.
6. **Unit 6** — IPC handlers + `SketchClient` + PraxisClient additions.
7. **Unit 7** — `<SketchCanvas>` component.
8. **Unit 8** — Composer sketch affordance + chat integration (depends on 7 + 6).
9. **Unit 9** — Submission sketch input (depends on 7 + 6 + Phase 8 schema migration).
10. **Unit 10** — Note sketch editor (depends on 7 + 6).
11. **Unit 11** — `sketch.read` tool (depends on 4 + 5).
12. **Unit 12** — `gradeMathTool` sketch case + `VisionService` (depends on 4 + 5 + 11).
13. **Unit 13** — system prompt fragment (depends on 11 + 12).
14. **Unit 14** — COPY additions (independent; can land any time).

Stop points where partial implementation is still useful:
- After **Unit 6**: backend complete; can manually `client.sketches.put({...})` from a test script.
- After **Unit 8**: chat composer can capture sketches; agent can read them via Unit 11; vision/grading via Unit 12.
- After **Unit 12**: full sketched-math grading pipeline works end-to-end.

---

## Testing

### Unit 3 (FsSketchStore) — `packages/tools/src/runtime/sketch/__tests__/fs-sketch-store.test.ts`
- `put` + `get` round-trip preserves bytes.
- `has` returns true after put, false beforehand.
- Re-putting same id overwrites cleanly.
- Sharded path matches `sketchRelativePath`.

### Unit 4 (SketchService) — `packages/core/src/services/__tests__/sketch-service.test.ts`
- `useTempDb` for isolated SQLite + temp store dir.
- Two `put` calls with identical snapshot return same id; PNG written only once.
- `get` returns the persisted sketch with correct image bytes.
- `getSummary` returns null for unknown id; never throws.

### Unit 6 (IPC + Client) — `packages/client/src/__tests__/sketch-client.test.ts`
- `client.sketches.put` invokes `praxis.sketches.put` with base64-encoded image.
- `client.sketches.get` returns a Blob with the image bytes.

### Unit 7 (SketchCanvas) — `packages/ui/src/__tests__/sketch-canvas.test.tsx`
- Renders inside the inline container.
- `capture()` returns `{ snapshot, image, width, height }` with non-zero dimensions.
- `clear()` resets the canvas.
- Hidden UI elements (menu, share) absent in inline variant.

(Note: tldraw inside vitest/jsdom may need `canvas` polyfill or a thin mock. If full integration tests are flaky, fall back to mounting tests + a separate manual smoke.)

### Unit 8 (Composer integration) — extend `chat-route.test.tsx`
- "Sketch" affordance renders when `sketchEnabled` is true.
- Clicking it shows the inline canvas.
- Capture + send attaches `[sketch:<id>]` marker to user message text (verify via spy on `session.send`).

### Unit 11 (sketch.read tool) — `packages/tools/src/sketch/__tests__/sketch-read.test.ts`
- Returns snapshot + image for a sketch put via the test sketch service.
- Returns `not_found` error for unknown id.
- Returns `service_unavailable` if `ctx.services.sketches` is missing.

### Unit 12 (gradeMath sketch case) — extend `packages/tools/src/math/__tests__/grade-math.test.ts`
- With a fake `VisionService` that returns a known LaTeX, sympy validates correctly.
- `needs_human_review` returned when fake vision returns an unparseable string.
- `vision_unavailable` when `services.vision` is undefined.

---

## Verification Checklist

```bash
cd /home/nathan/dev/praxis
pnpm install
pnpm db:migrate
pnpm --filter @praxis/memory test
pnpm --filter @praxis/core test
pnpm --filter @praxis/tools test
pnpm --filter @praxis/client test
pnpm --filter @praxis/ui test
pnpm --filter @praxis/desktop typecheck
pnpm build
```

Manual smoke (after Unit 12):

1. `pnpm dev` → open chat, sign in if needed.
2. Click "✎ Sketch" → canvas expands → draw `2x + 5 = 11`.
3. Click "Submit sketch" → canvas closes.
4. Type "Is this right?" → Send.
5. Tutor calls `sketch.read` (visible in main-process stderr as a tool call), then `grade_math({ kind: "sketch", sketchId })`.
6. Tutor responds with grading result.

For the iPad Safari + Apple Pencil smoke (per ROADMAP test checkpoint), defer until distribution flow ships — local dev doesn't reach iPad.

---

## Risks and Open Questions

1. **tldraw v4 image export in vitest/jsdom** — `editor.toImage()` typically requires a real canvas. If unit tests can't capture images, fall back to mounting tests only and verify capture/render behavior in manual smoke. The actual rendering happens in real Electron at runtime, so this is a test-tool gap, not a product gap.

2. **Vision adapter latency** — sketched-math grading involves a model call (vision read). Expect 2-5s per grading. Acceptable for v1; loading state in the UI must surface this.

3. **`[sketch:<id>]` marker as a contract** — the agent reads the marker via prompt instruction. If a future model ignores or hallucinates markers, grading fails silently. Watch episodic logs after the first weeks of use; consider escalating to a structured attachment slot in `EngineSession.send` for Phase 15.x.

4. **Sketch storage growth** — every chat sketch persists indefinitely. With 100 sketches × ~50KB PNG average = ~5MB; cheap. With 10,000 sketches (heavy user, year-long use) = 500MB. Probably fine for v1; orphan-sweep is a future polish.

5. **Auto-save bandwidth on submission canvas** — Unit 9 notes that v1 captures only on submit. If users complain about losing work, add debounced auto-save then.

6. **Vision returns non-LaTeX text** — vision adapter may emit "I see x = 5 written in pen" instead of `x = 5`. The prompt asks for LaTeX-only, but adapters may not comply. Sympy's parse-error path catches this and returns `needs_human_review`. Worth flagging: if the failure rate is high, add a "extract LaTeX from this verbose response" cleaning pass before sympy.

---

## What this DOESN'T cover (deferred)

- **Concept maps** (Phase 15b) — `<ConceptMapDrawing>` UI route, concept-linking, canonical hints, coach divergence indexer.
- **Embedded image extraction in ingestion** (Phase 15c) — pdfjs-dist image XObjects, mammoth.js images, epub2 chapter images, inline thumbnails in citation chips.
- **Native engine attachments** (Phase 15.x) — `EngineSession.send(message, attachments?)` so sketches flow inline in the model call rather than via tool round-trip.
- **Four-step verification** — vision → LaTeX → re-render → model verifies match → sympy. Trust two-step for v1.
- **Auto-save on submission canvas** — submit-only for v1.
- **Sketch orphan sweep** — manual `pnpm db:reset` for now.
