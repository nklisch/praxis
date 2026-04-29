# Refactor Plan: Post-Phase-4 Cleanup

> Scope: 4 phases of working code reviewed (foundation, engine layer, UI shell, verification tools). One refactor pass before Phase 5 lands new structure (RAG + Marker ingestion).

## Overview

Three explore agents swept the monorepo for duplicate logic, missing abstractions, and pattern inconsistencies. The codebase is in good structural health overall — naming, file conventions, dependency direction, type-only imports, and branded ID usage are all consistent. The cleanup opportunities are localized and small.

**Real findings to act on:**

| # | Finding | Files affected | LOC saved | Risk |
|---|---|---|---|---|
| 1 | DB-test setup duplicated 4× | 4 test files | ~30 | Low |
| 2 | `vi.mock("isolated-vm")` factory duplicated 4× | 4 test files | ~50 | Low |
| 3 | Inline `EngineError` construction 6× | 3 production files | ~12 | Low |
| 4 | `gradeMathTool` handler optional-spread density | 1 file (13 instances) | ~25 | Low |
| 5 | `type` vs `kind` discriminator convention undocumented | `CLAUDE.md` | 0 | Trivial |

**Findings explicitly NOT actioned** (red herrings or premature):

- **`BaseEngineSession` extraction** — only Claude Code + Codex share the bridged-session shape; Direct is genuinely different. Defer until a 4th looped engine exists.
- **`compactObject({a, b, c})` helper** — would hide explicit intent that `exactOptionalPropertyTypes: true` makes valuable.
- **`defineTool({...})` factory** — TypeScript already enforces the `ToolDefinition` shape; factory adds indirection without payoff.
- **Service base class** — `SessionServiceImpl` and `ConfigServiceImpl` share only the constructor signature.
- **Tool dispatch wrapper** — MCP wraps errors in result objects; Direct throws. Patterns intentionally diverge per SDK contract.
- **Console logger consolidation** — only 2 callsites with intentionally different prefixes.
- **Subpath-export consolidation** — standard pattern; not a problem.
- **Prompt-fragment data file** — only 6 fragments; loses syntax + types for marginal LOC win.

Total estimated work: **5 small commits**, each independently verifiable. No public API breakage. No test rewrites — existing tests adapt to import the helper.

---

## Refactor Steps

### Step 1: Extract DB-test setup into `tests/helpers/db-setup.ts`

**Priority**: High
**Risk**: Low
**Files**:
- New: `tests/helpers/db-setup.ts`
- Modified: `tests/foundation.test.ts`, `tests/full-turn-with-fake-engine.test.ts`, `packages/core/src/__tests__/episodic.test.ts`, `packages/core/src/__tests__/engine-config.test.ts`

**Current State** (repeated identically 4×):

```typescript
// tests/foundation.test.ts (and 3 others)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});
```

(Some variants also call `runMigrations({ path: dbPath })` in `beforeEach`.)

**Target State**:

```typescript
// tests/helpers/db-setup.ts (NEW)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { afterEach, beforeEach } from "vitest";

export interface TempDbContext {
  /** Temp directory holding the database. */
  readonly tmpDir: string;
  /** Absolute path to the SQLite file. */
  readonly dbPath: string;
}

export interface UseTempDbOptions {
  /** Apply migrations in beforeEach. Default: true. Set false when the test
   *  case wants to apply migrations manually (e.g., to assert migration behavior). */
  migrate?: boolean;
}

/**
 * Per-test temp SQLite database. Sets PRAXIS_DB_PATH so openDb() resolves
 * here, applies migrations (unless opts.migrate === false), and tears
 * everything down + cleans up after each test. Returns a context object
 * whose fields are populated lazily inside beforeEach.
 *
 * Usage:
 *   const db = useTempDb();
 *   it("does the thing", () => {
 *     const { db: client } = openDb({ path: db.dbPath });
 *     // ...
 *   });
 */
export function useTempDb(opts: UseTempDbOptions = {}): TempDbContext {
  const ctx: { tmpDir: string; dbPath: string } = { tmpDir: "", dbPath: "" };
  const migrate = opts.migrate !== false;

  beforeEach(() => {
    ctx.tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
    ctx.dbPath = join(ctx.tmpDir, "test.db");
    process.env.PRAXIS_DB_PATH = ctx.dbPath;
    if (migrate) runMigrations({ path: ctx.dbPath });
  });

  afterEach(() => {
    closeDb();
    delete process.env.PRAXIS_DB_PATH;
    rmSync(ctx.tmpDir, { recursive: true, force: true });
  });

  return ctx as TempDbContext;
}
```

