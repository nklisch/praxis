export { documentListSectionsTool } from "./list-sections.js";
export { documentOutlineTool } from "./outline.js";
export { documentReadPagesTool } from "./read-pages.js";

import { documentListSectionsTool } from "./list-sections.js";
import { documentOutlineTool } from "./outline.js";
import { documentReadPagesTool } from "./read-pages.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const DOCUMENT_TOOLS = [
  documentOutlineTool,
  documentListSectionsTool,
  documentReadPagesTool,
] as const;
