import type { ToolHandler } from './types/index.js';

// ============================================
// WELL-KNOWN INTERACTIVE TOOL NAMES
// ============================================

/**
 * Constants for built-in interactive tool names.
 *
 * Use these as keys in `toolHandlers` to avoid typos:
 * ```ts
 * { toolHandlers: { [InteractiveTool.AskUserQuestion]: askUserQuestionHandler(...) } }
 * ```
 */
export const InteractiveTool = {
  /** Claude calls this to ask the user a question during skill execution. */
  AskUserQuestion: 'AskUserQuestion',
  /** Claude calls this to send a one-way notification (requires `brief: true`). */
  SendUserMessage: 'SendUserMessage',
} as const;

export type InteractiveToolName = (typeof InteractiveTool)[keyof typeof InteractiveTool];

// ============================================
// INTERACTIVE SKILL TOOL HANDLERS
// ============================================

/**
 * Create a {@link ToolHandler} for `AskUserQuestion` tool calls.
 *
 * Claude calls `AskUserQuestion` when a skill needs user input. This factory
 * wraps your prompt function — it extracts the `question` field from the tool
 * input, calls your function, and returns the answer to Claude.
 *
 * @param fn - Async function that receives the question string and returns the user's answer.
 * @returns A {@link ToolHandler} to register in `toolHandlers`.
 *
 * @example
 * import { createConversation, askUserQuestionHandler } from '@praxis/claude-cli-sdk';
 * import * as readline from 'node:readline/promises';
 *
 * const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
 * await using conv = createConversation({
 *   toolHandlers: {
 *     AskUserQuestion: askUserQuestionHandler(q => rl.question(q + ' ')),
 *   },
 * });
 * const r = await conv.sendAndCollect('/my-interactive-skill');
 */
export function askUserQuestionHandler(
  fn: (question: string) => Promise<string>
): ToolHandler {
  return async (event) => {
    const input = event.toolInput as { question: string };
    return fn(input.question);
  };
}

/**
 * Create a {@link ToolHandler} for `SendUserMessage` tool calls.
 *
 * Used with `brief: true`. Claude calls this to send a one-way notification.
 * The factory calls your display function and auto-acknowledges to Claude
 * (returns an empty string).
 *
 * @param fn - Function that receives the message string. May be async.
 * @returns A {@link ToolHandler} to register in `toolHandlers`.
 *
 * @example
 * await using conv = createConversation({
 *   brief: true,
 *   toolHandlers: {
 *     SendUserMessage: sendUserMessageHandler(msg => process.stdout.write(msg + '\n')),
 *   },
 * });
 */
export function sendUserMessageHandler(
  fn: (message: string) => void | Promise<void>
): ToolHandler {
  return async (event) => {
    const input = event.toolInput as { message: string };
    await fn(input.message);
    return '';
  };
}