```typescript
// tests/foundation.test.ts (MIGRATED)
import { openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { listTables } from "@praxis/core/db/show";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

describe("foundation: migration + schema discovery", () => {
  // Disable auto-migrate — tests below want to control when migrations run
  const db = useTempDb({ migrate: false });

  it("opens a fresh database and applies migrations", () => {
    const result = runMigrations({ path: db.dbPath });
    expect(result.path).toBe(db.dbPath);
  });
  // ... other tests use db.dbPath directly
});
```

```typescript
// packages/core/src/__tests__/episodic.test.ts (MIGRATED)
import { useTempDb } from "../../../../tests/helpers/db-setup.js";

describe("episodic helpers", () => {
  const db = useTempDb();
  // tests use db.dbPath
});
```

**Implementation Notes**:

- The relative-path import from per-package tests (`../../../../tests/helpers/db-setup.js`) is ugly but the alternative — adding a `@praxis/test-utils` workspace package — is more infrastructure than this saves. Document in CLAUDE.md if questioned.
- The `migrate` opt defaults to true because most callsites want it. `tests/foundation.test.ts` explicitly tests migration behavior so it sets `migrate: false`.
- Return type uses `TempDbContext` (readonly fields) but internally mutates a lookalike. The cast to readonly is cosmetic — the test only reads inside `it()` blocks, after `beforeEach` populated.
- Do NOT export `runMigrations` re-import from this file; let test files import it directly when they need it. Keeps the helper focused.

**Acceptance Criteria**:
- [ ] `pnpm test` passes — same 192 tests, same skip count.
- [ ] No test file contains `mkdtempSync` import directly (except inside the helper).
- [ ] `tests/foundation.test.ts` shrinks by ~10 lines.
- [ ] Per-package test files (`episodic.test.ts`, `engine-config.test.ts`) shrink by ~10 lines each.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.

---

### Step 2: Extract `vi.mock("isolated-vm")` factory into `tests/helpers/mocks.ts`

**Priority**: High
**Risk**: Low
**Files**:
- New: `tests/helpers/mocks.ts`
- Modified: `tests/engine-conformance.test.ts`, `tests/full-turn-with-fake-engine.test.ts`, `packages/tools/src/__tests__/index.test.ts`

**Current State** (4 callsites — one shape repeated identically in 3 of them; the unit test for `IsolatedVmHost` itself uses a richer mock and stays as-is):

```typescript
// tests/engine-conformance.test.ts:26 (and full-turn, tools/index.test)
vi.mock("isolated-vm", () => ({
  default: {
    Isolate: class {
      async createContext() {
        return {
          global: { set: async () => {}, derefInto: () => ({}) },
          release: () => {},
        };
      }
      async compileScript(_code: string) {
        return { run: async () => {} };
      }
      dispose() {}
    },
    Reference: class {
      // biome-ignore lint/suspicious/noExplicitAny: mock factory
      constructor(_fn: (...args: any[]) => unknown) {}
    },
  },
}));
```

**Target State**:

