import type { PermissionMode } from '../types/index.js';
import type { HookEvent, HookMatcher } from './hooks.js';

// ============================================
// SETTINGS BUILDER
// ============================================

/** Typed settings object matching the CLI's settings.json schema. */
export interface SettingsConfig {
  /** Permission rules */
  permissions?: {
    allow?: string[];
    deny?: string[];
    additionalDirectories?: string[];
    defaultMode?: PermissionMode;
  };
  /** Hook definitions keyed by event name */
  hooks?: Partial<Record<HookEvent, HookMatcher[]>>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Default model */
  model?: string;
  /** Sandbox configuration */
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    filesystem?: {
      allowWrite?: string[];
      denyWrite?: string[];
      denyRead?: string[];
      allowRead?: string[];
    };
    network?: {
      allowedDomains?: string[];
      allowLocalBinding?: boolean;
      allowAllUnixSockets?: boolean;
    };
  };
  /** Disable all hooks */
  disableAllHooks?: boolean;
  /** Directory for automatic memory files */
  autoMemoryDirectory?: string;
  /** Model overrides keyed by model alias */
  modelOverrides?: Record<string, string>;
}

/**
 * Build a settings JSON string from a typed config.
 * Result is suitable for the `settings` option or `--settings` flag.
 *
 * @example
 * const settings = buildSettings({
 *   permissions: {
 *     allow: [toolPattern.bash('git *'), 'Read'],
 *     deny: ['Write'],
 *   },
 *   hooks: {
 *     PreToolUse: [{
 *       matcher: 'Bash',
 *       hooks: [{ type: 'command', command: './lint.sh' }],
 *     }],
 *   },
 *   env: { NODE_ENV: 'production' },
 * });
 */
export function buildSettings(config: SettingsConfig): string {
  return JSON.stringify(config);
}
