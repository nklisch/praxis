import { pedagogyGetStrategyTool } from "./get-strategy.js";
import { pedagogyGetTechniqueTool } from "./get-technique.js";
import { pedagogyListMetacognitivePromptsTool } from "./list-metacognitive-prompts.js";
import { pedagogyListStrategiesTool } from "./list-strategies.js";
import { pedagogyListTechniquesTool } from "./list-techniques.js";

export {
  pedagogyGetStrategyTool,
  pedagogyGetTechniqueTool,
  pedagogyListMetacognitivePromptsTool,
  pedagogyListStrategiesTool,
  pedagogyListTechniquesTool,
};

/**
 * Aggregated array of all pedagogy.* tools — pass to the tool registry in
 * services.ts alongside the other domain tool arrays.
 */
export const PEDAGOGY_TOOLS = [
  pedagogyListStrategiesTool,
  pedagogyGetStrategyTool,
  pedagogyListTechniquesTool,
  pedagogyGetTechniqueTool,
  pedagogyListMetacognitivePromptsTool,
] as const;