```typescript
// tests/helpers/mocks.ts (NEW)

/**
 * Minimal `isolated-vm` mock that lets `IsolatedVmHost` import without
 * triggering native binary load. Use in test files that import code which
 * transitively imports isolated-vm but never actually runs JS in a sandbox.
 * For tests that DO exercise IsolatedVmHost.run(), use the richer mock in
 * packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts.
 *
 * Usage:
 *   import { isolatedVmStubFactory } from "./helpers/mocks.js";
 *   vi.mock("isolated-vm", isolatedVmStubFactory);
 */
export function isolatedVmStubFactory() {
  return {
    default: {
      Isolate: class {
        async createContext() {
          return {
            global: { set: async () => {}, derefInto: () => ({}) },
            release: () => {},
          };
        }
        async compileScript(_code: string) {
          return { run: async () => {} };
        }
        dispose() {}
      },
      Reference: class {
        // biome-ignore lint/suspicious/noExplicitAny: mock factory
        constructor(_fn: (...args: any[]) => unknown) {}
      },
    },
  };
}

/**
 * Quiet Logger that drops every call. Use when testing components that
 * accept a Logger but the test doesn't assert on log output.
 */
export function noopLogger(): import("@praxis/core/types").Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
```

```typescript
// tests/engine-conformance.test.ts (MIGRATED)
import { isolatedVmStubFactory } from "./helpers/mocks.js";
vi.mock("isolated-vm", isolatedVmStubFactory);
```

```typescript
// packages/tools/src/__tests__/index.test.ts (MIGRATED)
import { isolatedVmStubFactory } from "../../../../tests/helpers/mocks.js";
vi.mock("isolated-vm", isolatedVmStubFactory);
```

**Implementation Notes**:

