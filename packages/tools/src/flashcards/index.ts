export { createFlashcardTool } from "./create.js";
export { fromNoteTool } from "./from-note.js";
export { reviewFlashcardTool } from "./review.js";
export { reviewNextTool } from "./review-next.js";

import { createFlashcardTool } from "./create.js";
import { fromNoteTool } from "./from-note.js";
import { reviewFlashcardTool } from "./review.js";
import { reviewNextTool } from "./review-next.js";

/** Aggregated array used by services.ts when building the tool registry. */
export const FLASHCARD_TOOLS = [
  createFlashcardTool,
  fromNoteTool,
  reviewFlashcardTool,
  reviewNextTool,
] as const;
