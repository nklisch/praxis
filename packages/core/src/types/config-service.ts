/**
 * Snapshot view of EngineConfig for the client surface. Mirrors EngineConfig
 * in @praxis/core/config without forcing client.ts to reach into other core
 * subfolders for a Zod-derived type. SessionServiceImpl validates against
 * EngineConfigSchema before persisting.
 *
 * Note: the plaintext `apiKey` field is intentionally NOT exposed on the
 * snapshot — the renderer reads `hasApiKey` for display and calls
 * `revealApiKey()` only when the user clicks "edit". The IPC layer
 * never crosses the trust boundary with the decrypted secret unless the
 * renderer explicitly requests it.
 */
export interface EngineConfigSnapshot {
  engineId: string;
  model?: string;
  /**
   * True iff a non-empty apiKey is stored (decrypted from `apiKeyEncrypted`)
   * OR set via the `PRAXIS_API_KEY` env override. Renderer drives
   * "configured / not configured" UI off this flag without ever seeing
   * the secret on a steady-state read.
   */
  hasApiKey: boolean;
  baseUrl?: string;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

/**
 * User-tunable course-create-mode configuration. Surfaced via ConfigService and
 * read at runtime by `course.start_drafting` to determine the drafter
 * agent's tool-call budget.
 */
export interface CourseCreateConfigSnapshot {
  /**
   * Max tool-call steps the drafter agent may take in a single run.
   * Bounded server-side; out-of-range values are rejected by the schema.
   */
  maxSteps: number;
}

export interface ConfigService {
  isLocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  selectedEngine(): Promise<string>;
  setSelectedEngine(engineId: string): Promise<void>;
  // Phase 3 additions:
  engineConfig(): Promise<EngineConfigSnapshot>;
  /**
   * Fetch the decrypted apiKey for the edit flow. The renderer calls this
   * only when the user explicitly clicks "edit" on the API key field;
   * steady-state reads use `engineConfig()` which returns presence only.
   * Returns `null` when nothing is stored.
   */
  revealApiKey(): Promise<{ apiKey: string | null }>;
  setEngineConfig(config: EngineConfigSnapshot & { apiKey?: string }): Promise<void>;
  // Course-create-mode budget knob.
  courseCreateConfig(): Promise<CourseCreateConfigSnapshot>;
  setCourseCreateConfig(config: CourseCreateConfigSnapshot): Promise<void>;
  // Phase 19 — first-run flow gating.
  firstRunCompleted(): Promise<boolean>;
  markFirstRunComplete(): Promise<void>;
}
