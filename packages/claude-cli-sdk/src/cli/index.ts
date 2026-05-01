export { buildCliArgs, buildConversationArgs } from './args.js';
export type { BuiltArgs } from './args.js';
export { spawnCli, isErrnoException, attachSpawnErrorHandler } from './spawn.js';
export type { SpawnResult, SpawnOptions_SDK } from './spawn.js';
export { parseStreamLine } from './parser.js';
export { streamEvents } from './stream.js';
// Re-export schema types for tests
export type { RawSystemInit, RawAssistant, RawUser, RawResult } from './schemas.js';
