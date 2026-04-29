import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { roleFragment } from "./fragments/role.js";
import { toolsFragment } from "./fragments/tools.js";

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    toolsFragment,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: ["grade_math", "code_sandbox"],
  uiSurface: "chat",
};