- `vi.mock`'s second argument is a factory function — fine to import a named function and pass it. The mock itself is hoisted; the function reference resolves correctly.
- The richer mock in `packages/tools/src/runtime/__tests__/isolated-vm-host.test.ts` (~40 lines specific to testing the host's behavior) **stays inline** — extracting it would couple the unit-test internals into a shared file.
- `noopLogger()` is a tiny addition that several tests can use; if scope creeps, split into a separate file. For now keep both helpers together.

**Acceptance Criteria**:
- [ ] `pnpm test` passes — same test counts.
- [ ] No top-level `vi.mock("isolated-vm", () => ({ default: { Isolate: class { async createContext()...` remains in test files (except in the dedicated `isolated-vm-host.test.ts`).
- [ ] Each migrated test file shrinks by ~15 lines.
- [ ] `pnpm typecheck` and `pnpm lint` clean.

---

### Step 3: Add `engineError()` helper in `@praxis/core/types/engine.ts`

**Priority**: Medium
**Risk**: Low
**Files**:
- Modified: `packages/core/src/types/engine.ts` (add factory)
- Modified: `packages/core/src/services/session-service.ts` (4 callsites)
- Modified: `packages/engines/src/claude-code/adapter.ts` (1 callsite)
- Modified: `packages/engines/src/codex/adapter.ts` (1 callsite)

**Current State** (6 inline constructions):

```typescript
// packages/core/src/services/session-service.ts:94-101
yield {
  type: "error",
  error: {
    code: "session.not_found",
    message: `Unknown session: ${sessionId}`,
    recoverable: false,
  },
};
return;

// session-service.ts:105-112
yield {
  type: "error",
  error: {
    code: "session.ended",
    message: "Cannot send to an ended session",
    recoverable: false,
  },
};

// session-service.ts:172-181
const writeError: EngineEvent = {
  type: "error",
  error: {
    code: "episodic.write_failed",
    message: cause instanceof Error ? cause.message : String(cause),
    recoverable: false,
    cause,
  },
};

// session-service.ts:188-191
yield {
  type: "error",
  error: { code: "engine.send_failed", message: errMsg, recoverable: false, cause },
};

// claude-code/adapter.ts:114-117
yield {
  type: "error",
  error: { code: "session.closed", message: "EngineSession is closed", recoverable: false },
};

// codex/adapter.ts:116-119
yield {
  type: "error",
  error: { code: "session.closed", message: "EngineSession is closed", recoverable: false },
};
```

**Target State**:

```typescript
// packages/core/src/types/engine.ts (ADDITION at the bottom of the file)

/**
 * Construct an EngineError with sensible defaults. `recoverable` defaults to
 * false (most engine errors aren't); `cause` is omitted from the object when
 * undefined (compatible with exactOptionalPropertyTypes).
 */
export function engineError(
  code: string,
  message: string,
  opts?: { recoverable?: boolean; cause?: unknown },
): EngineError {
  return {
    code,
    message,
    recoverable: opts?.recoverable ?? false,
    ...(opts?.cause !== undefined && { cause: opts.cause }),
  };
}
```

```typescript
// session-service.ts callsites (MIGRATED)
import { engineError } from "../types/engine.js";

// 1.
yield { type: "error", error: engineError("session.not_found", `Unknown session: ${sessionId}`) };
return;

// 2.
yield { type: "error", error: engineError("session.ended", "Cannot send to an ended session") };

// 3. (write failure — preserves cause)
const writeErrorMsg = cause instanceof Error ? cause.message : String(cause);
yield { type: "error", error: engineError("episodic.write_failed", writeErrorMsg, { cause }) };

// 4.
yield { type: "error", error: engineError("engine.send_failed", errMsg, { cause }) };
```

```typescript
// claude-code/adapter.ts and codex/adapter.ts (MIGRATED)
import { engineError } from "@praxis/core/types";

yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
```

**Implementation Notes**:

- `EngineError.recoverable` is currently a required field on the interface — the helper's default of `false` aligns with the dominant inline pattern. If a callsite passes a recoverable error, it does so explicitly via `{ recoverable: true }`.
- `cause` is omitted when undefined per `exactOptionalPropertyTypes` rule.
- `engineError` is exported from `@praxis/core/types/engine.ts` — already re-exported through `@praxis/core/types` because of the wildcard re-export at `packages/core/src/types/index.ts`. Adapters import from `@praxis/core/types`; core's services import via the relative path.
- Net LOC saved per callsite: 2-3 lines (multi-line literal collapses to single line).

**Acceptance Criteria**:
- [ ] `engineError("foo", "bar")` returns `{ code: "foo", message: "bar", recoverable: false }` (no `cause` key).
- [ ] `engineError("foo", "bar", { recoverable: true })` returns `{ code: "foo", message: "bar", recoverable: true }`.
- [ ] `engineError("foo", "bar", { cause: new Error("x") })` returns `{ code: "foo", message: "bar", recoverable: false, cause: <Error> }`.
- [ ] No `error: { code: ..., message: ..., recoverable: ... }` inline constructions remain in `session-service.ts`, `claude-code/adapter.ts`, `codex/adapter.ts`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass.
- [ ] Add a unit test in `packages/core/src/__tests__/engine-error.test.ts` covering the three shapes above.

---

### Step 4: Extract per-output builders in `packages/tools/src/math/grade-math.ts`

**Priority**: Medium
**Risk**: Low
**Files**:
- Modified: `packages/tools/src/math/grade-math.ts`

**Current State**: 4 handler branches each spread 2 optional fields plus copy 2-3 required fields. Total ~50 lines of `kind`-arms-with-optional-spread.

```typescript
// packages/tools/src/math/grade-math.ts (current handler — abbreviated)
async handler(args, ctx) {
  switch (args.kind) {
    case "check_solution": {
      const r = await sympy.checkSolution({
        equation: args.equation,
        variable: args.variable,
        proposedValue: args.proposedValue,
        ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
      });
      return {
        kind: "check_solution" as const,
        correct: r.correct,
        proposedValue: r.proposedValue,
        expectedSolutions: r.expectedSolutions,
        ...(r.needsHumanReview !== undefined && { needsHumanReview: r.needsHumanReview }),
        ...(r.parseError !== undefined && { parseError: r.parseError }),
      };
    }
    case "solve_equation": { /* same shape */ }
    case "simplify": { /* same shape */ }
    case "check_equivalent": { /* same shape */ }
  }
}
```

**Target State**:

```typescript
// packages/tools/src/math/grade-math.ts

import type {
  SymPyCheckEquivalentResult,
  SymPyCheckSolutionResult,
  SymPySimplifyResult,
  SymPySolveEquationResult,
} from "@praxis/core/types";

// At module scope, just below the schemas:

/** Carry the optional diagnostics fields onto the discriminated output. */
function withDiagnostics<T extends { needsHumanReview?: boolean; parseError?: string }>(
  base: Omit<T, "needsHumanReview" | "parseError">,
  source: { needsHumanReview?: boolean; parseError?: string },
): T {
  return {
    ...base,
    ...(source.needsHumanReview !== undefined && { needsHumanReview: source.needsHumanReview }),
    ...(source.parseError !== undefined && { parseError: source.parseError }),
  } as T;
}

function buildCheckSolutionOutput(r: SymPyCheckSolutionResult): z.infer<typeof checkSolutionOutput> {
  return withDiagnostics(
    {
      kind: "check_solution",
      correct: r.correct,
      proposedValue: r.proposedValue,
      expectedSolutions: r.expectedSolutions,
    },
    r,
  );
}

function buildSolveEquationOutput(r: SymPySolveEquationResult): z.infer<typeof solveEquationOutput> {
  return withDiagnostics(
    { kind: "solve_equation", solutions: r.solutions },
    r,
  );
}

function buildSimplifyOutput(r: SymPySimplifyResult): z.infer<typeof simplifyOutput> {
  return withDiagnostics(
    { kind: "simplify", simplified: r.simplified, simplifiedLatex: r.simplifiedLatex },
    r,
  );
}

function buildCheckEquivalentOutput(r: SymPyCheckEquivalentResult): z.infer<typeof checkEquivalentOutput> {
  return withDiagnostics(
    {
      kind: "check_equivalent",
      equivalent: r.equivalent,
      ...(r.difference !== undefined && { difference: r.difference }),
    },
    r,
  );
}

// Then the handler:
async handler(args, ctx) {
  const sympy = ctx.services.sympy;
  switch (args.kind) {
    case "check_solution": {
      return buildCheckSolutionOutput(
        await sympy.checkSolution({
          equation: args.equation,
          variable: args.variable,
          proposedValue: args.proposedValue,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        }),
      );
    }
    case "solve_equation": {
      return buildSolveEquationOutput(
        await sympy.solveEquation({
          equation: args.equation,
          variable: args.variable,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        }),
      );
    }
    case "simplify": {
      return buildSimplifyOutput(
        await sympy.simplify({
          expression: args.expression,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        }),
      );
    }
    case "check_equivalent": {
      return buildCheckEquivalentOutput(
        await sympy.checkEquivalent({
          expression1: args.expression1,
          expression2: args.expression2,
          ...(args.isLatex !== undefined && { isLatex: args.isLatex }),
        }),
      );
    }
  }
}
```

**Implementation Notes**:

- `withDiagnostics` is intentionally generic so the same helper handles all 4 kinds. The `as T` cast inside is necessary because TS can't infer that adding optional fields preserves the discriminated-union narrowing.
- Per-output builders live next to the schemas they construct — easy to verify shape correctness by reading them side-by-side.
- The `isLatex` optional spread on the INPUT side stays inline — different per-call structure, not amenable to a shared helper.
- `check_equivalent` inlines the `difference` spread because it's not a diagnostic field — it's a real result. Keeping the diagnostics helper focused on `needsHumanReview` + `parseError` only.
- Net result: handler shrinks from ~80 lines to ~40 lines; 4 small builders add ~30 lines. Net save: ~10 lines + clearer separation of "what the sympy result looks like" from "what the tool output looks like".

**Acceptance Criteria**:
- [ ] `pnpm test` passes — including the existing `grade-math.test.ts` without modification.
- [ ] Each handler branch is ≤ 8 lines.
- [ ] Each `build*Output` function is ≤ 12 lines.
- [ ] `withDiagnostics` is the only place `needsHumanReview`/`parseError` spreads live.
- [ ] `pnpm typecheck` and `pnpm lint` clean.

---

### Step 5: Document `type` vs `kind` discriminator convention in CLAUDE.md

**Priority**: Low
**Risk**: Trivial
**Files**:
- Modified: `CLAUDE.md`

**Current State**: The codebase consistently uses two discriminator field names:

- `type` — for **framework events** flowing through streams: `EngineEvent`, IPC envelope messages
- `kind` — for **domain object variants** stored in artifacts: `CourseSource`, `GateTarget`, `gradeMathInput`/`gradeMathOutput`

This is consistent in practice but not documented. New code may not know which to pick.

**Target State**:

Add a short section to `CLAUDE.md` (after the existing "File naming conventions" section):

```markdown
## Discriminated union conventions

Praxis uses two discriminator field names by convention:

- **`type`** — for events flowing through a stream or IPC channel (`EngineEvent`,
  IPC envelope messages, future telemetry events). The discriminator names the
  category of *what just happened*.

- **`kind`** — for variants of a stored or transmitted domain object (`CourseSource`,
  `GateTarget`, `gradeMathInput`, `gradeMathOutput`, `SuccessCriteria`). The
  discriminator names the *shape* of the value.

Heuristic: if the union is consumed by a `for await` loop or a switch over a
streamed event, use `type`. If it's a stored shape that gets read and written
(persisted to DB, sent over RPC, embedded in another type), use `kind`.
```

**Implementation Notes**:

- Pure documentation — no code changes.
- Place it between "File naming conventions" and "Test conventions" so it sits with the other naming guidance.

**Acceptance Criteria**:
- [ ] CLAUDE.md contains the new section.
- [ ] Existing tests still pass (no code touched).

---

## Implementation Order

Each step is independent and can be applied + verified + committed in any order. Recommended order is by **risk × payoff**:

1. **Step 1** — DB-test setup helper. Independent of all other code; ~30 LOC saved across 4 files; reduces real risk of test cleanup bugs going forward.
2. **Step 2** — `vi.mock("isolated-vm")` factory. Independent; ~50 LOC saved across 4 files.
3. **Step 5** — `CLAUDE.md` discriminator-convention doc. Independent; pure docs; trivial.
4. **Step 3** — `engineError()` helper. Touches 3 production files; ~12 LOC saved + standardizes error shape; small chance of a typo missing a callsite.
5. **Step 4** — `gradeMathTool` per-output builders. Localized to one file; clarifies intent; lowest urgency since the duplication is contained.

Each step is a single commit. After each commit, run `pnpm typecheck && pnpm lint && pnpm test` to verify before moving on.

---

## Out of scope (rejected)

The explore phase surfaced these but they didn't earn their place in the plan. Documented here so we don't keep re-discovering them.

| Idea | Why rejected |
|---|---|
| `BaseBridgedEngineSession` abstract class | Only Claude Code + Codex share the bridged shape; Direct is genuinely different. Defer until a 4th looped engine. |
| `compactObject({ a, b, c: undefined })` helper | Hides the explicit-omission intent that `exactOptionalPropertyTypes: true` makes valuable. Use the spread pattern. |
| `defineTool({...})` factory | TypeScript already enforces `ToolDefinition` structurally. A factory adds indirection without payoff. |
| `BaseServiceImpl` parent class for SessionServiceImpl + ConfigServiceImpl | They share only the constructor signature. No useful shared behavior. |
| Tool dispatch wrapper unifying MCP + Direct | MCP wraps errors as result objects; Direct throws to trigger Vercel SDK's `tool-error` event. Patterns intentionally diverge. |
| Console-logger consolidation across `services.ts` and `run-session.ts` | Only 2 callsites with intentionally different prefix strings. |
| Subpath-export consolidation in `@praxis/tools` | Standard pattern. The 1-line `index.ts` files allow per-subpath additions without external API churn. |
| Data-driven prompt fragments | Only 6 fragments. Loses syntax + types for marginal LOC win. |
| `composeFragments(...)` extracted from `composeSystemPrompt` | The current 30-line function is already clear. Extraction would add 10 LOC of indirection for no clarity gain. |
| Engine-adapter `id` initialization style consistency (literal vs constructor) | DirectEngine needs dynamic IDs from `provider`; the others have fixed IDs. Both satisfy the interface. Cosmetic only. |
