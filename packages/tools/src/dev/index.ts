/**
 * Dev tools — registered only when `PRAXIS_DEV === "true"`.
 * Safe to import unconditionally; the gate lives at the registration site.
 *
 * The `DevReport` and `DevReportsWriter` interfaces are canonical in
 * `@praxis/core/types`. This module re-exports them alongside the
 * concrete `createDevReportsWriter` factory for callers that want both
 * the types and the implementation from a single import.
 */
export type { DevReport, DevReportsWriter } from "./dev-reports-writer.js";
export { createDevReportsWriter } from "./dev-reports-writer.js";
export { reportIssueTool } from "./report-issue.js";

import { reportIssueTool } from "./report-issue.js";

/** All dev tools — conditionally spread into toolDefinitions when `PRAXIS_DEV === "true"`. */
export const DEV_TOOLS = [reportIssueTool] as const;
